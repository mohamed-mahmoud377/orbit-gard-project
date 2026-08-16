# Catalog builder

Generates `shop/api/src/catalog/catalog.json` — the committed product catalog described in
[`shop/CONTRACT.md` §3](../CONTRACT.md). Node 20+ (uses `fetch` and `AbortSignal.timeout`),
**no dependencies**.

```bash
node shop/tools/build-catalog.mjs             # build (uses ./.cache when warm — seconds)
node shop/tools/build-catalog.mjs --validate  # validate the committed catalog
node shop/tools/build-catalog.mjs --refresh   # ignore cached Openverse responses
node shop/tools/build-catalog.mjs --recheck   # re-verify every image URL
```

Commit both `catalog.json` and any change to this script. `shop/tools/.cache/` is gitignored.

## How it works

1. **Source images.** Each of the 30 categories declares 5–10 Openverse search terms, filtered
   to the **StockSnap** provider (professional CC0 stock photography). Page 1 of every term is
   fetched, then deeper pages round-robin until the category pool reaches ~110 URLs.
2. **Verify every URL.** Each unique URL gets an HTTP `HEAD` (falling back to a ranged `GET`,
   since some CDNs reject `HEAD`), 12 at a time, 15 s timeout, 2 retries. Only `200` +
   `image/*` survives. Dead URLs are dropped before any product is built.
3. **Fallback.** If a pool lands under 25 verified images the builder retries with that
   category's fallback terms, and if it is *still* short it drops the `source=stocksnap`
   filter for `license_type=commercial`, keeping only known-good CDN hosts. Any category that
   needed either path is printed at the end of the run.
4. **Generate.** Products are built from a seeded mulberry32 PRNG (`SEED = 0x0b17ba2a`).
   `Math.random()` is never used and "now" is pinned to a constant, so **the output is
   byte-for-byte reproducible** given the cache.

## Failure modes (all exit non-zero)

- a category ends up with fewer than 8 verified images
- fewer than 500 products can be built, or a duplicate name/slug cannot be resolved
- `preflight()` finds a malformed category: unknown copy family, a subcategory with fewer than
  5 features or 5 spec keys, a feature index out of range, or a spec key with no values

## Caching

`shop/tools/.cache/` holds `openverse-search.json` (raw API pages) and `url-verify.json`
(per-URL verification results). Both are written incrementally, so a run interrupted by the
Openverse rate limit resumes for free. A warm rebuild makes **zero** network calls.

The Openverse anonymous quota is **20 requests/minute and 200/day**, so requests are paced to
roughly 17/min and `429` responses are retried after `Retry-After`. A cold build makes ~250
calls and takes about 15 minutes; use `--refresh` sparingly.

## Editing the catalog

Everything lives in the `CATEGORIES` array in `build-catalog.mjs`.

- **Category** — slug, name, tagline, icon, accent, `family` (which marketing-copy pool it
  draws from), `weight` (share of the 500 products above the 12-per-category floor), price
  range, search terms, brands, model names, and the `vocab` slots used by the copy engine.
- **Subcategory** — owns the product types: `desc` (descriptors), `sfx` (spec suffixes used in
  the product name), `noun` (what the copy calls the thing), `feat` (indices into the
  category's feature pool, or literal bullet strings), `keys` (which spec rows to show, in
  order) and optional `specs` overriding or adding key/value pools.

Descriptions are assembled from shared + per-family pools of openers, benefits, use-cases and
closers with `{slot}` substitution, so the same frame reads differently in every category.
After any edit, run the builder and then `--validate`.
