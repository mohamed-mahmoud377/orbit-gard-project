#!/usr/bin/env node
/**
 * Orbit Bazaar — catalog builder.
 *
 * Generates `shop/api/src/catalog/catalog.json` per shop/CONTRACT.md §3.
 *
 *   node shop/tools/build-catalog.mjs            # build (uses ./.cache when warm)
 *   node shop/tools/build-catalog.mjs --refresh  # ignore cached Openverse responses
 *   node shop/tools/build-catalog.mjs --recheck  # re-verify every image URL
 *   node shop/tools/build-catalog.mjs --validate # validate the committed catalog
 *
 * Images come from the Openverse API, filtered to the StockSnap provider (CC0 stock
 * photography). Every URL is HTTP-verified before it is allowed into the catalog.
 *
 * Node builtins only. No dependencies.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const CACHE_DIR = path.join(__dirname, '.cache');
const OUT_FILE = path.join(ROOT, 'shop', 'api', 'src', 'catalog', 'catalog.json');

const SEED = 0x0b17ba2a; // fixed — the catalog must be reproducible
const BASE_DATE = Date.UTC(2026, 7, 16); // fixed "now" so createdAt is deterministic
const USER_AGENT = 'orbit-bazaar-catalog/1.0';
const OPENVERSE = 'https://api.openverse.org/v1/images/';

const TOTAL_PRODUCTS = 500;
const MIN_CATEGORIES = 24;
const MIN_PER_CATEGORY = 12;
const MIN_POOL = 8; // hard floor: fail the build below this
const WIDEN_POOL = 25; // below this we widen the search beyond StockSnap

const argv = new Set(process.argv.slice(2));
const FLAGS = {
  refresh: argv.has('--refresh'),
  recheck: argv.has('--recheck'),
  validate: argv.has('--validate'),
};

/* ------------------------------------------------------------------ *
 * Seeded PRNG — mulberry32. Math.random() is never used.
 * ------------------------------------------------------------------ */

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  float(min = 0, max = 1) {
    return min + this.next() * (max - min);
  }
  int(min, max) {
    return Math.floor(this.float(min, max + 1));
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** Skewed float in [min,max]; pow < 1 skews high, pow > 1 skews low. */
  skew(min, max, pow) {
    return min + (max - min) * Math.pow(this.next(), pow);
  }
  /** Log-uniform integer — good for prices and rating counts. */
  logInt(min, max) {
    const v = Math.exp(this.float(Math.log(min), Math.log(max)));
    return Math.round(v);
  }
  shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  /** n distinct items, in shuffled order. */
  sample(arr, n) {
    return this.shuffled(arr).slice(0, Math.min(n, arr.length));
  }
}

/* ------------------------------------------------------------------ *
 * Small utilities
 * ------------------------------------------------------------------ */

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

function slugify(s) {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readCache(name) {
  const f = path.join(CACHE_DIR, name);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(name, data) {
  ensureDir(CACHE_DIR);
  fs.writeFileSync(path.join(CACHE_DIR, name), JSON.stringify(data, null, 1));
}

/** Cap a sentence-ish string at n chars without cutting a word in half. */
function clamp(text, n) {
  if (text.length <= n) return text;
  const cut = text.slice(0, n);
  const i = cut.lastIndexOf(' ');
  return (i > 40 ? cut.slice(0, i) : cut).replace(/[\s,;:—-]+$/, '') + '.';
}

/** Simple, deterministic pluralisation for slot words. */
function titleCase(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ------------------------------------------------------------------ *
 * Rate-limited Openverse client
 *
 * Anonymous quota is 20 req/min burst / 200 req/day sustained, so requests are
 * paced and every response is cached to disk immediately.
 * ------------------------------------------------------------------ */

const REQ_INTERVAL_MS = 3400; // ~17/min, safely under the 20/min burst cap
let lastRequestAt = 0;
let apiCallCount = 0;

async function pace() {
  const wait = lastRequestAt + REQ_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

const searchCache = readCache('openverse-search.json') || {};
let searchCacheDirty = false;

function flushSearchCache() {
  if (searchCacheDirty) {
    writeCache('openverse-search.json', searchCache);
    searchCacheDirty = false;
  }
}

/**
 * One page of Openverse results. `mode` is 'stocksnap' (default, CC0 pro stock)
 * or 'wide' (any commercially-licensed source — the fallback path).
 */
async function openverseSearch(term, page = 1, mode = 'stocksnap') {
  const key = `${mode}|${term}|${page}`;
  if (!FLAGS.refresh && searchCache[key]) return searchCache[key];

  const url = new URL(OPENVERSE);
  url.searchParams.set('q', term);
  url.searchParams.set('page_size', '20');
  url.searchParams.set('page', String(page));
  if (mode === 'stocksnap') url.searchParams.set('source', 'stocksnap');
  else url.searchParams.set('license_type', 'commercial');

  let lastErr = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    await pace();
    apiCallCount++;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 429) {
        const retry = Number(res.headers.get('retry-after')) || 60;
        warn(`      rate limited on "${term}" p${page}; sleeping ${retry}s`);
        await sleep(retry * 1000);
        continue;
      }
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(1200 * (attempt + 1));
        continue;
      }
      const json = await res.json();
      const payload = {
        count: json.result_count ?? 0,
        pageCount: json.page_count ?? 0,
        results: (json.results || []).map((r) => ({
          url: r.url,
          title: r.title || '',
          source: r.source || '',
          license: r.license || '',
        })),
      };
      searchCache[key] = payload;
      searchCacheDirty = true;
      flushSearchCache();
      return payload;
    } catch (err) {
      lastErr = err;
      await sleep(1200 * (attempt + 1));
    }
  }
  warn(`      search failed for "${term}" p${page} (${mode}): ${lastErr?.message}`);
  const empty = { count: 0, pageCount: 0, results: [], failed: true };
  return empty;
}

/* ------------------------------------------------------------------ *
 * URL verification — HEAD first, ranged GET as a fallback.
 * ------------------------------------------------------------------ */

const verifyCache = readCache('url-verify.json') || {};
let verifyCacheDirty = false;
let verifiedSinceFlush = 0;

function flushVerifyCache() {
  if (verifyCacheDirty) {
    writeCache('url-verify.json', verifyCache);
    verifyCacheDirty = false;
    verifiedSinceFlush = 0;
  }
}

async function probe(url, method) {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*' };
  if (method === 'GET') headers.Range = 'bytes=0-1023';
  const res = await fetch(url, {
    method,
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  // Drain the body so the socket is released.
  if (res.body) {
    try {
      await res.arrayBuffer();
    } catch {
      /* ignore */
    }
  }
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  return { status: res.status, contentType: ct };
}

async function verifyUrl(url) {
  if (!FLAGS.recheck && verifyCache[url] !== undefined) return verifyCache[url];

  let result = { ok: false, status: 0, contentType: '' };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let r = await probe(url, 'HEAD');
      if (r.status !== 200 || !r.contentType.startsWith('image/')) {
        // Some CDNs are hostile to HEAD; confirm with a ranged GET before rejecting.
        r = await probe(url, 'GET');
        const okGet = (r.status === 200 || r.status === 206) && r.contentType.startsWith('image/');
        result = { ok: okGet, status: r.status, contentType: r.contentType };
      } else {
        result = { ok: true, status: 200, contentType: r.contentType };
      }
      if (result.ok) break;
      // 4xx other than 429 is permanent — do not burn retries on it.
      if (result.status >= 400 && result.status < 500 && result.status !== 429) break;
    } catch (err) {
      result = { ok: false, status: 0, contentType: String(err.name || 'error') };
    }
    await sleep(600 * (attempt + 1));
  }

  verifyCache[url] = result;
  verifyCacheDirty = true;
  if (++verifiedSinceFlush >= 100) flushVerifyCache();
  return result;
}

/** Verify many URLs with bounded concurrency. Returns the subset that returned 200 image/*. */
async function verifyAll(urls, { concurrency = 12, label = '' } = {}) {
  const list = [...urls];
  const good = [];
  let cursor = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(concurrency, list.length) }, async () => {
    while (cursor < list.length) {
      const u = list[cursor++];
      const r = await verifyUrl(u);
      if (r.ok) good.push(u);
      done++;
      if (label && done % 200 === 0) log(`      verified ${done}/${list.length} ${label}`);
    }
  });
  await Promise.all(workers);
  flushVerifyCache();
  // Stable order regardless of completion order.
  good.sort();
  return good;
}

/* ------------------------------------------------------------------ *
 * Marketing copy
 *
 * Sentences are drawn from family-level pools with slot substitution, so the
 * same frame lands differently in every category. Slots:
 *   {p} singular noun   {pp} plural noun   {brand}   {mat} material
 *   {q} quality adj     {ctx} context      {aud} audience   {act} activity
 * ------------------------------------------------------------------ */

const SHARED_COPY = {
  open: [
    'The {brand} {model} was drawn up around one stubborn question: what would this {p} look like if nothing about it was an afterthought?',
    'Some {pp} are designed to photograph well. This one was designed to be lived with.',
    'There is a particular satisfaction in owning a {p} that simply does what it promises, every time, without asking for attention.',
    '{brand} spent longer than anyone budgeted for on the details of this {p}, and it shows in the places you touch most.',
    'A {q} {p} for people who have grown tired of replacing the cheap one twice a year.',
    'This is the {p} you buy once, put to work, and stop thinking about.',
    'Understated on the shelf, genuinely capable in use — the {model} earns its keep quietly.',
    'Built from a short list of good decisions rather than a long list of features.',
    'The {model} sits at the point where {mat} and a sensible price finally meet.',
    'Everything about the {model} was tuned around the way a {p} gets used by {aud}, not the way a spec sheet imagines it.',
    'Most {pp} at this price are built down to a number. The {model} was built up from a brief.',
    'It took {brand} three prototypes to be happy with the {model}, and the third one is the one you are looking at.',
    'Nothing here is decorative. Every line on the {model} is doing structural or practical work.',
    'The {model} started life as an internal tool — something the workshop needed and could not buy.',
    'If you have ever been let down by {pp} that looked the part and were not, this is the answer to that.',
    'Not the cheapest {p} you will find, and not pretending to be. It is the one that lasts.',
    'Made in a run small enough that a person signed off every unit before it was boxed.',
    'The brief for the {model} was short: make it {q}, make it repairable, and stop there.',
    'A {p} designed around {ctx} rather than around a photograph of one.',
    'Familiar at a glance, better in the hand — which is roughly the point of good design.',
  ],
  benefit: [
    'The {mat} finish resists the everyday scuffs that make cheaper {pp} look tired within a season.',
    'It arrives ready to use — no fiddly setup, no missing hardware, no trip back to the shop.',
    'Serviceable by design: the parts that wear are the parts you can replace.',
    'Quality control is done unit by unit, not batch by batch, which is why the returns rate on this line stays low.',
    'The {mat} construction shrugs off humidity, dust and the general chaos of {ctx}.',
    'It was over-specified against its real duty cycle, which is why it never runs at its limit.',
    'The materials were chosen for how they age rather than how they photograph on day one.',
    'A hundred units were run to destruction before the design was signed off.',
    'The {mat} was picked after three alternatives failed the same test.',
    'Finished to the same standard on the faces you never see as on the ones you do.',
    'It weighs what it should — not padded out to feel expensive, not stripped to hit a price.',
    'The failure modes were mapped first, and then designed out one at a time.',
  ],
  use: [
    'It slots into {ctx} without demanding that you rearrange anything around it.',
    'Equally at home during a quiet weekday and a full-house weekend.',
    'Pack it, move it, unpack it — the {model} is built to survive being genuinely used.',
    'Built with {aud} in mind, and it shows in exactly the details that usually get skipped.',
    'Whether you are {act} or simply getting through a long day, it keeps up without fuss.',
    'Long sessions are where the difference shows: comfort and control hold steady when cheaper {pp} start to grate.',
    'Built with {aud} in mind, and it shows in exactly the details that usually get skipped.',
    'It handles the ordinary days first, which is most of them, and the hard ones without drama.',
    'Sized and finished so it earns its place in {ctx} rather than just occupying it.',
    'You will use it more than you expected to, which is the usual sign that something is right.',
    'It puts up with being borrowed, dropped and put back in the wrong place.',
    'Good on day one, better once you have worked out what it will do.',
    'It suits {act} as readily as it suits doing nothing much at all.',
  ],
  close: [
    'Backed by a two-year {brand} warranty and a spare-parts programme that actually stocks parts.',
    'Ships in recycled, plastic-free packaging that opens without a knife.',
    'If it is not right, send it back within 30 days — no restocking fee, no interrogation.',
    'Covered by {brand} support seven days a week, staffed by people who own the product themselves.',
    'A small, deliberate upgrade that you will notice on the first day and appreciate on the hundredth.',
    'Registered owners get extended cover and first access to new colourways.',
    'Every part carries a published number, so a repair never becomes a replacement.',
    'Shipped carbon-neutral, with the offsetting audited by a third party.',
    'Bought once, it should outlast the next two things you buy alongside it.',
    'Ask us anything before you order — we would rather talk you out of the wrong one.',
    'Priced to be bought once rather than discounted twice a year.',
    'Comes with a printed manual, because a QR code is not documentation.',
  ],
};

/**
 * Benefit sentences that only make sense about a manufactured object. Merged in for the
 * hard-goods families so that a linen shirt is never described as having tight tolerances.
 */
const HARD_GOODS_BENEFITS = [
    'Assembly is done by hand, which is slower and is the reason the tolerances hold.',
  'Weight is distributed so it feels balanced in the hand rather than merely light on paper.',
  'Tolerances are tight enough that nothing rattles, creaks or drifts out of alignment over time.',
  'Every edge is radiused and every seam is closed, because the parts you never look at are the parts that fail first.',
  'Small refinements — the weight of a switch, the depth of a chamfer — add up to something that just feels right.',
  'Nothing is glued shut that could have been screwed, so a repair stays a repair.',
  'Nothing rattles, nothing flexes, nothing needs a second look after a month.',
];

/** Families whose products are worn, applied or eaten rather than operated. */
const SOFT_FAMILIES = new Set(['fashion', 'beauty', 'food']);

const FAMILY_COPY = {
  tech: {
    open: [
      'Performance you can feel in the first ten seconds, and still feel three years in.',
      'The {model} is what happens when engineers are allowed to finish the firmware before shipping.',
      'Fast is easy. Fast, quiet and cool at the same time is the hard part — and that is where the {model} lives.',
      'Specs get you in the door; thermal headroom and driver quality are what keep the {model} feeling quick.',
    ],
    benefit: [
      'Thermals were solved before the marketing copy was written, so sustained loads do not turn into a throttled crawl.',
      'Firmware updates arrive over the air and have never once bricked a unit in the field.',
      'Standby drain is measured in days, not hours, so it is charged when you pick it up.',
      'The connectors are the ones you already own — no proprietary dongle tax.',
      'Latency stays low enough that the {p} disappears and you are left with the work.',
      'Shielding and grounding were taken seriously, which is why the noise floor stays where it belongs.',
      'Component tolerances are held to a tighter grade than the category norm, which is why the unit-to-unit variance is so small.',
    ],
    use: [
      'Comfortable through a nine-hour shift, a red-eye flight, or a weekend of nothing but {act}.',
      'It handles the boring work — spreadsheets, calls, tabs by the hundred — before you ever push it hard.',
      'Set it up once and it stays configured, across reboots, updates and hardware swaps.',
      'Take it from the desk to the sofa to a café table and nothing about the experience changes.',
    ],
    close: [
      'Firmware and security updates are committed for five years from launch.',
      'A two-year warranty covers parts and labour, with advance replacement on approved claims.',
      'Repair manuals and part numbers are published openly, because a sealed box is not a design goal.',
    ],
  },
  home: {
    open: [
      'A {p} that makes the daily routine feel a little less like a chore.',
      'Homes are loud, wet, hot and busy. The {model} was designed for that reality rather than a studio set.',
      'Good kitchens and calm rooms are built from small competent objects, and this is one of them.',
      'The {model} is the sort of {p} that quietly becomes the one everybody in the house reaches for.',
    ],
    benefit: [
      'Wipes clean with a damp cloth — no crevices, no trapped grease, no special products.',
      'Dishwasher-safe where it counts and hand-wash-friendly where the finish deserves it.',
      'Heat is spread evenly rather than concentrated in a hot ring at the centre.',
      'Stable on an uneven worktop thanks to a weighted base and grippy feet.',
      'Stacks and nests properly, which matters far more in a real cupboard than in a photograph.',
      'Food-safe {mat} throughout, with no coatings that flake or discolour.',
      'Quiet in operation — you can hold a conversation over it.',
    ],
    use: [
      'Weeknight dinners, long Friday lunches, and the occasional ambitious project all sit within its range.',
      'Small enough to leave out on the counter, good-looking enough that you want to.',
      'It behaves the same on the two-hundredth use as it did on the first.',
      'Handles {ctx} without complaint, then cleans up in under a minute.',
    ],
    close: [
      'Replacement seals, filters and fittings stay in stock for at least seven years.',
      'Two-year warranty, and a repair-first policy before any replacement is issued.',
      'Delivered flat-packed where it saves carbon and fully assembled where it saves your evening.',
    ],
  },
  fashion: {
    open: [
      'Cut from {mat} that softens with wear instead of giving up.',
      'A wardrobe piece rather than a trend piece — the {model} is meant to be worn out, not stored away.',
      'The fit was refined across four rounds of fitting on real bodies, not a single mannequin.',
      'Quiet construction, honest materials, and a silhouette that still works three seasons from now.',
    ],
    benefit: [
      'Seams are flat-locked and bar-tacked at the stress points, so nothing puckers after a wash.',
      'Pre-shrunk and colour-fast — what you try on is what you keep.',
      'The {mat} breathes properly in heat, which matters more than any marketing fabric name.',
      'Hardware is solid rather than plated, so zips and buckles survive daily handling.',
      'Sized on a generous, consistent grade with a fit guide that has kept exchange rates unusually low.',
      'Finished with a clean interior — bound seams, no scratchy labels, nothing that shows through.',
    ],
    use: [
      'Dress it up for a dinner or down for a Saturday and it reads correctly either way.',
      'Layers cleanly under a jacket without bunching at the shoulder.',
      'Packs small, shakes out flat, and forgives a suitcase.',
      'Comfortable from the first wear — there is no break-in period to survive.',
    ],
    close: [
      'Free exchanges on sizing within 30 days, including the return postage.',
      'Care is simple: cold wash, hang dry, and it will outlast three fast-fashion equivalents.',
      'Made in a facility audited twice a year for wages and working hours.',
    ],
  },
  beauty: {
    open: [
      'Formulated short — every ingredient in the {model} is there because it does something.',
      'A {p} that respects the fact that your skin has to live with the results.',
      'Dermatologist-tested, fragrance-honest, and free of the filler that pads out cheaper formulas.',
      'Results you can actually see in the mirror after a fortnight, not a promise measured in vibes.',
    ],
    benefit: [
      'Non-comedogenic and tested on sensitive, reactive skin before it ever went to market.',
      'The texture absorbs cleanly and leaves no tacky film under makeup or sunscreen.',
      'Airless packaging keeps the active ingredients stable from the first pump to the last.',
      'pH-balanced so it plays nicely alongside the rest of your routine.',
      'No added fragrance, no essential-oil shortcuts, no dyes doing decorative work.',
      'Concentrations are printed on the carton, because a percentage you cannot check is a marketing number.',
    ],
    use: [
      'Fits into a two-minute morning or a longer evening ritual without rearranging either.',
      'Travel-friendly and leak-tested, so it survives a wash bag in a checked case.',
      'Suitable year-round — it does not turn heavy in summer or thin in winter.',
      'A little goes a long way; most people find one bottle lasts a full season.',
    ],
    close: [
      'Cruelty-free and certified vegan, with recyclable packaging throughout.',
      'Batch codes and expiry dates are printed on every unit, not hidden on a sticker.',
      'If it does not suit your skin, return it opened within 30 days for a full refund.',
    ],
  },
  active: {
    open: [
      'Tested where it matters — outdoors, in bad weather, by people who were not being paid to be polite about it.',
      'Built for the session after the session, when good gear stops being a luxury.',
      'The {model} does not care whether you are chasing a personal best or just getting out of the house.',
      'Kit that holds up to sweat, grit and repetition is rarer than it should be. This is some of it.',
    ],
    benefit: [
      'Moisture moves outward instead of sitting against the skin, which is the whole game in heat.',
      'Abrasion-resistant panels sit exactly where the wear actually happens.',
      'The grip holds when wet, which is the only condition worth testing for.',
      'Load is carried on the frame rather than the straps, so long days stay comfortable.',
      'Reflective detailing is built into the trim rather than bolted on as an afterthought.',
      'Rated well beyond its everyday load so it never runs at the edge of its tolerance.',
    ],
    use: [
      'Early starts, long sessions, and the trip home afterwards — all covered.',
      'Rolls down small enough to live in a day pack permanently.',
      'Works as well on a gym floor as it does on a trail or a hotel carpet.',
      'Rinse it, hang it, use it again tomorrow.',
    ],
    close: [
      'Covered for two years against defects, and repairable well beyond that.',
      'Field-tested across a full season before a single unit shipped.',
      'Spare buckles, straps and clips are sent free for the life of the product.',
    ],
  },
  accessory: {
    open: [
      'Small leather goods, watches and bags all live or die on the details — this one was built around them.',
      'The {model} is the sort of thing you carry every day and stop noticing, which is the highest compliment.',
      'Made to be used rather than kept for good, and finished so that use improves it.',
      'A {p} that will look better in five years than it does in the photographs.',
    ],
    benefit: [
      'Edges are burnished and sealed in four passes rather than cut and left raw.',
      'Hardware is solid rather than plated, so it will not wear through to a different colour.',
      'Stitched with bonded polyester at eight stitches per inch and back-tacked at every stress point.',
      'The {mat} takes a patina instead of a crack, which is the whole reason to buy it in this material.',
      'Tolerances are close enough that everything closes with a click rather than a wobble.',
      'Every component is a stocked spare, so a broken clasp is a repair rather than a replacement.',
      'Weight sits where your hand expects it, which is a surprisingly hard thing to get right.',
    ],
    use: [
      'Works with a suit on Tuesday and with jeans on Saturday without looking like it is trying.',
      'Survives a daily commute, an airport tray and a coat pocket full of keys.',
      'Sized so it disappears when you are wearing it and works when you need it.',
      'It is the one you reach for when you can only take one.',
    ],
    close: [
      'Repairs are offered at cost for as long as we can get the parts, which is a long time.',
      'Arrives in a reusable box with a care cloth and honest instructions.',
      'Covered for two years, and serviceable long after that by anyone competent.',
    ],
  },
  media: {
    open: [
      'The kind of thing that ends up permanently out on the table rather than filed away.',
      'Made for people who care about the object as much as the content.',
      'A considered edition of a {p}, produced without cutting the corners that usually get cut.',
      'There is craft here that survives the first hour and rewards the hundredth.',
    ],
    benefit: [
      'Printed on heavy uncoated stock that takes ink cleanly and does not ghost.',
      'Sewn binding lies flat on a table and will not shed pages in a year.',
      'Tuned and checked by hand before it leaves the workshop.',
      'Components are standard sizes, so replacements and upgrades are easy to find.',
      'The finish is hard-wearing enough for daily handling by people who are not careful.',
      'Materials were chosen for how they age, not how they photograph on day one.',
    ],
    use: [
      'Good for a quiet hour alone or a full table of people.',
      'Approachable in five minutes, deep enough to stay interesting for years.',
      'Travels well and survives being packed badly.',
      'A reliable gift for the person who is difficult to buy for.',
    ],
    close: [
      'Produced in a limited run using FSC-certified materials.',
      'Missing or damaged parts are replaced free, no receipt required.',
      'Comes boxed and ready to give, without an extra wrapping bill.',
    ],
  },
  family: {
    open: [
      'Safety was the constraint the rest of the design had to work around, not a box ticked at the end.',
      'Made for households where things get dropped, chewed, spilled on and loved hard.',
      'The {model} is easy on the grown-ups doing the work at seven in the morning.',
      'Every material here has to survive being put in a mouth, a washing machine, or both.',
    ],
    benefit: [
      'BPA-free, phthalate-free and independently lab-tested against EN and ASTM standards.',
      'No small detachable parts, and every edge is rounded and smooth.',
      'Machine washable at 60°C without losing shape, colour or softness.',
      'Non-toxic finishes throughout, certified safe for mouthing and prolonged skin contact.',
      'Adjusts as they grow, which buys you another year or two of use.',
      'One-handed operation, because the other hand is always busy.',
    ],
    use: [
      'Copes with nurseries, car journeys, grandparents’ houses and everything in between.',
      'Quick to clean, which is the feature you will appreciate most.',
      'Light enough to carry up a flight of stairs with a child on your hip.',
      'Folds down small enough for a boot that is already full.',
    ],
    close: [
      'Independently safety-certified, with test reports available on request.',
      'Two-year warranty, and replacement parts posted free within that window.',
      'Designed to be handed down rather than thrown away.',
    ],
  },
  food: {
    open: [
      'Sourced from growers we can name, in quantities small enough to actually taste before shipping.',
      'Single-origin, seasonally batched, and dated on the pack so you know exactly what you have.',
      'Flavour first — everything else about this {p} follows from that.',
      'Good ingredients do not need much doing to them, which is roughly the entire philosophy here.',
    ],
    benefit: [
      'No artificial preservatives, colours or flavour enhancers — the ingredient list fits on one line.',
      'Resealable, light-blocking packaging keeps it fresh long after opening.',
      'Batch and harvest dates are printed on every pack, not hidden in a code.',
      'Traceable to the cooperative that produced it, and priced so they are paid properly.',
      'Stored and shipped at temperature the whole way, which is where most suppliers quietly cut costs.',
      'Naturally gluten-free and produced in a facility audited to BRC standards.',
    ],
    use: [
      'Good enough for a special occasion, priced for a Tuesday.',
      'Works as an everyday staple and as the base for something more ambitious.',
      'Keeps well in a cupboard, better in a cool pantry, and travels fine either way.',
      'A generous pack size — enough to cook with rather than ration.',
    ],
    close: [
      'Packed to order and dispatched within 24 hours.',
      'If it arrives anything less than perfect, we replace it and you keep the original.',
      'Packaging is home-compostable, including the inner liner.',
    ],
  },
  utility: {
    open: [
      'A tool, in the honest sense — bought to do a job and judged on whether it does it.',
      'The {model} is over-specified on purpose, because working at the limit is how things break.',
      'Designed by people who have done the job themselves and were tired of the compromises.',
      'Practical, repairable and unglamorous. That is the point.',
    ],
    benefit: [
      'Hardened {mat} where the load goes, and a comfortable grip where your hand goes.',
      'Corrosion-protected inside and out, so a damp garage does not shorten its life.',
      'Standard fittings throughout — no proprietary consumables, no locked-in refills.',
      'Rated well above the load it will realistically see in normal use.',
      'Every part that wears is a stocked spare with a published part number.',
      'Balanced so that a long job does not become a wrist injury.',
    ],
    use: [
      'At home on a job site, in a garage, or in the corner of a spare room.',
      'Stores flat, hangs on a hook, and does not need a dedicated shelf.',
      'Set up in minutes and put away just as quickly.',
      'Handles occasional heavy use and constant light use equally well.',
    ],
    close: [
      'Three-year warranty covering normal working use, not just showroom conditions.',
      'Spares and service parts are guaranteed available for a decade.',
      'Comes with the fixings you actually need, rather than a token bag of the wrong ones.',
    ],
  },
};

const SHORT_FRAMES = [
  '{q} {p} in {mat} — {tail}.',
  '{titleQ} {p} built for {ctx}, with {tail}.',
  '{titleP} for {aud}: {tail}.',
  '{q} {p} with {tail}, ready for daily use.',
  '{brand}’s {q} take on the {p} — {tail}.',
  'A {p} for {act}, finished in {mat} with {tail}.',
];

/** Fill {slots} in a frame from a per-product context. */
function fill(frame, ctx) {
  return frame.replace(/\{(\w+)\}/g, (m, k) => (ctx[k] !== undefined ? ctx[k] : m));
}

/**
 * Build 2–4 paragraphs of copy. Sentences are sampled without replacement from a
 * merged shared + family pool so a single product never repeats a frame, and the
 * per-category vocabulary keeps the same frame reading differently elsewhere.
 */
function buildDescription(rng, cat, ctx) {
  const fam = FAMILY_COPY[cat.family];
  const hard = SOFT_FAMILIES.has(cat.family) ? [] : HARD_GOODS_BENEFITS;
  const pool = (k) =>
    rng.shuffled([...SHARED_COPY[k], ...fam[k], ...(k === 'benefit' ? hard : [])]);

  const opens = pool('open');
  const benefits = pool('benefit');
  const uses = pool('use');
  const closes = pool('close');

  let bi = 0;
  let ui = 0;
  const nextBenefit = () => benefits[bi++ % benefits.length];
  const nextUse = () => uses[ui++ % uses.length];

  const paras = [];
  paras.push([opens[0], nextBenefit(), nextBenefit()].join(' '));
  paras.push([nextUse(), nextBenefit(), rng.chance(0.6) ? nextUse() : nextBenefit()].join(' '));

  const n = rng.chance(0.55) ? 4 : rng.chance(0.7) ? 3 : 2;
  if (n >= 3) paras.push([nextBenefit(), nextUse(), rng.chance(0.5) ? nextBenefit() : closes[1]].join(' '));
  if (n >= 4) paras.push([closes[0], rng.chance(0.5) ? closes[2] : nextBenefit()].join(' '));
  else if (n === 2) paras[1] += ' ' + closes[0];

  return paras.map((p) => fill(p, ctx)).join('\n\n');
}

function buildShortDescription(rng, cat, ctx) {
  const frame = rng.pick(SHORT_FRAMES);
  const tail = rng.pick(cat.vocab.tail);
  const text = fill(frame, { ...ctx, tail, titleQ: titleCase(ctx.q), titleP: titleCase(ctx.pp) });
  return clamp(text.charAt(0).toUpperCase() + text.slice(1), 158);
}

/* ------------------------------------------------------------------ *
 * Category catalogue
 *
 * `terms` are Openverse queries measured to return real StockSnap results;
 * `fallback` terms are tried when a pool comes up short. Brands are invented —
 * no real trademarks appear anywhere in this file.
 * ------------------------------------------------------------------ */

