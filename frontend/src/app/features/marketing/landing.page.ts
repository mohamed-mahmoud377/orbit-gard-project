import { Component, inject } from '@angular/core';
import { DOCUMENT } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Tint families the design uses for section accents. Each maps to Orbit tokens. */
type Tone = 'accent' | 'family' | 'held';

interface Pillar {
  readonly tone: Tone;
  readonly glyph: string;
  readonly title: string;
  readonly body: string;
  readonly points: readonly string[];
}

/**
 * The public landing page (Figma `10 Marketing · Landing page`, node 547:3).
 *
 * Every glyph on this page — ◎ ● @ ◆ ↻ ✓ ↑ — is a text character in the
 * design, not an exported asset, so they stay as characters here and are
 * hidden from screen readers rather than being redrawn as SVG.
 */
@Component({
  selector: 'app-landing-page',
  imports: [RouterLink],
  template: `
    <div class="landing" data-node-id="547:3">
      <!-- ── Hero ───────────────────────────────────────────────────── -->
      <header class="hero" data-node-id="547:4">
        <nav class="wrap hero-nav" data-node-id="547:5">
          <a class="logo" routerLink="/" aria-label="Orbit home">
            <span class="logo-mark" aria-hidden="true">◎</span>
            <span class="logo-word">Orbit</span>
          </a>

          <div class="hero-links" data-node-id="547:9">
            @for (link of navLinks; track link.id) {
              <button type="button" (click)="scrollTo(link.id)">{{ link.label }}</button>
            }
          </div>

          <div class="hero-actions" data-node-id="547:14">
            <a class="hero-signin" routerLink="/auth/login">Sign in</a>
            <a class="btn-solid btn-sm" routerLink="/auth/sign-up">Create wallet</a>
          </div>
        </nav>

        <div class="wrap hero-body" data-node-id="547:18">
          <div class="hero-copy" data-node-id="547:19">
            <p class="eyebrow-pill" data-node-id="547:20">
              <span class="eyebrow-dot" aria-hidden="true">●</span>
              A digital wallet built for Egypt
            </p>
            <h1 data-node-id="547:23">Send, spend and get paid — with nothing but a username.</h1>
            <p class="hero-sub" data-node-id="547:24">
              Orbit is a wallet you top up by card or InstaPay, spend anywhere online without ever
              handing over your card details, and share with your family on limits you set yourself.
            </p>
            <div class="hero-ctas" data-node-id="547:25">
              <a class="btn-solid" routerLink="/auth/sign-up">Create your wallet</a>
              <button class="btn-ghost" type="button" (click)="scrollTo('how')">
                See how paying works
              </button>
            </div>
            <p class="hero-fine" data-node-id="547:30">
              Free to open&nbsp; ·&nbsp; No card needed to start&nbsp; ·&nbsp; Your money stays yours
            </p>
          </div>

          <div class="hero-visual" data-node-id="547:31" aria-hidden="true">
            <div class="wallet-card" data-node-id="547:32">
              <div class="wallet-top">
                <span class="wallet-mark"><span aria-hidden="true">◎</span> Orbit</span>
                <span class="chip">PERSONAL</span>
              </div>
              <p class="wallet-label">AVAILABLE TO SPEND</p>
              <p class="wallet-amount">EGP 4,280.50</p>
              <div class="rule"></div>
              <div class="wallet-foot">
              <span class="wallet-handle">&#64;mohamed</span>
                <span class="wallet-held">Held&nbsp; EGP 250.00</span>
              </div>
            </div>
            <div class="toast" data-node-id="547:49">
              <span class="toast-tick">✓</span>
              <span class="toast-text">
                <strong>Paid Nile Books</strong>
                <small>EGP 320.00&nbsp; ·&nbsp; no card details shared</small>
              </span>
            </div>
          </div>
        </div>
      </header>

      <!-- ── Stats ──────────────────────────────────────────────────── -->
      <section class="stats" data-node-id="549:2">
        <div class="wrap stats-row">
          @for (stat of stats; track stat.value; let last = $last) {
            <div class="stat">
              <p class="stat-value">{{ stat.value }}</p>
              <p class="stat-caption">{{ stat.caption }}</p>
            </div>
            @if (!last) {
              <span class="stat-sep" aria-hidden="true"></span>
            }
          }
        </div>
      </section>

      <!-- ── What Orbit does ────────────────────────────────────────── -->
      <section id="features" class="band band-base" data-node-id="549:22">
        <div class="wrap">
          <div class="section-head">
            <p class="eyebrow">WHAT ORBIT DOES</p>
            <h2>Three things a normal wallet will not do for you.</h2>
            <p class="section-sub">
              Everything else — balances, transfers, history — Orbit does too. These are the parts
              worth building it for.
            </p>
          </div>
          <div class="pillars">
            @for (pillar of pillars; track pillar.title) {
              <article class="pillar" [attr.data-tone]="pillar.tone">
                <span class="pillar-icon" aria-hidden="true">{{ pillar.glyph }}</span>
                <h3>{{ pillar.title }}</h3>
                <p class="pillar-body">{{ pillar.body }}</p>
                <ul class="points">
                  @for (point of pillar.points; track point) {
                    <li><span class="tick" aria-hidden="true">✓</span>{{ point }}</li>
                  }
                </ul>
              </article>
            }
          </div>
        </div>
      </section>

      <!-- ── How paying works ───────────────────────────────────────── -->
      <section id="how" class="band band-surface" data-node-id="550:2">
        <div class="wrap">
          <div class="section-head">
            <p class="eyebrow">HOW PAYING WORKS</p>
            <h2>You give a shop your username. That is the whole checkout.</h2>
            <p class="section-sub">
              No card form, no three-digit code on the back of anything, no redirect to a page you
              have to trust.
            </p>
          </div>
          <div class="steps">
            @for (step of steps; track step.n) {
              <article class="step">
                <span class="step-num" aria-hidden="true">{{ step.n }}</span>
                <h3>{{ step.title }}</h3>
                <p>{{ step.body }}</p>
              </article>
            }
          </div>
          <p id="merchants" class="merchant-note" data-node-id="550:23">
            <span class="merchant-mark" aria-hidden="true">◎</span>
            Running a shop? One HTTP call charges an Orbit user by username — no gateway account, no
            card handling, no PCI paperwork on your side.
          </p>
        </div>
      </section>

      <!-- ── Top up ─────────────────────────────────────────────────── -->
      <section class="band band-base" data-node-id="550:26">
        <div class="wrap">
          <div class="section-head">
            <p class="eyebrow">PUTTING MONEY IN</p>
            <h2>Two ways in. Both free, both instant enough.</h2>
          </div>
          <div class="ways">
            @for (way of ways; track way.title) {
              <article class="way" [attr.data-tone]="way.tone">
                <div class="way-head">
                  <span class="way-icon" aria-hidden="true">{{ way.glyph }}</span>
                  <span class="way-title">
                    <strong>{{ way.title }}</strong>
                    <small>{{ way.sub }}</small>
                  </span>
                </div>
                <p class="way-body">{{ way.body }}</p>
                <ul class="points">
                  @for (point of way.points; track point) {
                    <li><span class="tick" aria-hidden="true">✓</span>{{ point }}</li>
                  }
                </ul>
              </article>
            }
          </div>
        </div>
      </section>

      <!-- ── Family ─────────────────────────────────────────────────── -->
      <section id="families" class="band band-surface" data-node-id="551:2">
        <div class="wrap family-split">
          <div class="family-copy">
            <p class="eyebrow-chip">FOR FAMILIES</p>
            <h2>Pocket money that cannot quietly become the whole account.</h2>
            <p class="family-body">
              Open a wallet for your child in a minute. Move money into it from your own whenever you
              like. Then set three ceilings — per purchase, per day, per month — and let them get on
              with it.
            </p>
            <p class="family-body">
              They never see your balance. You see every single thing they spend.
            </p>
            <a class="btn-family" routerLink="/auth/sign-up">Open a child wallet</a>
          </div>

          <div class="family-visual" aria-hidden="true">
            <div class="child-card">
              <div class="child-head">
                <span class="avatar">O</span>
                <span class="child-name">
                  <strong>Omar</strong>
                  <small>&#64;omar&nbsp; ·&nbsp; child wallet</small>
                </span>
              </div>
              <div class="child-balance">
                <span><small>Balance</small><strong>EGP 295.00</strong></span>
                <span><small>Held</small><strong class="is-held">EGP 50.00</strong></span>
                <span><small>Can spend</small><strong class="is-ok">EGP 245.00</strong></span>
              </div>
              <p class="child-label">SPENDING LIMITS YOU SET</p>
              @for (limit of limits; track limit.label; let last = $last) {
                <div class="limit">
                  <span>{{ limit.label }}</span>
                  <span class="limit-value">{{ limit.value }}</span>
                </div>
                @if (!last) {
                  <div class="rule"></div>
                }
              }
            </div>
          </div>
        </div>
      </section>

      <!-- ── Security ───────────────────────────────────────────────── -->
      <section id="security" class="band band-base" data-node-id="551:44">
        <div class="wrap">
          <div class="section-head">
            <p class="eyebrow">BUILT CAREFULLY</p>
            <h2>The boring parts, taken seriously.</h2>
          </div>
          <div class="security-grid">
            @for (item of security; track item.title) {
              <article class="security-item">
                <span class="security-mark" aria-hidden="true">✓</span>
                <h3>{{ item.title }}</h3>
                <p>{{ item.body }}</p>
              </article>
            }
          </div>
        </div>
      </section>

      <!-- ── Closing CTA ────────────────────────────────────────────── -->
      <section class="closing" data-node-id="551:69">
        <div class="wrap closing-wrap">
          <h2>Open a wallet in about a minute.</h2>
          <p>
            A username, an email and a password. That is the whole thing. Add money when you feel
            like it.
          </p>
          <div class="hero-ctas closing-ctas">
            <a class="btn-solid" routerLink="/auth/sign-up">Create your wallet</a>
            <a class="btn-ghost" routerLink="/auth/login">I already have one</a>
          </div>
        </div>
      </section>

      <!-- ── Footer ─────────────────────────────────────────────────── -->
      <footer class="footer" data-node-id="551:78">
        <div class="wrap">
          <div class="footer-row">
            <div class="footer-brand">
              <span class="logo">
                <span class="logo-mark" aria-hidden="true">◎</span>
                <span class="logo-word">Orbit</span>
              </span>
              <p>Money orbits you. The people you look after orbit your rules.</p>
            </div>
            @for (col of footerColumns; track col.heading) {
              <div class="footer-col">
                <p class="footer-heading">{{ col.heading }}</p>
                @for (item of col.items; track item) {
                  <p class="footer-link">{{ item }}</p>
                }
              </div>
            }
          </div>
          <div class="rule footer-rule"></div>
          <div class="footer-bottom">
            <span>© 2026 Orbit&nbsp; ·&nbsp; Cairo, Egypt</span>
            <span>
              A student demonstration project. Not a licensed financial institution and holds no real
              funds.
            </span>
          </div>
        </div>
      </footer>
    </div>
  `,
  styleUrl: './landing.page.scss',
})
export default class LandingPage {
  private readonly document = inject(DOCUMENT);