const CATEGORIES = [
  {
    slug: 'electronics',
    name: 'Electronics',
    tagline: 'Tech that keeps up with you',
    icon: 'cpu',
    accent: 'indigo',
    family: 'tech',
    weight: 22,
    price: [30000, 2400000],
    subcategories: [
      {
        slug: 'smart-home',
        name: 'Smart Home & Hubs',
        noun: ['hub', 'hubs'],
        desc: ['Smart Hub', 'Smart Plug', 'Sensor Kit', 'Motion Sensor'],
        sfx: ['Gen 3', 'Matter Ready', 'Wi-Fi 6', 'Dual-Band'],
        feat: [0, 1, 3, 5, 6, 8, 9, 11, 12],
        keys: ['Connectivity', 'Power', 'Housing', 'Dimensions', 'Standards', 'Warranty', 'In the box'],
      },
      {
        slug: 'wearables',
        name: 'Wearables & Trackers',
        noun: ['tracker', 'trackers'],
        desc: ['Fitness Band', 'Activity Tracker', 'Tracker Tag'],
        sfx: ['Gen 3', 'Bluetooth 5.3', 'Edition Two'],
        feat: [1, 6, 7, 9, 11, 12, 13],
        keys: ['Connectivity', 'Battery', 'Housing', 'Dimensions', 'Weight', 'Warranty', 'In the box'],
      },
      {
        slug: 'tablets-ereaders',
        name: 'Tablets & E-Readers',
        noun: ['reader', 'readers'],
        desc: ['E-Reader', 'Reading Tablet', 'Note Tablet'],
        sfx: ['Gen 3', 'Wi-Fi 6', 'Edition Two'],
        feat: [1, 2, 6, 9, 11, 12, 13],
        keys: ['Connectivity', 'Power', 'Battery', 'Housing', 'Dimensions', 'Weight', 'Warranty'],
      },
      {
        slug: 'power-charging',
        name: 'Power & Charging',
        noun: ['charger', 'chargers'],
        desc: ['Power Bank', 'Charging Dock', 'Wall Adapter', 'Travel Charger'],
        sfx: ['20 000 mAh', '65 W', 'Qi2', 'Gen 3'],
        feat: [2, 4, 5, 9, 10, 11, 13],
        keys: ['Power', 'Battery', 'Housing', 'Dimensions', 'Weight', 'Ports', 'Standards', 'Warranty'],
      },
      {
        slug: 'cables-adapters',
        name: 'Cables & Adapters',
        noun: ['adapter', 'adapters'],
        desc: ['USB-C Hub', 'Braided Cable Set', 'Multiport Adapter'],
        sfx: ['7-in-1', '65 W', '2 m', 'Gen 3'],
        feat: [2, 4, 5, 9, 10, 11, 'Every port is individually fused, so one bad device cannot take the rest down'],
        keys: ['Power', 'Housing', 'Dimensions', 'Weight', 'Ports', 'Standards', 'Warranty'],
      },
    ],
    terms: ['gadget', 'technology', 'electronics', 'tablet', 'cables', 'circuit board', 'monitor'],
    fallback: ['device', 'wireless technology', 'smart device'],
    brands: ['Aurora', 'Voltaic', 'Nimbus Labs', 'Helios', 'Kestrel', 'Lumen Works', 'Northwind', 'Axiom', 'Zephyr Tech'],
    models: ['Vertex', 'Halo', 'Pulse', 'Atlas', 'Ion', 'Nova', 'Relay', 'Beacon', 'Quanta', 'Orbit', 'Prism', 'Ember', 'Vector', 'Slate'],
    tags: ['electronics', 'smart', 'gadget', 'connected', 'tech'],
    vocab: {
      mat: ['anodised aluminium', 'recycled polycarbonate', 'matte ABS', 'brushed steel', 'soft-touch composite'],
      q: ['compact', 'quietly capable', 'well-engineered', 'unfussy', 'genuinely portable'],
      ctx: ['a cluttered desk', 'a small flat', 'a shared office', 'a busy household'],
      aud: ['commuters', 'remote workers', 'students', 'people with too many devices'],
      act: ['travelling light', 'working from three places a week', 'wiring up a smart home'],
      tail: ['a two-day battery', 'pass-through charging', 'a magnetic mount', 'app-free setup', 'braided cabling'],
    },
    features: [
      'Wi-Fi 6 and Bluetooth 5.3 radios with a shared low-power coprocessor',
      'Over-the-air firmware updates committed for five years',
      'USB-C in and out with 65 W pass-through charging',
      'Works locally when the internet drops — no cloud dependency for core functions',
      'Magnetic mounting plate included, with adhesive and screw options',
      'Anodised aluminium shell that doubles as a heatsink',
      'Status LED you can dim or switch off entirely',
      'Six-axis sensor with on-device processing, so nothing leaves the house',
      'Matter and Thread compatible out of the box',
      'Standby drain under 0.4 W',
      'Braided cabling rated for 10 000 bend cycles',
      'Setup completes in under 90 seconds without an account',
      'Optional physical privacy switch that cuts the radios at the hardware level',
      'Field-replaceable battery pack secured with standard screws',
    ],
    specs: [
      ['Connectivity', ['Wi-Fi 6 + BT 5.3', 'Wi-Fi 6E + BT 5.4', 'Wi-Fi 5 + BT 5.2', 'Thread + BT 5.3']],
      ['Power', ['USB-C PD 65 W', 'USB-C PD 30 W', 'Mains, 12 V DC', 'USB-C PD 100 W']],
      ['Battery', ['20 000 mAh', '10 000 mAh', '5 000 mAh', 'Mains powered']],
      ['Housing', ['Anodised aluminium', 'Recycled polycarbonate', 'Matte ABS', 'Brushed steel']],
      ['Dimensions', ['98 × 62 × 22 mm', '124 × 74 × 16 mm', '76 × 76 × 30 mm', '145 × 68 × 12 mm']],
      ['Weight', ['186 g', '242 g', '95 g', '410 g']],
      ['Ports', ['2 × USB-C, 1 × USB-A', '1 × USB-C', '3 × USB-C, HDMI 2.1', 'USB-C, Ethernet']],
      ['Standards', ['Matter 1.2, Thread 1.3', 'Qi2 certified', 'USB-IF certified', 'CE, FCC, RoHS']],
      ['Warranty', ['2 years', '3 years', '2 years + registration extension']],
      ['In the box', ['Unit, 1 m USB-C cable, mount', 'Unit, cable, adhesive plate, guide', 'Unit, cable, quick-start card']],
    ],
  },
  {
    slug: 'computers-laptops',
    name: 'Computers & Laptops',
    tagline: 'Machines that get out of the way',
    icon: 'laptop',
    accent: 'blue',
    family: 'tech',
    weight: 22,
    price: [180000, 8800000],
    subcategories: [
      {
        slug: 'laptops-ultrabooks',
        name: 'Laptops & Ultrabooks',
        noun: ['laptop', 'laptops'],
        desc: ['Ultrabook', 'Creator Laptop', 'Business Laptop'],
        sfx: ['16GB / 1TB', '32GB / 2TB', '14" 2.8K OLED', 'Thunderbolt 4'],
        feat: [0, 1, 3, 4, 5, 6, 7, 8, 9, 12],
        keys: ['Display', 'Processor', 'Memory', 'Storage', 'Graphics', 'Ports', 'Battery', 'Weight', 'Keyboard', 'Warranty'],
      },
      {
        slug: 'desktops-workstations',
        name: 'Desktops & Workstations',
        noun: ['workstation', 'workstations'],
        desc: ['Compact Desktop', 'Creator Workstation', 'Mini PC'],
        sfx: ['32GB / 2TB', '8-Core', '4TB Gen4'],
        feat: [0, 1, 3, 8, 9, 11, 12],
        keys: ['Processor', 'Memory', 'Storage', 'Graphics', 'Ports', 'Weight', 'Warranty'],
      },
      {
        slug: 'monitors',
        name: 'Monitors & Displays',
        noun: ['display', 'displays'],
        desc: [
          ['IPS Monitor', ['27" QHD 165Hz', '32" 4K 144Hz']],
          ['Portable Display', ['15.6" FHD', '14" 2.8K OLED']],
          ['Ultrawide Monitor', ['34" Ultrawide', '49" Super Ultrawide']],
        ],
        sfx: ['27" QHD 165Hz', '14" 2.8K OLED', '34" Ultrawide'],
        feat: [2, 4, 7, 8, 9, 12, 'Factory-calibrated to Delta-E under 2, with the report in the box'],
        keys: ['Display', 'Panel', 'Refresh rate', 'Ports', 'Stand', 'Weight', 'Warranty'],
        specs: [
          ['Panel', ['IPS, 8-bit + FRC', 'OLED, 10-bit', 'VA, 8-bit, 3000:1']],
          ['Refresh rate', ['165 Hz', '120 Hz', '60 Hz']],
          ['Stand', ['Height, tilt, swivel, pivot', 'Tilt only', 'VESA 100 mount only']],
        ],
      },
      {
        slug: 'keyboards-mice',
        name: 'Keyboards & Mice',
        noun: ['keyboard', 'keyboards'],
        desc: [
          ['Mechanical Keyboard', ['Hot-Swap 75%', '65% Layout', 'Full Size']],
          ['Wireless Keyboard', ['Low-Profile', '2.4G + BT', '75% Layout']],
          ['Ergonomic Mouse', ['2.4G + BT', '8000 Hz', 'Vertical']],
        ],
        sfx: ['Hot-Swap 75%', 'Low-Profile', '2.4G + BT'],
        feat: [3, 5, 8, 9, 10, 12, 'Every keycap is PBT doubleshot, so the legends cannot wear off'],
        keys: ['Keyboard', 'Switches', 'Layout', 'Polling rate', 'Battery', 'Ports', 'Weight', 'Warranty'],
        specs: [
          ['Switches', ['Hot-swap linear, 45 g', 'Tactile, 55 g', 'Low-profile scissor']],
          ['Layout', ['75% compact', '65% compact', 'Full size, 104 key']],
          ['Polling rate', ['1000 Hz', '8000 Hz', '125 Hz']],
        ],
      },
      {
        slug: 'storage-components',
        name: 'Storage & Components',
        noun: ['drive', 'drives'],
        desc: [
          ['NVMe SSD', ['1TB', '2TB', '4TB Gen4']],
          ['Portable SSD', ['1TB', '2TB', 'USB4']],
          ['Docking Station', ['Thunderbolt 4', '11-in-1', 'Dual 4K']],
        ],
        sfx: ['4TB Gen4', '1TB', 'Thunderbolt 4'],
        feat: [3, 4, 8, 9, 11, 12, 'Firmware is user-updatable from any OS, without a vendor utility'],
        keys: ['Storage', 'Interface', 'Sequential read', 'Endurance', 'Ports', 'Weight', 'Warranty'],
        specs: [
          ['Interface', ['PCIe Gen4 ×4', 'USB4 40 Gbps', 'SATA III 6 Gbps']],
          ['Endurance', ['1 200 TBW', '600 TBW', '2 400 TBW']],
          ['Sequential read', ['7 400 MB/s', '3 500 MB/s', '1 050 MB/s']],
        ],
      },
    ],
    terms: ['laptop', 'computer', 'keyboard', 'macbook', 'workspace desk', 'monitor', 'coding'],
    fallback: ['notebook computer', 'desktop computer', 'workstation'],
    brands: ['Aurora', 'Corveta', 'Meridian', 'Halcyon Systems', 'Basalt', 'Northwind', 'Foundry', 'Lumen Works', 'Teraline'],
    models: ['X14', 'X16', 'Studio', 'Forge', 'Slate', 'Atlas', 'Vertex', 'Meridian', 'Praxis', 'Verge', 'Onyx', 'Cirrus', 'Quill', 'Anvil'],
    tags: ['computers', 'laptop', 'productivity', 'workstation', 'pc'],
    vocab: {
      mat: ['CNC-milled aluminium', 'magnesium alloy', 'PBT doubleshot plastic', 'anodised unibody', 'carbon-fibre composite'],
      q: ['seriously fast', 'quiet under load', 'thoughtfully built', 'workhorse-grade', 'genuinely repairable'],
      ctx: ['a home office', 'a hot-desking floor', 'an edit bay', 'a small studio'],
      aud: ['developers', 'editors', 'analysts', 'people who live in twenty tabs'],
      act: ['compiling all afternoon', 'grading footage', 'running a dozen containers'],
      tail: ['a full-day battery', 'a genuinely good keyboard', 'user-replaceable RAM', 'a fanless idle', 'colour-accurate panel'],
    },
    features: [
      'Sustained turbo held for the length of a full render, not a 30-second benchmark',
      'Vapour chamber and dual fans that stay under 34 dB at typical load',
      'Colour-calibrated panel shipped with a per-unit calibration report',
      'User-replaceable SSD and RAM behind standard Phillips screws',
      'Thunderbolt 4 with 100 W charging and dual 4K display output',
      'Backlit keyboard with 1.5 mm travel and a proper inverted-T arrow cluster',
      'Full-day battery under mixed real-world use, not a video-loop figure',
      '1080p webcam with a physical shutter and a three-mic array',
      'Linux is supported and tested, not merely tolerated',
      'Service manual, schematics and part numbers published on day one',
      'Hot-swappable switches on a gasket-mounted plate',
      'PCIe Gen 4 storage with a heatsink that stops thermal throttling on long writes',
      'MIL-STD-810H drop and vibration tested at the chassis level',
    ],
    specs: [
      ['Display', ['14" 2.8K OLED, 120 Hz', '16" 3.2K IPS, 165 Hz', '27" QHD IPS, 165 Hz', '13.3" FHD IPS, 60 Hz', 'None (desktop)']],
      ['Processor', ['8-core, up to 4.9 GHz', '12-core, up to 5.2 GHz', '6-core, up to 4.4 GHz', '16-core, up to 5.4 GHz']],
      ['Memory', ['16 GB LPDDR5', '32 GB DDR5, 2 slots', '8 GB LPDDR5', '64 GB DDR5 ECC']],
      ['Storage', ['1 TB PCIe Gen4 NVMe', '2 TB PCIe Gen4 NVMe', '512 GB PCIe Gen4 NVMe', '4 TB PCIe Gen4 NVMe']],
      ['Graphics', ['Integrated, 12 CU', 'Discrete, 8 GB GDDR6', 'Discrete, 12 GB GDDR6', 'Integrated, 8 CU']],
      ['Ports', ['2 × TB4, HDMI 2.1, SD, 3.5 mm', '2 × USB-C, 2 × USB-A, HDMI', 'USB-C, DP 1.4, HDMI 2.1', '4 × USB-A, 2 × USB-C, RJ45']],
      ['Battery', ['72 Wh, 65 W charger', '99 Wh, 100 W charger', '54 Wh, 45 W charger', 'Mains powered']],
      ['Weight', ['1.29 kg', '1.86 kg', '2.4 kg', '5.8 kg']],
      ['Keyboard', ['Backlit, 1.5 mm travel', 'Hot-swap, gasket-mounted', 'Low-profile scissor', 'Not applicable']],
      ['Warranty', ['2 years', '3 years on-site', '2 years + accidental damage']],
    ],
  },
  {
    slug: 'mobile-phones',
    name: 'Mobile Phones',
    tagline: 'Pocket-sized, properly made',
    icon: 'smartphone',
    accent: 'violet',
    family: 'tech',
    weight: 22,
    price: [250000, 6200000],
    subcategories: [
      {
        slug: 'smartphones',
        name: 'Smartphones',
        noun: ['phone', 'phones'],
        desc: ['Smartphone', 'Rugged Smartphone', 'Compact Smartphone'],
        sfx: ['256GB 5G', '512GB 5G', '128GB Dual-SIM'],
        feat: [0, 1, 2, 3, 4, 5, 6, 7, 11],
        keys: ['Display', 'Storage', 'Memory', 'Battery', 'Rear camera', 'Charging', 'Protection', 'Connectivity', 'Support'],
      },
      {
        slug: 'cases-protection',
        name: 'Cases & Protection',
        noun: ['case', 'cases'],
        desc: [
          ['Silicone Case', ['Shock-Rated', 'MagSnap', 'Soft-Touch']],
          ['Leather Folio', ['Full-Grain', 'MagSnap', 'Card Slots']],
          ['Rugged Case', ['Shock-Rated', 'Drop-Tested', 'MagSnap']],
          ['Screen Protector', ['Tempered Glass', '2-Pack', 'Privacy']],
        ],
        sfx: ['Shock-Rated', 'Tempered Glass', 'MagSnap'],
        feat: [3, 7, 8, 9, 'Precision cutouts that line up with every button and port first time', 'Wireless charging works straight through it, so the case stays on', 'Raised camera lip keeps the lens glass off the table'],
        keys: ['Compatibility', 'Drop rating', 'Finish', 'Weight', 'Material', 'Protection', 'Support'],
        specs: [
          ['Compatibility', ['Fits the 6.4" model', 'Fits the 6.1" model', 'Universal, 6.1" – 6.7"']],
          ['Drop rating', ['3 m onto concrete', '2 m onto concrete', 'MIL-STD-810H']],
          ['Finish', ['Soft-touch matte', 'Full-grain leather', 'Clear, anti-yellowing']],
          ['Weight', ['38 g', '52 g', '9 g']],
        ],
      },
      {
        slug: 'phone-chargers',
        name: 'Chargers & Power',
        noun: ['charger', 'chargers'],
        desc: [
          ['GaN Charger', ['45 W GaN', '65 W Dual-Port', '30 W']],
          ['MagSafe Power Bank', ['10 000 mAh', '5 000 mAh', 'Qi2']],
          ['Car Charger', ['45 W Dual-Port', '30 W', 'USB-C']],
        ],
        sfx: ['45 W GaN', '10 000 mAh', 'Dual-Port'],
        feat: [2, 10, 3, 'Charges a phone and a laptop at once without derating either', 'Over-current, over-voltage and thermal protection on every port', 'Folding pins, so it will not shred the inside of a bag'],
        keys: ['Output', 'Capacity', 'Ports', 'Weight', 'Charging', 'Material', 'Support'],
        specs: [
          ['Output', ['45 W USB-C PD', '65 W total, dual port', '20 W USB-C']],
          ['Capacity', ['10 000 mAh', '5 000 mAh', 'Not applicable']],
          ['Ports', ['2 × USB-C', '1 × USB-C, 1 × USB-A', '1 × USB-C']],
          ['Weight', ['112 g', '198 g', '64 g']],
        ],
      },
      {
        slug: 'phone-accessories',
        name: 'Mounts & Accessories',
        noun: ['mount', 'mounts'],
        desc: [
          ['Car Mount', ['MagSnap', 'Vent Clip', 'Suction']],
          ['Camera Grip', ['Bluetooth', 'MagSnap', 'Two-Stage']],
          ['MagSafe Wallet', ['MagSnap', 'Full-Grain', '3 Cards']],
          ['Desk Stand', ['MagSnap', 'Adjustable', 'Aluminium']],
        ],
        sfx: ['MagSnap', 'Universal Fit', 'Shock-Rated'],
        feat: [3, 8, 9, 'Magnet array strong enough to hold through a case on a bad road', 'Adjusts one-handed while you are still moving', 'Silicone contact pads that will not mark a dashboard'],
        keys: ['Compatibility', 'Mounting', 'Hold force', 'Weight', 'Material', 'Support'],
        specs: [
          ['Compatibility', ['MagSafe and Qi2', 'Universal, 55 – 90 mm', 'Fits cases up to 4 mm']],
          ['Mounting', ['Vent clip', 'Adhesive dash pad', 'Suction cup']],
          ['Hold force', ['1.6 kg magnetic', 'Mechanical clamp', 'Not applicable']],
          ['Weight', ['86 g', '120 g', '32 g']],
        ],
      },
    ],
    terms: ['smartphone', 'mobile phone', 'iphone', 'texting', 'tablet', 'selfie'],
    fallback: ['phone', 'cell phone', 'mobile device'],
    brands: ['Kestrel', 'Aurora', 'Nadir', 'Solace Mobile', 'Zephyr Tech', 'Cobalt', 'Halcyon', 'Verity', 'Lumen Works'],
    models: ['One', 'Arc', 'Neo', 'Air', 'Edge', 'Field', 'Prime', 'Lite', 'Fold', 'Core', 'Trace', 'Halo'],
    tags: ['phones', 'mobile', '5g', 'smartphone', 'accessories'],
    vocab: {
      mat: ['aerospace aluminium', 'liquid silicone', 'full-grain leather', 'toughened glass', 'recycled polycarbonate'],
      q: ['pocketable', 'seriously durable', 'refreshingly simple', 'well-judged', 'no-nonsense'],
      ctx: ['a crowded commute', 'a building site', 'a beach holiday', 'a long day out'],
      aud: ['commuters', 'photographers', 'people who drop things', 'anyone who hates charging twice a day'],
      act: ['shooting on the move', 'navigating a new city', 'living out of a bag'],
      tail: ['a two-day battery', 'IP68 sealing', 'a matte anti-glare finish', 'wireless charging support'],
    },
    features: [
      'Six years of OS and security updates, written into the product page not the small print',
      'IP68 rated against dust and full immersion to 1.5 m',
      '5 000 mAh cell with 45 W wired and 15 W wireless charging',
      'Screen and battery replacement priced and published up front',
      'Dual physical SIM plus eSIM, all three usable at once',
      'Gorilla-grade toughened glass front and back with a raised camera lip',
      'Optical image stabilisation on both the main and telephoto cameras',
      'MIL-STD-810H drop tested to 1.2 m onto concrete',
      'Anti-yellowing polymer that stays clear for the life of the case',
      'Raised bezel lifts the screen clear of the surface when face down',
      'GaN internals run cool enough to charge a laptop and a phone at once',
      'Dual stereo speakers tuned by a studio, not a spreadsheet',
    ],
    specs: [
      ['Display', ['6.4" AMOLED, 120 Hz', '6.1" AMOLED, 90 Hz', '6.7" AMOLED, 120 Hz', 'Not applicable']],
      ['Storage', ['256 GB', '128 GB', '512 GB', 'Not applicable']],
      ['Memory', ['8 GB', '12 GB', '6 GB', 'Not applicable']],
      ['Battery', ['5 000 mAh', '4 600 mAh', '5 500 mAh', 'Not applicable']],
      ['Rear camera', ['50 MP + 12 MP UW + 8 MP tele', '50 MP + 12 MP UW', '108 MP + 12 MP UW + 5 MP macro', 'Not applicable']],
      ['Charging', ['45 W wired, 15 W wireless', '30 W wired', '65 W wired, 15 W wireless', '45 W GaN output']],
      ['Protection', ['IP68', 'IP67', 'Drop-rated to 2 m', 'Scratch-resistant coating']],
      ['Material', ['Aerospace aluminium', 'Liquid silicone', 'Full-grain leather', 'Recycled polycarbonate']],
      ['Connectivity', ['5G, Wi-Fi 6E, BT 5.3', '5G, Wi-Fi 6, BT 5.2', '4G, Wi-Fi 6, BT 5.1']],
      ['Support', ['6 years of updates', '2-year warranty', '5 years of updates']],
    ],
  },
  {
    slug: 'audio-headphones',
    name: 'Audio & Headphones',
    tagline: 'Sound worth sitting still for',
    icon: 'headphones',
    accent: 'fuchsia',
    family: 'tech',
    weight: 11,
    price: [60000, 2200000],
    subcategories: [
      {
        slug: 'over-ear',
        name: 'Over-Ear Headphones',
        noun: ['pair', 'pairs'],
        desc: ['Wireless ANC Headphones', 'Open-Back Headphones', 'Studio Headphones'],
        sfx: ['Pro', 'Studio Edition', '40 h Battery'],
        feat: [0, 1, 2, 3, 4, 5, 6, 8, 9, 11],
        keys: ['Driver', 'Frequency response', 'Impedance', 'Battery life', 'Codecs', 'Connectivity', 'Weight', 'Finish', 'Warranty'],
      },
      {
        slug: 'earbuds',
        name: 'Earbuds & In-Ear',
        noun: ['pair', 'pairs'],
        desc: [
          ['True Wireless Earbuds', ['Pro', 'ANC', '8 h + 24 h']],
          ['Sport Earbuds', ['IPX7', 'Ear Hook', 'ANC']],
          ['In-Ear Monitors', ['Pro', 'Dual Driver', 'Detachable Cable']],
        ],
        sfx: ['Pro', 'IPX7', 'ANC'],
        feat: [0, 3, 4, 7, 8, 9, 11, 2],
        keys: ['Driver', 'Frequency response', 'Battery life', 'Codecs', 'Connectivity', 'Weight', 'Rating', 'Warranty'],
        specs: [
          ['Weight', ['4.9 g per bud', '5.4 g per bud']],
        ],
      },
      {
        slug: 'speakers',
        name: 'Speakers & Soundbars',
        noun: ['speaker', 'speakers'],
        desc: [
          ['Bookshelf Speakers', ['2.1 Channel', 'Walnut Finish', '5" Woofer']],
          ['Portable Speaker', ['IPX7', '20 h Battery', 'Compact']],
          ['Soundbar', ['2.1 Channel', 'Dolby Atmos', 'Wall-Mount']],
        ],
        sfx: ['2.1 Channel', 'Walnut Finish', 'IPX7'],
        feat: [6, 7, 10, 11, 'Class-D amplification with a linear supply and no audible hiss at idle', 'Front-ported, so it can sit close to a wall without booming'],
        keys: ['Power', 'Frequency response', 'Impedance', 'Connectivity', 'Weight', 'Finish', 'Rating', 'Warranty'],
        specs: [
          ['Weight', ['5.4 kg pair', '2.1 kg', '3.8 kg']],
          ['Power', ['2 × 25 W class-D', '2 × 50 W class-D', '60 W total, 2.1']],
        ],
      },
      {
        slug: 'turntables-hifi',
        name: 'Turntables & Hi-Fi',
        noun: ['turntable', 'turntables'],
        desc: ['Belt-Drive Turntable', 'Phono Preamp', 'Hi-Fi Amplifier'],
        sfx: ['Walnut Finish', 'Hi-Res Certified', 'Studio Edition'],
        feat: [10, 'Belt-driven with a decoupled AC motor to keep rumble out of the platter', 'Aluminium tonearm with adjustable counterweight and anti-skate', 'Pre-fitted cartridge, aligned and tracking-force set at the factory', 'Ground lug and a proper phono stage, so no hum', 'Plinth is MDF-cored and internally damped rather than hollow'],
        keys: ['Drive', 'Speeds', 'Frequency response', 'Connectivity', 'Weight', 'Finish', 'Warranty'],
        specs: [
          ['Weight', ['5.6 kg', '4.2 kg']],
          ['Drive', ['Belt drive, AC synchronous', 'Direct drive', 'Not applicable']],
          ['Speeds', ['33 1/3 and 45 rpm', '33 1/3, 45 and 78 rpm', 'Not applicable']],
        ],
      },
      {
        slug: 'microphones',
        name: 'Microphones & Interfaces',
        noun: ['microphone', 'microphones'],
        desc: ['USB Condenser Mic', 'Audio Interface', 'Dynamic Broadcast Mic'],
        sfx: ['XLR', 'Studio Edition', '24-bit / 192 kHz'],
        feat: [6, 8, 'Cardioid capsule with a genuinely tight rejection pattern off-axis', 'Zero-latency monitoring straight off the front panel', 'Internal shockmount, so a knocked desk does not end the take', 'Class-compliant over USB — no driver install on any platform'],
        keys: ['Pattern', 'Resolution', 'Frequency response', 'Connectivity', 'Weight', 'Finish', 'Warranty'],
        specs: [
          ['Weight', ['620 g', '1.1 kg', '340 g']],
          ['Finish', ['Machined aluminium', 'Matte black composite', 'Brushed steel']],
          ['Pattern', ['Cardioid', 'Cardioid and omni', 'Supercardioid']],
          ['Resolution', ['24-bit / 192 kHz', '24-bit / 96 kHz', '16-bit / 48 kHz']],
        ],
      },
    ],
    terms: ['headphones', 'music', 'speaker', 'vinyl record', 'musician', 'dj', 'studio microphone'],
    fallback: ['audio equipment', 'sound system', 'listening music'],
    brands: ['Nimbus Audio', 'Marlowe', 'Auralis', 'Bellhaus', 'Cadence Labs', 'Vantage Sound', 'Torrent', 'Oriel', 'Rooftop Acoustics'],
    models: ['Drift', 'Meridian', 'Verse', 'Loom', 'Solstice', 'Canton', 'Rill', 'Aria', 'Bower', 'Kite', 'Vellum', 'Halcyon'],
    tags: ['audio', 'headphones', 'sound', 'hi-fi', 'wireless'],
    vocab: {
      mat: ['machined aluminium', 'protein leather', 'solid walnut', 'memory foam', 'woven ballistic nylon'],
      q: ['detailed', 'unfatiguing', 'properly tuned', 'honest-sounding', 'lively'],
      ctx: ['an open-plan office', 'a small living room', 'a night train', 'a home studio'],
      aud: ['commuters', 'producers', 'late-night listeners', 'people who still buy albums'],
      act: ['mixing after midnight', 'flying long-haul', 'rediscovering a record collection'],
      tail: ['40 hours of playback', 'replaceable earpads', 'a genuinely flat response', 'multipoint pairing'],
    },
    features: [
      'Hybrid adaptive ANC with a transparency mode that does not hiss',
      '40 hours of playback with ANC on, 60 with it off',
      'Replaceable earpads and a replaceable headband, sold as spares for a decade',
      'Multipoint Bluetooth holds two devices without dropping either',
      'LDAC and aptX Adaptive alongside AAC and SBC',
      'Custom 40 mm drivers with a tuning published as an actual frequency plot',
      'USB-C audio works while charging — no silent-while-plugged nonsense',
      'IPX7 sealing survives rain, sweat and an accidental drop in the sink',
      'Physical buttons with distinct shapes you can find without looking',
      'Wear detection that pauses reliably instead of guessing',
      'Solid walnut cabinets, internally braced to kill panel resonance',
      'Low-latency mode under 60 ms for video and games',
    ],
    specs: [
      ['Driver', ['40 mm dynamic', '10 mm dynamic', '50 mm planar magnetic', '2 × 25 W class-D', 'Cardioid condenser']],
      ['Frequency response', ['20 Hz – 20 kHz', '10 Hz – 40 kHz', '45 Hz – 22 kHz', '20 Hz – 22 kHz']],
      ['Impedance', ['32 Ω', '250 Ω', '16 Ω', '8 Ω nominal']],
      ['Battery life', ['40 h (ANC on)', '8 h + 24 h case', '20 h', 'Mains powered']],
      ['Codecs', ['LDAC, aptX Adaptive, AAC, SBC', 'aptX, AAC, SBC', 'AAC, SBC', 'Not applicable']],
      ['Connectivity', ['BT 5.3, USB-C, 3.5 mm', 'BT 5.3, USB-C', 'BT 5.2, RCA, optical', 'USB-C, XLR']],
      ['Weight', ['268 g', '4.9 g per bud', '5.4 kg pair', '1.1 kg']],
      ['Finish', ['Machined aluminium', 'Solid walnut', 'Matte black composite', 'Brushed steel']],
      ['Rating', ['IPX7', 'IPX4', 'Not rated']],
      ['Warranty', ['2 years', '3 years', '5 years on drivers']],
    ],
  },
  {
    slug: 'cameras-photography',
    name: 'Cameras & Photography',
    tagline: 'Gear for people who actually shoot',
    icon: 'camera',
    accent: 'amber',
    family: 'tech',
    weight: 7,
    price: [120000, 9000000],
    subcategories: [
      {
        slug: 'mirrorless-dslr',
        name: 'Mirrorless & DSLR',
        noun: ['camera', 'cameras'],
        desc: ['Mirrorless Body', 'Full-Frame Body', 'APS-C Body'],
        sfx: ['24MP', '45MP', '4K 60fps', 'Weather-Sealed'],
        feat: [0, 1, 2, 3, 4, 5, 7, 9, 10],
        keys: ['Sensor', 'Mount', 'ISO range', 'Stabilisation', 'Video', 'Build', 'Weight', 'Warranty'],
      },
      {
        slug: 'lenses',
        name: 'Lenses',
        noun: ['lens', 'lenses'],
        desc: [
          ['Prime Lens', ['35mm f/1.8', '85mm f/1.4', '50mm f/1.4']],
          ['Zoom Lens', ['24-70mm f/2.8', '70-200mm f/2.8', 'Weather-Sealed']],
          ['Macro Lens', ['100mm f/2.8', '1:1 Magnification', 'Weather-Sealed']],
        ],
        sfx: ['35mm f/1.8', '24-70mm f/2.8', '85mm f/1.4', 'Weather-Sealed'],
        feat: [0, 6, 11, 9, 'Eleven elements in eight groups, three of them low-dispersion glass', 'Internal focusing, so the barrel does not extend or rotate', 'Fluorine coating on the front element sheds water and fingerprints'],
        keys: ['Filter thread', 'Minimum focus', 'Mount', 'Focal length', 'Aperture', 'Build', 'Weight', 'Warranty'],
        specs: [
          ['Weight', ['385 g', '805 g', '1.2 kg']],
          ['Filter thread', ['67 mm', '77 mm', '82 mm']],
          ['Minimum focus', ['0.28 m', '0.38 m', '0.19 m']],
        ],
      },
      {
        slug: 'drones',
        name: 'Drones & Aerial',
        noun: ['drone', 'drones'],
        desc: ['Folding Drone', 'Cinema Drone', 'Compact Drone'],
        sfx: ['4K 60fps', '3-Axis', '34 min Flight'],
        feat: [3, 5, 7, 9, 'Folds to the size of a water bottle and fits in a jacket pocket', 'Omnidirectional obstacle sensing that actually stops before the branch', 'Return-to-home holds position in wind up to 10 m/s'],
        keys: ['Flight time', 'Range', 'Folded size', 'Sensor', 'Stabilisation', 'Video', 'Weight', 'Warranty'],
        specs: [
          ['Weight', ['249 g', '595 g', '895 g']],
          ['Flight time', ['34 min', '28 min', '46 min']],
          ['Range', ['12 km, occupancy dependent', '8 km', '6 km']],
          ['Folded size', ['180 × 96 × 84 mm', '214 × 120 × 92 mm']],
        ],
      },
      {
        slug: 'tripods-support',
        name: 'Tripods & Support',
        noun: ['tripod', 'tripods'],
        desc: [
          ['Carbon Tripod', ['Carbon Fibre', '168 cm', 'Arca-Swiss']],
          ['Travel Tripod', ['Folds to 42 cm', 'Carbon Fibre', 'Arca-Swiss']],
          ['Fluid Head Monopod', ['Fluid Head', '185 cm', 'Arca-Swiss']],
        ],
        sfx: ['Weather-Sealed', '3-Axis', 'Carbon Fibre'],
        feat: [8, 'Twist locks that release in a quarter turn and grip in the wet', 'Load rated to 12 kg with the centre column fully extended', 'Arca-Swiss compatible plate, so it works with what you already own', 'Spiked and rubber feet both supplied, swapped without a tool', 'Folds to 42 cm, which is short enough for a carry-on'],
        keys: ['Max height', 'Folded length', 'Load capacity', 'Head', 'Build', 'Weight', 'Warranty'],
        specs: [
          ['Build', ['Carbon fibre, 10-layer', 'Anodised aluminium', 'Magnesium alloy head']],
          ['Weight', ['1.42 kg', '1.86 kg', '680 g']],
          ['Max height', ['168 cm', '152 cm', '185 cm']],
          ['Folded length', ['42 cm', '54 cm', '38 cm']],
          ['Load capacity', ['12 kg', '8 kg', '20 kg']],
          ['Head', ['Ball head, Arca-Swiss', 'Fluid video head', 'Three-way pan/tilt']],
        ],
      },
      {
        slug: 'lighting-studio',
        name: 'Lighting & Studio',
        noun: ['light', 'lights'],
        desc: ['LED Panel', 'Bi-Colour Light', 'Softbox Kit'],
        sfx: ['Bi-Colour', 'Weather-Sealed', '120 W'],
        feat: [7, 9, 'CRI above 96 across the full 2700 – 6500 K range', 'Silent passive cooling — no fan noise on the audio track', 'Bowens mount, so every modifier on the market fits', 'V-mount battery plate as well as mains, for location work'],
        keys: ['Output', 'Colour temperature', 'CRI', 'Build', 'Weight', 'Warranty'],
        specs: [
          ['Build', ['Die-cast aluminium', 'Anodised aluminium', 'Polycarbonate, sealed']],
          ['Weight', ['1.9 kg', '3.4 kg', '820 g']],
          ['Output', ['120 W, 4 200 lux at 1 m', '60 W, 2 100 lux at 1 m', '200 W bi-colour']],
          ['Colour temperature', ['2700 – 6500 K', '5600 K fixed', '3200 – 5600 K']],
          ['CRI', ['96+', '98+', '92+']],
        ],
      },
    ],
    terms: ['camera', 'camera lens', 'photographer', 'drone', 'vintage camera', 'film photography', 'tripod'],
    fallback: ['photography', 'dslr camera', 'photo studio'],
    brands: ['Corveta', 'Vantor', 'Lumen Works', 'Praxis Optics', 'Aperture Nine', 'Halcyon', 'Foundry', 'Skylark', 'Sable Optics'],
    models: ['R7', 'M2', 'Field', 'Atlas', 'Prime', 'Verge', 'Skylark', 'Cardinal', 'Quill', 'Vista', 'Anvil', 'Lumen'],
    tags: ['photography', 'camera', 'lens', 'video', 'creator'],
    vocab: {
      mat: ['magnesium alloy', 'carbon fibre', 'weather-sealed polycarbonate', 'machined brass', 'anodised aluminium'],
      q: ['sharp', 'weather-sealed', 'genuinely portable', 'reliable', 'beautifully damped'],
      ctx: ['a wedding', 'a rainy hillside', 'a cramped studio', 'a long assignment'],
      aud: ['wedding shooters', 'documentary photographers', 'creators', 'anyone who has missed a shot to slow autofocus'],
      act: ['shooting all day', 'chasing light at dusk', 'filming handheld'],
      tail: ['weather sealing', 'dual card slots', 'in-body stabilisation', 'a proper manual focus ring'],
    },
    features: [
      'Weather-sealed at every seam, button and dial — tested to IP53',
      'In-body stabilisation rated at 7 stops with compatible lenses',
      'Dual UHS-II card slots configurable as backup, overflow or split',
      'Autofocus with subject detection for people, animals, vehicles and birds',
      'Fully articulating 3" touchscreen plus a 3.69 M-dot OLED viewfinder',
      '10-bit 4:2:2 internal recording with no arbitrary time limit',
      'Manual focus ring with a linear response and a hard stop at infinity',
      'USB-C tethering and charging while shooting',
      'Carbon-fibre legs with twist locks that actually lock in the wet',
      'Firmware updates keep adding features years after launch',
      'Battery grip and dummy battery available as first-party accessories',
      'Nine-blade rounded aperture for clean, circular highlights',
    ],
    specs: [
      ['Sensor', ['24.2 MP APS-C CMOS', '45 MP full-frame CMOS', '61 MP full-frame BSI', '1" stacked CMOS', 'Not applicable']],
      ['Mount', ['Proprietary Z-mount', 'E-mount compatible', 'Universal 1/4"-20', 'Not applicable']],
      ['ISO range', ['100 – 51 200', '64 – 102 400', '100 – 25 600', 'Not applicable']],
      ['Stabilisation', ['5-axis IBIS, 7 stops', '3-axis gimbal', 'Optical, 4 stops', 'None']],
      ['Video', ['4K 60p 10-bit 4:2:2', '6K 30p ProRes', '4K 30p 8-bit', 'Not applicable']],
      ['Focal length', ['35 mm', '24-70 mm', '85 mm', '70-200 mm', 'Not applicable']],
      ['Aperture', ['f/1.8', 'f/2.8 constant', 'f/1.4', 'f/4 constant', 'Not applicable']],
      ['Build', ['Magnesium alloy, sealed', 'Carbon fibre', 'Polycarbonate, sealed', 'Anodised aluminium']],
      ['Weight', ['658 g', '1.02 kg', '385 g', '1.6 kg']],
      ['Warranty', ['2 years', '3 years with registration']],
    ],
  },
  {
    slug: 'gaming',
    name: 'Gaming',
    tagline: 'Play like you mean it',
    icon: 'gamepad-2',
    accent: 'purple',
    family: 'tech',
    weight: 11,
    price: [45000, 3600000],
    subcategories: [
      {
        slug: 'consoles-handhelds',
        name: 'Consoles & Handhelds',
        noun: ['console', 'consoles'],
        desc: [
          ['Handheld Console', ['1080p 120Hz', '512GB', '7-Inch']],
          ['Retro Console', ['4-Player', 'HDMI', 'Wireless Pads']],
          ['Portable Gaming PC', ['512GB', '1080p 120Hz', '16GB']],
        ],
        sfx: ['Low-Latency 2.4G', '1080p 120Hz', '512GB'],
        feat: [0, 5, 10, 'Hall-effect sticks and triggers, so nothing drifts after a year', 'Suspends and resumes instantly, even mid-match', 'Runs a standard desktop OS — nothing is locked down'],
        keys: ['Display', 'Storage', 'Platform', 'Connection', 'Battery', 'Materials', 'Weight', 'Warranty'],
        specs: [
          ['Weight', ['608 g', '398 g', '512 g']],
          ['Display', ['7" 1080p 120 Hz LCD', '5.5" 720p OLED', 'Not applicable']],
          ['Storage', ['512 GB, microSD expandable', '256 GB', 'Not applicable']],
        ],
      },
      {
        slug: 'controllers',
        name: 'Controllers & Input',
        noun: ['controller', 'controllers'],
        desc: [
          ['Wireless Controller', ['Hall Effect', 'Low-Latency 2.4G', '1000 Hz']],
          ['Pro Controller', ['Hall Effect', 'Tournament Edition', 'Back Paddles']],
          ['Racing Wheel', ['900° Rotation', 'Force Feedback', '3-Pedal']],
          ['Arcade Stick', ['Tournament Edition', 'Sanwa Layout', 'Low-Latency 2.4G']],
        ],
        sfx: ['Hall Effect', 'Low-Latency 2.4G', '1000 Hz', 'Tournament Edition'],
        feat: [0, 1, 2, 3, 4, 5, 10],
        keys: ['Platform', 'Connection', 'Latency', 'Battery', 'Materials', 'Weight', 'Warranty'],
      },
      {
        slug: 'gaming-headsets',
        name: 'Gaming Headsets',
        noun: ['headset', 'headsets'],
        desc: ['Gaming Headset', 'Wireless Headset', 'Open-Back Headset'],
        sfx: ['7.1 Surround', 'Low-Latency 2.4G', '50 mm Drivers'],
        feat: [1, 5, 9, 10, 'Memory foam earpads that survive a six-hour session without clamping', 'Sidetone you can dial in, so you stop shouting at your team', 'Broadcast-grade mic that does not need a noise gate'],
        keys: ['Platform', 'Connection', 'Latency', 'Battery', 'Materials', 'Weight', 'Warranty'],
        specs: [
          ['Weight', ['312 g', '268 g', '340 g']],
        ],
      },
      {
        slug: 'gaming-chairs',
        name: 'Gaming Chairs & Desks',
        noun: ['chair', 'chairs'],
        desc: [
          ['Ergonomic Gaming Chair', ['Mesh Back', '4D Armrests', '150 kg Rated']],
          ['Sit-Stand Gaming Desk', ['140 cm', 'Dual-Motor', '160 cm']],
          ['Mesh Task Chair', ['Mesh Back', '4D Armrests', 'Adjustable Lumbar']],
        ],
        sfx: ['Mesh Back', 'Tournament Edition', '140 cm'],
        feat: [8, 'Class-4 gas lift certified well past the load it will ever see', 'Four-dimensional armrests that lock instead of drifting down', 'Cable tray and monitor riser included rather than sold separately', 'Assembles in 25 minutes with everything labelled'],
        keys: ['Max user weight', 'Adjustment', 'Dimensions', 'Materials', 'Weight', 'Warranty'],
        specs: [
          ['Materials', ['Breathable mesh, steel frame', 'Moulded foam and PU', 'Powder-coated steel and laminate']],
          ['Weight', ['17.4 kg', '21 kg', '32 kg']],
          ['Max user weight', ['150 kg', '120 kg', '180 kg']],
          ['Adjustment', ['Height, tilt, lumbar, 4D arms', 'Height and tilt', 'Electric, 62 – 128 cm']],
          ['Dimensions', ['70 × 70 × 125 cm', '140 × 70 × 75 cm']],
        ],
      },
      {
        slug: 'tabletop',
        name: 'Tabletop & Board Games',
        noun: ['game', 'games'],
        desc: ['Strategy Board Game', 'Deck Builder', 'Party Card Game', 'Cooperative Board Game'],
        sfx: ['4-Player', 'Tournament Edition', '2 – 5 Players'],
        feat: [6, 7, 11, 'Iconography does the work, so the reference card replaces the rulebook by round two', 'Plays in under an hour once everyone knows it', 'Balanced across a hundred recorded playtests, not a designer hunch'],
        keys: ['Players', 'Play time', 'Materials', 'Weight', 'Age'],
        specs: [
          ['Materials', ['350 gsm linen-finish board', '2 mm greyboard, linen finish', 'FSC board with wooden tokens']],
          ['Weight', ['1.8 kg', '620 g', '2.4 kg']],
        ],
      },
    ],
    terms: ['gaming', 'controller', 'board game', 'chess', 'puzzle', 'dice', 'keyboard'],
    fallback: ['video game', 'games', 'arcade'],
    brands: ['Ravenline', 'Volt Nine', 'Kestrel', 'Basalt', 'Nocturne', 'Foundry', 'Hexline', 'Aurora', 'Ironwake'],
    models: ['Vantage', 'Rift', 'Apex', 'Ronin', 'Havoc', 'Zenith', 'Warden', 'Tempo', 'Praxis', 'Ember', 'Draft', 'Talon'],
    tags: ['gaming', 'games', 'esports', 'controller', 'play'],
    vocab: {
      mat: ['textured ABS', 'breathable mesh', 'anodised aluminium', 'linen-finish board stock', 'moulded foam'],
      q: ['fast', 'genuinely comfortable', 'tournament-grade', 'drift-free', 'well-balanced'],
      ctx: ['a long session', 'a full lobby', 'a Friday night at the table', 'a shared living room'],
      aud: ['competitive players', 'couch co-op groups', 'board game clubs', 'people who play until 2am'],
      act: ['grinding ranked', 'hosting a game night', 'playing handheld on a train'],
      tail: ['Hall-effect sticks', 'sub-2 ms latency', 'swappable faceplates', 'a five-year switch rating'],
    },
    features: [
      'Hall-effect thumbsticks that do not develop drift, guaranteed for five years',
      'Sub-2 ms wireless over a dedicated 2.4 GHz link, with Bluetooth as a fallback',
      'Remappable back paddles with adjustable trigger stops',
      '1000 Hz polling with per-button actuation tuning',
      'Swappable faceplates and stick gates, all sold as spares',
      '40-hour battery with USB-C charge-and-play',
      'Linen-finish board and cards with a snap that survives real shuffling',
      'Rulebook written by a teacher, not a lawyer — first play starts in ten minutes',
      'Four-way lumbar support with a genuinely adjustable seat pan',
      'Detachable boom mic with a hardware mute you can feel',
      'Cross-platform by default: PC, console and mobile from the same unit',
      'Insert tray holds every component sorted and sleeved',
    ],
    specs: [
      ['Platform', ['PC, console, mobile', 'PC and console', 'Standalone handheld', 'Tabletop']],
      ['Connection', ['2.4 GHz + BT 5.2 + USB-C', 'USB-C wired', 'BT 5.3', 'Not applicable']],
      ['Latency', ['< 2 ms wireless', '< 1 ms wired', '< 8 ms', 'Not applicable']],
      ['Battery', ['40 h', '25 h', '6 h handheld', 'Not applicable']],
      ['Players', ['1', '1-2', '2-4', '2-6', '3-5']],
      ['Play time', ['20 min', '45-60 min', '90 min', 'Not applicable']],
      ['Materials', ['Textured ABS, aluminium', 'Breathable mesh, steel frame', '350 gsm linen board', 'Moulded foam, nylon']],
      ['Weight', ['248 g', '398 g', '17.4 kg', '1.8 kg']],
      ['Age', ['12+', '14+', '8+', 'Not applicable']],
      ['Warranty', ['2 years', '5 years on sticks', '3 years on frame']],
    ],
  },
  {
    slug: 'home-kitchen',
    name: 'Home & Kitchen',
    tagline: 'The good stuff, used daily',
    icon: 'utensils',
    accent: 'orange',
    family: 'home',
    weight: 22,
    price: [18000, 480000],
    subcategories: [
      {
        slug: 'cookware',
        name: 'Cookware & Pans',
        noun: ['pan', 'pans'],
        desc: ['Sauté Pan', 'Cast Iron Skillet', 'Saucepan', 'Stock Pot'],
        sfx: ['28 cm', '24 cm', '20 cm', 'Oven-Safe'],
        feat: [0, 1, 2, 5, 6, 7, 10],
        keys: ['Material', 'Size', 'Hob compatibility', 'Oven safe', 'Dishwasher safe', 'Handle', 'Weight', 'Guarantee'],
      },
      {
        slug: 'knives-cutting',
        name: 'Knives & Cutting',
        noun: ['knife', 'knives'],
        desc: [
          ['Chef’s Knife', ['20 cm Blade', '18 cm Blade', 'Full Tang']],
          ['Knife Block Set', ['Six-Piece', 'Full Tang', 'Beech Block']],
          ['Santoku Knife', ['18 cm Blade', 'Full Tang', 'High-Carbon']],
          ['Chopping Board', ['End-Grain', '40 × 30 cm', 'Reversible']],
        ],
        sfx: ['20 cm Blade', '16-Piece', 'Full Tang'],
        feat: [3, 5, 6, 'Hand-ground on a whetstone to a 15° edge and tested on paper before boxing', 'Full bolster balanced at the pinch grip, so the wrist does the least work', 'Ships with a sharpening guide and a lifetime free re-grind'],
        keys: ['Blade', 'Material', 'Size', 'Dishwasher safe', 'Handle', 'Weight', 'Care', 'Guarantee'],
        specs: [
          ['Material', ['High-carbon steel, 60 HRC', 'Damascus-clad VG-10', 'Stabilised beech and steel']],
          ['Size', ['20 cm blade', '18 cm blade', '16 cm blade', 'Six-piece block']],
          ['Weight', ['198 g', '242 g', '2.9 kg block']],
          ['Blade', ['High-carbon steel, 60 HRC', 'Damascus-clad VG-10', 'Stainless, 56 HRC']],
        ],
      },
      {
        slug: 'tableware',
        name: 'Tableware & Glass',
        noun: ['set', 'sets'],
        desc: [
          ['Stoneware Dinner Set', ['16-Piece', 'Set of 4', 'Reactive Glaze']],
          ['Glass Tumbler Set', ['Set of 4', 'Set of 6', '350 ml']],
          ['Serving Bowl', ['27 cm', 'Reactive Glaze', 'Stoneware']],
          ['Pasta Bowl Set', ['Set of 4', 'Stoneware', '22 cm']],
        ],
        sfx: ['Set of 4', 'Stoneware', '16-Piece'],
        feat: [4, 5, 6, 8, 'Fired twice at 1 240°C, so the glaze is fused rather than sitting on top', 'Stacks to a genuinely compact height, tested in a 30 cm cupboard', 'Every piece is sold individually, so one breakage is not a new set'],
        keys: ['Material', 'Size', 'Dishwasher safe', 'Weight', 'Capacity', 'Care', 'Guarantee'],
        specs: [
          ['Material', ['Reactive-glazed stoneware', 'Borosilicate glass', 'Recycled hand-blown glass']],
          ['Size', ['Set of 4', 'Set of 8', '27 cm plate']],
          ['Weight', ['620 g per piece', '3.2 kg set', '280 g per piece']],
        ],
      },
      {
        slug: 'coffee-tea',
        name: 'Coffee & Tea',
        noun: ['kettle', 'kettles'],
        desc: [
          ['Pour-Over Kettle', ['1 L', 'Gooseneck', 'Stainless']],
          ['French Press', ['1 L', '600 ml', 'Borosilicate']],
          ['Burr Grinder', ['40 Settings', 'Conical Burr', 'Stainless']],
          ['Tea Pot', ['1 L', '600 ml', 'Borosilicate']],
        ],
        sfx: ['1 L', 'Gooseneck', 'Stainless'],
        feat: [11, 5, 6, 'Holds brew temperature within 2°C for the length of a pour', 'Borosilicate glass that survives a genuine thermal shock', 'Every seal and filter is a stocked spare, not a reason to rebuy'],
        keys: ['Material', 'Dishwasher safe', 'Handle', 'Weight', 'Capacity', 'Care', 'Guarantee'],
        specs: [
          ['Weight', ['840 g', '1.2 kg', '380 g']],
          ['Capacity', ['1 L', '350 ml', '600 ml']],
        ],
      },
      {
        slug: 'storage-organisation',
        name: 'Storage & Organisation',
        noun: ['jar', 'jars'],
        desc: ['Storage Jar Set', 'Food Container Set', 'Bread Bin', 'Utensil Crock'],
        sfx: ['Set of 4', 'Airtight', '1 L'],
        feat: [5, 6, 9, 8, 'Airtight to the point that a coffee bean stays fresh for a month', 'Stacks and nests, which is the whole point of a storage set', 'Silicone gaskets are replaceable and sold in packs of four'],
        keys: ['Material', 'Size', 'Dishwasher safe', 'Weight', 'Capacity', 'Care', 'Guarantee'],
        specs: [
          ['Material', ['Borosilicate glass and bamboo', 'Reactive-glazed stoneware', 'Recycled glass and steel']],
          ['Size', ['Set of 4', 'Set of 3', '1 L']],
          ['Weight', ['1.9 kg set', '480 g', '2.4 kg']],
        ],
      },
    ],
    terms: ['kitchen', 'cooking', 'baking', 'coffee', 'tea cup', 'dishes', 'cutlery'],
    fallback: ['kitchen table', 'meal', 'chef'],
    brands: ['Verdant', 'Copperfield', 'Marrow & Oak', 'Terra Nine', 'Basil Row', 'Hearthline', 'Saltworks', 'Bellhaus', 'Grainhouse'],
    models: ['Provence', 'Harvest', 'Everyday', 'Atelier', 'Foundry', 'Nordic', 'Loam', 'Sable', 'Hearth', 'Rill', 'Orchard', 'Fen'],
    tags: ['kitchen', 'cookware', 'home', 'dining', 'cooking'],
    vocab: {
      mat: ['tri-ply stainless steel', 'seasoned cast iron', 'reactive-glazed stoneware', 'stabilised beech', 'hand-forged carbon steel'],
      q: ['hard-wearing', 'properly weighted', 'oven-safe', 'genuinely useful', 'handsome'],
      ctx: ['a small kitchen', 'a weeknight rush', 'a Sunday roast', 'a shared flat'],
      aud: ['home cooks', 'people who cook every night', 'new households', 'anyone tired of warped pans'],
      act: ['searing steak', 'batch-cooking on a Sunday', 'making coffee before anyone else is up'],
      tail: ['an induction-ready base', 'a lifetime guarantee', 'a riveted handle', 'a dishwasher-safe finish'],
    },
    features: [
      'Tri-ply construction with an aluminium core running all the way up the walls',
      'Works on induction, gas, ceramic and in the oven to 260°C',
      'Riveted stainless handle that stays cool on the hob and never works loose',
      'Full-tang blade with a 15° edge, hardened to 60 HRC',
      'Reactive glaze means no two pieces come out exactly alike',
      'Stacks and nests cleanly, which matters in a real cupboard',
      'Dishwasher safe, though a rinse and a towel keeps the finish better',
      'Lifetime guarantee against warping and delamination',
      'Chip-resistant rim tested to 3 000 impact cycles',
      'Airtight bamboo lid with a replaceable silicone gasket',
      'Pre-seasoned with flaxseed oil and ready to cook straight from the box',
      'Gooseneck spout gives genuine control over pour rate',
    ],
    specs: [
      ['Material', ['Tri-ply stainless steel', 'Seasoned cast iron', 'Reactive-glazed stoneware', 'Borosilicate glass', 'High-carbon steel']],
      ['Size', ['28 cm', '24 cm', '20 cm', '1 L', '16-piece set']],
      ['Hob compatibility', ['Induction, gas, ceramic, halogen', 'Induction and gas', 'Not applicable']],
      ['Oven safe', ['To 260°C', 'To 220°C', 'To 180°C', 'Not oven safe']],
      ['Dishwasher safe', ['Yes', 'Hand wash recommended', 'Yes, top rack']],
      ['Handle', ['Riveted stainless', 'Stabilised beech', 'Integral cast', 'Silicone-wrapped']],
      ['Weight', ['1.4 kg', '2.8 kg', '640 g', '3.2 kg']],
      ['Capacity', ['2.8 L', '1 L', '350 ml per piece', '4 × 750 ml']],
      ['Care', ['Dishwasher safe', 'Hand wash, dry immediately', 'Re-season occasionally']],
      ['Guarantee', ['Lifetime', '10 years', '5 years']],
    ],
  },
  {
    slug: 'furniture',
    name: 'Furniture',
    tagline: 'Pieces that outlast the trend',
    icon: 'armchair',
    accent: 'stone',
    family: 'home',
    weight: 7,
    price: [180000, 4800000],
    subcategories: [
      {
        slug: 'sofas-seating',
        name: 'Sofas & Seating',
        noun: ['sofa', 'sofas'],
        desc: ['Two-Seater Sofa', 'Three-Seater Sofa', 'Armchair', 'Footstool'],
        sfx: ['Boucle', 'Solid Oak', 'Removable Covers'],
        feat: [0, 2, 3, 4, 5, 6, 7, 10],
        keys: ['Material', 'Dimensions', 'Seat height', 'Assembly', 'Upholstery', 'Weight', 'Origin', 'Guarantee'],
      },
      {
        slug: 'tables-desks',
        name: 'Tables & Desks',
        noun: ['table', 'tables'],
        desc: ['Oak Dining Table', 'Standing Desk', 'Console Table', 'Nesting Coffee Tables'],
        sfx: ['Solid Oak', '160 cm', 'Walnut Veneer', 'Flat-Pack'],
        feat: [0, 1, 2, 5, 6, 7, 8, 10, 11],
        keys: ['Material', 'Dimensions', 'Weight capacity', 'Assembly', 'Finish', 'Weight', 'Origin', 'Guarantee'],
      },
      {
        slug: 'beds-mattresses',
        name: 'Beds & Mattresses',
        noun: ['frame', 'frames'],
        desc: ['Bed Frame', 'Slatted Bed Base', 'Upholstered Headboard'],
        sfx: ['King Size', 'Double', 'Solid Oak'],
        feat: [0, 1, 2, 4, 5, 7, 10, 'Sprung beech slats on adjustable rubber cups, not a sheet of chipboard', 'Silent by design — no metal-on-metal joint anywhere in the frame'],
        keys: ['Material', 'Dimensions', 'Weight capacity', 'Assembly', 'Finish', 'Weight', 'Origin', 'Guarantee'],
        specs: [
          ['Dimensions', ['210 × 165 × 95 cm', '200 × 145 × 90 cm']],
          ['Weight', ['46 kg', '38 kg']],
        ],
      },
      {
        slug: 'storage-shelving',
        name: 'Storage & Shelving',
        noun: ['unit', 'units'],
        desc: ['Open Shelving Unit', 'Sideboard', 'Bookcase', 'Shoe Cabinet'],
        sfx: ['Solid Oak', 'Walnut Veneer', 'Flat-Pack'],
        feat: [0, 1, 2, 5, 6, 7, 10, 11],
        keys: ['Material', 'Dimensions', 'Weight capacity', 'Assembly', 'Finish', 'Weight', 'Origin', 'Guarantee'],
        specs: [
          ['Dimensions', ['180 × 35 × 90 cm', '75 × 40 × 180 cm']],
          ['Weight', ['32 kg', '24 kg']],
        ],
      },
      {
        slug: 'office-chairs',
        name: 'Office Chairs',
        noun: ['chair', 'chairs'],
        desc: ['Ergonomic Task Chair', 'Mesh Desk Chair', 'Drafting Stool'],
        sfx: ['Mesh Back', 'Adjustable Lumbar', 'Flat-Pack'],
        feat: [1, 4, 6, 9, 'Synchronous tilt with four lock points and adjustable tension', 'Seat pan slides 60 mm, which is the adjustment most chairs leave out', 'BIFMA-tested to 100 000 cycles before a single unit shipped'],
        keys: ['Dimensions', 'Seat height', 'Weight capacity', 'Assembly', 'Upholstery', 'Weight', 'Guarantee'],
        specs: [
          ['Dimensions', ['68 × 68 × 118 cm', '66 × 66 × 112 cm']],
          ['Weight', ['16 kg', '19 kg']],
        ],
      },
    ],
    terms: ['chair', 'table', 'sofa', 'furniture', 'bedroom', 'interior design', 'living room'],
    fallback: ['wooden chair', 'dining table', 'armchair'],
    brands: ['Marrow & Oak', 'Halden', 'Northgrove', 'Bellhaus', 'Larkspur', 'Fenwick Row', 'Terra Nine', 'Quarry', 'Ashvale'],
    models: ['Halden', 'Nordic', 'Sable', 'Linden', 'Fen', 'Ridge', 'Alder', 'Quarry', 'Meadow', 'Bramble', 'Verge', 'Cove'],
    tags: ['furniture', 'home', 'living', 'interior', 'wood'],
    vocab: {
      mat: ['solid European oak', 'FSC walnut', 'powder-coated steel', 'wool bouclé', 'kiln-dried ash'],
      q: ['solid', 'quietly handsome', 'built to be moved', 'properly joined', 'unfussy'],
      ctx: ['a small flat', 'a family living room', 'a rented house', 'a home office'],
      aud: ['first-time buyers', 'people who move often', 'anyone furnishing a first flat', 'renters'],
      act: ['moving flat again', 'working from home full time', 'hosting eight for dinner'],
      tail: ['mortise-and-tenon joints', 'a ten-year frame guarantee', 'replaceable covers', 'tool-free assembly'],
    },
    features: [
      'Kiln-dried hardwood frame with mortise-and-tenon joinery, not staples',
      'Assembles with the supplied hex key in under 20 minutes',
      'Disassembles and reassembles repeatedly without the joints loosening',
      'Removable, machine-washable covers available in eleven colourways',
      'Ten-year guarantee on the frame and suspension',
      'Hand-finished with a hardwax oil you can repair with a cloth',
      'Felt pads pre-fitted so it will not mark a wooden floor',
      'Fits through a standard 76 cm doorway fully assembled',
      'Height adjusts from 68 to 122 cm with a dual-motor lift',
      'Load-rated to 120 kg with a genuinely tested safety margin',
      'FSC-certified timber traceable to the mill',
      'Cable management built into the frame rather than clipped on afterwards',
    ],
    specs: [
      ['Material', ['Solid European oak', 'FSC walnut veneer on ply', 'Powder-coated steel and ash', 'Wool bouclé on hardwood']],
      ['Dimensions', ['180 × 90 × 75 cm', '140 × 80 × 74 cm', '210 × 92 × 82 cm', '120 × 60 × 72 cm']],
      ['Seat height', ['45 cm', '42 cm', '46-56 cm adjustable', 'Not applicable']],
      ['Weight capacity', ['120 kg', '150 kg', '80 kg per shelf', '300 kg distributed']],
      ['Assembly', ['20 minutes, hex key supplied', 'Fully assembled', 'Two people, 40 minutes']],
      ['Finish', ['Hardwax oil', 'Matte lacquer', 'Powder coat, RAL 7016', 'Natural, unfinished']],
      ['Upholstery', ['Wool bouclé, removable', 'Recycled polyester weave', 'Full-grain leather', 'Not applicable']],
      ['Weight', ['28 kg', '46 kg', '14.5 kg', '62 kg']],
      ['Origin', ['Made in Portugal', 'Made in Poland', 'Made in Egypt']],
      ['Guarantee', ['10 years on frame', '5 years', '15 years on frame']],
    ],
  },
  {
    slug: 'home-decor',
    name: 'Home Decor',
    tagline: 'The finishing five percent',
    icon: 'lamp',
    accent: 'rose',
    family: 'home',
    weight: 7,
    price: [15000, 380000],
    subcategories: [
      {
        slug: 'lighting',
        name: 'Lamps & Lighting',
        noun: ['lamp', 'lamps'],
        desc: [
          ['Table Lamp', ['Linen Shade', 'Brass', 'Dimmable']],
          ['Floor Lamp', ['Linen Shade', 'Brass', 'Dimmable']],
          ['Pendant Light', ['Ø 35 cm', 'Brass', 'Linen Shade']],
          ['Wall Sconce', ['Brass', 'Dimmable', 'Plug-In']],
        ],
        sfx: ['Linen Shade', 'Brass', 'Dimmable'],
        feat: [1, 2, 3, 8, 9, 10, 'Fabric flex in a colour chosen to go with the shade, not against it', 'Inline switch placed where your hand actually lands'],
        keys: ['Material', 'Dimensions', 'Finish', 'Light source', 'Colour temperature', 'Weight', 'Origin', 'Packaging'],
        specs: [
          ['Dimensions', ['H 42 cm × Ø 16 cm', 'H 152 cm × Ø 40 cm', 'Ø 35 cm shade']],
          ['Weight', ['1.8 kg', '4.2 kg', '620 g']],
          ['Material', ['Unlacquered brass and linen', 'Oiled ash and cotton', 'Powder-coated steel']],
        ],
      },
      {
        slug: 'wall-art',
        name: 'Wall Art & Frames',
        noun: ['print', 'prints'],
        desc: [
          ['Framed Print', ['50 × 70 cm', '30 × 40 cm', 'Oak Frame']],
          ['Giclée Print', ['50 × 70 cm', 'A2', 'Unframed']],
          ['Poster Frame', ['50 × 70 cm', 'A2', 'Oak Frame']],
          ['Gallery Set', ['Set of 3', 'Set of 2', 'Oak Frame']],
        ],
        sfx: ['50 × 70 cm', 'Set of 2', 'Oak Frame'],
        feat: [6, 9, 10, 11, 'Printed with pigment inks rated at 100 years without visible fade', 'Hanging hardware and a paper spirit level are in the box'],
        keys: ['Material', 'Dimensions', 'Finish', 'Care', 'Weight', 'Origin', 'Packaging'],
        specs: [
          ['Dimensions', ['50 × 70 cm', '30 × 40 cm', 'A2, 42 × 59 cm']],
          ['Weight', ['1.6 kg', '820 g', '2.4 kg']],
          ['Material', ['Oak frame, museum glazing', 'Aluminium frame, acrylic glazing', 'Unframed giclée on cotton rag']],
        ],
      },
      {
        slug: 'vases-ceramics',
        name: 'Vases & Ceramics',
        noun: ['vase', 'vases'],
        desc: ['Stoneware Vase', 'Ceramic Bowl', 'Bud Vase Set', 'Serving Platter'],
        sfx: ['Hand-Thrown', 'Set of 2', 'Reactive Glaze'],
        feat: [0, 8, 9, 11, 'Watertight without a liner, which not every hand-thrown vase manages', 'Foot is wax-resisted and sanded, so it will not scratch a table'],
        keys: ['Material', 'Dimensions', 'Finish', 'Care', 'Weight', 'Origin', 'Packaging'],
      },
      {
        slug: 'textiles-rugs',
        name: 'Textiles & Rugs',
        noun: ['rug', 'rugs'],
        desc: [
          ['Handwoven Rug', ['160 × 230 cm', '200 × 300 cm', 'Hand-Knotted']],
          ['Cushion Cover', ['Set of 2', '45 × 45 cm', 'Undyed Linen']],
          ['Linen Throw', ['130 × 180 cm', 'Undyed Linen', 'Stonewashed']],
          ['Runner Rug', ['80 × 250 cm', 'Hand-Knotted', 'Undyed']],
        ],
        sfx: ['160 × 230 cm', 'Set of 2', 'Undyed Linen'],
        feat: [4, 5, 9, 11, 'Colour-fast to a wet rub test, so it will not transfer onto a sofa', 'Backed with a natural latex that grips without gluing itself to the floor'],
        keys: ['Material', 'Dimensions', 'Finish', 'Care', 'Weight', 'Origin', 'Packaging'],
        specs: [
          ['Weight', ['9.4 kg', '3.2 kg', '480 g']],
        ],
      },
      {
        slug: 'candles-scent',
        name: 'Candles & Scent',
        noun: ['candle', 'candles'],
        desc: [
          ['Scented Candle', ['220 g', '55 h Burn', 'Set of 2']],
          ['Reed Diffuser', ['200 ml', 'Set of 2', '12 Weeks']],
          ['Refill Candle', ['220 g', 'Set of 2', '55 h Burn']],
          ['Room Spray', ['100 ml', 'Set of 2', 'Alcohol-Free']],
        ],
        sfx: ['220 g', '55 h Burn', 'Set of 2'],
        feat: [7, 9, 11, 'Poured in batches of forty and cured for a fortnight before it is sold', 'Vessel is a usable tumbler once the wax is gone', 'Scented at 8%, which is strong enough to fill a room and stop there'],
        keys: ['Material', 'Dimensions', 'Burn time', 'Care', 'Weight', 'Origin', 'Packaging'],
        specs: [
          ['Dimensions', ['Ø 8 × H 10 cm', 'Ø 10 × H 12 cm', 'H 22 cm']],
          ['Weight', ['420 g', '680 g', '210 g']],
          ['Material', ['Coconut-rapeseed wax, glass vessel', 'Soy wax, stoneware vessel', 'Rattan reeds, glass base']],
        ],
      },
    ],
    terms: ['vase', 'home decor', 'wall art', 'mirror', 'candle', 'interior design', 'flowers'],
    fallback: ['decoration', 'lamp', 'living room'],
    brands: ['Larkspur', 'Terra Nine', 'Bellhaus', 'Ochre & Ash', 'Fenwick Row', 'Verdant', 'Kilnhouse', 'Meridian Home', 'Saltworks'],
    models: ['Loam', 'Ochre', 'Dune', 'Fen', 'Cove', 'Linden', 'Marl', 'Sable', 'Orchard', 'Bramble', 'Vellum', 'Cirrus'],
    tags: ['decor', 'interior', 'home', 'styling', 'handmade'],
    vocab: {
      mat: ['hand-thrown stoneware', 'unlacquered brass', 'undyed linen', 'hand-spun wool', 'solid ash'],
      q: ['quietly beautiful', 'tactile', 'hand-finished', 'understated', 'warm'],
      ctx: ['a north-facing room', 'a rented flat', 'a hallway that needed something', 'a small bedroom'],
      aud: ['renters', 'people who hate overhead lighting', 'anyone finishing a room', 'gift-buyers'],
      act: ['making a rented flat feel like yours', 'warming up a bare corner', 'setting a table properly'],
      tail: ['a warm 2700 K glow', 'a hand-glazed finish', 'a dimmable driver', 'natural fibres throughout'],
    },
    features: [
      'Hand-thrown, so the throwing lines and slight asymmetry are the point',
      'Warm 2700 K light with a CRI above 95 — colours look right under it',
      'Fully dimmable with any standard trailing-edge dimmer',
      'Unlacquered brass that develops a patina rather than flaking',
      'Undyed, GOTS-certified linen that softens with every wash',
      'Hand-knotted by a workshop paid a published day rate',
      'Museum-grade anti-glare glazing that does not wash the print out',
      'Coconut and rapeseed wax with a cotton wick — 55 hours of clean burn',
      'Weighted base so it will not tip when a cable is caught',
      'Ships in moulded pulp packaging with no plastic at all',
      'Frame is a standard size, so replacement glazing is easy to source',
      'Every piece is signed and dated on the base by the maker',
    ],
    specs: [
      ['Material', ['Hand-thrown stoneware', 'Unlacquered brass and linen', 'Hand-spun wool', 'Solid ash and glass']],
      ['Dimensions', ['24 × 18 cm', '50 × 70 cm', '160 × 230 cm', 'H 42 cm × Ø 16 cm', 'H 152 cm']],
      ['Finish', ['Reactive glaze, matte', 'Brushed brass', 'Natural undyed', 'Oiled ash']],
      ['Light source', ['E27, max 60 W, LED recommended', 'Integrated LED, 9 W', 'Not applicable']],
      ['Colour temperature', ['2700 K warm white', '3000 K', 'Not applicable']],
      ['Burn time', ['55 hours', '38 hours', 'Not applicable']],
      ['Care', ['Wipe clean, damp cloth', 'Professional clean only', 'Vacuum on low, no beater bar']],
      ['Weight', ['1.8 kg', '620 g', '9.4 kg', '3.1 kg']],
      ['Origin', ['Hand-made in Egypt', 'Made in Portugal', 'Made in India']],
      ['Packaging', ['Plastic-free moulded pulp', 'Recycled card', 'Reusable cotton bag']],
    ],
  },
  {
    slug: 'appliances',
    name: 'Appliances',
    tagline: 'The machines that do the work',
    icon: 'washing-machine',
    accent: 'sky',
    family: 'home',
    weight: 4,
    price: [180000, 5600000],
    subcategories: [
      {
        slug: 'laundry',
        name: 'Washers & Dryers',
        noun: ['machine', 'machines'],
        desc: ['Washing Machine', 'Heat-Pump Dryer', 'Washer Dryer'],
        sfx: ['9 kg A+++', '8 kg', '1400 rpm'],
        feat: [0, 1, 2, 3, 4, 8, 9, 10, 11],
        keys: ['Capacity', 'Energy rating', 'Noise level', 'Dimensions', 'Programmes', 'Motor', 'Finish', 'Installation', 'Spares availability', 'Warranty'],
      },
      {
        slug: 'refrigeration',
        name: 'Fridges & Freezers',
        noun: ['fridge', 'fridges'],
        desc: ['Fridge Freezer', 'Under-Counter Fridge', 'Chest Freezer'],
        sfx: ['330 L No-Frost', 'Frost-Free', 'A++'],
        feat: [0, 1, 3, 5, 9, 10, 11, 'Independent zones, so the salad drawer is not fighting the freezer', 'Holds temperature for 14 hours in a power cut'],
        keys: ['Capacity', 'Energy rating', 'Noise level', 'Dimensions', 'Motor', 'Finish', 'Installation', 'Spares availability', 'Warranty'],
        specs: [
          ['Dimensions', ['600 × 650 × 1850 mm', '595 × 545 × 820 mm']],
        ],
      },
      {
        slug: 'cooking-appliances',
        name: 'Ovens & Hobs',
        noun: ['oven', 'ovens'],
        desc: [
          ['Built-In Oven', ['73 L Pyrolytic', '60 cm', 'A+']],
          ['Induction Hob', ['60 cm', '77 cm', 'Flex Zone']],
          ['Double Oven', ['110 L', '60 cm', 'A+']],
          ['Gas Hob', ['60 cm', '75 cm', 'Cast Iron Supports']],
        ],
        sfx: ['73 L Pyrolytic', '60 cm', 'A+'],
        feat: [1, 3, 6, 8, 9, 11, 'Triple-glazed door that stays under 45°C on the outside pane', 'Telescopic runners so a heavy roasting tin comes out level'],
        keys: ['Capacity', 'Energy rating', 'Dimensions', 'Programmes', 'Finish', 'Installation', 'Spares availability', 'Warranty'],
        specs: [
          ['Dimensions', ['595 × 595 × 595 mm', '600 × 520 × 55 mm']],
        ],
      },
      {
        slug: 'coffee-machines',
        name: 'Coffee Machines',
        noun: ['machine', 'machines'],
        desc: [
          ['Espresso Machine', ['15 Bar', 'PID Control', '58 mm']],
          ['Bean-to-Cup Machine', ['1.8 L', '15 Bar', 'Ceramic Burr']],
          ['Filter Coffee Maker', ['1.2 L', 'Thermal Carafe', 'SCA Certified']],
        ],
        sfx: ['15 Bar', '1.8 L', 'PID Control'],
        feat: [3, 7, 8, 11, 'PID holds the group head within 1°C, which is what repeatability actually needs', 'Standard 58 mm portafilter, so every basket and tamper fits', 'Descaling is a twenty-minute cycle you run four times a year'],
        keys: ['Capacity', 'Dimensions', 'Finish', 'Installation', 'Spares availability', 'Warranty'],
        specs: [
          ['Capacity', ['1.8 L', '2.5 L', '1.2 L']],
          ['Dimensions', ['290 × 340 × 400 mm', '240 × 300 × 380 mm']],
        ],
      },
      {
        slug: 'small-appliances',
        name: 'Small Appliances',
        noun: ['appliance', 'appliances'],
        desc: [
          ['Stand Mixer', ['5.5 L', '1200 W', '6 Speeds']],
          ['Cordless Vacuum', ['60 min Runtime', 'HEPA', '0.8 L']],
          ['Air Fryer', ['5.5 L', '1700 W', 'Dual Basket']],
          ['Blender', ['1.8 L', '1200 W', 'Vacuum Blend']],
        ],
        sfx: ['5.5 L', '60 min Runtime', '1200 W'],
        feat: [0, 2, 3, 9, 11, 'All-metal gearbox rather than a nylon one that strips on a stiff dough', 'Every attachment is dishwasher safe and sold separately for years'],
        keys: ['Capacity', 'Noise level', 'Dimensions', 'Programmes', 'Motor', 'Finish', 'Installation', 'Spares availability', 'Warranty'],
        specs: [
          ['Capacity', ['5.5 L', '1.8 L', '0.6 L']],
          ['Dimensions', ['290 × 340 × 400 mm', '240 × 220 × 320 mm']],
        ],
      },
    ],
    terms: ['espresso', 'laundry', 'stove', 'appliance', 'coffee machine', 'mixer', 'oven', 'kitchen appliance', 'refrigerator', 'fan'],
    fallback: ['washing machine', 'home appliance', 'dishwasher', 'toaster', 'vacuum cleaner'],
    brands: ['Copperfield', 'Halcyon Home', 'Northwind', 'Verdant', 'Bellhaus', 'Quarry', 'Meridian Home', 'Ironwake', 'Saltworks'],
    models: ['Provence', 'Atelier', 'Nordic', 'Hearth', 'Foundry', 'Verge', 'Praxis', 'Loam', 'Cirrus', 'Anvil', 'Orchard', 'Kite'],
    tags: ['appliances', 'home', 'kitchen', 'laundry', 'energy-efficient'],
    vocab: {
      mat: ['brushed stainless steel', 'enamelled steel', 'tempered glass', 'die-cast aluminium', 'powder-coated steel'],
      q: ['quiet', 'efficient', 'seriously well built', 'low-maintenance', 'repairable'],
      ctx: ['a small kitchen', 'a flat with thin walls', 'a family of five', 'a busy weekday morning'],
      aud: ['families', 'people in flats', 'anyone who has replaced a machine twice in five years', 'home baristas'],
      act: ['running three loads a day', 'baking every weekend', 'pulling shots before work'],
      tail: ['a ten-year motor guarantee', 'a 44 dB spin cycle', 'a published spare-parts list', 'an A+++ rating'],
    },
    features: [
      'Inverter motor guaranteed for ten years, with a published part number',
      'A+++ energy rating verified under the current EU test cycle',
      'Runs at 44 dB on wash and 72 dB on spin — usable in a flat with thin walls',
      'Every wear part is a stocked spare, listed with a price on the support site',
      'Heat-pump drying uses roughly half the energy of a vented equivalent',
      'No-frost cooling with independent temperature zones',
      'Pyrolytic self-clean cycle that leaves ash you brush out',
      '15-bar pump with PID temperature control and a real steam wand',
      'Delay start up to 24 hours so you can run it on off-peak tariffs',
      'Child lock on the door and on the controls, separately',
      'Reversible door hinge, swappable in about ten minutes',
      'Filter and seal replacements posted free for the first three years',
    ],
    specs: [
      ['Capacity', ['9 kg', '8 kg', '330 L', '73 L', '5.5 L', '1.8 L']],
      ['Energy rating', ['A+++', 'A++', 'A', 'B']],
      ['Noise level', ['44 dB wash / 72 dB spin', '62 dB', '38 dB', '76 dB']],
      ['Dimensions', ['600 × 600 × 850 mm', '595 × 595 × 595 mm', '600 × 650 × 1850 mm', '290 × 340 × 400 mm']],
      ['Programmes', ['15 programmes', '12 programmes', '9 programmes', 'Not applicable']],
      ['Motor', ['Brushless inverter, 10-yr guarantee', 'Universal, 2-yr guarantee', 'Digital inverter']],
      ['Finish', ['Brushed stainless steel', 'Enamelled white', 'Matte graphite', 'Tempered glass front']],
      ['Installation', ['Freestanding', 'Built-in', 'Countertop', 'Integrated']],
      ['Spares availability', ['10 years', '7 years', '15 years']],
      ['Warranty', ['2 years parts and labour', '5 years parts and labour', '10 years on motor']],
    ],
  },
];

CATEGORIES.push(
  {
    slug: 'fashion-men',
    name: 'Fashion — Men',
    tagline: 'Clothes that get better with wear',
    icon: 'shirt',
    accent: 'slate',
    family: 'fashion',
    weight: 11,
    price: [35000, 720000],
    subcategories: [
      {
        slug: 'shirts',
        name: 'Shirts & Polos',
        noun: ['shirt', 'shirts'],
        desc: ['Linen Oxford Shirt', 'Poplin Shirt', 'Short-Sleeve Camp Shirt', 'Piqué Polo'],
        sfx: ['Slim Fit', 'Regular Fit', 'Garment Dyed'],
        feat: [0, 1, 2, 3, 4, 5, 7, 10, 11],
        keys: ['Fabric', 'Fit', 'Collar', 'Closure', 'Sizes', 'Care', 'Origin', 'Weight', 'Detailing', 'Returns'],
      },
      {
        slug: 'trousers-jeans',
        name: 'Trousers & Jeans',
        noun: ['pair', 'pairs'],
        desc: ['Selvedge Denim Jeans', 'Chino Trousers', 'Pleated Trousers', 'Drawstring Trousers'],
        sfx: ['Slim Fit', 'Tapered', '13.5 oz', 'Relaxed Fit'],
        feat: [1, 3, 4, 5, 6, 8, 9, 10],
        keys: ['Fabric', 'Fit', 'Closure', 'Sizes', 'Care', 'Origin', 'Weight', 'Detailing', 'Returns'],
      },
      {
        slug: 'outerwear-men',
        name: 'Jackets & Outerwear',
        noun: ['jacket', 'jackets'],
        desc: ['Waxed Cotton Jacket', 'Overshirt', 'Field Jacket', 'Bomber Jacket'],
        sfx: ['Unlined', 'Regular Fit', 'Garment Dyed'],
        feat: [1, 4, 5, 7, 8, 9, 11, 'Waxed in Scotland and re-waxable at home with a tin and a hairdryer', 'Cut with a pivot sleeve, so reaching does not lift the hem'],
        keys: ['Fabric', 'Fit', 'Closure', 'Sizes', 'Care', 'Origin', 'Weight', 'Detailing', 'Returns'],
      },
      {
        slug: 'knitwear-men',
        name: 'Knitwear & Sweats',
        noun: ['knit', 'knits'],
        desc: ['Merino Crew Knit', 'Lambswool Jumper', 'Loopback Sweatshirt', 'Half-Zip Knit'],
        sfx: ['Regular Fit', 'Relaxed Fit', 'Garment Dyed'],
        feat: [3, 5, 10, 11, 'Fully fashioned, so the panels are knitted to shape rather than cut from a sheet', 'Ribbed cuffs and hem knitted at a tighter gauge so they keep their shape', '19.5 micron merino, which is fine enough to wear against skin'],
        keys: ['Fabric', 'Fit', 'Sizes', 'Care', 'Origin', 'Weight', 'Detailing', 'Returns'],
      },
      {
        slug: 'suiting',
        name: 'Suiting & Tailoring',
        noun: ['suit', 'suits'],
        desc: ['Two-Piece Suit', 'Unstructured Blazer', 'Wool Waistcoat'],
        sfx: ['Slim Fit', 'Regular Fit', 'Unlined'],
        feat: [1, 4, 5, 7, 8, 11, 'Half-canvassed chest that moulds to you rather than a fused sheet of glue', 'Working cuff buttons and a 6 cm let-out in the seat and waist'],
        keys: ['Fabric', 'Fit', 'Closure', 'Sizes', 'Care', 'Origin', 'Weight', 'Detailing', 'Returns'],
      },
    ],
    terms: ['suit', 'jeans', 'shirt', 'tie', 'leather shoes', 'mens fashion'],
    fallback: ['clothing', 'menswear', 'fashion'],
    brands: ['Cairo Threads', 'Halden & Co', 'Marlowe', 'Fenwick Row', 'Ashvale', 'Corvid', 'Loom Street', 'Northgrove', 'Bellamy'],
    models: ['Oxford', 'Harbour', 'Drift', 'Camden', 'Ridge', 'Sable', 'Linden', 'Ashcroft', 'Verge', 'Foundry', 'Warden', 'Cove'],
    tags: ['menswear', 'fashion', 'shirts', 'denim', 'wardrobe'],
    vocab: {
      mat: ['Egyptian long-staple cotton', 'Irish linen', 'selvedge denim', 'extra-fine merino', 'waxed cotton canvas'],
      q: ['well-cut', 'hard-wearing', 'breathable', 'quietly smart', 'properly finished'],
      ctx: ['a Cairo summer', 'an office with no dress code', 'a long commute', 'a weekend away'],
      aud: ['men who own three shirts they actually wear', 'commuters', 'anyone building a smaller wardrobe'],
      act: ['dressing for 38 degrees', 'going straight from the office to dinner', 'travelling with hand luggage only'],
      tail: ['mother-of-pearl buttons', 'a clean single-needle finish', 'a fit guide that works', 'flat-locked seams'],
    },
    features: [
      'Woven from long-staple Egyptian cotton spun at a single mill',
      'Single-needle side seams at 18 stitches per inch',
      'Mother-of-pearl buttons, cross-stitched so they stay on',
      'Pre-shrunk and colour-fast — the first wash changes nothing',
      'Bar-tacked at the pocket corners and stress points',
      'Cut on a consistent grade across the whole range, so your size stays your size',
      'Selvedge denim woven on shuttle looms and left raw for you to break in',
      'Unlined shoulders keep the weight down in real heat',
      'YKK Excella hardware throughout',
      'Reinforced gusset at the side seam for movement',
      'Machine washable at 30°C — no dry-cleaning bill',
      'Spare buttons and a length of matching thread included',
    ],
    specs: [
      ['Fabric', ['100% Egyptian cotton, 120 gsm', '100% Irish linen, 180 gsm', '13.5 oz selvedge denim', '100% extra-fine merino, 19.5 micron']],
      ['Fit', ['Slim', 'Regular', 'Relaxed', 'Tapered']],
      ['Collar', ['Button-down', 'Cutaway', 'Spread', 'Not applicable']],
      ['Closure', ['Mother-of-pearl buttons', 'YKK Excella zip', 'Corozo buttons', 'Button fly']],
      ['Sizes', ['S – XXL', 'XS – XXL', '28 – 40 waist', '46 – 56 chest']],
      ['Care', ['Machine wash 30°C, hang dry', 'Machine wash 30°C, cool iron', 'Wash cold inside out, sparingly']],
      ['Origin', ['Made in Egypt', 'Made in Portugal', 'Made in Turkey']],
      ['Weight', ['180 gsm', '340 gsm', '13.5 oz', '260 gsm']],
      ['Detailing', ['Single-needle side seams', 'Flat-locked seams', 'Chain-stitched hem']],
      ['Returns', ['Free size exchange, 30 days', 'Free returns, 60 days']],
    ],
  },
  {
    slug: 'fashion-women',
    name: 'Fashion — Women',
    tagline: 'Pieces you reach for first',
    icon: 'shopping-bag',
    accent: 'pink',
    family: 'fashion',
    weight: 22,
    price: [35000, 850000],
    subcategories: [
      {
        slug: 'dresses',
        name: 'Dresses',
        noun: ['dress', 'dresses'],
        desc: ['Midi Dress', 'Wrap Dress', 'Slip Dress', 'Tiered Maxi Dress'],
        sfx: ['Bias Cut', 'Belted', 'A-Line', 'Tiered'],
        feat: [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11],
        keys: ['Fabric', 'Fit', 'Length', 'Lining', 'Sizes', 'Care', 'Origin', 'Closure', 'Certification', 'Returns'],
      },
      {
        slug: 'tops-blouses',
        name: 'Tops & Blouses',
        noun: ['blouse', 'blouses'],
        desc: ['Silk Blouse', 'Linen Shirt', 'Cotton Poplin Top', 'Camisole'],
        sfx: ['Relaxed', 'Cropped', 'Bias Cut'],
        feat: [0, 1, 2, 3, 4, 5, 10, 11],
        keys: ['Fabric', 'Fit', 'Length', 'Sizes', 'Care', 'Origin', 'Closure', 'Certification', 'Returns'],
      },
      {
        slug: 'skirts-trousers',
        name: 'Skirts & Trousers',
        noun: ['piece', 'pieces'],
        desc: ['Pleated Skirt', 'Wide-Leg Trousers', 'Tailored Trousers', 'Denim Skirt'],
        sfx: ['A-Line', 'Cropped', 'Belted', 'Longline'],
        feat: [0, 1, 2, 4, 7, 9, 10, 11],
        keys: ['Fabric', 'Fit', 'Length', 'Lining', 'Sizes', 'Care', 'Origin', 'Closure', 'Returns'],
      },
      {
        slug: 'outerwear-women',
        name: 'Coats & Outerwear',
        noun: ['coat', 'coats'],
        desc: ['Trench Coat', 'Wool Overcoat', 'Quilted Jacket', 'Linen Blazer'],
        sfx: ['Belted', 'Longline', 'Relaxed'],
        feat: [0, 2, 5, 9, 10, 11, 'Storm flap, gun patch and a throat latch that actually fastens', 'Cut with room for a knit underneath, which most coats forget'],
        keys: ['Fabric', 'Fit', 'Length', 'Lining', 'Sizes', 'Care', 'Origin', 'Closure', 'Returns'],
      },
      {
        slug: 'knitwear-women',
        name: 'Knitwear',
        noun: ['knit', 'knits'],
        desc: ['Cashmere Cardigan', 'Merino Crew Knit', 'Ribbed Knit Dress', 'Cotton Cardigan'],
        sfx: ['Cropped', 'Longline', 'Relaxed'],
        feat: [2, 8, 10, 11, 'Fully fashioned panels knitted to shape rather than cut from a sheet', 'Two-ply grade-A cashmere from a mill that publishes its fibre length', 'Pills less because the fibre is longer, not because of a coating'],
        keys: ['Fabric', 'Fit', 'Length', 'Sizes', 'Care', 'Origin', 'Certification', 'Returns'],
      },
    ],
    terms: ['dress', 'fashion model', 'womens fashion', 'skirt', 'boutique', 'handbag'],
    fallback: ['clothing', 'fashion', 'style'],
    brands: ['Cairo Threads', 'Larkspur', 'Aveline', 'Marlowe', 'Ochre & Ash', 'Sorrel', 'Bellamy', 'Loom Street', 'Wren & Vale'],
    models: ['Amara', 'Solene', 'Nadia', 'Vela', 'Isla', 'Farah', 'Linden', 'Juniper', 'Marlow', 'Sabine', 'Cove', 'Wren'],
    tags: ['womenswear', 'fashion', 'dresses', 'style', 'wardrobe'],
    vocab: {
      mat: ['washed silk', 'Belgian linen', 'organic cotton poplin', 'grade-A cashmere', 'Tencel twill'],
      q: ['beautifully cut', 'easy to wear', 'quietly elegant', 'breathable', 'well-finished'],
      ctx: ['a Cairo summer', 'a wedding you have three weeks to plan for', 'a long working day', 'a weekend away'],
      aud: ['women building a wardrobe that lasts', 'people who dress for the heat', 'anyone tired of one-season clothes'],
      act: ['going from desk to dinner', 'packing for ten days in a carry-on', 'dressing for 38 degrees'],
      tail: ['French seams throughout', 'real pockets', 'a lining you can actually wear in summer', 'a size range from 6 to 22'],
    },
    features: [
      'French seams throughout, so the inside is as clean as the outside',
      'Real pockets, deep enough for a phone, set into the side seam',
      'Cut and graded on real bodies from a 6 through to a 22',
      'Washed silk that can go in a cool machine cycle — no dry-cleaning bill',
      'Belgian linen that softens with every wear rather than creasing into a mess',
      'Covered buttons and a concealed placket for a clean line',
      'Bias-cut so it moves with you instead of hanging off you',
      'Adjustable waist tie that actually stays tied',
      'Grade-A cashmere, 2-ply, from a mill that publishes its fibre length',
      'Lining is cupro rather than polyester, which matters in heat',
      'OEKO-TEX certified dyes with no azo compounds',
      'Free hemming to your length on full-price orders',
    ],
    specs: [
      ['Fabric', ['100% washed silk, 19 mm', '100% Belgian linen, 190 gsm', 'Organic cotton poplin, 130 gsm', '100% cashmere, 2-ply']],
      ['Fit', ['Relaxed', 'True to size', 'Slim through the waist', 'Oversized']],
      ['Length', ['Midi, 118 cm', 'Maxi, 138 cm', 'Cropped, 52 cm', 'Longline, 96 cm']],
      ['Lining', ['Cupro', 'Unlined', 'Organic cotton', 'Not applicable']],
      ['Sizes', ['UK 6 – 22', 'XS – XXL', 'One size', 'UK 8 – 20']],
      ['Care', ['Machine wash cold, hang dry', 'Hand wash, dry flat', 'Machine wash 30°C, cool iron']],
      ['Origin', ['Made in Egypt', 'Made in Portugal', 'Made in Italy']],
      ['Closure', ['Concealed side zip', 'Covered buttons', 'Wrap and tie', 'Pull-on']],
      ['Certification', ['OEKO-TEX Standard 100', 'GOTS organic', 'Not certified']],
      ['Returns', ['Free returns, 30 days', 'Free size exchange, 60 days']],
    ],
  },
  {
    slug: 'shoes',
    name: 'Shoes',
    tagline: 'Miles before they look tired',
    icon: 'footprints',
    accent: 'zinc',
    family: 'accessory',
    weight: 11,
    price: [70000, 980000],
    subcategories: [
      {
        slug: 'sneakers',
        name: 'Sneakers & Trainers',
        noun: ['pair', 'pairs'],
        desc: ['Leather Sneakers', 'Canvas Trainers', 'Retro Runners'],
        sfx: ['Full-Grain', 'Cup Sole', 'Wide Fit'],
        feat: [1, 4, 5, 6, 9, 10, 11, 'Vulcanised cup sole bonded under heat rather than glued cold', 'Padded collar that does not collapse after a hundred wears'],
        keys: ['Upper', 'Sole', 'Construction', 'Lining', 'Footbed', 'Sizes', 'Weight', 'Care'],
      },
      {
        slug: 'boots',
        name: 'Boots',
        noun: ['pair', 'pairs'],
        desc: ['Chelsea Boots', 'Chukka Boots', 'Work Boots', 'Hiking Boots'],
        sfx: ['Goodyear Welted', 'Vibram Sole', 'Waterproof'],
        feat: [0, 1, 2, 3, 5, 6, 7, 8, 11],
        keys: ['Upper', 'Sole', 'Construction', 'Lining', 'Footbed', 'Sizes', 'Weight', 'Water resistance', 'Care'],
      },
      {
        slug: 'formal-shoes',
        name: 'Formal & Loafers',
        noun: ['pair', 'pairs'],
        desc: ['Penny Loafers', 'Derby Shoes', 'Oxford Shoes', 'Tassel Loafers'],
        sfx: ['Goodyear Welted', 'Full-Grain', 'Unlined'],
        feat: [0, 1, 3, 5, 6, 7, 11, 'Blake-stitched forepart keeps the sole slim enough for a suit', 'Leather sole with a discreet rubber topy already fitted'],
        keys: ['Upper', 'Sole', 'Construction', 'Lining', 'Footbed', 'Sizes', 'Weight', 'Care'],
      },
      {
        slug: 'sandals',
        name: 'Sandals & Slides',
        noun: ['pair', 'pairs'],
        desc: ['Leather Sandals', 'Cork Footbed Slides', 'Woven Sandals'],
        sfx: ['Cork Footbed', 'Full-Grain', 'Wide Fit'],
        feat: [1, 3, 4, 5, 9, 11, 'Vegetable-tanned straps that darken and soften rather than crack', 'Footbed is replaceable, which is what usually ends a pair of sandals'],
        keys: ['Upper', 'Sole', 'Construction', 'Footbed', 'Sizes', 'Weight', 'Care'],
      },
      {
        slug: 'running-shoes',
        name: 'Running & Training',
        noun: ['pair', 'pairs'],
        desc: ['Road Running Shoes', 'Trail Runners', 'Gym Trainers'],
        sfx: ['Cushioned', '8 mm Drop', 'Vibram Sole'],
        feat: [2, 4, 5, 9, 10, 'Supercritical foam midsole that still bounces at 600 km', 'Engineered mesh with no overlays where blisters normally start', 'Outsole rubber placed only where wear data said it was needed'],
        keys: ['Upper', 'Sole', 'Footbed', 'Sizes', 'Drop', 'Weight', 'Water resistance'],
      },
    ],
    terms: ['shoes', 'sneakers', 'boots', 'leather shoes', 'running shoes', 'high heels'],
    fallback: ['footwear', 'walking', 'trainers'],
    brands: ['Marlowe', 'Ashvale', 'Corvid', 'Stride & Sole', 'Fenwick Row', 'Halden & Co', 'Terrafirm', 'Bellamy', 'Northgrove'],
    models: ['Court', 'Trailhead', 'Camden', 'Harbour', 'Ridge', 'Verge', 'Sable', 'Drift', 'Foundry', 'Alder', 'Cove', 'Quarry'],
    tags: ['shoes', 'footwear', 'sneakers', 'boots', 'leather'],
    vocab: {
      mat: ['full-grain calf leather', 'vegetable-tanned leather', 'Vibram rubber', 'recycled canvas', 'suede'],
      q: ['comfortable from day one', 'resoleable', 'genuinely durable', 'well-lasted', 'grippy'],
      ctx: ['a city commute', 'a wet winter', 'a wedding in August', 'a fortnight of walking'],
      aud: ['people who walk everywhere', 'commuters', 'anyone who wears out shoes in a season'],
      act: ['walking 12 000 steps a day', 'standing through a long shift', 'covering a city on foot'],
      tail: ['a resoleable welt', 'a Vibram outsole', 'a cork footbed that moulds to you', 'a wide-fit option'],
    },
    features: [
      'Goodyear welted, so they can be resoled two or three times over',
      'Full-grain leather from a tannery with an LWG Gold rating',
      'Vibram outsole with a tread that clears mud instead of packing it',
      'Cork footbed that moulds to your foot within a fortnight',
      'Comfortable from the first day — there is no break-in to endure',
      'Available in a genuine wide fit, not just a half size up',
      'Vegetable-tanned lining that handles sweat without going hard',
      'Steel shank gives arch support through a long day standing',
      'Water-resistant treatment reapplied easily with a standard wax',
      'Removable insole so you can drop in your own orthotic',
      'Recycled rubber outsole with 8 mm of stack under the heel',
      'Resoling service offered at cost for the life of the shoe',
    ],
    specs: [
      ['Upper', ['Full-grain calf leather', 'Vegetable-tanned leather', 'Recycled canvas', 'Waxed suede', 'Engineered mesh']],
      ['Sole', ['Vibram rubber', 'Leather with rubber topy', 'EVA foam, 8 mm drop', 'Cup sole, vulcanised']],
      ['Construction', ['Goodyear welted', 'Blake stitched', 'Cemented', 'Vulcanised']],
      ['Lining', ['Vegetable-tanned leather', 'Unlined', 'Breathable mesh', 'Shearling']],
      ['Footbed', ['Cork, moulds to foot', 'Removable EVA', 'Leather over foam']],
      ['Sizes', ['EU 39 – 46', 'EU 36 – 42', 'EU 40 – 47, wide fit available']],
      ['Drop', ['8 mm', '4 mm', '10 mm', 'Not applicable']],
      ['Weight', ['420 g per shoe', '265 g per shoe', '580 g per shoe']],
      ['Water resistance', ['Water-resistant, re-waxable', 'Fully waterproof membrane', 'Not water resistant']],
      ['Care', ['Brush, condition, polish', 'Wipe clean', 'Machine wash cold']],
    ],
  },
  {
    slug: 'bags-luggage',
    name: 'Bags & Luggage',
    tagline: 'Carry it without thinking about it',
    icon: 'briefcase',
    accent: 'amber',
    family: 'accessory',
    weight: 7,
    price: [60000, 1300000],
    subcategories: [
      {
        slug: 'backpacks',
        name: 'Backpacks',
        noun: ['backpack', 'backpacks'],
        desc: ['Commuter Backpack', 'Travel Backpack', 'Roll-Top Backpack'],
        sfx: ['20 L', '35 L', 'Water-Resistant', 'Recycled Nylon'],
        feat: [0, 1, 2, 5, 6, 7, 8, 10, 11],
        keys: ['Capacity', 'Material', 'Laptop fit', 'Dimensions', 'Weight', 'Hardware', 'Water resistance', 'Carry', 'Warranty', 'Origin'],
      },
      {
        slug: 'suitcases',
        name: 'Suitcases & Cabin Bags',
        noun: ['case', 'cases'],
        desc: ['Cabin Suitcase', 'Check-In Suitcase', 'Hard-Shell Spinner'],
        sfx: ['55 cm', '68 L', 'Recycled Shell'],
        feat: [3, 4, 6, 7, 11, 'Polycarbonate shell that flexes and returns rather than cracking', 'TSA lock recessed flush so it cannot be levered off', 'Wheels and handles are replaceable with a screwdriver and a part number'],
        keys: ['Capacity', 'Material', 'Dimensions', 'Weight', 'Hardware', 'Warranty', 'Origin'],
        specs: [
          ['Dimensions', ['55 × 40 × 23 cm', '75 × 50 × 30 cm']],
          ['Weight', ['2.6 kg', '3.8 kg', '4.4 kg']],
        ],
      },
      {
        slug: 'totes-shoulder',
        name: 'Totes & Shoulder Bags',
        noun: ['tote', 'totes'],
        desc: ['Leather Tote', 'Canvas Tote', 'Sling Bag', 'Shoulder Bag'],
        sfx: ['Full-Grain', 'Water-Resistant', '16" Laptop'],
        feat: [0, 1, 6, 8, 9, 10, 'Base is a single piece of leather, so the corners cannot wear through', 'Strap is adjustable and removable without a tool'],
        keys: ['Capacity', 'Material', 'Laptop fit', 'Dimensions', 'Weight', 'Hardware', 'Warranty', 'Origin'],
        specs: [
          ['Dimensions', ['40 × 32 × 12 cm', '36 × 28 × 10 cm', '24 × 16 × 6 cm']],
          ['Weight', ['780 g', '520 g', '1.1 kg']],
        ],
      },
      {
        slug: 'laptop-bags',
        name: 'Laptop & Work Bags',
        noun: ['bag', 'bags'],
        desc: ['Laptop Messenger', 'Briefcase', 'Work Tote'],
        sfx: ['16" Laptop', 'Water-Resistant', 'Recycled Nylon'],
        feat: [0, 1, 2, 6, 8, 9, 11, 'Opens to 90° on a desk so you can work out of it without unpacking'],
        keys: ['Capacity', 'Material', 'Laptop fit', 'Dimensions', 'Weight', 'Hardware', 'Water resistance', 'Warranty'],
        specs: [
          ['Dimensions', ['42 × 30 × 12 cm', '38 × 28 × 10 cm']],
          ['Weight', ['980 g', '1.3 kg']],
        ],
      },
      {
        slug: 'travel-accessories',
        name: 'Travel Accessories',
        noun: ['set', 'sets'],
        desc: ['Packing Cube Set', 'Toiletry Roll', 'Tech Organiser', 'Passport Wallet'],
        sfx: ['Set of 3', 'Water-Resistant', 'Recycled Nylon'],
        feat: [1, 2, 6, 8, 10, 'Mesh panels so you can see what is in a cube without opening it', 'Compression zip that actually reclaims 30% of the volume'],
        keys: ['Capacity', 'Material', 'Dimensions', 'Weight', 'Hardware', 'Warranty', 'Origin'],
        specs: [
          ['Dimensions', ['35 × 25 × 10 cm', '28 × 20 × 8 cm', '22 × 12 × 4 cm']],
          ['Weight', ['180 g', '96 g', '240 g']],
          ['Capacity', ['Set of 3, 18 L total', '5 L', '1.5 L']],
          ['Material', ['Recycled ripstop nylon', '1680D ballistic nylon', 'Full-grain leather']],
        ],
      },
    ],
    terms: ['backpack', 'travel bag', 'purse', 'suitcase', 'luggage', 'handbag'],
    fallback: ['bag', 'travel', 'packing'],
    brands: ['Wayfare', 'Marlowe', 'Terrafirm', 'Halden & Co', 'Corvid', 'Loom Street', 'Northgrove', 'Kestrel Carry', 'Ashvale'],
    models: ['Transit', 'Harbour', 'Ridge', 'Camden', 'Drift', 'Verge', 'Atlas', 'Cove', 'Foundry', 'Trailhead', 'Warden', 'Quarry'],
    tags: ['bags', 'luggage', 'travel', 'backpack', 'carry'],
    vocab: {
      mat: ['recycled ballistic nylon', 'waxed cotton canvas', 'full-grain leather', 'polycarbonate shell', 'ripstop Cordura'],
      q: ['well-organised', 'genuinely water-resistant', 'comfortable loaded', 'hard-wearing', 'sensibly sized'],
      ctx: ['a daily commute', 'a two-week trip', 'an airport at 5am', 'a rainy walk to the office'],
      aud: ['commuters', 'frequent flyers', 'people who carry a laptop everywhere', 'one-bag travellers'],
      act: ['living out of a carry-on', 'cycling to work in the rain', 'running for a connection'],
      tail: ['a suspended laptop sleeve', 'YKK AquaGuard zips', 'a lifetime repair promise', 'sealed seams'],
    },
    features: [
      'Suspended laptop compartment keeps the machine off the ground when you set the bag down',
      'YKK AquaGuard zips with storm flaps at every opening',
      'Recycled ballistic nylon rated at 1680D with a PU backing',
      'Airline-legal cabin dimensions verified against the strictest European carrier',
      'Japanese-made wheels that roll silently and can be replaced with a screwdriver',
      'Load lifters and a removable hip belt for anything over 12 kg',
      'Lifetime repair promise — send it in and it comes back fixed',
      'Opens flat like a suitcase rather than a top-loading tunnel',
      'Hidden pocket sits against your back for a passport and a phone',
      'Full-grain leather base panel that ages rather than frays',
      'Compresses down when half full so it does not sag',
      'Luggage pass-through on the back panel for stacking on a case',
    ],
    specs: [
      ['Capacity', ['20 L', '35 L', '45 L', '68 L', 'Not applicable']],
      ['Material', ['1680D recycled ballistic nylon', 'Waxed cotton canvas', 'Full-grain leather', 'Polycarbonate shell']],
      ['Laptop fit', ['Up to 16"', 'Up to 14"', 'Up to 13"', 'Not applicable']],
      ['Dimensions', ['55 × 40 × 20 cm', '45 × 30 × 18 cm', '75 × 50 × 30 cm', '38 × 28 × 12 cm']],
      ['Weight', ['1.2 kg', '2.4 kg', '3.8 kg', '640 g']],
      ['Hardware', ['YKK AquaGuard zips', 'Solid brass', 'Duraflex buckles', 'TSA-approved lock']],
      ['Water resistance', ['Water-resistant, sealed seams', 'Fully waterproof', 'Water-repellent coating']],
      ['Carry', ['Padded straps + hip belt', 'Shoulder strap + handles', 'Four spinner wheels']],
      ['Warranty', ['Lifetime repair', '10 years', '5 years']],
      ['Origin', ['Made in Vietnam', 'Made in Egypt', 'Made in Portugal']],
    ],
  },
  {
    slug: 'watches',
    name: 'Watches',
    tagline: 'Time, properly kept',
    icon: 'watch',
    accent: 'neutral',
    family: 'accessory',
    weight: 4,
    price: [120000, 4200000],
    subcategories: [
      {
        slug: 'automatic',
        name: 'Automatic & Mechanical',
        noun: ['watch', 'watches'],
        desc: ['Automatic Dress Watch', 'GMT Automatic', 'Automatic Field Watch'],
        sfx: ['38 mm', '40 mm', 'Sapphire'],
        feat: [0, 2, 3, 5, 6, 7, 8, 10, 11],
        keys: ['Case size', 'Case material', 'Movement', 'Crystal', 'Water resistance', 'Strap', 'Lug width', 'Accuracy', 'Warranty'],
      },
      {
        slug: 'quartz',
        name: 'Quartz & Solar',
        noun: ['watch', 'watches'],
        desc: ['Solar Chronograph', 'Quartz Dress Watch', 'Solar Field Watch'],
        sfx: ['38 mm', '42 mm', 'Sapphire'],
        feat: [0, 3, 5, 6, 10, 'Solar cell under the dial charges from indoor light alone', 'Ten months of running reserve from a full charge, in the dark', 'Battery is a standard cell any high-street shop can fit'],
        keys: ['Case size', 'Case material', 'Movement', 'Crystal', 'Water resistance', 'Strap', 'Lug width', 'Accuracy', 'Warranty'],
      },
      {
        slug: 'dive-watches',
        name: 'Dive & Field Watches',
        noun: ['diver', 'divers'],
        desc: ['Automatic Dive Watch', 'Titanium Diver', 'Field Watch'],
        sfx: ['200 m', '42 mm', 'Titanium'],
        feat: [0, 1, 2, 3, 4, 5, 6, 9, 11],
        keys: ['Case size', 'Case material', 'Movement', 'Crystal', 'Water resistance', 'Lume', 'Strap', 'Accuracy', 'Warranty'],
      },
      {
        slug: 'watch-straps',
        name: 'Straps & Tools',
        noun: ['strap', 'straps'],
        desc: ['Leather Strap', 'FKM Rubber Strap', 'Steel Bracelet', 'Strap Tool Kit'],
        sfx: ['20 mm', '18 mm', 'Quick-Release'],
        feat: [5, 8, 'Quick-release spring bars fitted, so a change takes fifteen seconds', 'Taper is cut properly, so it does not look like a replacement', 'Buckle is brushed to match a steel case rather than left polished', 'Sold in every lug width from 18 to 22 mm'],
        keys: ['Length', 'Thickness', 'Case material', 'Strap', 'Lug width', 'Warranty'],
        specs: [
          ['Length', ['115/75 mm, fits 150 – 200 mm wrists', '120/80 mm', 'Adjustable, 200 mm max']],
          ['Thickness', ['3.5 mm tapering to 2 mm', '2.2 mm flat', '4 mm padded']],
        ],
      },
    ],
    terms: ['watch', 'clock', 'wristwatch', 'jewelry', 'time'],
    fallback: ['wrist watch', 'timepiece', 'luxury watch'],
    brands: ['Meridian', 'Corvid', 'Halden & Co', 'Vantor', 'Oriel', 'Ashvale', 'Sable', 'Marlowe', 'Kestrel'],
    models: ['Tidebreak', 'Field', 'Harbour', 'Verge', 'Cove', 'Ridge', 'Solstice', 'Anvil', 'Quill', 'Warden', 'Drift', 'Bower'],
    tags: ['watches', 'automatic', 'timepiece', 'accessories', 'dive'],
    vocab: {
      mat: ['brushed 316L steel', 'grade-2 titanium', 'sapphire crystal', 'vegetable-tanned leather', 'ceramic bezel insert'],
      q: ['well-proportioned', 'legible', 'serviceable', 'solidly built', 'understated'],
      ctx: ['a wrist that is not enormous', 'a working week', 'a dive holiday', 'a formal evening'],
      aud: ['first-time collectors', 'people with smaller wrists', 'anyone who wants one watch for everything'],
      act: ['wearing one watch for everything', 'diving twice a year', 'dressing up occasionally'],
      tail: ['a sapphire crystal', '200 m water resistance', 'a serviceable movement', 'a quick-release strap'],
    },
    features: [
      'Sapphire crystal with an internal anti-reflective coating',
      'Water resistant to 200 m, pressure-tested unit by unit',
      'Automatic movement with 41 hours of power reserve and hacking seconds',
      'Screw-down crown with a double gasket',
      'Fully lumed dial, hands and bezel pip with Swiss Super-LumiNova',
      'Quick-release spring bars — change the strap without a tool',
      'Drilled lugs, because a scratched lug is worse than a visible hole',
      'Movement is a standard calibre any competent watchmaker can service',
      'Bracelet has on-the-fly micro-adjustment and screwed links',
      'Ceramic bezel insert with a 120-click unidirectional action',
      'Case back is engraved rather than printed, so it will not wear off',
      'Regulated to within +6/-4 seconds a day before shipping',
    ],
    specs: [
      ['Case size', ['38 mm', '40 mm', '42 mm', '36 mm']],
      ['Case material', ['Brushed 316L stainless steel', 'Grade-2 titanium', 'Bronze', 'PVD-coated steel']],
      ['Movement', ['Automatic, 41 h reserve', 'Automatic GMT, 38 h reserve', 'Solar quartz', 'Swiss quartz']],
      ['Crystal', ['Sapphire, AR-coated', 'Domed sapphire', 'Hardened mineral']],
      ['Water resistance', ['200 m', '100 m', '50 m', '300 m']],
      ['Lume', ['Swiss Super-LumiNova BGW9', 'Super-LumiNova C3', 'Not applicable']],
      ['Strap', ['Steel bracelet, quick-release', 'Vegetable-tanned leather', 'FKM rubber', 'NATO nylon']],
      ['Lug width', ['20 mm', '18 mm', '22 mm']],
      ['Accuracy', ['+6 / -4 sec per day', '±15 sec per month', '+25 / -15 sec per day']],
      ['Warranty', ['5 years', '3 years', '2 years']],
    ],
  },
  {
    slug: 'jewelry-accessories',
    name: 'Jewelry & Accessories',
    tagline: 'Small things, made properly',
    icon: 'gem',
    accent: 'yellow',
    family: 'accessory',
    weight: 4,
    price: [45000, 2600000],
    subcategories: [
      {
        slug: 'rings',
        name: 'Rings',
        noun: ['ring', 'rings'],
        desc: ['Signet Ring', 'Stacking Ring Set', 'Band Ring'],
        sfx: ['18k Gold Vermeil', 'Sterling Silver', '14k Solid Gold'],
        feat: [0, 1, 2, 3, 4, 5, 11],
        keys: ['Material', 'Stone', 'Plating', 'Dimensions', 'Sizes', 'Weight', 'Hallmark', 'Care', 'Warranty'],
        specs: [
          ['Dimensions', ['Ø 18 mm', '4 mm band', '8 mm signet face']],
          ['Weight', ['4.2 g', '6.8 g']],
        ],
      },
      {
        slug: 'necklaces',
        name: 'Necklaces & Pendants',
        noun: ['necklace', 'necklaces'],
        desc: ['Pendant Necklace', 'Chain Necklace', 'Pearl Necklace', 'Locket'],
        sfx: ['18k Gold Vermeil', 'Sterling Silver', 'Freshwater Pearl'],
        feat: [0, 1, 2, 3, 4, 6, 11],
        keys: ['Material', 'Stone', 'Plating', 'Dimensions', 'Weight', 'Hallmark', 'Care', 'Warranty'],
        specs: [
          ['Dimensions', ['45 cm chain', '50 cm chain', '40 cm chain']],
          ['Weight', ['8.4 g', '11 g']],
        ],
      },
      {
        slug: 'earrings',
        name: 'Earrings',
        noun: ['pair', 'pairs'],
        desc: ['Hoop Earrings', 'Stud Earrings', 'Drop Earrings'],
        sfx: ['18k Gold Vermeil', 'Sterling Silver', 'Freshwater Pearl'],
        feat: [0, 1, 2, 3, 4, 6, 11],
        keys: ['Material', 'Stone', 'Plating', 'Dimensions', 'Weight', 'Hallmark', 'Care', 'Warranty'],
        specs: [
          ['Dimensions', ['12 mm hoop', '20 mm hoop', '6 mm stud']],
          ['Weight', ['2.6 g', '4.1 g']],
        ],
      },
      {
        slug: 'sunglasses',
        name: 'Sunglasses',
        noun: ['pair', 'pairs'],
        desc: [
          ['Polarised Sunglasses', ['Polarised', 'UV400', 'Acetate']],
          ['Acetate Sunglasses', ['Acetate', 'Polarised', 'Hand-Polished']],
          ['Metal Aviators', ['Titanium', 'Polarised', 'UV400']],
        ],
        sfx: ['Acetate', 'UV400', 'Polarised'],
        feat: [7, 8, 11, 'Five-barrel hinges pinned rather than glued, so they can be tightened', 'Lenses are swappable for prescription at any optician', 'Comes with a hard case and a microfibre pouch, not one or the other'],
        keys: ['Material', 'Dimensions', 'Lens', 'Weight', 'Care', 'Warranty'],
        specs: [
          ['Dimensions', ['52-20-145 mm', '50-21-140 mm']],
          ['Weight', ['28 g', '24 g']],
        ],
      },
      {
        slug: 'belts-wallets',
        name: 'Belts & Wallets',
        noun: ['piece', 'pieces'],
        desc: ['Leather Belt', 'Bifold Wallet', 'Card Holder', 'Cardholder Belt Set'],
        sfx: ['Full-Grain', 'RFID-Blocking', '35 mm'],
        feat: [9, 10, 11, 3, 'Edges are burnished and painted in four passes, then sealed', 'Solid brass buckle on a screw pin, so the strap can be replaced', 'Made from a single hide, so the grain runs continuously'],
        keys: ['Material', 'Dimensions', 'Sizes', 'Weight', 'Care', 'Warranty'],
        specs: [
          ['Dimensions', ['35 mm wide', '11 × 9 cm', '10 × 7 cm']],
          ['Weight', ['86 g', '142 g', '52 g']],
        ],
      },
    ],
    terms: ['jewelry', 'ring', 'earrings', 'necklace', 'sunglasses', 'diamond'],
    fallback: ['jewellery', 'gold jewelry', 'accessories'],
    brands: ['Oriel', 'Larkspur', 'Aveline', 'Sorrel', 'Wren & Vale', 'Ochre & Ash', 'Corvid', 'Bellamy', 'Marlowe'],
    models: ['Solene', 'Vela', 'Isla', 'Juniper', 'Amara', 'Cove', 'Marlow', 'Wren', 'Sabine', 'Linden', 'Fen', 'Nadia'],
    tags: ['jewellery', 'accessories', 'gold', 'silver', 'gifts'],
    vocab: {
      mat: ['recycled sterling silver', '18k gold vermeil', '14k solid gold', 'Italian acetate', 'full-grain bridle leather'],
      q: ['delicate but not fragile', 'hand-finished', 'hypoallergenic', 'wearable daily', 'quietly luxurious'],
      ctx: ['everyday wear', 'a wedding', 'a gift you had two days to find', 'a stacked wrist'],
      aud: ['people with sensitive ears', 'gift-buyers', 'anyone building a small collection'],
      act: ['wearing it every day including in the shower', 'stacking three at once', 'finding a gift at short notice'],
      tail: ['2.5 micron vermeil plating', 'nickel-free posts', 'a recycled silver base', 'a lifetime resize service'],
    },
    features: [
      '2.5 micron gold vermeil over recycled sterling silver — five times the legal minimum',
      'Nickel-free and hypoallergenic throughout, posts included',
      'Solid rather than hollow, so it has real weight in the hand',
      'Hand-finished and polished by a jeweller before it is boxed',
      'Recycled precious metal certified through a chain-of-custody audit',
      'Free resizing for life on any ring bought at full price',
      'Freshwater pearls hand-knotted on silk thread',
      'Polarised CR-39 lenses that cut glare without a colour cast',
      'Italian acetate frames, hand-polished over three days in a tumbler',
      'Bridle leather from an LWG Gold-rated tannery, edge-painted by hand',
      'RFID-blocking layer that does not add visible bulk',
      'Arrives in a reusable box with a polishing cloth',
    ],
    specs: [
      ['Material', ['18k gold vermeil on recycled silver', 'Recycled sterling silver', '14k solid gold', 'Italian acetate', 'Full-grain bridle leather']],
      ['Stone', ['Freshwater pearl, 7 mm', 'Lab-grown sapphire', 'Cubic zirconia', 'None']],
      ['Plating', ['2.5 micron', '3 micron', 'Not plated']],
      ['Dimensions', ['Ø 18 mm', '45 cm chain', '12 mm hoop', '52-20-145 mm']],
      ['Sizes', ['UK J – T', 'One size', '30 – 42 waist', 'Adjustable']],
      ['Lens', ['Polarised CR-39, UV400', 'Mineral glass, UV400', 'Not applicable']],
      ['Weight', ['4.2 g', '11 g', '28 g', '86 g']],
      ['Hallmark', ['Assay office hallmarked', 'Stamped 925', 'Not hallmarked']],
      ['Care', ['Polish with supplied cloth', 'Remove before swimming', 'Condition twice a year']],
      ['Warranty', ['Lifetime on craftsmanship', '2 years', '5 years']],
    ],
  },
  {
    slug: 'beauty-personal-care',
    name: 'Beauty & Personal Care',
    tagline: 'Short ingredient lists, real results',
    icon: 'sparkles',
    accent: 'rose',
    family: 'beauty',
    weight: 11,
    price: [12000, 340000],
    subcategories: [
      {
        slug: 'skincare',
        name: 'Skincare',
        noun: ['serum', 'serums'],
        desc: [
          ['Hydrating Serum', ['30 ml', '50 ml', 'Fragrance-Free']],
          ['Vitamin C Serum', ['30 ml', '15% L-Ascorbic', 'Fragrance-Free']],
          ['Daily Moisturiser', ['50 ml', '10% Niacinamide', 'Fragrance-Free']],
          ['Gentle Cleanser', ['100 ml', '150 ml', 'Fragrance-Free']],
          ['Mineral SPF 50', ['50 ml', 'SPF 50 PA++++', 'No White Cast']],
        ],
        sfx: ['30 ml', '50 ml', '10% Niacinamide', 'Fragrance-Free'],
        feat: [0, 1, 2, 3, 4, 5, 6, 8, 10, 11],
        keys: ['Size', 'Key actives', 'Skin type', 'Texture', 'Fragrance', 'pH', 'Packaging', 'Period after opening', 'Certification', 'Made in'],
      },
      {
        slug: 'makeup',
        name: 'Makeup',
        noun: ['formula', 'formulas'],
        desc: ['Satin Lipstick', 'Tinted Serum Foundation', 'Cream Blush', 'Brow Pencil'],
        sfx: ['Fragrance-Free', '30 ml', 'Refillable'],
        feat: [1, 2, 4, 7, 9, 10, 'Shade range built from 40 undertone-matched options, not 12', 'Refillable metal case — you buy the bullet, not the packaging again', 'Wears eight hours without transferring onto a collar'],
        keys: ['Size', 'Skin type', 'Texture', 'Fragrance', 'Packaging', 'Period after opening', 'Certification', 'Made in'],
      },
      {
        slug: 'haircare',
        name: 'Haircare',
        noun: ['formula', 'formulas'],
        desc: ['Repair Shampoo', 'Bond Conditioner', 'Scalp Serum', 'Hair Oil'],
        sfx: ['100 ml', 'Fragrance-Free', 'Sulphate-Free'],
        feat: [1, 2, 7, 9, 10, 11, 'Sulphate- and silicone-free, so it will not strip colour', 'pH 4.8, which is where the cuticle actually lies flat'],
        keys: ['Size', 'Key actives', 'Texture', 'Fragrance', 'pH', 'Packaging', 'Certification', 'Made in'],
      },
      {
        slug: 'fragrance',
        name: 'Fragrance',
        noun: ['scent', 'scents'],
        desc: ['Eau de Parfum', 'Extrait de Parfum', 'Solid Perfume'],
        sfx: ['50 ml', 'Refillable', '18% Concentration'],
        feat: [9, 10, 'Blended at 18% concentration, which is why it lasts a working day', 'Naturals and safe synthetics both listed, with the allergen panel printed', 'Refill bottles cut the cost and the packaging by roughly two thirds', 'No colourant, so it will not mark a shirt cuff'],
        keys: ['Size', 'Fragrance', 'Packaging', 'Period after opening', 'Certification', 'Made in'],
      },
      {
        slug: 'grooming-tools',
        name: 'Tools & Grooming',
        noun: ['tool', 'tools'],
        desc: [
          ['Facial Roller', ['Rose Quartz', 'Dual-Ended', 'Cooling']],
          ['Safety Razor', ['Stainless', 'Machined', 'Double-Edge']],
          ['Boar Bristle Brush', ['Beech Handle', 'Set of 2', 'Natural Bristle']],
          ['Nail Care Set', ['Set of 4', 'Stainless', 'Leather Case']],
        ],
        sfx: ['Refillable', 'Stainless', 'Set of 4'],
        feat: [9, 11, 'Machined from a single billet, so there is no join to trap water', 'Takes standard double-edge blades that cost pennies, not cartridges', 'Weight is in the head rather than the handle, which is what does the work', 'Dishwasher safe and will not corrode in a wet bathroom'],
        keys: ['Material', 'Weight', 'Size', 'Packaging', 'Certification', 'Made in'],
        specs: [
          ['Material', ['Machined stainless steel', 'Solid brass', 'Rose quartz', 'FSC beech and boar bristle']],
          ['Weight', ['96 g', '142 g', '58 g']],
        ],
      },
    ],
    terms: ['makeup', 'cosmetics', 'skincare', 'spa', 'lipstick', 'perfume', 'nail polish'],
    fallback: ['beauty', 'cosmetic products', 'face care'],
    brands: ['Solene', 'Ochre & Ash', 'Verdant', 'Aveline', 'Sorrel', 'Kilnhouse', 'Wren & Vale', 'Bloom Ledger', 'Marrow & Oak'],
    models: ['Clarity', 'Renew', 'Balance', 'Dawn', 'Halcyon', 'Loam', 'Vela', 'Fen', 'Juniper', 'Amber', 'Orchard', 'Cove'],
    tags: ['beauty', 'skincare', 'makeup', 'self-care', 'clean'],
    vocab: {
      mat: ['squalane', 'niacinamide', 'hyaluronic acid', 'ceramide complex', 'mineral zinc oxide'],
      q: ['gentle', 'genuinely effective', 'fragrance-free', 'lightweight', 'well-formulated'],
      ctx: ['a humid Cairo summer', 'reactive skin', 'a two-minute morning', 'a long-haul flight'],
      aud: ['people with sensitive skin', 'anyone rebuilding a routine', 'first-time actives users'],
      act: ['rebuilding a barrier after over-exfoliating', 'wearing SPF every single day', 'travelling constantly'],
      tail: ['a nine-ingredient formula', 'airless packaging', 'a published percentage', 'no added fragrance'],
    },
    features: [
      'Nine ingredients, every one of which is doing something measurable',
      'Active concentrations printed on the carton, not buried in a claim',
      'Fragrance-free and essential-oil-free, tested on reactive skin',
      'Airless pump keeps the actives stable from first use to last',
      'Non-comedogenic, verified by an independent lab',
      'pH balanced to 5.5 so it sits well under and over anything else',
      'No white cast, even on deeper skin tones',
      'Refill pouches cut packaging by 78% versus a new bottle',
      'Dermatologist-tested and suitable for use during pregnancy',
      'Cruelty-free, certified vegan, and never sold in markets requiring animal testing',
      'Batch code and expiry printed on the base of every unit',
      'One bottle lasts about twelve weeks at twice-daily use',
    ],
    specs: [
      ['Size', ['30 ml', '50 ml', '100 ml', '15 ml', '200 ml']],
      ['Key actives', ['10% niacinamide, 1% zinc', '15% L-ascorbic acid', '2% hyaluronic acid, squalane', 'Ceramide NP, cholesterol', 'Zinc oxide 22%']],
      ['Skin type', ['All skin types', 'Oily and combination', 'Dry and dehydrated', 'Sensitive and reactive']],
      ['Texture', ['Lightweight gel', 'Rich cream', 'Milky lotion', 'Fluid oil']],
      ['Fragrance', ['Fragrance-free', 'Naturally derived, 0.4%', 'Eau de parfum, 18%']],
      ['pH', ['5.5', '3.4', '6.0', 'Not applicable']],
      ['Packaging', ['Airless pump, refillable', 'Amber glass dropper', 'Recyclable aluminium tube']],
      ['Period after opening', ['12 months', '6 months', '24 months']],
      ['Certification', ['Leaping Bunny, vegan', 'COSMOS organic', 'Dermatologist tested']],
      ['Made in', ['Made in France', 'Made in Korea', 'Made in Egypt']],
    ],
  },
  {
    slug: 'health-wellness',
    name: 'Health & Wellness',
    tagline: 'Small habits, held steady',
    icon: 'heart-pulse',
    accent: 'emerald',
    family: 'beauty',
    weight: 4,
    price: [15000, 420000],
    subcategories: [
      {
        slug: 'supplements',
        name: 'Supplements & Vitamins',
        noun: ['blend', 'blends'],
        desc: ['Magnesium Complex', 'Vitamin D3 + K2', 'Sleep Support Blend', 'Omega-3 Complex'],
        sfx: ['90 Capsules', '60 Tablets', 'Third-Party Tested'],
        feat: [0, 1, 2, 3, 11],
        keys: ['Format', 'Serving', 'Key ingredient', 'Testing', 'Material', 'Allergens', 'Suitable for'],
      },
      {
        slug: 'sleep-recovery',
        name: 'Sleep & Recovery',
        noun: ['aid', 'aids'],
        desc: [
          ['Weighted Blanket', ['7 kg', '9 kg', 'GOTS Cotton']],
          ['Silk Sleep Mask', ['22 Momme', 'Adjustable', 'Machine Washable']],
          ['Cooling Pillow', ['Gel Layer', 'Memory Foam', '50 × 70 cm']],
          ['Sunrise Alarm', ['Dual Alarm', '30 Levels', 'USB-C']],
        ],
        sfx: ['7 kg', 'GOTS Cotton', 'Machine Washable'],
        feat: [6, 7, 10, 'Weighted to roughly 10% of body mass, which is the figure the research uses', 'Glass beads, not plastic pellets, so it drapes instead of lumping', 'Cover unzips fully and washes at 40°C without shrinking'],
        keys: ['Fill', 'Dimensions', 'Care', 'Material', 'Weight', 'Suitable for'],
        specs: [
          ['Fill', ['Glass microbeads', 'Memory foam, gel layer', 'Mulberry silk, 22 momme']],
          ['Dimensions', ['150 × 200 cm', '200 × 200 cm', '50 × 70 cm']],
          ['Care', ['Machine wash 40°C', 'Hand wash only', 'Cover machine washable']],
        ],
      },
      {
        slug: 'massage-therapy',
        name: 'Massage & Therapy',
        noun: ['tool', 'tools'],
        desc: [
          ['Massage Gun', ['4 Attachments', 'Rechargeable', '25 kg Stall Force']],
          ['Acupressure Mat', ['With Pillow', 'GOTS Cotton', '6 210 Points']],
          ['Foam Roller', ['High-Density', '45 cm', 'Textured']],
          ['Trigger Point Ball', ['Set of 2', 'High-Density', 'Ø 6 cm']],
        ],
        sfx: ['4 Attachments', 'High-Density', 'Rechargeable'],
        feat: [5, 8, 10, 4, 'Four attachments that each actually do something different', 'Stall force of 25 kg, so it does not bog down on a big muscle', 'Amplitude of 12 mm, which is where percussion stops being vibration'],
        keys: ['Power', 'Noise', 'Material', 'Weight', 'Suitable for'],
      },
      {
        slug: 'monitoring',
        name: 'Health Monitoring',
        noun: ['device', 'devices'],
        desc: ['Smart Body Scale', 'Blood Pressure Monitor', 'Pulse Oximeter', 'Sleep Tracker'],
        sfx: ['Bluetooth', 'Clinically Validated', 'Rechargeable'],
        feat: [4, 8, 9, 'Validated against a mercury reference under the ESH protocol', 'Stores 200 readings on-device for two users without an account', 'Cuff fits 22 – 42 cm and is replaceable separately'],
        keys: ['Accuracy', 'Memory', 'Power', 'Testing', 'Material', 'Weight', 'Suitable for'],
        specs: [
          ['Accuracy', ['±3 mmHg', '±0.1 kg', '±2% SpO2']],
          ['Memory', ['200 readings, 2 users', '60 readings', 'Syncs to phone only']],
        ],
      },
    ],
    terms: ['wellness', 'healthy lifestyle', 'yoga', 'meditation', 'vitamins', 'massage', 'spa'],
    fallback: ['health', 'relaxation', 'mindfulness'],
    brands: ['Verdant', 'Halcyon', 'Bloom Ledger', 'Solace', 'Terra Nine', 'Wren & Vale', 'Northwind', 'Sorrel', 'Kestrel'],
    models: ['Balance', 'Renew', 'Dawn', 'Stillwater', 'Halcyon', 'Loam', 'Cove', 'Vela', 'Fen', 'Orchard', 'Juniper', 'Solstice'],
    tags: ['wellness', 'health', 'recovery', 'sleep', 'supplements'],
    vocab: {
      mat: ['glass amber packaging', 'GOTS cotton', 'medical-grade silicone', 'high-density EVA foam', 'brushed aluminium'],
      q: ['third-party tested', 'genuinely calming', 'clinically validated', 'well-made', 'unfussy'],
      ctx: ['a bad week of sleep', 'a desk job', 'the evening wind-down', 'a training block'],
      aud: ['shift workers', 'desk-bound people', 'anyone whose sleep has gone sideways', 'runners in recovery'],
      act: ['winding down after a long day', 'recovering between sessions', 'tracking something properly for once'],
      tail: ['a third-party assay for every batch', 'a clinically validated sensor', 'no proprietary blends', 'a 40 dB motor'],
    },
    features: [
      'Every batch is third-party assayed and the certificate is published by batch code',
      'No proprietary blends — every ingredient is listed at its actual dose',
      'Bioavailable forms rather than the cheapest salt on the market',
      'Free from artificial colours, sweeteners and unnecessary fillers',
      'Clinically validated against a reference device, with the study cited',
      'Runs at under 40 dB so it can be used while someone else sleeps',
      'GOTS-certified cotton cover that comes off and goes in the machine',
      'Glass beads distributed in individually stitched pockets so nothing shifts',
      'Battery lasts six hours of continuous use and charges over USB-C',
      'Readings sync locally over Bluetooth; cloud upload is optional and off by default',
      'High-density foam that holds its shape past a thousand sessions',
      'Suitable for vegetarians and free from the fourteen major allergens',
    ],
    specs: [
      ['Format', ['90 capsules', '60 tablets', '300 g powder', 'Device']],
      ['Serving', ['2 capsules daily', '1 tablet daily', '5 g scoop', 'Not applicable']],
      ['Key ingredient', ['Magnesium bisglycinate 400 mg', 'Vitamin D3 4000 IU + K2 100 µg', 'L-theanine 200 mg', 'Not applicable']],
      ['Testing', ['Third-party assayed per batch', 'Clinically validated', 'ISO 13485 manufactured']],
      ['Power', ['USB-C rechargeable, 6 h', '2 × AAA', 'Not applicable']],
      ['Noise', ['Under 40 dB', 'Under 55 dB', 'Silent']],
      ['Material', ['Amber glass, aluminium cap', 'GOTS cotton, glass beads', 'High-density EVA foam', 'Medical-grade silicone']],
      ['Weight', ['7 kg', '9 kg', '780 g', '210 g']],
      ['Allergens', ['Free from all 14 major allergens', 'Made in a facility handling nuts']],
      ['Suitable for', ['Vegetarians and vegans', 'Adults 18+', 'All ages']],
    ],
  },
  {
    slug: 'sports-outdoors',
    name: 'Sports & Outdoors',
    tagline: 'Kit that comes back muddy',
    icon: 'tent',
    accent: 'lime',
    family: 'active',
    weight: 7,
    price: [45000, 1600000],
    subcategories: [
      {
        slug: 'camping-hiking',
        name: 'Camping & Hiking',
        noun: ['kit', 'kits'],
        desc: [
          ['Two-Person Tent', ['3-Season', '4-Season', '1.94 kg']],
          ['Down Sleeping Bag', ['-5°C Comfort', '750 Fill', '0°C Comfort']],
          ['Trekking Poles', ['3-Section', 'Carbon', 'Flick-Lock']],
          ['Camping Stove', ['Ultralight', 'Windproof', 'Piezo Ignition']],
        ],
        sfx: ['3-Season', '-5°C Comfort', '750 Fill'],
        feat: [0, 1, 2, 3, 4, 5, 9, 'Vestibule big enough for two packs and a pair of muddy boots'],
        keys: ['Season rating', 'Waterproofing', 'Packed weight', 'Capacity', 'Fill', 'Comfort rating', 'Material', 'Pack size', 'Warranty'],
      },
      {
        slug: 'water-sports',
        name: 'Water Sports',
        noun: ['kit', 'kits'],
        desc: [
          ['Dry Bag', ['20 L', '10 L', 'Roll-Top']],
          ['Inflatable Paddleboard', ['10 ft 6 in', '15 PSI', 'Complete Kit']],
          ['Wetsuit Top', ['4/3 mm', '2 mm', 'Chest Zip']],
          ['Swim Goggles', ['Anti-Fog', 'Mirrored', 'UV400']],
        ],
        sfx: ['20 L', '10\'6"', '4/3 mm'],
        feat: [3, 4, 9, 'Roll-top closure welded rather than stitched, so there is no seam to leak', 'Drop-stitch construction holds 15 PSI without flexing underfoot', 'Rinses clean in fresh water and dries without going stiff'],
        keys: ['Waterproofing', 'Packed weight', 'Capacity', 'Material', 'Pack size', 'Warranty'],
        specs: [
          ['Material', ['500D welded PVC tarpaulin', 'Drop-stitch PVC', 'Limestone neoprene, 4/3 mm']],
          ['Packed weight', ['380 g', '11.4 kg', '620 g']],
        ],
      },
      {
        slug: 'team-sports',
        name: 'Team Sports',
        noun: ['ball', 'balls'],
        desc: [
          ['Match Football', ['Size 5', 'Match Grade', 'Thermally Bonded']],
          ['Basketball', ['Size 7', 'Indoor/Outdoor', 'Composite']],
          ['Training Bib Set', ['Set of 6', 'Set of 10', 'Mesh']],
          ['Shin Guards', ['Set of 2', 'Lightweight', 'Ankle Guard']],
        ],
        sfx: ['Size 5', 'Match Grade', 'Set of 6'],
        feat: [6, 9, 'Thermally bonded panels, so it does not take on water in the wet', 'Butyl bladder holds pressure for a full season of Sunday games', 'FIFA Quality Pro tested for weight, rebound and sphericity'],
        keys: ['Size', 'Weight', 'Surface', 'Material', 'Certification', 'Warranty'],
        specs: [
          ['Material', ['Thermally bonded PU', 'Composite leather', 'Recycled polyester mesh']],
          ['Size', ['Size 5', 'Size 7', 'One size, S – XL']],
          ['Weight', ['430 g', '620 g', '180 g']],
          ['Surface', ['Grass and artificial', 'Indoor court', 'All surfaces']],
        ],
      },
      {
        slug: 'cycling',
        name: 'Cycling',
        noun: ['kit', 'kits'],
        desc: [
          ['Bike Helmet', ['MIPS', 'In-Mould', '280 g']],
          ['Cycling Jersey', ['3 Rear Pockets', 'Full Zip', 'Recycled']],
          ['Pannier Bag', ['20 L', 'Waterproof', 'Roll-Top']],
          ['Bike Lights', ['400 Lumen', 'USB-C', 'Front and Rear']],
        ],
        sfx: ['20 000 mm', '400 Lumen', 'MIPS'],
        feat: [6, 8, 4, 9, 'Rotational impact liner fitted as standard, not as an upsell', 'Reflective piping on every rear-facing panel', 'Mounts with a rubber strap, so it moves between bikes in seconds'],
        keys: ['Waterproofing', 'Packed weight', 'Material', 'Certification', 'Warranty'],
        specs: [
          ['Material', ['In-mould polycarbonate shell', 'Recycled polyester jersey knit', 'Welded ripstop nylon']],
          ['Packed weight', ['290 g', '640 g', '88 g']],
        ],
      },
      {
        slug: 'outdoor-clothing',
        name: 'Outdoor Clothing',
        noun: ['shell', 'shells'],
        desc: [
          ['Waterproof Shell', ['20 000 mm', '3-Season', 'Packable']],
          ['Insulated Jacket', ['750 Fill', 'Packable', 'Recycled']],
          ['Fleece Midlayer', ['200 gsm', 'Grid Fleece', 'Full Zip']],
          ['Softshell Trousers', ['Water-Repellent', 'Articulated', 'Packable']],
        ],
        sfx: ['20 000 mm', '3-Season', 'Packable'],
        feat: [0, 2, 3, 4, 6, 10, 11],
        keys: ['Sizes', 'Season rating', 'Waterproofing', 'Packed weight', 'Fill', 'Material', 'Certification', 'Warranty'],
        specs: [
          ['Material', ['Recycled polyester, 3-layer', '80/20 recycled nylon shell', 'Grid fleece, 200 gsm']],
          ['Packed weight', ['420 g', '610 g', '280 g']],
          ['Sizes', ['S – XXL', 'XS – XL', 'UK 8 – 20']],
        ],
      },
    ],
    terms: ['hiking', 'camping', 'sports', 'surfing', 'basketball', 'kayak', 'bicycle'],
    fallback: ['outdoor', 'adventure', 'mountain'],
    brands: ['Terrafirm', 'Wayfare', 'Northgrove', 'Kestrel', 'Ironwake', 'Summit Row', 'Verdant', 'Trailmark', 'Quarry'],
    models: ['Trailhead', 'Ridge', 'Summit', 'Cirrus', 'Basin', 'Warden', 'Alder', 'Verge', 'Talon', 'Cove', 'Fen', 'Anvil'],
    tags: ['outdoors', 'camping', 'hiking', 'sports', 'adventure'],
    vocab: {
      mat: ['ripstop nylon', 'recycled polyester', 'responsibly sourced down', 'anodised aluminium', 'three-layer laminate'],
      q: ['genuinely waterproof', 'packable', 'field-tested', 'lightweight', 'over-built'],
      ctx: ['a wet weekend in the hills', 'a coastal wind', 'a season of Sunday matches', 'a long ride home'],
      aud: ['weekend hikers', 'wild campers', 'commuting cyclists', 'people who go out in bad weather'],
      act: ['pitching in the dark', 'riding home in the rain', 'walking a long ridge'],
      tail: ['a 20 000 mm hydrostatic head', 'fully taped seams', 'a sub-2 kg packed weight', 'a lifetime repair service'],
    },
    features: [
      'Three-layer laminate with a 20 000 mm hydrostatic head and fully taped seams',
      'Pitches outer-first, so the inner stays dry when you set up in rain',
      'Responsibly sourced down, traceable to the farm and certified to RDS',
      'Packs to under two litres and weighs less than a full water bottle',
      'DWR finish is PFC-free and reproofable at home',
      'Aluminium poles with a published spare-part number and a repair sleeve in the bag',
      'Reflective detailing woven into the trim rather than printed on top',
      'Keeps liquid hot for 12 hours and cold for 24, tested at 20°C ambient',
      'Helmet meets EN 1078 and has an integrated rotational-impact liner',
      'Field-repairable: patches, cord and a spare buckle come in the stuff sack',
      'Storm hood adjusts one-handed and still turns with your head',
      'Pit zips and a two-way front zip for genuine ventilation under load',
    ],
    specs: [
      ['Season rating', ['3-season', '4-season', '2-season', 'Not applicable']],
      ['Waterproofing', ['20 000 mm, taped seams', '10 000 mm', '15 000 mm, PFC-free DWR']],
      ['Packed weight', ['1.94 kg', '870 g', '420 g', '2.6 kg']],
      ['Capacity', ['2 person', '1 L', '20 L', '65 L']],
      ['Fill', ['750 fill-power RDS down', 'Synthetic PrimaLoft', 'Not applicable']],
      ['Comfort rating', ['-5°C', '0°C', '+5°C', 'Not applicable']],
      ['Material', ['20D ripstop nylon', 'Recycled polyester, 3-layer', 'Anodised aluminium', '18/8 stainless steel']],
      ['Certification', ['EN 1078', 'RDS certified down', 'bluesign approved', 'Not applicable']],
      ['Pack size', ['42 × 16 cm', '18 × 12 cm', 'Not applicable']],
      ['Warranty', ['Lifetime repair', '5 years', '3 years']],
    ],
  },
  {
    slug: 'fitness-equipment',
    name: 'Fitness Equipment',
    tagline: 'Train at home without apologising for it',
    icon: 'dumbbell',
    accent: 'red',
    family: 'active',
    weight: 4,
    price: [60000, 3000000],
    subcategories: [
      {
        slug: 'free-weights',
        name: 'Free Weights',
        noun: ['weight', 'weights'],
        desc: [
          ['Adjustable Dumbbell', ['2 – 24 kg', '2 – 32 kg', 'Single']],
          ['Kettlebell', ['16 kg', '24 kg', 'Cast Iron']],
          ['Olympic Barbell', ['20 kg', '15 kg', '220 kg Rated']],
          ['Weight Plate Set', ['2 × 10 kg', '2 × 20 kg', 'Bumper']],
        ],
        sfx: ['2 – 24 kg', '16 kg', '20 kg'],
        feat: [0, 1, 8, 9, 11, 'Knurl cut on a lathe rather than pressed, so it grips without tearing', 'Powder coat baked at 200°C and rated for a decade of chalk and sweat'],
        keys: ['Weight range', 'Frame', 'Footprint', 'Surface', 'Weight', 'Warranty'],
        specs: [
          ['Weight', ['24 kg per hand', '16 kg', '20 kg']],
          ['Footprint', ['62 × 40 cm', 'Ø 22 cm']],
        ],
      },
      {
        slug: 'cardio-machines',
        name: 'Cardio Machines',
        noun: ['machine', 'machines'],
        desc: [
          ['Rowing Machine', ['Magnetic', 'Air Resistance', 'Foldable']],
          ['Exercise Bike', ['Magnetic', '16 Levels', 'Foldable']],
          ['Air Bike', ['Air Resistance', 'Unlimited Levels', 'Steel Frame']],
          ['Folding Treadmill', ['16 km/h', 'Foldable', '12 Programmes']],
        ],
        sfx: ['Magnetic', 'Air Resistance', 'Foldable'],
        feat: [2, 3, 4, 7, 8, 9, 10, 'Belt drive rather than chain, so it stays quiet and needs no oil'],
        keys: ['Resistance', 'Frame', 'Max user weight', 'Footprint', 'Noise', 'Assembly', 'Weight', 'Warranty'],
      },
      {
        slug: 'yoga-mobility',
        name: 'Yoga & Mobility',
        noun: ['mat', 'mats'],
        desc: [
          ['Yoga Mat', ['6 mm', '4 mm', 'Natural Rubber']],
          ['Resistance Band Set', ['5-Piece', '5 – 35 kg', 'Fabric']],
          ['Cork Yoga Block', ['Set of 2', 'Cork', '23 × 15 × 8 cm']],
          ['Mobility Strap', ['2.5 m', '10 Loops', 'Cotton']],
        ],
        sfx: ['6 mm', '5-Piece', 'Natural Rubber'],
        feat: [5, 9, 'Natural rubber with a closed-cell top, so sweat sits on it rather than in it', 'Alignment markings printed rather than embossed, so they will not wear off', 'Bands are fabric-covered and will not roll or snap under load', 'Rolls up and stays rolled without a strap fighting it'],
        keys: ['Resistance', 'Footprint', 'Surface', 'Weight', 'Warranty'],
        specs: [
          ['Weight', ['1.9 kg', '380 g', '620 g']],
          ['Footprint', ['183 × 61 cm', '61 × 61 cm', 'Rolls to Ø 15 cm']],
        ],
      },
      {
        slug: 'home-gym',
        name: 'Home Gym & Racks',
        noun: ['rack', 'racks'],
        desc: ['Squat Rack', 'Weight Bench', 'Wall-Mounted Rack', 'Pull-Up Bar'],
        sfx: ['Foldable', '200 kg Rated', 'Westside Spacing'],
        feat: [2, 6, 7, 8, 9, 10, 'Folds flat to 12 cm against the wall when you are done', 'J-cups lined with UHMW so they will not chew the bar knurl'],
        keys: ['Frame', 'Max user weight', 'Footprint', 'Assembly', 'Weight', 'Warranty'],
        specs: [
          ['Weight', ['78 kg', '34 kg', '4.2 kg']],
          ['Footprint', ['122 × 122 cm', '140 × 60 cm']],
        ],
      },
    ],
    terms: ['fitness', 'workout', 'running', 'yoga', 'gym', 'dumbbell', 'sports'],
    fallback: ['exercise', 'training', 'athlete'],
    brands: ['Ironwake', 'Summit Row', 'Kestrel', 'Basalt', 'Terrafirm', 'Anvil Works', 'Northgrove', 'Verdant', 'Foundry'],
    models: ['Anvil', 'Forge', 'Basin', 'Ridge', 'Warden', 'Praxis', 'Talon', 'Summit', 'Quarry', 'Verge', 'Ember', 'Atlas'],
    tags: ['fitness', 'gym', 'training', 'home-gym', 'strength'],
    vocab: {
      mat: ['powder-coated cast iron', 'knurled steel', 'natural rubber', 'heavy-gauge steel tube', 'high-density foam'],
      q: ['gym-grade', 'stable under load', 'space-efficient', 'seriously solid', 'quiet'],
      ctx: ['a spare bedroom', 'a garage gym', 'a flat above a neighbour', 'a small balcony'],
      aud: ['people training at home', 'lifters without a gym nearby', 'anyone with a spare corner'],
      act: ['training at 6am without waking the house', 'building a home gym in stages', 'fitting a session into 30 minutes'],
      tail: ['a 200 kg static load rating', 'a genuinely quiet belt drive', 'a five-year frame warranty', 'a compact footprint'],
    },
    features: [
      'Powder-coated cast iron with a knurl that grips without shredding your hands',
      'Adjusts from 2 to 24 kg in 2 kg steps with a single dial',
      'Frame rated to a 200 kg static load with a tested safety margin',
      'Magnetic resistance runs quiet enough for a flat with neighbours below',
      'Folds to under 40 cm deep and rolls away on built-in castors',
      'Natural rubber mat with a closed-cell surface that does not absorb sweat',
      'Laser-cut numbered uprights on Westside spacing',
      'Assembles in under an hour with the supplied tools',
      'Bearings are a standard size and replaceable without a service call',
      'Non-marking feet that will not dent a wooden floor',
      'Five-year warranty on the frame, two on the moving parts',
      'Weight plates are calibrated to within 1% of stated mass',
    ],
    specs: [
      ['Weight range', ['2 – 24 kg per hand', '16 kg fixed', '20 kg bar, 220 kg rated', 'Not applicable']],
      ['Resistance', ['16 levels, magnetic', 'Air, unlimited', '5 bands, 5 – 35 kg', 'Not applicable']],
      ['Frame', ['Heavy-gauge 50 mm steel', 'Powder-coated cast iron', 'Aluminium rail', 'Not applicable']],
      ['Max user weight', ['150 kg', '135 kg', '200 kg']],
      ['Footprint', ['62 × 40 cm', '210 × 56 cm', '183 × 61 cm', 'Folds to 40 cm deep']],
      ['Surface', ['Natural rubber, 6 mm', 'Knurled steel', 'High-density foam', 'Not applicable']],
      ['Noise', ['Under 45 dB', 'Under 60 dB', 'Silent']],
      ['Assembly', ['Under 60 minutes, tools included', 'Fully assembled', 'Two people recommended']],
      ['Weight', ['24 kg', '32 kg', '1.9 kg', '78 kg']],
      ['Warranty', ['5 years frame, 2 years parts', 'Lifetime on frame', '3 years']],
    ],
  },
);