  protected readonly navLinks = [
    { id: 'features', label: 'Features' },
    { id: 'families', label: 'For families' },
    { id: 'merchants', label: 'For merchants' },
    { id: 'security', label: 'Security' },
  ];

  protected readonly stats = [
    { value: '2 ways', caption: 'to put money in — a card through Paymob, or an InstaPay transfer' },
    { value: 'EGP 0.00', caption: 'in fees on every top up, whichever way you use' },
    { value: '1 username', caption: 'is your entire payment address. No card, no IBAN, no forms' },
    { value: '~30 sec', caption: 'to read an InstaPay receipt and credit it to your wallet' },
  ];

  protected readonly pillars: readonly Pillar[] = [
    {
      tone: 'accent',
      glyph: '@',
      title: 'Pay without exposing anything',
      body: 'Any online shop can charge your Orbit wallet using nothing but your username. No card number leaves your hands — because there is no card number to leave.',
      points: [
        'Merchants never see a card',
        'You approve nothing at checkout',
        'Every charge lands in your history',
      ],
    },
    {
      tone: 'family',
      glyph: '◆',
      title: 'Wallets for the people you look after',
      body: 'Open a wallet for your child, fund it from your own, and decide what they can spend per purchase, per day and per month. They get independence. You keep the ceiling.',
      points: [
        'Per-transaction, daily and monthly caps',
        'You top them up, they cannot top up',
        'One level deep — a child never has children',
      ],
    },
    {
      tone: 'held',
      glyph: '↻',
      title: 'Nothing settles behind your back',
      body: 'Payments hold money before they take it, and you watch every hold as it happens. Your available balance is the truth, not an optimistic guess.',
      points: [
        'Held money is shown, never hidden',
        'Holds expire on their own after 2 hours',
        'Balance minus held is what you can spend',
      ],
    },
  ];