CATEGORIES.push(
  {
    slug: 'books',
    name: 'Books',
    tagline: 'Something worth the evening',
    icon: 'book-open',
    accent: 'teal',
    family: 'media',
    weight: 11,
    price: [14000, 62000],
    subcategories: [
      {
        slug: 'fiction',
        name: 'Fiction',
        noun: ['book', 'books'],
        desc: ['Hardback Novel', 'Paperback Novel', 'Short Story Collection'],
        sfx: ['First Edition', '432 Pages', 'Signed Edition'],
        feat: [0, 1, 2, 3, 4, 10, 11],
        keys: ['Format', 'Pages', 'Dimensions', 'Binding', 'Paper', 'Language', 'Edition', 'Weight', 'ISBN prefix'],
      },
      {
        slug: 'non-fiction',
        name: 'Non-Fiction & History',
        noun: ['book', 'books'],
        desc: ['Narrative History', 'Essay Collection', 'Biography', 'Reported Non-Fiction'],
        sfx: ['432 Pages', 'Second Edition', 'Illustrated'],
        feat: [0, 1, 3, 4, 5, 11, 'Maps and a chronology in the endpapers, where you will actually use them'],
        keys: ['Format', 'Pages', 'Dimensions', 'Binding', 'Paper', 'Illustrations', 'Language', 'Edition', 'Weight'],
      },
      {
        slug: 'cookbooks',
        name: 'Cookbooks & Food Writing',
        noun: ['book', 'books'],
        desc: ['Illustrated Cookbook', 'Baking Book', 'Regional Cookbook'],
        sfx: ['Illustrated', '432 Pages', 'Collector’s Edition'],
        feat: [0, 2, 6, 7, 8, 9, 'Ingredients listed in the order you use them, with the method alongside'],
        keys: ['Format', 'Pages', 'Dimensions', 'Binding', 'Paper', 'Illustrations', 'Language', 'Weight'],
      },
      {
        slug: 'childrens-books',
        name: 'Children’s Books',
        noun: ['book', 'books'],
        desc: ['Children’s Picture Book', 'Board Book', 'Early Reader'],
        sfx: ['Illustrated', 'Boxed Set', '64 Pages'],
        feat: [2, 6, 9, 10, 'Board pages thick enough to survive a two-year-old and a wet hand', 'Read-aloud tested — it comes in at about eleven minutes', 'Rounded corners and non-toxic, food-safe inks throughout'],
        keys: ['Age range', 'Format', 'Pages', 'Dimensions', 'Binding', 'Illustrations', 'Language', 'Weight'],
        specs: [
          ['Age range', ['0 – 3 years', '3 – 6 years', '6 – 9 years']],
        ],
      },
      {
        slug: 'art-design-books',
        name: 'Art, Design & Photography',
        noun: ['volume', 'volumes'],
        desc: ['Photography Monograph', 'Design Anthology', 'Exhibition Catalogue'],
        sfx: ['Illustrated', 'Collector’s Edition', 'Signed Edition'],
        feat: [0, 2, 3, 6, 11, 'Duotone plates proofed against the original prints before the run', 'Section-sewn and squared so a 1.4 kg book still opens flat'],
        keys: ['Format', 'Pages', 'Dimensions', 'Binding', 'Paper', 'Illustrations', 'Edition', 'Weight'],
      },
    ],
    terms: ['book', 'books', 'reading', 'notebook writing', 'library', 'novel', 'bookshelf'],
    fallback: ['literature', 'writing', 'study'],
    brands: ['Rill Press', 'Vellum House', 'Marrow & Oak', 'Northgrove Books', 'Kilnhouse Editions', 'Bloom Ledger', 'Saltworks Press', 'Fenwick & Row', 'Quill Editions'],
    models: ['The Long Harvest', 'Salt and Compass', 'A Quiet Machinery', 'Nine Bridges', 'The Copper Notebook', 'Field Notes from the Delta', 'What the River Kept', 'The Second Kitchen', 'Small Hours', 'The Paper Garden', 'North of Reason', 'Everything Rebuilt'],
    tags: ['books', 'reading', 'literature', 'gift', 'print'],
    vocab: {
      mat: ['uncoated Munken stock', 'cloth-bound board', 'FSC-certified paper', 'foil-blocked linen', 'heavyweight art paper'],
      q: ['beautifully made', 'genuinely absorbing', 'carefully edited', 'well-illustrated', 'handsome'],
      ctx: ['a long flight', 'a quiet Sunday', 'a bedside table', 'a kitchen counter'],
      aud: ['readers who finish things', 'people who buy books as gifts', 'anyone rebuilding a shelf'],
      act: ['reading a chapter a night', 'cooking from it every week', 'giving it to someone who reads properly'],
      tail: ['a sewn binding that lies flat', 'foil-blocked boards', 'a ribbon marker', 'uncoated paper that takes a pencil'],
    },
    features: [
      'Section-sewn binding that lies flat on a table and will not shed pages',
      'Printed on uncoated FSC-certified stock that takes a pencil note cleanly',
      'Foil-blocked cloth boards under a printed dust jacket',
      'Head and tail bands, a ribbon marker, and properly squared corners',
      'Typeset in a face chosen for long-form reading rather than fashion',
      'Fully indexed with a bibliography that cites primary sources',
      'Photographs reproduced at 300 lpi on a heavier art stock',
      'Recipes tested three times in a domestic kitchen, not a studio',
      'Metric and imperial measurements given side by side throughout',
      'Wipe-clean laminate on the boards for a book that lives in a kitchen',
      'Large, generous type and margins that survive being read in poor light',
      'Printed in a run small enough that the press could be watched',
    ],
    specs: [
      ['Format', ['Hardback', 'Paperback', 'Boxed set', 'Board book']],
      ['Pages', ['432', '288', '196', '512', '64']],
      ['Dimensions', ['234 × 153 mm', '198 × 129 mm', '270 × 210 mm', '250 × 250 mm']],
      ['Binding', ['Section-sewn, cloth-bound', 'Perfect bound', 'Sewn with ribbon marker']],
      ['Paper', ['Munken Print Cream 90 gsm', 'FSC uncoated 80 gsm', 'Matt art 150 gsm']],
      ['Illustrations', ['48 colour plates', 'Fully illustrated throughout', 'Line drawings', 'None']],
      ['Language', ['English', 'English and Arabic', 'Arabic']],
      ['Edition', ['First edition', 'Second edition, revised', 'Collector’s edition, numbered']],
      ['Weight', ['680 g', '312 g', '1.4 kg']],
      ['ISBN prefix', ['978-1-9993', '978-0-8871', '978-1-7745']],
    ],
  },
  {
    slug: 'music-instruments',
    name: 'Music & Instruments',
    tagline: 'Instruments that reward practice',
    icon: 'music',
    accent: 'orange',
    family: 'media',
    weight: 2,
    price: [90000, 3600000],
    subcategories: [
      {
        slug: 'guitars',
        name: 'Guitars & Bass',
        noun: ['guitar', 'guitars'],
        desc: ['Dreadnought Acoustic', 'Parlour Acoustic', 'Electric Guitar', 'Bass Guitar'],
        sfx: ['Solid Spruce', 'Mahogany Back', 'Left-Handed'],
        feat: [0, 1, 2, 4, 5, 7, 10, 11],
        keys: ['Body', 'Scale length', 'Electronics', 'Finish', 'Outputs', 'Weight', 'Included', 'Warranty'],
      },
      {
        slug: 'keys-pianos',
        name: 'Keys & Pianos',
        noun: ['piano', 'pianos'],
        desc: [
          ['Stage Piano', ['88 Weighted Keys', 'Hammer Action', '128-Note']],
          ['Digital Piano', ['88 Weighted Keys', 'Hammer Action', 'Cabinet']],
          ['Portable Keyboard', ['61 Keys', '76 Keys', 'Touch Response']],
        ],
        sfx: ['88 Weighted Keys', '61 Keys', 'Hammer Action'],
        feat: [3, 6, 9, 11, 'Triple-sensor key bed that repeats cleanly without a full key return', 'Speakers good enough that you do not need headphones to practise', 'Half-pedalling supported, which is the thing cheap boards skip'],
        keys: ['Keys', 'Polyphony', 'Electronics', 'Finish', 'Outputs', 'Weight', 'Included', 'Warranty'],
        specs: [
          ['Weight', ['11.8 kg', '16.4 kg', '6.2 kg']],
        ],
      },
      {
        slug: 'drums-percussion',
        name: 'Drums & Percussion',
        noun: ['drum', 'drums'],
        desc: [
          ['Snare Drum', ['14" × 6.5"', '13" × 7"', 'Birch Shell']],
          ['Cajon', ['Birch', 'Snare Wires', 'Padded Seat']],
          ['Practice Pad', ['12-Inch', 'Double-Sided', 'Rubber']],
          ['Cymbal Pack', ['14" / 16" / 20"', 'B20 Bronze', '3-Piece']],
        ],
        sfx: ['14" × 6.5"', 'Birch Shell', 'Left-Handed'],
        feat: [8, 11, 'Triple-flanged hoops that stay round after a season of gigging', 'Throw-off engages positively and does not creep loose mid-song', 'Heads are a standard size from any brand you like'],
        keys: ['Size', 'Shell', 'Body', 'Finish', 'Weight', 'Included', 'Warranty'],
        specs: [
          ['Weight', ['5.4 kg', '9.8 kg', '1.2 kg']],
          ['Size', ['14" × 6.5"', '13" × 7"', '12" × 5"']],
          ['Shell', ['6-ply birch, 45° edges', '8-ply maple', 'Solid rubberwood']],
        ],
      },
      {
        slug: 'studio-recording',
        name: 'Studio & Recording',
        noun: ['pair', 'pairs'],
        desc: [
          ['Studio Monitor Pair', ['5" Woofer', '8" Woofer', 'Bi-Amped']],
          ['Audio Interface', ['24-bit / 192 kHz', '2-In / 2-Out', 'USB-C']],
          ['Monitor Stands', ['Set of 2', 'Adjustable', 'Isolation Pads']],
          ['Acoustic Panel Set', ['Set of 6', 'Set of 12', '60 × 60 cm']],
        ],
        sfx: ['5" Woofer', '24-bit / 192 kHz', 'Set of 6'],
        feat: [9, 11, 'Front-ported, so they still work 20 cm from a wall', 'Waveguide designed to widen the sweet spot in a small room', 'Balanced TRS and XLR on both, because studios are never tidy'],
        keys: ['Driver', 'Power', 'Body', 'Electronics', 'Finish', 'Outputs', 'Weight', 'Warranty'],
        specs: [
          ['Weight', ['6.4 kg per speaker', '1.1 kg', '620 g']],
          ['Driver', ['5" woofer, 1" silk dome', '8" woofer, 1" dome', 'Not applicable']],
          ['Power', ['2 × 50 W bi-amped', '2 × 80 W bi-amped', 'Not applicable']],
        ],
      },
    ],
    terms: ['guitar', 'music', 'musician', 'piano', 'drums', 'violin', 'studio microphone'],
    fallback: ['instrument', 'concert', 'band'],
    brands: ['Cadence Labs', 'Marlowe', 'Rooftop Acoustics', 'Oriel', 'Vantage Sound', 'Bellhaus', 'Torrent', 'Auralis', 'Grainhouse'],
    models: ['Verse', 'Bower', 'Solstice', 'Canton', 'Aria', 'Rill', 'Halcyon', 'Vellum', 'Kite', 'Meridian', 'Loom', 'Cove'],
    tags: ['music', 'instruments', 'guitar', 'studio', 'audio'],
    vocab: {
      mat: ['solid Sitka spruce', 'African mahogany', 'roasted maple', 'birch ply shell', 'MDF-braced cabinet'],
      q: ['resonant', 'genuinely playable', 'well-intonated', 'responsive', 'honest-sounding'],
      ctx: ['a small flat', 'a first year of lessons', 'a home studio', 'a Friday night gig'],
      aud: ['beginners who will stick with it', 'gigging players', 'people returning after twenty years'],
      act: ['practising an hour a night', 'recording demos at home', 'playing a first gig'],
      tail: ['a solid rather than laminate top', 'a factory setup by a real luthier', 'graded hammer action', 'a bone nut and saddle'],
    },
    features: [
      'Solid Sitka spruce top — not a laminate — so the tone opens up as it is played',
      'Set up by a luthier before shipping, with action measured and recorded',
      'Bone nut and saddle rather than moulded plastic',
      'Graded hammer action with escapement, heavier at the bass end',
      'Truss rod is accessible without removing anything',
      'Fret ends dressed by hand so nothing catches when you slide',
      '128-note polyphony and a sample set recorded from a single concert grand',
      'Onboard preamp with a tuner and a genuinely usable EQ',
      'Birch ply shell with 45° bearing edges cut on a proper table',
      'Balanced XLR outputs alongside a 3.5 mm input for practice',
      'Comes with a padded gig bag, strap and spare strings',
      'Every unit is play-tested and signed off by name',
    ],
    specs: [
      ['Body', ['Solid Sitka spruce top, mahogany back', 'Roasted maple, alder body', 'Birch ply, 6-ply shell', 'MDF cabinet, front-ported']],
      ['Scale length', ['648 mm', '628 mm', '864 mm', 'Not applicable']],
      ['Keys', ['88 weighted, graded hammer', '61 semi-weighted', 'Not applicable']],
      ['Polyphony', ['128-note', '64-note', 'Not applicable']],
      ['Electronics', ['Onboard preamp with tuner', 'Two humbuckers, coil split', 'Passive', 'Class-D 2 × 50 W']],
      ['Finish', ['Satin open-pore', 'Gloss polyurethane', 'Natural oil', 'Matte vinyl wrap']],
      ['Outputs', ['1/4" jack', 'Balanced XLR + TRS', 'Stereo RCA', 'Not applicable']],
      ['Weight', ['2.1 kg', '3.6 kg', '11.8 kg', '6.4 kg per speaker']],
      ['Included', ['Gig bag, strap, spare strings', 'Sustain pedal, stand, headphones', 'Cables and mounting pads']],
      ['Warranty', ['3 years', '2 years', '5 years']],
    ],
  },
  {
    slug: 'toys-games',
    name: 'Toys & Games',
    tagline: 'Played with, not shelved',
    icon: 'puzzle',
    accent: 'cyan',
    family: 'media',
    weight: 7,
    price: [20000, 480000],
    subcategories: [
      {
        slug: 'building-toys',
        name: 'Building & Construction',
        noun: ['set', 'sets'],
        desc: ['Wooden Building Blocks', 'Marble Run', 'Magnetic Tile Set', 'Construction Set'],
        sfx: ['100 Pieces', 'FSC Beech', 'Ages 3+'],
        feat: [0, 1, 2, 3, 4, 9, 11],
        keys: ['Age range', 'Pieces', 'Material', 'Dimensions', 'Safety', 'Weight', 'Care', 'Origin'],
      },
      {
        slug: 'puzzles',
        name: 'Puzzles & Brain Games',
        noun: ['puzzle', 'puzzles'],
        desc: [
          ['1000-Piece Jigsaw', ['1000 Pieces', 'Ages 8+', '68 × 48 cm']],
          ['Wooden Puzzle', ['48 Pieces', 'Ages 3+', 'FSC Beech']],
          ['Logic Puzzle Set', ['Set of 4', 'Ages 8+', 'Wooden']],
        ],
        sfx: ['1000 Pieces', '48 Pieces', 'Ages 8+'],
        feat: [2, 3, 4, 5, 8, 11, 'Cut with a hand-made die, so no two pieces are quite the same shape', 'Printed on 2 mm greyboard that does not delaminate at the edges'],
        keys: ['Age range', 'Pieces', 'Material', 'Dimensions', 'Safety', 'Weight', 'Origin'],
        specs: [
          ['Dimensions', ['68 × 48 cm assembled', '50 × 35 cm assembled', '28 × 28 × 6 cm box']],
          ['Weight', ['820 g', '620 g', '1.1 kg']],
        ],
      },
      {
        slug: 'outdoor-play',
        name: 'Outdoor Play',
        noun: ['toy', 'toys'],
        desc: ['Garden Play Tent', 'Sand and Water Table', 'Wooden Swing Seat', 'Ride-On Trike'],
        sfx: ['Ages 3+', 'FSC Beech', 'Weatherproof'],
        feat: [0, 2, 3, 4, 9, 11, 'UV-stable finish that will not chalk after a summer outside', 'Every fixing is stainless, so nothing rusts into the timber'],
        keys: ['Age range', 'Material', 'Dimensions', 'Safety', 'Weight', 'Care', 'Origin'],
        specs: [
          ['Dimensions', ['110 × 110 × 140 cm', '90 × 60 × 55 cm', 'Seat at 45 cm']],
          ['Weight', ['4.6 kg', '9.2 kg', '11 kg']],
        ],
      },
      {
        slug: 'pretend-play',
        name: 'Pretend Play',
        noun: ['set', 'sets'],
        desc: ['Play Kitchen', 'Doll’s House', 'Toy Tool Bench', 'Market Stall'],
        sfx: ['FSC Beech', 'Ages 3+', 'Boxed'],
        feat: [0, 1, 2, 3, 9, 10, 11],
        keys: ['Age range', 'Material', 'Dimensions', 'Safety', 'Weight', 'Care', 'Origin'],
        specs: [
          ['Dimensions', ['60 × 30 × 95 cm', '45 × 28 × 60 cm']],
          ['Weight', ['12 kg', '7.4 kg']],
        ],
      },
      {
        slug: 'family-games',
        name: 'Family Board Games',
        noun: ['game', 'games'],
        desc: ['Family Board Game', 'Card Game', 'Cooperative Game', 'Party Game'],
        sfx: ['2 – 5 Players', 'Ages 8+', 'Boxed'],
        feat: [2, 4, 6, 7, 8, 11],
        keys: ['Age range', 'Pieces', 'Players', 'Play time', 'Material', 'Dimensions', 'Weight', 'Origin'],
        specs: [
          ['Dimensions', ['28 × 28 × 7 cm box', '20 × 14 × 4 cm box']],
          ['Weight', ['1.4 kg', '380 g']],
        ],
      },
    ],
    terms: ['toys', 'toy', 'children playing', 'playground', 'board game', 'puzzle', 'chess'],
    fallback: ['play', 'kids toys', 'game'],
    brands: ['Bramble & Bo', 'Larkspur', 'Kilnhouse', 'Wren & Vale', 'Hexline', 'Meadowbrook', 'Ochre & Ash', 'Rill', 'Northgrove'],
    models: ['Meadow', 'Bramble', 'Juniper', 'Wren', 'Cove', 'Orchard', 'Linden', 'Fen', 'Marlow', 'Alder', 'Solstice', 'Kite'],
    tags: ['toys', 'games', 'kids', 'play', 'wooden'],
    vocab: {
      mat: ['FSC-certified beech', 'water-based non-toxic paint', 'recycled board', 'organic cotton', 'solid rubberwood'],
      q: ['genuinely engaging', 'hard-wearing', 'open-ended', 'well-made', 'satisfying'],
      ctx: ['a rainy afternoon', 'a full table on a Sunday', 'a small living room', 'a birthday party'],
      aud: ['children who take things apart', 'families who play together', 'grandparents buying properly'],
      act: ['playing for an hour without a screen', 'building the same thing forty different ways', 'getting everyone at the table'],
      tail: ['water-based non-toxic paint', 'FSC beech throughout', 'a ten-minute rules explanation', 'replaceable pieces'],
    },
    features: [
      'FSC-certified beech, sanded smooth and finished in water-based non-toxic paint',
      'Open-ended by design — there is no single right way to use it',
      'Tested to EN 71 and ASTM F963 with certificates available on request',
      'No batteries, no app, no subscription, no bleeping',
      'Pieces are replaceable individually, posted free for the first two years',
      'Precision-cut jigsaw with a genuinely satisfying fit and no dust',
      'Rules explained in ten minutes; first play finishes in under an hour',
      'Scales properly from two players to five without breaking',
      'Storage insert keeps every component sorted between games',
      'Rounded edges and a chunky grip sized for smaller hands',
      'Machine washable fabric elements at 40°C',
      'Designed to be handed down rather than binned after a season',
    ],
    specs: [
      ['Age range', ['3+', '5+', '8+', '12+', '18 months+']],
      ['Pieces', ['100', '48', '1000', '250', 'Not applicable']],
      ['Players', ['1', '2-4', '2-5', '3-6', 'Not applicable']],
      ['Play time', ['20 min', '45 min', '60-90 min', 'Open-ended']],
      ['Material', ['FSC beech, water-based paint', 'Recycled 2 mm board', 'Organic cotton and beech', 'Solid rubberwood']],
      ['Dimensions', ['30 × 30 × 12 cm', '68 × 48 cm assembled', '110 × 60 × 90 cm', '28 × 28 × 7 cm box']],
      ['Safety', ['EN 71 and ASTM F963 tested', 'CE marked', 'Not suitable under 3']],
      ['Weight', ['1.8 kg', '620 g', '9.2 kg']],
      ['Care', ['Wipe clean', 'Machine wash 40°C', 'Dry cloth only']],
      ['Origin', ['Made in Poland', 'Made in Germany', 'Made in Egypt']],
    ],
  },
  {
    slug: 'baby-kids',
    name: 'Baby & Kids',
    tagline: 'For the people doing the 3am shift',
    icon: 'baby',
    accent: 'sky',
    family: 'family',
    weight: 4,
    price: [25000, 980000],
    subcategories: [
      {
        slug: 'nursery',
        name: 'Nursery & Sleep',
        noun: ['cot', 'cots'],
        desc: ['Cot Bed', 'Moses Basket', 'Sleep Bag', 'Nursery Wardrobe'],
        sfx: ['0 – 3 Years', '2.5 Tog', 'GOTS Cotton'],
        feat: [0, 1, 2, 4, 5, 6, 9, 10, 11],
        keys: ['Age range', 'Material', 'Safety standard', 'Washing', 'Tog rating', 'Weight limit', 'Weight', 'Warranty'],
      },
      {
        slug: 'feeding',
        name: 'Feeding & Weaning',
        noun: ['set', 'sets'],
        desc: ['Weaning Set', 'Silicone Bib', 'Suction Bowl Set', 'Sippy Cup'],
        sfx: ['Set of 4', '6 – 36 Months', 'Dishwasher Safe'],
        feat: [0, 2, 5, 7, 10, 'Suction base that holds to a highchair tray but releases for an adult', 'Every part is dishwasher, steriliser and freezer safe'],
        keys: ['Age range', 'Material', 'Safety standard', 'Washing', 'Weight', 'Included', 'Warranty'],
        specs: [
          ['Weight', ['210 g', '380 g', '140 g']],
        ],
      },
      {
        slug: 'travel-gear',
        name: 'Prams & Travel',
        noun: ['stroller', 'strollers'],
        desc: ['Compact Stroller', 'Baby Carrier', 'Travel Cot', 'Car Seat Organiser'],
        sfx: ['One-Hand Fold', 'Cabin Size', '0 – 3 Years'],
        feat: [0, 3, 5, 6, 8, 10, 11],
        keys: ['Age range', 'Material', 'Safety standard', 'Folded size', 'Weight limit', 'Weight', 'Included', 'Warranty'],
      },
      {
        slug: 'kids-clothing',
        name: 'Kids’ Clothing',
        noun: ['set', 'sets'],
        desc: [
          ['Muslin Set', ['Set of 4', 'Bamboo', '70 × 70 cm']],
          ['Organic Cotton Sleepsuit', ['GOTS Cotton', '6 – 36 Months', 'Set of 2']],
          ['Kids’ Sun Hat', ['UPF 50+', '6 – 36 Months', 'GOTS Cotton']],
          ['Two-Piece Set', ['GOTS Cotton', '6 – 36 Months', 'Set of 2']],
        ],
        sfx: ['GOTS Cotton', 'Set of 4', '6 – 36 Months'],
        feat: [1, 2, 9, 'Poppers along the leg, because nobody has time for a full undress', 'Grows-with-me cuffs that fold back for another few months', 'Dyed with OEKO-TEX certified low-impact dyes'],
        keys: ['Sizes', 'Age range', 'Material', 'Washing', 'Weight', 'Included'],
        specs: [
          ['Material', ['GOTS organic cotton', 'Bamboo muslin, 70/30', 'OEKO-TEX cotton jersey']],
          ['Weight', ['180 g', '240 g', '95 g']],
          ['Sizes', ['0 – 3 m', '3 – 6 m', '6 – 12 m', '1 – 2 y', '2 – 3 y']],
        ],
      },
      {
        slug: 'bath-changing',
        name: 'Bath & Changing',
        noun: ['mat', 'mats'],
        desc: ['Changing Mat', 'Baby Bath Support', 'Hooded Towel', 'Nappy Caddy'],
        sfx: ['Wipe-Clean', 'GOTS Cotton', '0 – 3 Years'],
        feat: [0, 2, 5, 7, 10, 'Raised sides on a wipe-clean surface with no stitched seam to hold water', 'Folds in half and fits in a changing bag'],
        keys: ['Age range', 'Material', 'Safety standard', 'Washing', 'Weight', 'Warranty'],
        specs: [
          ['Material', ['Wipe-clean PU over foam', 'GOTS organic cotton terry', 'Food-grade silicone']],
          ['Weight', ['1.1 kg', '420 g', '680 g']],
        ],
      },
    ],
    terms: ['baby', 'kids', 'children', 'toddler', 'playground', 'children playing'],
    fallback: ['infant', 'family', 'newborn'],
    brands: ['Bramble & Bo', 'Meadowbrook', 'Wren & Vale', 'Larkspur', 'Solace', 'Ochre & Ash', 'Verdant', 'Kilnhouse', 'Sorrel'],
    models: ['Meadow', 'Juniper', 'Wren', 'Bramble', 'Orchard', 'Linden', 'Fen', 'Cove', 'Marlow', 'Alder', 'Dawn', 'Vela'],
    tags: ['baby', 'kids', 'nursery', 'parenting', 'safe'],
    vocab: {
      mat: ['GOTS organic cotton', 'food-grade silicone', 'FSC beech', 'bamboo muslin', 'OEKO-TEX jersey'],
      q: ['easy to clean', 'genuinely safe', 'soft', 'one-handed', 'well-thought-through'],
      ctx: ['a 3am feed', 'a small nursery', 'a cabin bag', 'a hot Cairo night'],
      aud: ['new parents', 'second-time parents who know better', 'grandparents', 'people in small flats'],
      act: ['getting out of the house before 9am', 'surviving a 3am feed', 'travelling with a toddler'],
      tail: ['a one-handed fold', 'a machine-washable cover', 'food-grade silicone throughout', 'no detachable small parts'],
    },
    features: [
      'BPA-, PVC- and phthalate-free throughout, tested by an independent lab',
      'GOTS-certified organic cotton, OEKO-TEX dyed, soft from the first wash',
      'Machine washable at 60°C without losing shape or colour',
      'Folds one-handed while you are holding a child in the other arm',
      'Converts as they grow, from newborn through to about three years',
      'No small detachable parts, and every edge is rounded',
      'Meets EN 1888 / EN 716 with test reports available on request',
      'Food-grade silicone that survives the dishwasher and the steriliser',
      'Fits in a cabin locker on most European carriers',
      'Breathable, temperature-regulating fabric rated for warm nights',
      'Replacement covers, straps and pads all sold separately for years',
      'Assembled without tools and takes about ten minutes',
    ],
    specs: [
      ['Age range', ['0 – 3 years', '6 – 36 months', 'Newborn – 9 kg', '0 – 6 months']],
      ['Material', ['GOTS organic cotton', 'Food-grade silicone', 'FSC beech', 'Bamboo muslin, 70/30']],
      ['Safety standard', ['EN 1888', 'EN 716', 'EN 14988', 'BS 8510']],
      ['Washing', ['Machine wash 60°C', 'Dishwasher safe', 'Wipe clean only']],
      ['Tog rating', ['2.5 tog', '1.0 tog', '0.5 tog', 'Not applicable']],
      ['Folded size', ['52 × 45 × 23 cm', 'Not applicable', '60 × 30 × 30 cm']],
      ['Weight limit', ['9 kg', '15 kg', '22 kg']],
      ['Weight', ['6.2 kg', '380 g', '14 kg']],
      ['Included', ['Rain cover and carry strap', 'Set of 4', 'Mattress and fitted sheet']],
      ['Warranty', ['2 years', '3 years', '5 years on frame']],
    ],
  },
  {
    slug: 'pet-supplies',
    name: 'Pet Supplies',
    tagline: 'For the other members of the household',
    icon: 'paw-print',
    accent: 'amber',
    family: 'family',
    weight: 4,
    price: [12000, 420000],
    subcategories: [
      {
        slug: 'dog-supplies',
        name: 'Dog Beds & Gear',
        noun: ['bed', 'beds'],
        desc: [
          ['Orthopaedic Dog Bed', ['Large', 'Medium', 'Washable Cover']],
          ['Crate Mat', ['Large', 'Washable Cover', 'Non-Slip']],
          ['Padded Harness', ['No-Pull', 'Large', 'Medium']],
          ['Waterproof Dog Coat', ['Large', 'Medium', 'Reflective']],
        ],
        sfx: ['Large', 'Washable Cover', 'No-Pull'],
        feat: [0, 1, 2, 3, 8, 9, 10],
        keys: ['Size', 'Suitable for', 'Material', 'Cover', 'Base', 'Weight', 'Care', 'Warranty'],
      },
      {
        slug: 'cat-supplies',
        name: 'Cat Trees & Litter',
        noun: ['tree', 'trees'],
        desc: ['Cat Tree', 'Scratching Post', 'Covered Litter Box', 'Window Perch'],
        sfx: ['Sisal', 'Large', 'Non-Slip'],
        feat: [6, 9, 10, 11, 'Sisal wound at 4 kg tension, which is why it lasts a year not a month', 'Posts unscrew and replace individually when they finally go', 'Base is weighted so a 6 kg cat cannot tip it over'],
        keys: ['Size', 'Suitable for', 'Material', 'Base', 'Weight', 'Care', 'Warranty'],
        specs: [
          ['Size', ['H 120 cm', 'H 65 cm', '48 × 38 × 40 cm']],
          ['Weight', ['11 kg', '4.2 kg', '2.8 kg']],
        ],
      },
      {
        slug: 'pet-feeding',
        name: 'Bowls & Feeding',
        noun: ['bowl', 'bowls'],
        desc: ['Ceramic Bowl Set', 'Slow Feeder', 'Elevated Bowl Stand', 'Travel Water Bottle'],
        sfx: ['Set of 2', 'Non-Slip', 'Dishwasher Safe'],
        feat: [4, 5, 7, 11, 'Fired to 1 250°C so the glaze cannot craze and harbour bacteria', 'Weighted enough that an enthusiastic dog cannot push it round the kitchen'],
        keys: ['Size', 'Suitable for', 'Material', 'Base', 'Capacity', 'Weight', 'Dishwasher safe', 'Care'],
      },
      {
        slug: 'pet-toys',
        name: 'Toys & Enrichment',
        noun: ['toy', 'toys'],
        desc: ['Rope Tug Toy', 'Puzzle Feeder', 'Snuffle Mat', 'Treat Ball'],
        sfx: ['Set of 2', 'Washable Cover', 'Large'],
        feat: [3, 8, 11, 9, 'Rope is undyed recycled cotton, so a shredded strand is harmless', 'Difficulty adjusts across three levels as they work it out'],
        keys: ['Size', 'Suitable for', 'Material', 'Weight', 'Care', 'Warranty'],
        specs: [
          ['Size', ['32 cm', '24 cm', 'Ø 9 cm']],
          ['Weight', ['180 g', '320 g', '95 g']],
          ['Material', ['Recycled cotton rope', 'Natural rubber', 'Fleece and canvas']],
        ],
      },
      {
        slug: 'pet-grooming',
        name: 'Grooming & Care',
        noun: ['brush', 'brushes'],
        desc: [
          ['Grooming Brush', ['Beech Handle', 'Self-Cleaning', 'Large']],
          ['Deshedding Tool', ['Stainless', 'Large', 'Medium']],
          ['Nail Clippers', ['Stainless', 'Safety Guard', 'Large']],
          ['Grooming Glove', ['Set of 2', 'Silicone', 'One Size']],
        ],
        sfx: ['Non-Slip', 'Large', 'Stainless'],
        feat: [9, 11, 'Rounded pin tips that reach the undercoat without scoring the skin', 'Self-cleaning plunger that clears a full brush in one press', 'Stainless blade that can be sharpened rather than replaced'],
        keys: ['Size', 'Suitable for', 'Material', 'Weight', 'Care', 'Warranty'],
        specs: [
          ['Size', ['Ø 9 cm head', '18 cm overall', 'One size']],
          ['Weight', ['140 g', '96 g', '210 g']],
          ['Material', ['Stainless pins, beech handle', 'Stainless blade, TPE grip', 'Silicone and nylon']],
        ],
      },
    ],
    terms: ['dog', 'cat', 'pet', 'puppy', 'kitten', 'aquarium fish'],
    fallback: ['animal', 'pets', 'dog walking'],
    brands: ['Bramble & Bo', 'Terra Nine', 'Meadowbrook', 'Verdant', 'Wayfare', 'Sorrel', 'Kilnhouse', 'Hearthline', 'Trailmark'],
    models: ['Bramble', 'Meadow', 'Orchard', 'Fen', 'Cove', 'Juniper', 'Loam', 'Alder', 'Wren', 'Marlow', 'Linden', 'Basin'],
    tags: ['pets', 'dog', 'cat', 'pet-care', 'home'],
    vocab: {
      mat: ['memory foam', 'heavy canvas', 'natural sisal', 'lead-free stoneware', 'recycled cotton rope'],
      q: ['genuinely washable', 'chew-resistant', 'supportive', 'non-slip', 'hard-wearing'],
      ctx: ['a muddy hallway', 'a flat with no garden', 'an older dog with stiff joints', 'a cat that destroys everything'],
      aud: ['owners of large breeds', 'people with older pets', 'anyone whose cat has ruined a sofa'],
      act: ['walking twice a day whatever the weather', 'keeping an older dog comfortable', 'stopping a cat shredding the furniture'],
      tail: ['a fully removable washable cover', 'lead-free glaze', 'a chew-tested seam', 'a non-slip base'],
    },
    features: [
      'Removable cover unzips fully and goes in the machine at 40°C',
      'Orthopaedic memory foam base that does not flatten under a large dog',
      'Waterproof inner liner protects the foam from accidents',
      'Chew-tested seams with bar-tacked stress points',
      'Lead-free, food-safe glaze fired at 1 250°C',
      'Non-slip base ring keeps the bowl where you put it',
      'Natural sisal rope wound tight enough to survive a determined cat',
      'Slow-feeder maze reduces gulping and the vomiting that follows',
      'Machine washable and tumble-dry safe on low',
      'Sized properly by breed rather than by a vague small/medium/large',
      'Replacement covers and posts available separately for years',
      'No dyes, glues or coatings that are unsafe if chewed',
    ],
    specs: [
      ['Size', ['Large, 100 × 70 cm', 'Medium, 80 × 55 cm', 'Small, 60 × 45 cm', 'Set of 2 × 400 ml']],
      ['Suitable for', ['Dogs up to 40 kg', 'Dogs up to 15 kg', 'Cats and kittens', 'All breeds']],
      ['Material', ['Memory foam, canvas cover', 'Lead-free stoneware', 'Natural sisal and FSC pine', 'Recycled cotton rope']],
      ['Cover', ['Removable, machine wash 40°C', 'Not removable', 'Wipe clean']],
      ['Base', ['Waterproof liner, non-slip', 'Silicone ring', 'Weighted']],
      ['Capacity', ['400 ml', '900 ml', 'Not applicable']],
      ['Weight', ['3.4 kg', '820 g', '11 kg']],
      ['Dishwasher safe', ['Yes', 'No', 'Top rack only']],
      ['Care', ['Machine wash 40°C, tumble low', 'Hand wash', 'Vacuum and spot clean']],
      ['Warranty', ['2 years', '1 year', '3 years on frame']],
    ],
  },
  {
    slug: 'groceries-gourmet',
    name: 'Groceries & Gourmet',
    tagline: 'Ingredients worth cooking with',
    icon: 'shopping-basket',
    accent: 'green',
    family: 'food',
    weight: 7,
    price: [5000, 145000],
    subcategories: [
      {
        slug: 'coffee-beans',
        name: 'Coffee & Tea',
        noun: ['bag', 'bags'],
        desc: ['Single-Origin Coffee', 'Espresso Blend', 'Loose Leaf Tea', 'Decaf Coffee'],
        sfx: ['250 g', 'Whole Bean', '500 g'],
        feat: [0, 1, 2, 3, 9, 10, 11],
        keys: ['Weight', 'Origin', 'Roast', 'Grind', 'Tasting notes', 'Ingredients', 'Certification', 'Storage', 'Shelf life'],
      },
      {
        slug: 'spices-seasoning',
        name: 'Spices & Seasoning',
        noun: ['jar', 'jars'],
        desc: [
          ['Smoked Paprika', ['100 g', '250 g', 'Sweet']],
          ['Dukkah Blend', ['100 g', '250 g', 'Hazelnut']],
          ['Sumac', ['100 g', '250 g', 'Whole Spice']],
          ['Za’atar Blend', ['100 g', '250 g', 'Wild Thyme']],
        ],
        sfx: ['100 g', '250 g', 'Whole Spice'],
        feat: [1, 5, 6, 8, 9, 11, 'Ground within a week of shipping, because pre-ground spice is mostly dust'],
        keys: ['Weight', 'Origin', 'Tasting notes', 'Ingredients', 'Certification', 'Storage', 'Shelf life'],
      },
      {
        slug: 'oils-vinegars',
        name: 'Oils & Vinegars',
        noun: ['bottle', 'bottles'],
        desc: [
          ['Extra Virgin Olive Oil', ['500 ml', '250 ml', 'Cold Pressed']],
          ['Aged Balsamic', ['250 ml', '12 Years', '100 ml']],
          ['Cold-Pressed Sesame Oil', ['250 ml', '500 ml', 'Unroasted']],
          ['Pomegranate Molasses', ['500 ml', '250 ml', 'Unsweetened']],
        ],
        sfx: ['500 ml', 'Cold Pressed', '250 ml'],
        feat: [1, 4, 5, 6, 8, 11, 'Bottled in dark glass within 48 hours of pressing'],
        keys: ['Volume', 'Origin', 'Tasting notes', 'Ingredients', 'Certification', 'Storage', 'Shelf life'],
      },
      {
        slug: 'sweet-treats',
        name: 'Chocolate & Sweets',
        noun: ['bar', 'bars'],
        desc: [
          ['Dark Chocolate Bar', ['70% Cacao', '85% Cacao', '100 g']],
          ['Milk Chocolate Bar', ['45% Cacao', '100 g', 'Single Origin']],
          ['Halva Slab', ['400 g', 'Pistachio', 'Sesame']],
          ['Date and Nut Bar', ['Set of 4', 'Set of 8', 'No Added Sugar']],
        ],
        sfx: ['70% Cacao', '100 g', 'Set of 4'],
        feat: [1, 5, 9, 10, 11, 'Conched for 72 hours, which is where the grit and the bitterness go', 'Three ingredients, and one of them is optional'],
        keys: ['Weight', 'Origin', 'Tasting notes', 'Ingredients', 'Certification', 'Storage', 'Shelf life'],
      },
      {
        slug: 'pantry-staples',
        name: 'Pantry Staples',
        noun: ['jar', 'jars'],
        desc: [
          ['Stone-Ground Tahini', ['500 g', '300 g', 'Unsalted']],
          ['Wildflower Honey', ['500 g', '340 g', 'Raw']],
          ['Bulgur Wheat', ['1 kg', '500 g', 'Coarse']],
          ['Preserved Lemons', ['400 g', 'Whole', 'Beldi']],
        ],
        sfx: ['500 g', 'Cold Pressed', '1 kg'],
        feat: [1, 5, 6, 7, 8, 9, 11],
        keys: ['Weight', 'Volume', 'Origin', 'Ingredients', 'Certification', 'Storage', 'Shelf life'],
      },
    ],
    terms: ['food', 'fruit', 'vegetables', 'chocolate', 'cheese', 'spices', 'honey', 'coffee'],
    fallback: ['grocery', 'ingredients', 'market'],
    brands: ['Saltworks', 'Basil Row', 'Verdant', 'Grainhouse', 'Orchard & Vine', 'Bloom Ledger', 'Marrow & Oak', 'Sorrel', 'Terra Nine'],
    models: ['Harvest', 'Orchard', 'Loam', 'Fen', 'Delta', 'Meadow', 'Bramble', 'Solstice', 'Rill', 'Amber', 'Cove', 'Basin'],
    tags: ['food', 'gourmet', 'pantry', 'coffee', 'ingredients'],
    vocab: {
      mat: ['single-origin arabica', 'first cold-pressed oil', 'stone-ground sesame', 'raw unfiltered honey', 'hand-harvested salt'],
      q: ['properly sourced', 'small-batch', 'genuinely fresh', 'traceable', 'well-balanced'],
      ctx: ['a weekday breakfast', 'a slow Sunday lunch', 'a well-stocked cupboard', 'a gift hamper'],
      aud: ['home cooks', 'people who grind their own beans', 'anyone who reads an ingredients list'],
      act: ['cooking properly on a weeknight', 'making coffee before anyone else is up', 'building a pantry from scratch'],
      tail: ['a printed roast date', 'a named producer', 'a resealable valve bag', 'no added anything'],
    },
    features: [
      'Roast date printed on every bag — not a best-before eighteen months out',
      'Single origin, traceable to a named cooperative and a published price',
      'Resealable degassing valve bag keeps it fresh for weeks after opening',
      'Ground to order, or shipped as whole bean if you prefer',
      'First cold pressing only, bottled in light-blocking glass',
      'No artificial preservatives, colours or flavour enhancers',
      'Harvest year and lot number on the label',
      'Stone-ground in small batches so nothing overheats',
      'Naturally gluten-free and produced in a BRC-audited facility',
      'Packaging is home-compostable, including the inner liner',
      'Tasting notes written by someone who actually drank it',
      'Packed to order and dispatched within 24 hours',
    ],
    specs: [
      ['Weight', ['250 g', '500 g', '100 g', '1 kg']],
      ['Volume', ['500 ml', '250 ml', '750 ml', 'Not applicable']],
      ['Origin', ['Ethiopia, Yirgacheffe', 'Egypt, Fayoum', 'Italy, Puglia', 'Sri Lanka, Uva']],
      ['Roast', ['Medium', 'Medium-dark', 'Light', 'Not applicable']],
      ['Grind', ['Whole bean', 'Filter', 'Espresso', 'Not applicable']],
      ['Tasting notes', ['Blackcurrant, cocoa, orange peel', 'Almond, honey, dried fig', 'Grassy, peppery finish', 'Caramel, toasted nut']],
      ['Ingredients', ['100% arabica', 'Olives, nothing else', 'Cacao, cane sugar, cocoa butter', 'Sesame seeds']],
      ['Certification', ['Organic certified', 'Fairtrade', 'Not certified']],
      ['Storage', ['Cool, dark, resealed', 'Refrigerate after opening', 'Ambient']],
      ['Shelf life', ['12 months unopened', '18 months unopened', '6 months from roast']],
    ],
  },
  {
    slug: 'automotive',
    name: 'Automotive',
    tagline: 'Keep it running properly',
    icon: 'car',
    accent: 'zinc',
    family: 'utility',
    weight: 2,
    price: [25000, 1500000],
    subcategories: [
      {
        slug: 'car-care',
        name: 'Cleaning & Detailing',
        noun: ['kit', 'kits'],
        desc: [
          ['Ceramic Coating Kit', ['9H', '2-Year', 'Complete Kit']],
          ['Microfibre Wash Set', ['Set of 6', '350 gsm', 'Edgeless']],
          ['Snow Foam Cannon', ['1 L', 'Adjustable', 'Brass Fitting']],
          ['Wheel Cleaner', ['500 ml', 'pH-Neutral', 'Iron Fallout']],
        ],
        sfx: ['9H', 'Set of 6', '500 ml'],
        feat: [5, 6, 10, 11, 'pH-neutral, so it will not strip a wax or etch a trim', 'Edgeless microfibre with the tags heat-cut rather than sewn'],
        keys: ['Coverage', 'Volume', 'Cure time', 'Material', 'Weight', 'Warranty'],
        specs: [
          ['Material', ['350 gsm edgeless microfibre', 'SiO2 ceramic, 9H', 'pH-neutral concentrate']],
          ['Weight', ['380 g', '620 g', '1.1 kg']],
          ['Coverage', ['Two full cars', 'One full car', '15 – 20 washes']],
          ['Volume', ['500 ml', '1 L', '50 ml']],
          ['Cure time', ['24 hours', '1 hour', 'Not applicable']],
        ],
      },
      {
        slug: 'car-electronics',
        name: 'Dash Cams & Electronics',
        noun: ['unit', 'units'],
        desc: [
          ['Dash Cam', ['2K 60fps', '1080p', 'Front and Rear']],
          ['Jump Starter', ['12 000 mAh', '2 000 A', 'Supercapacitor']],
          ['Tyre Inflator', ['150 PSI', 'Cordless', 'Auto Cut-Off']],
          ['Bluetooth Receiver', ['aptX', 'Hands-Free', 'USB-C']],
        ],
        sfx: ['2K 60fps', '12 000 mAh', '150 PSI'],
        feat: [0, 1, 2, 3, 8, 9, 11],
        keys: ['Power', 'Resolution', 'Field of view', 'Max pressure', 'Peak current', 'Operating range', 'Weight', 'Warranty'],
      },
      {
        slug: 'car-interior',
        name: 'Interior & Comfort',
        noun: ['set', 'sets'],
        desc: [
          ['Boot Liner', ['Universal Fit', 'Anti-Slip', 'Waterproof']],
          ['Phone Mount', ['Vent Clip', 'MagSnap', 'Anti-Slip']],
          ['Seat Organiser', ['Universal Fit', 'Waterproof', 'Set of 2']],
          ['Lumbar Cushion', ['Memory Foam', 'Adjustable Strap', 'Mesh']],
        ],
        sfx: ['Universal Fit', 'Set of 6', 'Anti-Slip'],
        feat: [7, 8, 10, 'Laser-scanned to the exact boot, so it sits flat with no trimming', 'Anti-slip backing that grips carpet without leaving residue', 'Wipes clean and hoses down when something inevitably leaks'],
        keys: ['Material', 'Fitment', 'Operating range', 'Weight', 'Warranty'],
        specs: [
          ['Material', ['Laser-scanned TPE', 'Reinforced ABS and silicone', 'Memory foam, mesh cover']],
          ['Weight', ['4.2 kg', '180 g', '620 g']],
        ],
      },
      {
        slug: 'tools-maintenance',
        name: 'Maintenance & Tools',
        noun: ['tool', 'tools'],
        desc: [
          ['Torque Wrench', ['1/2" Drive', '3/8" Drive', 'Calibrated']],
          ['Car Vacuum', ['12 000 mAh', 'Cordless', 'HEPA']],
          ['OBD2 Scanner', ['Bluetooth', 'Live Data', 'Universal']],
          ['Socket Set', ['46-Piece', '1/2" Drive', 'Chrome Vanadium']],
        ],
        sfx: ['1/2" Drive', '12 000 mAh', 'Calibrated'],
        feat: [4, 8, 9, 10, 11, 'Calibrated to ±3% with the certificate in the case', 'Click is audible and felt, so you stop before the stud does'],
        keys: ['Range', 'Power', 'Material', 'Operating range', 'Weight', 'Warranty'],
        specs: [
          ['Weight', ['1.9 kg', '2.4 kg', '280 g']],
          ['Range', ['28 – 210 Nm', '10 – 60 Nm', 'Not applicable']],
        ],
      },
    ],
    terms: ['car', 'tire', 'motorcycle', 'road trip', 'car interior', 'car engine'],
    fallback: ['automobile', 'vehicle', 'driving'],
    brands: ['Ironwake', 'Vantor', 'Northwind', 'Anvil Works', 'Kestrel', 'Foundry', 'Terrafirm', 'Quarry', 'Basalt'],
    models: ['Anvil', 'Warden', 'Praxis', 'Verge', 'Ridge', 'Atlas', 'Talon', 'Basin', 'Forge', 'Ember', 'Quarry', 'Cirrus'],
    tags: ['automotive', 'car', 'driving', 'maintenance', 'detailing'],
    vocab: {
      mat: ['die-cast aluminium', 'reinforced ABS', 'automotive-grade silicone', 'chrome vanadium steel', 'anti-slip TPE'],
      q: ['properly rated', 'reliable in heat', 'well-built', 'straightforward', 'compact'],
      ctx: ['a Cairo summer', 'a dead battery on a Monday', 'a long motorway run', 'a weekend detail'],
      aud: ['daily drivers', 'people who do their own servicing', 'anyone who has been stranded once'],
      act: ['keeping a ten-year-old car right', 'detailing on a Saturday', 'driving to the coast every summer'],
      tail: ['a supercapacitor rather than a lithium cell', 'a calibrated torque scale', 'a 150 PSI cut-off', 'a genuine 2K sensor'],
    },
    features: [
      'Supercapacitor power rather than a lithium cell, so a hot dashboard does not kill it',
      'Records at 2K 60 fps with an HDR sensor that reads plates at night',
      'Loop recording with G-sensor lock and a parking mode that will not flatten the battery',
      'Rated to 150 PSI with an auto cut-off you can set to the exact pressure',
      'Chrome vanadium steel, heat-treated and calibrated to ±3%',
      'Nine-layer ceramic coating with a claimed and tested three-year durability',
      'Microfibre rated at 350 gsm with edgeless stitching so it will not scratch',
      'Fits without cutting, drilling or removing trim',
      'Works from -10°C to 60°C, which matters in a parked car in August',
      'Cables are 12 AWG with proper strain relief at both ends',
      'Carry case is moulded rather than a nylon bag that falls apart',
      'Three-year warranty covering normal in-vehicle use',
    ],
    specs: [
      ['Power', ['12 V socket', '12 000 mAh internal', 'Supercapacitor', 'Not applicable']],
      ['Resolution', ['2560 × 1440 at 60 fps', '1920 × 1080 at 30 fps', 'Not applicable']],
      ['Field of view', ['140°', '170°', 'Not applicable']],
      ['Max pressure', ['150 PSI', '120 PSI', 'Not applicable']],
      ['Peak current', ['2 000 A', '1 200 A', 'Not applicable']],
      ['Material', ['Die-cast aluminium', 'Reinforced ABS', 'Chrome vanadium steel', '350 gsm microfibre']],
      ['Operating range', ['-10°C to 60°C', '-20°C to 70°C', '0°C to 40°C']],
      ['Fitment', ['Universal', 'Vehicle-specific, see guide', 'Not applicable']],
      ['Weight', ['1.9 kg', '380 g', '620 g', '4.2 kg']],
      ['Warranty', ['3 years', '2 years', '5 years']],
    ],
  },
  {
    slug: 'office-stationery',
    name: 'Office & Stationery',
    tagline: 'Desk things you will actually keep',
    icon: 'pencil',
    accent: 'indigo',
    family: 'utility',
    weight: 7,
    price: [4000, 220000],
    subcategories: [
      {
        slug: 'notebooks',
        name: 'Notebooks & Journals',
        noun: ['notebook', 'notebooks'],
        desc: ['A5 Notebook', 'B5 Notebook', 'Pocket Notebook', 'Leather Journal'],
        sfx: ['Dotted', 'Ruled', '160 gsm', 'Plain'],
        feat: [0, 1, 2, 3, 8, 10, 11],
        keys: ['Size', 'Pages', 'Paper', 'Ruling', 'Binding', 'Material', 'Weight', 'Origin'],
      },
      {
        slug: 'pens-writing',
        name: 'Pens & Writing',
        noun: ['pen', 'pens'],
        desc: [
          ['Fountain Pen', ['Fine Nib', 'Medium Nib', 'Solid Brass']],
          ['Rollerball Pen', ['0.5 mm', '0.7 mm', 'Solid Brass']],
          ['Mechanical Pencil', ['0.5 mm', '0.7 mm', 'Machined']],
          ['Brass Ballpoint', ['Machined', 'Refillable', 'Bullet']],
        ],
        sfx: ['Fine Nib', '0.5 mm', 'Solid Brass'],
        feat: [4, 5, 6, 9, 'Balanced to sit just behind the grip, so it does not need pressure', 'Section is machined rather than moulded, so it will not go slippery', 'Converter included as well as cartridges'],
        keys: ['Nib', 'Refill', 'Material', 'Weight', 'Origin'],
        specs: [
          ['Material', ['Solid brass', 'Machined aluminium', 'Resin with a steel section']],
          ['Weight', ['38 g', '26 g', '54 g']],
        ],
      },
      {
        slug: 'desk-organisation',
        name: 'Desk Organisation',
        noun: ['organiser', 'organisers'],
        desc: [
          ['Desk Organiser', ['Solid Brass', 'Oiled Walnut', 'Set of 3']],
          ['Pen Cup', ['Solid Brass', 'Machined', 'Oiled Walnut']],
          ['Monitor Riser', ['Oiled Walnut', 'Powder-Coated', '56 cm']],
          ['Cable Tray', ['Powder-Coated', 'Under-Desk', '56 cm']],
        ],
        sfx: ['Solid Brass', 'Set of 3', 'Machined'],
        feat: [5, 11, 'Felt-lined base that will not scratch a desk or slide on it', 'Machined from a single billet, so there is nothing to work loose', 'Sized around the things people actually keep on a desk'],
        keys: ['Size', 'Finish', 'Capacity', 'Material', 'Weight', 'Origin'],
        specs: [
          ['Size', ['22 × 12 × 6 cm', 'Ø 8 × H 10 cm', '56 × 22 × 10 cm']],
          ['Material', ['Solid brass', 'Oiled walnut', 'Powder-coated steel']],
          ['Weight', ['1.2 kg', '680 g', '410 g']],
          ['Finish', ['Brushed brass', 'Matte black powder coat', 'Oiled walnut']],
          ['Capacity', ['Holds 12 pens', 'Three compartments', 'Fits a 16" laptop']],
        ],
      },
      {
        slug: 'paper-filing',
        name: 'Paper & Filing',
        noun: ['box', 'boxes'],
        desc: [
          ['Document Box', ['A4', 'Cloth-Bound', 'Set of 2']],
          ['Ring Binder', ['A4', '2-Ring', 'Cloth-Bound']],
          ['Manuscript Paper Pad', ['160 gsm', 'A4', '50 Sheets']],
          ['File Divider Set', ['Set of 12', 'A4', 'Kraft']],
        ],
        sfx: ['A4', '160 gsm', 'Set of 3'],
        feat: [0, 8, 10, 'Cloth-covered board with a ribbon pull, not a plastic finger hole', 'Acid-free throughout, so what you file will still be readable in thirty years'],
        keys: ['Size', 'Pages', 'Paper', 'Material', 'Weight', 'Origin'],
        specs: [
          ['Material', ['FSC board, cloth-covered', 'Acid-free 120 gsm paper', 'Recycled kraft board']],
          ['Weight', ['640 g', '980 g', '220 g']],
        ],
      },
      {
        slug: 'planners',
        name: 'Planners & Calendars',
        noun: ['planner', 'planners'],
        desc: [
          ['Weekly Planner', ['Undated', 'A5', 'B5']],
          ['Undated Daily Planner', ['Undated', 'A5', '160 gsm']],
          ['Wall Calendar', ['A2', 'A3', 'Undated']],
          ['Desk Diary', ['A5', 'Undated', 'Week-to-View']],
        ],
        sfx: ['Undated', 'A5', '160 gsm'],
        feat: [0, 1, 2, 3, 7, 8, 10],
        keys: ['Size', 'Pages', 'Paper', 'Ruling', 'Binding', 'Weight', 'Origin'],
      },
    ],
    terms: ['notebook', 'pen', 'office', 'desk', 'paper', 'stationery', 'calendar'],
    fallback: ['writing', 'workspace', 'journal'],
    brands: ['Vellum House', 'Quill Editions', 'Rill', 'Fenwick Row', 'Grainhouse', 'Marrow & Oak', 'Ochre & Ash', 'Kilnhouse', 'Bloom Ledger'],
    models: ['Vellum', 'Quill', 'Marl', 'Loam', 'Fen', 'Linden', 'Slate', 'Cove', 'Orchard', 'Bramble', 'Verge', 'Rill'],
    tags: ['stationery', 'office', 'notebook', 'writing', 'desk'],
    vocab: {
      mat: ['160 gsm Tomoe-style paper', 'solid brass', 'full-grain leather', 'FSC board', 'machined aluminium'],
      q: ['genuinely fountain-pen-friendly', 'well-weighted', 'lie-flat', 'refillable', 'unfussy'],
      ctx: ['a daily journalling habit', 'a desk that is always full', 'a meeting-heavy week', 'a bag that gets thrown around'],
      aud: ['people who still write things down', 'fountain-pen users', 'anyone who has had ink bleed through'],
      act: ['journalling every morning', 'taking notes in back-to-back meetings', 'planning a quarter on paper'],
      tail: ['no bleed-through with wet inks', 'a lay-flat sewn binding', 'a standard international refill', 'numbered pages'],
    },
    features: [
      '160 gsm paper that takes wet fountain-pen ink without bleeding or feathering',
      'Section-sewn so it lies completely flat from the first page',
      'Numbered pages and a two-page index at the front',
      'Two ribbon markers, an elastic closure and a rear gusset pocket',
      'Takes a standard international refill, so you are never locked in',
      'Solid brass body that develops a patina with handling',
      'Stainless steel nib available in extra-fine through to broad',
      'Undated, so you can start in March without wasting a third of it',
      'FSC-certified paper from a mill with a published carbon figure',
      'Refills, nibs and converters all stocked as separate items',
      'Perforated last twenty pages for tearing out cleanly',
      'Cover is a single piece of full-grain leather with no bonded filler',
    ],
    specs: [
      ['Size', ['A5, 148 × 210 mm', 'B5, 176 × 250 mm', 'A6, 105 × 148 mm', 'A4, 210 × 297 mm']],
      ['Pages', ['192', '256', '144', '80']],
      ['Paper', ['160 gsm ivory, fountain-pen friendly', '100 gsm FSC uncoated', '120 gsm bright white']],
      ['Ruling', ['5 mm dot grid', '7 mm ruled', 'Plain', 'Weekly layout']],
      ['Binding', ['Section-sewn, lies flat', 'Perfect bound', 'Wire-o']],
      ['Nib', ['Stainless steel, fine', 'Stainless steel, medium', 'Not applicable']],
      ['Refill', ['Standard international cartridge', 'G2 rollerball', '0.5 mm HB lead', 'Not applicable']],
      ['Material', ['Solid brass', 'Full-grain leather', 'FSC board, cloth-covered', 'Machined aluminium']],
      ['Weight', ['420 g', '38 g', '186 g', '1.2 kg']],
      ['Origin', ['Made in Egypt', 'Made in Japan', 'Made in Germany']],
    ],
  },
  {
    slug: 'garden-outdoor',
    name: 'Garden & Outdoor',
    tagline: 'For the bit outside the back door',
    icon: 'sprout',
    accent: 'green',
    family: 'utility',
    weight: 4,
    price: [18000, 900000],
    subcategories: [
      {
        slug: 'plants-seeds',
        name: 'Plants & Seeds',
        noun: ['kit', 'kits'],
        desc: [
          ['Herb Seed Kit', ['Set of 6', 'Organic', 'Windowsill']],
          ['Wildflower Seed Mix', ['100 g', 'Pollinator', 'Native']],
          ['Vegetable Starter Kit', ['Set of 6', 'Organic', 'Complete Kit']],
          ['Bulb Collection', ['Set of 25', 'Autumn Planting', 'Naturalising']],
        ],
        sfx: ['Set of 6', 'Organic', '9 L'],
        feat: [6, 10, 'Germination-tested at 92% or better on every lot before packing', 'Sowing calendar on the back of every packet, written for this climate', 'Packets are paper and the box is card, with nothing to throw away'],
        keys: ['Contents', 'Sowing', 'Germination', 'Capacity', 'Care', 'Guarantee'],
        specs: [
          ['Contents', ['6 varieties, 200 seeds each', '12 varieties', '3 varieties plus compost']],
          ['Sowing', ['February – May', 'Year-round indoors', 'September – November']],
          ['Germination', ['92%+ tested', '88%+ tested']],
        ],
      },
      {
        slug: 'planters-pots',
        name: 'Planters & Pots',
        noun: ['planter', 'planters'],
        desc: ['Terracotta Planter', 'Self-Watering Planter', 'Glazed Pot', 'Window Box'],
        sfx: ['30 cm', '45 cm', '9 L'],
        feat: [0, 1, 5, 8, 11, 'Wall thickness of 12 mm, which is what stops a pot cracking in February'],
        keys: ['Material', 'Dimensions', 'Capacity', 'Frost resistance', 'Drainage', 'Weight', 'Care', 'Guarantee'],
      },
      {
        slug: 'garden-tools',
        name: 'Garden Tools',
        noun: ['tool', 'tools'],
        desc: [
          ['Bypass Secateurs', ['Carbon Steel', 'Replaceable Blade', '210 mm']],
          ['Border Fork', ['Ash Handle', 'Stainless', '1 060 mm']],
          ['Watering Can', ['9 L', '5 L', 'Galvanised']],
          ['Hand Trowel', ['Ash Handle', 'Stainless', 'Carbon Steel']],
        ],
        sfx: ['Carbon Steel', '9 L', 'Ash Handle'],
        feat: [2, 3, 7, 8, 11, 'Ash handle, steam-bent and finished with linseed rather than lacquer'],
        keys: ['Material', 'Dimensions', 'Capacity', 'Blade', 'Weight', 'Care', 'Guarantee'],
        specs: [
          ['Material', ['High-carbon steel, ash handle', 'Stainless steel, ash handle', 'Powder-coated steel']],
          ['Dimensions', ['210 mm overall', '1 060 mm overall', 'H 34 cm × Ø 18 cm']],
          ['Weight', ['320 g', '1.6 kg', '820 g']],
        ],
      },
      {
        slug: 'outdoor-furniture',
        name: 'Outdoor Furniture',
        noun: ['set', 'sets'],
        desc: [
          ['Teak Bistro Set', ['2 Seats', 'FSC Teak', '4 Seats']],
          ['Folding Deck Chair', ['Foldable', 'FSC Teak', 'Canvas Sling']],
          ['Outdoor Bench', ['FSC Teak', '150 cm', '2 Seats']],
          ['Parasol', ['Ø 270 cm', 'Crank Tilt', 'FSC Teak']],
        ],
        sfx: ['FSC Teak', '2 Seats', 'Foldable'],
        feat: [4, 8, 9, 11, 'Mortise-and-tenon joints pinned with teak dowel, not screws', 'Stainless fixings throughout, so nothing bleeds rust down the timber'],
        keys: ['Material', 'Dimensions', 'Seats', 'Weight', 'Care', 'Guarantee'],
        specs: [
          ['Dimensions', ['120 × 70 × 74 cm', '60 × 60 × 72 cm', 'Ø 270 cm']],
          ['Weight', ['18 kg', '6.4 kg', '24 kg']],
        ],
      },
      {
        slug: 'bbq-grills',
        name: 'BBQ & Grills',
        noun: ['grill', 'grills'],
        desc: [
          ['Charcoal Kettle Grill', ['57 cm', '47 cm', 'One-Touch Vents']],
          ['Kamado Grill', ['Ceramic', 'Cast Iron', '56 cm']],
          ['Portable BBQ', ['Foldable', 'Compact', 'Stainless']],
          ['Fire Pit', ['Corten Steel', '80 cm', 'Foldable']],
        ],
        sfx: ['57 cm', 'Cast Iron', 'Foldable'],
        feat: [8, 11, 'Porcelain-enamelled inside and out, fired at 800°C', 'Cast iron grates that hold heat instead of dumping it on cold meat', 'Ash catcher empties from underneath without dismantling anything', 'One-touch vents that still move after three winters outside'],
        keys: ['Material', 'Dimensions', 'Weight', 'Care', 'Guarantee'],
        specs: [
          ['Material', ['Porcelain-enamelled steel', 'Cast iron and steel', 'Powder-coated steel']],
          ['Dimensions', ['Ø 57 × H 100 cm', 'Ø 47 × H 82 cm', '40 × 30 × 26 cm']],
          ['Weight', ['16 kg', '9.2 kg', '4.8 kg']],
        ],
      },
    ],
    terms: ['garden', 'plant', 'gardening', 'flowers', 'lawn', 'patio', 'greenhouse'],
    fallback: ['backyard', 'outdoor', 'nature'],
    brands: ['Verdant', 'Terra Nine', 'Meadowbrook', 'Orchard & Vine', 'Kilnhouse', 'Larkspur', 'Hearthline', 'Northgrove', 'Grainhouse'],
    models: ['Orchard', 'Meadow', 'Loam', 'Bramble', 'Fen', 'Alder', 'Basin', 'Linden', 'Cove', 'Solstice', 'Rill', 'Marl'],
    tags: ['garden', 'outdoor', 'plants', 'growing', 'patio'],
    vocab: {
      mat: ['frost-proof terracotta', 'FSC teak', 'high-carbon steel', 'powder-coated aluminium', 'recycled HDPE'],
      q: ['frost-proof', 'genuinely sharp', 'weatherproof', 'long-lasting', 'well-balanced'],
      ctx: ['a small balcony', 'a north-facing yard', 'a full growing season', 'a windy roof terrace'],
      aud: ['balcony growers', 'people with more ambition than space', 'anyone who has lost a pot to frost'],
      act: ['growing herbs on a balcony', 'getting the beds ready in February', 'cooking outside all summer'],
      tail: ['a frost-proof firing', 'replaceable blades', 'a fifteen-year guarantee', 'a self-watering reservoir'],
    },
    features: [
      'Fired to 1 100°C and frost-proof down to -15°C, guaranteed for ten years',
      'Self-watering reservoir holds a fortnight of water for a mature plant',
      'High-carbon steel blades that take an edge and can be re-sharpened',
      'Every blade, spring and catch is a stocked replaceable spare',
      'FSC teak that silvers naturally, or stays honey-coloured if you oil it',
      'Drainage holes are pre-drilled and correctly sized, with feet included',
      'Seeds are open-pollinated so you can save them for next season',
      'Sap groove and a wiper blade keep the cut clean on green wood',
      'Powder-coated after welding, not before, so the joints do not rust first',
      'Folds flat for winter storage in about thirty seconds',
      'Peat-free compost and a slow-release feed included',
      'Fifteen-year guarantee on the frame against rot and corrosion',
    ],
    specs: [
      ['Material', ['Frost-proof terracotta', 'FSC teak', 'High-carbon steel, ash handle', 'Powder-coated aluminium', 'Recycled HDPE']],
      ['Dimensions', ['Ø 30 × H 28 cm', 'Ø 45 × H 40 cm', '210 mm overall', '120 × 70 × 74 cm']],
      ['Capacity', ['9 L', '24 L', '5 L reservoir', '330 L']],
      ['Frost resistance', ['To -15°C, guaranteed 10 years', 'To -5°C', 'Not frost resistant']],
      ['Drainage', ['Pre-drilled, feet included', 'Self-watering reservoir', 'Not applicable']],
      ['Blade', ['High-carbon steel, replaceable', 'Stainless steel', 'Not applicable']],
      ['Seats', ['2', '4', '6', 'Not applicable']],
      ['Weight', ['4.6 kg', '820 g', '18 kg', '11 kg']],
      ['Care', ['Oil annually or let silver', 'Wipe and oil the blade', 'Bring in below -15°C']],
      ['Guarantee', ['15 years', '10 years', '5 years']],
    ],
  },
  {
    slug: 'tools-diy',
    name: 'Tools & DIY',
    tagline: 'Bought once, used for years',
    icon: 'wrench',
    accent: 'orange',
    family: 'utility',
    weight: 2,
    price: [22000, 1300000],
    subcategories: [
      {
        slug: 'power-tools',
        name: 'Power Tools',
        noun: ['tool', 'tools'],
        desc: ['Brushless Drill Driver', 'Impact Driver', 'Angle Grinder', 'Circular Saw'],
        sfx: ['18 V 2 × 4 Ah', 'Brushless', 'Bare Unit'],
        feat: [0, 1, 6, 9, 10, 11, 'LED ring rather than a single diode, so the bit does not cast a shadow'],
        keys: ['Voltage', 'Battery', 'Torque', 'Chuck', 'Material', 'Weight', 'Warranty'],
        specs: [
          ['Weight', ['1.4 kg', '1.9 kg', '2.6 kg']],
        ],
      },
      {
        slug: 'hand-tools',
        name: 'Hand Tools',
        noun: ['tool', 'tools'],
        desc: [
          ['Combination Spanner Set', ['8 – 22 mm', '6 – 19 mm', '12-Piece']],
          ['Ratchet Screwdriver', ['54-Piece', '72-Tooth', 'Precision']],
          ['Claw Hammer', ['450 g', '560 g', 'Hickory']],
          ['Pliers Set', ['3-Piece', 'VDE Rated', '8 – 22 mm']],
        ],
        sfx: ['54-Piece', '8 – 22 mm', '450 g'],
        feat: [2, 3, 4, 8, 9, 10, 11],
        keys: ['Sizes', 'Finish', 'Pieces', 'Material', 'Weight', 'Warranty'],
        specs: [
          ['Sizes', ['8 – 22 mm', '6 – 19 mm', 'Not applicable']],
          ['Finish', ['Satin chrome', 'Black phosphate', 'Polished']],
        ],
      },
      {
        slug: 'measuring',
        name: 'Measuring & Marking',
        noun: ['tool', 'tools'],
        desc: [
          ['Laser Level', ['Self-Levelling', 'Cross-Line', '30 m']],
          ['Tape Measure', ['5 m', '8 m', '25 mm Blade']],
          ['Digital Caliper', ['0.01 mm', '150 mm', 'Stainless']],
          ['Combination Square', ['300 mm', 'Hardened', 'Cast Iron']],
        ],
        sfx: ['Self-Levelling', '5 m', '0.01 mm'],
        feat: [5, 9, 10, 11, 'Holds calibration through a drop that would end most instruments', 'Blade is hardened and etched, so the markings do not rub off'],
        keys: ['Accuracy', 'Range', 'Power', 'Material', 'Weight', 'Warranty'],
        specs: [
          ['Material', ['Glass-filled nylon', 'Anodised aluminium', 'Hardened stainless steel']],
          ['Weight', ['210 g', '620 g', '86 g']],
          ['Range', ['30 m indoor, 50 m with a target', '5 m tape, 25 mm blade', '0 – 150 mm']],
          ['Power', ['2 × AA', 'USB-C rechargeable', 'Not applicable']],
        ],
      },
      {
        slug: 'storage-workshop',
        name: 'Storage & Workshop',
        noun: ['chest', 'chests'],
        desc: [
          ['Steel Tool Chest', ['5 Drawer', '7 Drawer', 'Ball-Bearing']],
          ['Rolling Tool Cabinet', ['7 Drawer', 'Ball-Bearing', 'Heavy Gauge']],
          ['Tool Bag', ['16-Inch', 'Waterproof Base', '24 Pockets']],
          ['Wall Panel Set', ['Set of 2', 'Heavy Gauge', 'With Hooks']],
        ],
        sfx: ['5 Drawer', 'Ball-Bearing', 'Heavy Gauge'],
        feat: [7, 10, 11, 'Drawers stay shut on a slope thanks to a proper detent, not friction', 'Powder-coated after welding so the seams do not rust first', 'Central locking on a barrel key rather than a bent tab'],
        keys: ['Drawers', 'Dimensions', 'Load rating', 'Material', 'Weight', 'Warranty'],
        specs: [
          ['Material', ['Powder-coated 1.0 mm steel', 'Heavy-gauge 1.2 mm steel', '1680D ballistic nylon']],
          ['Weight', ['28 kg', '46 kg', '2.4 kg']],
          ['Drawers', ['5', '7', '3']],
          ['Dimensions', ['660 × 305 × 380 mm', '1015 × 460 × 950 mm']],
        ],
      },
      {
        slug: 'painting-decorating',
        name: 'Painting & Decorating',
        noun: ['set', 'sets'],
        desc: [
          ['Synthetic Paint Brush Set', ['Set of 5', 'Synthetic', '25 – 75 mm']],
          ['Roller Kit', ['9-Inch', 'Set of 3', 'Medium Pile']],
          ['Filling Knife Set', ['Set of 3', 'Stainless', 'Flexible']],
          ['Masking Tape Pack', ['Set of 3', 'Low-Tack', '24 mm']],
        ],
        sfx: ['Set of 5', 'Synthetic', 'Heavy Gauge'],
        feat: [9, 10, 11, 'Filaments are tipped and flagged, so they lay off without leaving tram lines', 'Stainless ferrule crimped twice, which is why the head does not shed', 'Washes out completely in water and dries back to shape'],
        keys: ['Pieces', 'Sizes', 'Bristle', 'Material', 'Weight', 'Warranty'],
        specs: [
          ['Material', ['Synthetic filament, stainless ferrule', 'Beech handle, brass ferrule', 'Microfibre sleeve and steel frame']],
          ['Weight', ['320 g', '480 g', '140 g']],
          ['Sizes', ['25, 38, 50, 63 and 75 mm', '9" roller with two sleeves', '12, 25 and 50 mm']],
          ['Bristle', ['Synthetic filament, tipped and flagged', 'Natural bristle', 'Microfibre sleeve']],
        ],
      },
    ],
    terms: ['tools', 'paint brush', 'workshop', 'construction tools', 'hammer', 'wrench', 'screwdriver', 'carpenter'],
    fallback: ['diy', 'toolbox', 'repair'],
    brands: ['Anvil Works', 'Ironwake', 'Foundry', 'Quarry', 'Basalt', 'Northwind', 'Terrafirm', 'Kestrel', 'Hexline'],
    models: ['Anvil', 'Forge', 'Warden', 'Praxis', 'Talon', 'Ridge', 'Basin', 'Verge', 'Ember', 'Atlas', 'Quarry', 'Cirrus'],
    tags: ['tools', 'diy', 'workshop', 'hardware', 'repair'],
    vocab: {
      mat: ['chrome vanadium steel', 'drop-forged steel', 'glass-filled nylon', 'anodised aluminium', 'hickory'],
      q: ['properly rated', 'balanced', 'over-engineered', 'serviceable', 'no-nonsense'],
      ctx: ['a first flat', 'a working van', 'a garage that doubles as a workshop', 'a weekend of jobs'],
      aud: ['tradespeople', 'people doing up a first flat', 'anyone tired of rounding off bolts'],
      act: ['fitting a kitchen at the weekend', 'working out of a van', 'finally sorting the shelves out'],
      tail: ['a brushless motor', 'a lifetime guarantee on hand tools', 'a published torque figure', 'a 72-tooth ratchet'],
    },
    features: [
      'Brushless motor with 65 Nm of torque and a 22-position clutch',
      'Batteries are a standard platform shared across the whole range',
      'Chrome vanadium steel, drop-forged and heat-treated, guaranteed for life',
      '72-tooth ratchet needs only 5° of swing in a tight space',
      'Anti-slip drive profile grips the flank of the fastener, not the corners',
      'Self-levelling to ±0.3 mm per metre with a magnetic mount',
      'All-metal gearbox rather than a nylon one that strips under load',
      'Ball-bearing drawer slides rated to 35 kg per drawer',
      'Hickory handle with a proper wedge, replaceable if it ever breaks',
      'Every socket and bit is laser-etched, not printed — the markings stay legible',
      'Case is moulded to hold each piece, so a missing tool is obvious',
      'Three-year warranty on power tools, lifetime on hand tools',
    ],
    specs: [
      ['Voltage', ['18 V', '12 V', 'Mains 230 V', 'Not applicable']],
      ['Battery', ['2 × 4.0 Ah Li-ion', '2 × 2.0 Ah Li-ion', 'Bare unit', 'Not applicable']],
      ['Torque', ['65 Nm', '180 Nm', '40 Nm', 'Not applicable']],
      ['Chuck', ['13 mm keyless metal', '1/4" hex', 'Not applicable']],
      ['Pieces', ['54', '22', '5', '108']],
      ['Material', ['Chrome vanadium steel', 'Drop-forged steel, hickory', 'Glass-filled nylon', 'Powder-coated steel']],
      ['Accuracy', ['±0.3 mm per metre', '±3% of reading', 'Not applicable']],
      ['Load rating', ['35 kg per drawer', '150 kg total', 'Not applicable']],
      ['Weight', ['1.4 kg', '3.8 kg', '620 g', '28 kg']],
      ['Warranty', ['3 years on power tools', 'Lifetime on hand tools', '5 years']],
    ],
  },
);