  protected readonly steps = [
    {
      n: '01',
      title: 'The shop asks for your username',
      body: 'At checkout you type @yourname instead of a card number. Nothing sensitive is entered, so nothing sensitive can be stolen.',
    },
    {
      n: '02',
      title: 'Orbit holds the money, it does not take it',
      body: 'The amount is set aside from what you can spend, and appears in your history straight away as a hold you can see.',
    },
    {
      n: '03',
      title: 'It settles, or it comes back',
      body: 'Rules decide it within the hour. If anything is wrong the hold simply expires and the money was never gone in the first place.',
    },
  ];

  protected readonly ways = [
    {
      tone: 'accent' as Tone,
      glyph: '◆',
      title: 'Card',
      sub: 'Through Paymob · instant',
      body: "Enter an amount, pay on the gateway's own secure page, and the money is in your wallet the moment the bank confirms it. Your card details never touch Orbit.",
      points: [
        'EGP 50 to EGP 20,000',
        'Credited only on a signed confirmation',
        'Never credited twice, whatever the network does',
      ],
    },
    {
      tone: 'held' as Tone,
      glyph: '↑',
      title: 'InstaPay',
      sub: 'Upload a receipt · about 30 seconds',
      body: "Send a transfer from any bank app to Orbit's InstaPay number, then upload the confirmation. Orbit reads the amount, the reference and the recipient straight off the image and credits you.",
      points: [
        'EGP 0.01 to EGP 70,000',
        'Usually checked in about thirty seconds',
        'Every reference can only ever be credited once',
      ],
    },
  ];

  protected readonly limits = [
    { label: 'Per purchase', value: 'EGP 100.00' },
    { label: 'Per day', value: 'EGP 200.00' },
    { label: 'Per month', value: 'EGP 1,500.00' },
  ];

  protected readonly security = [
    {
      title: 'Sessions that expire',
      body: 'Signed in for fifteen minutes at a time, renewed quietly while you use it. Leave it alone long enough and it closes itself.',
    },
    {
      title: 'Every device listed',
      body: 'See everywhere your account is open, and end any of them from anywhere. Reusing an old session kills the whole thing.',
    },
    {
      title: 'Money in exact numbers',
      body: 'Balances are stored as exact decimals, never as floating point. A wallet is never off by a hundredth of a pound.',
    },
    {
      title: 'One receipt, one credit',
      body: 'Every transfer reference can be used exactly once, ever. The same proof cannot become money twice.',
    },
  ];

  protected readonly footerColumns = [
    { heading: 'Product', items: ['Pay by username', 'Top up', 'Send money', 'Transaction history'] },
    { heading: 'Families', items: ['Child wallets', 'Spending limits', 'Supervision'] },
    { heading: 'Company', items: ['Security', 'For merchants', 'Contact'] },
  ];

  /**
   * In-page navigation without touching the router.
   *
   * A bare `href="#id"` would push a URL the router then tries to resolve, and
   * `routerLink` with a fragment needs `withInMemoryScrolling` configured
   * globally — which would change scroll behaviour on every other route.
   */
  protected scrollTo(id: string): void {
    this.document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