/* ------------------------------------------------------------------ *
 * Image pools
 * ------------------------------------------------------------------ */

const TARGET_POOL = 110; // stop topping a category up once it has this many raw URLs
const MAX_PAGES = 4;

/** Hosts we are willing to accept when the search has to be widened past StockSnap. */
const REPUTABLE_HOSTS = [
  /(^|\.)stocksnap\.io$/,
  /(^|\.)staticflickr\.com$/,
  /(^|\.)wikimedia\.org$/,
  /(^|\.)pexels\.com$/,
  /(^|\.)pixabay\.com$/,
  /(^|\.)unsplash\.com$/,
  /(^|\.)shopifycdn\.com$/,
  /(^|\.)freerangestock\.com$/,
  /(^|\.)rawpixel\.com$/,
  /(^|\.)nasa\.gov$/,
];

function isReputable(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return REPUTABLE_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

/**
 * Pool URLs for a set of search terms.
 *
 * Pass 1 always fetches page 1 of *every* term, so a category's pool is a blend of
 * all of its terms rather than whatever the first two happened to return. Pass 2
 * then tops the pool up with deeper pages, round-robin across the terms, until the
 * cap is reached — which keeps the blend even instead of over-weighting term one.
 */
async function gather(terms, mode, into, cap) {
  const pageCounts = new Map();

  const absorb = (res) => {
    for (const r of res.results) {
      if (!r.url) continue;
      if (mode === 'wide' && !isReputable(r.url)) continue;
      into.add(r.url);
    }
  };

  for (const term of terms) {
    const res = await openverseSearch(term, 1, mode);
    pageCounts.set(term, res.pageCount || 1);
    absorb(res);
  }

  for (let page = 2; page <= MAX_PAGES && into.size < cap; page++) {
    for (const term of terms) {
      if (into.size >= cap) break;
      if (page > pageCounts.get(term)) continue;
      absorb(await openverseSearch(term, page, mode));
    }
  }
}

/**
 * Build a verified image pool per category. Returns
 * { pools: Map<slug, string[]>, fallbackUsed: string[] }.
 */
async function buildImagePools() {
  const pools = new Map();
  const fallbackUsed = [];

  for (const cat of CATEGORIES) {
    const raw = new Set();
    await gather(cat.terms, 'stocksnap', raw, TARGET_POOL);

    let verified = await verifyAll([...raw].sort(), { label: cat.slug });
    let note = '';

    if (verified.length < WIDEN_POOL) {
      // Step 1: category fallback terms, still on StockSnap.
      note = 'fallback terms';
      await gather(cat.fallback, 'stocksnap', raw, TARGET_POOL);
      verified = await verifyAll([...raw].sort(), { label: cat.slug });
    }

    if (verified.length < WIDEN_POOL) {
      // Step 2: drop the provider filter, keep commercial licences and known CDNs.
      note = 'widened past StockSnap';
      const wide = new Set();
      await gather([...cat.terms, ...cat.fallback], 'wide', wide, TARGET_POOL * 2);
      const wideOk = await verifyAll([...wide].sort(), { label: `${cat.slug}/wide` });
      verified = [...new Set([...verified, ...wideOk])].sort();
    }

    if (note) fallbackUsed.push(`${cat.slug} (${note}) → ${verified.length} images`);

    log(
      `   ${cat.slug.padEnd(24)} raw ${String(raw.size).padStart(3)}  verified ${String(verified.length).padStart(3)}${note ? '  [' + note + ']' : ''}`
    );

    if (verified.length < MIN_POOL) {
      throw new Error(
        `Category "${cat.slug}" only produced ${verified.length} verified images (minimum ${MIN_POOL}). ` +
          `Add stronger search terms and re-run.`
      );
    }
    pools.set(cat.slug, verified);
  }

  return { pools, fallbackUsed };
}

/* ------------------------------------------------------------------ *
 * Product generation
 * ------------------------------------------------------------------ */

const NAME_PATTERNS = {
  0: (b, m, d, s) => `${b} ${m} ${d} ${s}`,
  1: (b, m, d, s) => `${b} ${m} ${d} — ${s}`,
  2: (b, m, d, s) => `${b} ${m} ${s} ${d}`,
  3: (b, m, d, s) => `${b} ${m} — ${d}, ${s}`,
  4: (b, m, d, s) => `${b} ${m} ${d}, ${s}`,
};

const FAMILY_PATTERNS = {
  tech: [0, 1, 2],
  home: [0, 1, 2],
  fashion: [1, 0, 4],
  beauty: [0, 1, 2],
  active: [0, 1, 2],
  accessory: [1, 0, 4],
  media: [3, 1, 0],
  family: [0, 1, 2],
  food: [1, 0, 4],
  utility: [0, 1, 2],
};

const TAG_STOPWORDS = new Set(['and', 'the', 'with', 'for', 'set', 'pack', 'kit']);

const COLOURWAYS = ['Slate', 'Olive', 'Sand', 'Graphite', 'Ink', 'Clay', 'Fern', 'Bone', 'Rust', 'Storm'];

/** "a"/"an" agreement, applied after slot substitution. */
function fixArticles(text) {
  return text.replace(/\b([Aa])\s+([A-Za-z][A-Za-z-]*)/g, (m, a, w) => {
    if (w === w.toUpperCase() && w.length > 1) return m; // acronym: leave alone
    const lw = w.toLowerCase();
    const vowel = /^[aeiou]/.test(lw) && !/^(uni|use|user|usb|eu|one|ubiq)/.test(lw);
    if (!vowel) return m;
    return (a === 'A' ? 'An' : 'an') + ' ' + w;
  });
}

/** Round a price to something a shop would actually print. */
function tidyPrice(cents) {
  if (cents >= 1000000) return Math.round(cents / 10000) * 10000 - 100; // …99.00 EGP
  if (cents >= 100000) return Math.round(cents / 1000) * 1000 - 100;
  if (cents >= 20000) return Math.round(cents / 500) * 500 - 100;
  return Math.max(500, Math.round(cents / 100) * 100 - 5);
}

/** Distribute TOTAL_PRODUCTS over the categories: min 12 each, rest by weight. */
function allocateCounts(cats) {
  const base = MIN_PER_CATEGORY;
  let remaining = TOTAL_PRODUCTS - base * cats.length;
  if (remaining < 0) {
    throw new Error(
      `${cats.length} categories × ${base} minimum exceeds ${TOTAL_PRODUCTS} products.`
    );
  }
  const totalWeight = cats.reduce((s, c) => s + c.weight, 0);
  const exact = cats.map((c) => (c.weight / totalWeight) * remaining);
  const counts = exact.map((e) => Math.floor(e));
  let assigned = counts.reduce((s, n) => s + n, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  let k = 0;
  while (assigned < remaining) {
    counts[order[k % order.length].i]++;
    assigned++;
    k++;
  }
  return cats.map((c, i) => ({ cat: c, count: base + counts[i] }));
}

/** 3–5 distinct images, offset by product index so neighbours differ. */
function pickImages(rng, pool, index) {
  const n = rng.int(3, 5);
  const len = pool.length;
  const start = (index * 3 + rng.int(0, 2)) % len;
  const stride = 1 + ((index + rng.int(0, 2)) % Math.max(1, Math.min(7, len - 1)));
  const out = [];
  const seen = new Set();
  let cursor = start;
  let guard = 0;
  while (out.length < n && guard++ < len * 4) {
    const url = pool[cursor % len];
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
    cursor += stride;
  }
  // Pool is >= 8 so this always fills; the guard is belt and braces.
  for (let i = 0; out.length < 3 && i < len; i++) {
    const url = pool[i];
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

/** Fail fast on a malformed category definition rather than shipping bad data. */
function preflight() {
  const problems = [];
  const seenSub = new Set();
  for (const cat of CATEGORIES) {
    if (!FAMILY_COPY[cat.family]) problems.push(`${cat.slug}: unknown family "${cat.family}"`);
    if (!FAMILY_PATTERNS[cat.family]) problems.push(`${cat.slug}: no name patterns for family "${cat.family}"`);
    if (cat.subcategories.length < 2 || cat.subcategories.length > 5) {
      problems.push(`${cat.slug}: ${cat.subcategories.length} subcategories (contract allows 2-5)`);
    }
    if (cat.brands.length < 6 || cat.brands.length > 12) {
      problems.push(`${cat.slug}: ${cat.brands.length} brands (want 6-12)`);
    }
    for (const sub of cat.subcategories) {
      const id = `${cat.slug}/${sub.slug}`;
      if (seenSub.has(id)) problems.push(`${id}: duplicate subcategory`);
      seenSub.add(id);
      if (sub.feat.length < 5) problems.push(`${id}: only ${sub.feat.length} features`);
      if (sub.keys.length < 5) problems.push(`${id}: only ${sub.keys.length} spec keys`);
      if (sub.desc.length < 3) problems.push(`${id}: only ${sub.desc.length} descriptors`);
      if (sub.sfx.length < 3) problems.push(`${id}: only ${sub.sfx.length} suffixes`);
      for (const d of sub.desc) {
        if (Array.isArray(d) && (typeof d[0] !== 'string' || !Array.isArray(d[1]) || d[1].length < 2)) {
          problems.push(`${id}: descriptor ${JSON.stringify(d[0])} needs at least 2 suffixes`);
        }
      }
      for (const f of sub.feat) {
        if (typeof f === 'number' && !cat.features[f]) problems.push(`${id}: feature index ${f} out of range`);
      }
      const pool = new Map([...cat.specs, ...(sub.specs || [])]);
      for (const k of sub.keys) {
        if (!pool.has(k)) problems.push(`${id}: spec key "${k}" is not defined`);
      }
    }
  }
  if (problems.length) {
    throw new Error(`Category definitions are invalid:\n  - ${problems.join('\n  - ')}`);
  }
}

function buildProducts(pools) {
  const rng = new Rng(SEED);
  const badgeRng = new Rng(SEED ^ 0x5bf03635);
  const allocation = allocateCounts(CATEGORIES);
  const products = [];
  const usedNames = new Set();
  const usedSlugs = new Set();
  let idSeq = 0;

  // createdAt spread over the last three years.
  const THREE_YEARS = 3 * 365 * 24 * 3600 * 1000;

  for (const { cat, count } of allocation) {
    const pool = pools.get(cat.slug);
    const brandOrder = rng.shuffled(cat.brands);
    const subOrder = rng.shuffled(cat.subcategories);
    const patterns = FAMILY_PATTERNS[cat.family];

    for (let i = 0; i < count; i++) {
      const brand = brandOrder[i % brandOrder.length];
      const sub = subOrder[i % subOrder.length];

      // --- name ---
      let name = null;
      let chosenModel = cat.models[0];
      let chosenDesc = Array.isArray(sub.desc[0]) ? sub.desc[0][0] : sub.desc[0];
      for (let attempt = 0; attempt < 200 && !name; attempt++) {
        const model = rng.pick(cat.models);
        // A descriptor may carry its own suffixes — "Trekking Poles 3-Section" rather
        // than "Trekking Poles 750 Fill". Otherwise it falls back to the subcategory's.
        const entry = rng.pick(sub.desc);
        const desc = Array.isArray(entry) ? entry[0] : entry;
        const sfx = rng.pick(Array.isArray(entry) ? entry[1] : sub.sfx);
        // Avoid "Anvil Works Anvil ..." and "Oxford ... Oxford Shirt".
        if (brand.toLowerCase().includes(model.toLowerCase())) continue;
        if (desc.toLowerCase().includes(model.toLowerCase())) continue;
        if (desc.toLowerCase().includes(sfx.toLowerCase())) continue;
        const pattern = NAME_PATTERNS[patterns[attempt % patterns.length]];
        let candidate = pattern(brand, model, desc, sfx);
        if (attempt > 120) candidate += ` in ${COLOURWAYS[attempt % COLOURWAYS.length]}`;
        if (!usedNames.has(candidate)) {
          name = candidate;
          chosenModel = model;
          chosenDesc = desc;
        }
      }
      if (!name) throw new Error(`Could not find a unique name in "${cat.slug}" after 200 attempts.`);
      usedNames.add(name);

      let slug = slugify(name);
      if (usedSlugs.has(slug)) {
        let n = 2;
        while (usedSlugs.has(`${slug}-${n}`)) n++;
        slug = `${slug}-${n}`;
      }
      usedSlugs.add(slug);

      // --- copy context ---
      const noun = sub.noun;
      const copyCtx = {
        brand,
        model: chosenModel,
        p: noun[0],
        pp: noun[1],
        mat: rng.pick(cat.vocab.mat),
        q: rng.pick(cat.vocab.q),
        ctx: rng.pick(cat.vocab.ctx),
        aud: rng.pick(cat.vocab.aud),
        act: rng.pick(cat.vocab.act),
      };

      // --- price ---
      const priceCents = tidyPrice(rng.logInt(cat.price[0], cat.price[1]));
      const discounted = rng.chance(0.4);
      const listPriceCents = discounted
        ? Math.max(priceCents + 100, tidyPrice(Math.round(priceCents * rng.float(1.1, 1.45))))
        : null;

      // --- ratings, stock ---
      const rating = Math.round((3.2 + 1.8 * Math.pow(rng.next(), 0.45)) * 10) / 10;
      const ratingCount = rng.logInt(8, 4200);
      const outOfStock = rng.chance(0.04);
      const stock = outOfStock ? 0 : Math.max(1, Math.round(rng.skew(1, 400, 1.6)));

      // --- dates ---
      const ageMs = Math.round(rng.skew(0, THREE_YEARS, 0.85));
      const createdAt = new Date(BASE_DATE - ageMs);
      createdAt.setUTCHours(0, 0, 0, 0);

      // --- badges ---
      // Drawn from a dedicated stream: two mulberry32 draws taken at a fixed stride
      // inside the main sequence turn out to be correlated enough to skew the rates.
      const badges = [];
      if (badgeRng.chance(0.08)) badges.push('BEST_SELLER');
      if (ageMs < 150 * 24 * 3600 * 1000) badges.push('NEW');
      if (listPriceCents) badges.push('DEAL');
      if (badgeRng.chance(0.05)) badges.push('LIMITED');

      // --- content ---
      const description = fixArticles(buildDescription(rng, cat, copyCtx));
      const shortDescription = fixArticles(buildShortDescription(rng, cat, copyCtx));
      const featurePool = sub.feat.map((f) => (typeof f === 'number' ? cat.features[f] : f));
      const features = rng
        .sample(featurePool, rng.int(5, Math.min(7, featurePool.length)))
        .map((f) => fixArticles(fill(f, copyCtx)));

      const specPool = new Map([...cat.specs, ...(sub.specs || [])]);
      const chosenKeys = rng.sample(sub.keys, rng.int(5, Math.min(9, sub.keys.length)));
      const specs = {};
      // Keep the authored key order rather than the sampled order.
      for (const key of sub.keys) {
        if (chosenKeys.includes(key)) specs[key] = rng.pick(specPool.get(key));
      }

      // Lead with words taken from this product, then top up from the category pool,
      // so a field jacket never ends up tagged "denim" just because its category is.
      const specific = [
        ...sub.slug.split('-'),
        ...chosenDesc.toLowerCase().split(/[^a-z0-9]+/),
      ].filter((t) => t.length > 2 && !TAG_STOPWORDS.has(t));
      const tags = [];
      for (const t of rng.shuffled([...new Set(specific)]).slice(0, 3)) tags.push(t);
      for (const t of rng.shuffled([...cat.tags, brand.split(' ')[0].toLowerCase()])) {
        if (tags.length >= rng.int(5, 6)) break;
        if (!tags.includes(t)) tags.push(t);
      }

      const images = pickImages(rng, pool, i);

      const freeShipping = priceCents >= 100000 ? rng.chance(0.92) : rng.chance(0.35);

      products.push({
        id: `p-${String(++idSeq).padStart(5, '0')}`,
        slug,
        name,
        brand,
        categorySlug: cat.slug,
        subcategorySlug: sub.slug,
        priceCents,
        listPriceCents,
        rating,
        ratingCount,
        stock,
        badges,
        shortDescription,
        description,
        features,
        specs,
        tags,
        images,
        freeShipping,
        createdAt: createdAt.toISOString(),
      });
    }
  }

  return products;
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

async function build() {
  log('Orbit Bazaar catalog builder');
  log(`  categories: ${CATEGORIES.length}  products: ${TOTAL_PRODUCTS}  seed: 0x${SEED.toString(16)}`);
  log('');
  log('1/3  Sourcing and verifying images (Openverse → StockSnap)');

  preflight();
  const { pools, fallbackUsed } = await buildImagePools();
  flushSearchCache();
  flushVerifyCache();

  if (CATEGORIES.length < MIN_CATEGORIES) {
    throw new Error(`Only ${CATEGORIES.length} categories survived; the contract requires ${MIN_CATEGORIES}.`);
  }

  log('');
  log('2/3  Generating products');
  const products = buildProducts(pools);
  if (products.length !== TOTAL_PRODUCTS) {
    throw new Error(`Generated ${products.length} products, expected exactly ${TOTAL_PRODUCTS}.`);
  }

  const categories = CATEGORIES.map((c) => {
    const pool = pools.get(c.slug);
    return {
      slug: c.slug,
      name: c.name,
      tagline: c.tagline,
      icon: c.icon,
      accent: c.accent,
      heroImage: pool[0],
      subcategories: c.subcategories.map((s) => ({ slug: s.slug, name: s.name })),
    };
  });

  const catalog = { version: 1, currency: 'EGP', categories, products };

  log('');
  log('3/3  Writing catalog');
  ensureDir(path.dirname(OUT_FILE));
  fs.writeFileSync(OUT_FILE, JSON.stringify(catalog, null, 2) + '\n');

  const usedImages = new Set(products.flatMap((p) => p.images));
  const bytes = fs.statSync(OUT_FILE).size;

  log('');
  log('Done.');
  log(`  file            ${path.relative(ROOT, OUT_FILE)}`);
  log(`  size            ${(bytes / 1024 / 1024).toFixed(2)} MiB (${bytes.toLocaleString('en-US')} bytes)`);
  log(`  categories      ${categories.length}`);
  log(`  products        ${products.length}`);
  log(`  unique images   ${usedImages.size}`);
  log(`  openverse calls ${apiCallCount}`);
  log('');
  log('  Products per category:');
  for (const c of categories) {
    const n = products.filter((p) => p.categorySlug === c.slug).length;
    log(`    ${c.slug.padEnd(24)} ${String(n).padStart(3)}   pool ${String(pools.get(c.slug).length).padStart(3)}`);
  }
  if (fallbackUsed.length) {
    log('');
    log('  Categories that needed fallback sourcing:');
    for (const f of fallbackUsed) log(`    ${f}`);
  } else {
    log('');
    log('  No category needed fallback sourcing.');
  }
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

async function validate() {
  const failures = [];
  const check = (cond, msg) => {
    if (!cond) failures.push(msg);
  };

  const raw = fs.readFileSync(OUT_FILE, 'utf8');
  const cat = JSON.parse(raw);

  log('Validating ' + path.relative(ROOT, OUT_FILE));
  log('');

  check(cat.version === 1, 'version must be 1');
  check(cat.currency === 'EGP', 'currency must be EGP');
  check(Array.isArray(cat.categories), 'categories must be an array');
  check(Array.isArray(cat.products), 'products must be an array');

  const cats = cat.categories || [];
  const products = cat.products || [];

  check(products.length === 500, `expected exactly 500 products, got ${products.length}`);
  check(cats.length >= 24, `expected >= 24 categories, got ${cats.length}`);

  const catBySlug = new Map(cats.map((c) => [c.slug, c]));
  check(catBySlug.size === cats.length, 'category slugs must be unique');

  for (const c of cats) {
    check(typeof c.name === 'string' && c.name.length > 0, `${c.slug}: missing name`);
    check(typeof c.tagline === 'string' && c.tagline.length > 0, `${c.slug}: missing tagline`);
    check(typeof c.icon === 'string' && c.icon.length > 0, `${c.slug}: missing icon`);
    check(typeof c.accent === 'string' && c.accent.length > 0, `${c.slug}: missing accent`);
    check(/^https?:\/\//.test(c.heroImage || ''), `${c.slug}: bad heroImage`);
    check(
      Array.isArray(c.subcategories) && c.subcategories.length >= 2 && c.subcategories.length <= 5,
      `${c.slug}: expected 2-5 subcategories, got ${c.subcategories?.length}`
    );
    const subSlugs = new Set(c.subcategories.map((s) => s.slug));
    check(subSlugs.size === c.subcategories.length, `${c.slug}: duplicate subcategory slug`);
  }

  const names = new Set();
  const slugs = new Set();
  const ids = new Set();
  const perCategory = new Map();
  const allImages = new Set();
  const badgeCounts = {};
  let discounted = 0;
  let outOfStock = 0;

  for (const p of products) {
    check(!ids.has(p.id), `duplicate id ${p.id}`);
    ids.add(p.id);
    check(!names.has(p.name), `duplicate name: ${p.name}`);
    names.add(p.name);
    check(!slugs.has(p.slug), `duplicate slug: ${p.slug}`);
    slugs.add(p.slug);

    const c = catBySlug.get(p.categorySlug);
    check(!!c, `${p.slug}: unknown categorySlug ${p.categorySlug}`);
    if (c) {
      const ok = c.subcategories.some((s) => s.slug === p.subcategorySlug);
      check(ok, `${p.slug}: subcategorySlug "${p.subcategorySlug}" not in category ${c.slug}`);
    }
    perCategory.set(p.categorySlug, (perCategory.get(p.categorySlug) || 0) + 1);

    check(Array.isArray(p.images) && p.images.length >= 3 && p.images.length <= 5, `${p.slug}: expected 3-5 images, got ${p.images?.length}`);
    check(new Set(p.images).size === p.images.length, `${p.slug}: duplicate image inside its own gallery`);
    for (const u of p.images) {
      check(/^https:\/\//.test(u), `${p.slug}: non-https image ${u}`);
      allImages.add(u);
    }

    check(Number.isInteger(p.priceCents) && p.priceCents > 0, `${p.slug}: priceCents must be a positive integer`);
    check(
      p.listPriceCents === null || (Number.isInteger(p.listPriceCents) && p.listPriceCents > p.priceCents),
      `${p.slug}: listPriceCents must be null or greater than priceCents`
    );
    if (p.listPriceCents !== null) discounted++;

    check(p.rating >= 3.2 && p.rating <= 5.0, `${p.slug}: rating out of range (${p.rating})`);
    check(Math.abs(p.rating * 10 - Math.round(p.rating * 10)) < 1e-9, `${p.slug}: rating must have 1 decimal`);
    check(Number.isInteger(p.ratingCount) && p.ratingCount >= 8 && p.ratingCount <= 4200, `${p.slug}: ratingCount out of range`);
    check(Number.isInteger(p.stock) && p.stock >= 0 && p.stock <= 400, `${p.slug}: stock out of range`);
    if (p.stock === 0) outOfStock++;

    check(Array.isArray(p.badges), `${p.slug}: badges must be an array`);
    for (const b of p.badges) {
      check(['BEST_SELLER', 'NEW', 'DEAL', 'LIMITED'].includes(b), `${p.slug}: unknown badge ${b}`);
      badgeCounts[b] = (badgeCounts[b] || 0) + 1;
    }
    check((p.listPriceCents !== null) === p.badges.includes('DEAL'), `${p.slug}: DEAL badge must track listPriceCents`);

    check(typeof p.shortDescription === 'string' && p.shortDescription.length > 0 && p.shortDescription.length <= 160, `${p.slug}: shortDescription must be 1-160 chars (${p.shortDescription?.length})`);
    const paras = (p.description || '').split('\n\n');
    check(paras.length >= 2 && paras.length <= 4, `${p.slug}: description must be 2-4 paragraphs, got ${paras.length}`);
    check(paras.every((x) => x.trim().length > 60), `${p.slug}: description has a stub paragraph`);

    check(Array.isArray(p.features) && p.features.length >= 5 && p.features.length <= 7, `${p.slug}: expected 5-7 features, got ${p.features?.length}`);
    check(new Set(p.features).size === p.features.length, `${p.slug}: duplicate feature`);

    const specKeys = Object.keys(p.specs || {});
    check(specKeys.length >= 5 && specKeys.length <= 10, `${p.slug}: expected 5-10 specs, got ${specKeys.length}`);

    check(Array.isArray(p.tags) && p.tags.length >= 3, `${p.slug}: needs at least 3 tags`);
    check(typeof p.freeShipping === 'boolean', `${p.slug}: freeShipping must be a boolean`);
    check(!Number.isNaN(Date.parse(p.createdAt)), `${p.slug}: bad createdAt`);
    check(p.createdAt.endsWith('Z'), `${p.slug}: createdAt must be ISO-8601 UTC`);
  }

  for (const c of cats) {
    const n = perCategory.get(c.slug) || 0;
    check(n >= 12, `category ${c.slug} has only ${n} products (minimum 12)`);
  }

  log(`  categories            ${cats.length}`);
  log(`  products              ${products.length}`);
  log(`  unique names / slugs  ${names.size} / ${slugs.size}`);
  log(`  unique image URLs     ${allImages.size}`);
  log(`  discounted            ${discounted} (${((discounted / products.length) * 100).toFixed(1)}%)`);
  log(`  out of stock          ${outOfStock} (${((outOfStock / products.length) * 100).toFixed(1)}%)`);
  log(`  badges                ${JSON.stringify(badgeCounts)}`);
  log('');

  // Live re-check of a random sample of 40 committed image URLs.
  const sampleRng = new Rng(0xa11ce);
  const sample = sampleRng.sample([...allImages].sort(), 40);
  log(`  Re-verifying a random sample of ${sample.length} committed image URLs...`);
  const results = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 10 }, async () => {
      while (cursor < sample.length) {
        const u = sample[cursor++];
        let r = { ok: false, status: 0, contentType: '' };
        for (let attempt = 0; attempt < 3 && !r.ok; attempt++) {
          try {
            const h = await probe(u, 'HEAD');
            r = { ok: h.status === 200 && h.contentType.startsWith('image/'), ...h };
            if (!r.ok) {
              const g = await probe(u, 'GET');
              r = { ok: (g.status === 200 || g.status === 206) && g.contentType.startsWith('image/'), ...g };
            }
          } catch (e) {
            r = { ok: false, status: 0, contentType: String(e.name) };
          }
          if (!r.ok) await sleep(500 * (attempt + 1));
        }
        results.push({ url: u, ...r });
      }
    })
  );
  const dead = results.filter((r) => !r.ok);
  log(`  live sample           ${results.length - dead.length}/${results.length} returned 200 image/*`);
  for (const d of dead) log(`    DEAD ${d.status} ${d.contentType} ${d.url}`);
  check(dead.length === 0, `${dead.length} sampled image URLs did not return 200`);

  log('');
  if (failures.length) {
    log(`FAILED — ${failures.length} problem(s):`);
    for (const f of failures.slice(0, 40)) log(`  ✗ ${f}`);
    if (failures.length > 40) log(`  ... and ${failures.length - 40} more`);
    process.exitCode = 1;
  } else {
    log('VALIDATION PASSED — every assertion held.');
  }
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

try {
  if (FLAGS.validate) await validate();
  else await build();
} catch (err) {
  flushSearchCache();
  flushVerifyCache();
  console.error('');
  console.error('BUILD FAILED: ' + (err?.message || err));
  if (err?.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
  process.exit(1);
}
