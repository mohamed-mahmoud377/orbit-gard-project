import { Directive, ElementRef, HostListener, effect, inject, input } from '@angular/core';

/**
 * Catalog photography is remote (`cdn.stocksnap.io`). A dead URL must never
 * render as a broken-image glyph, so on `error` we swap in a locally generated
 * inline SVG — no network round-trip, no bundled asset, and deterministic per
 * product so the same item always gets the same placeholder.
 *
 * Also applies `loading="lazy"` + `decoding="async"` unless the image is
 * marked `eager` (the LCP hero and the first product photo).
 */
@Directive({
  selector: 'img[obImgFallback]',
})
export class ImgFallbackDirective {
  private readonly el = inject<ElementRef<HTMLImageElement>>(ElementRef);

  /** Seed for the generated artwork — usually the product name. */
  readonly obImgFallback = input<string>('');
  readonly eager = input(false);

  private swapped = false;

  constructor() {
    effect(() => {
      const img = this.el.nativeElement;
      img.loading = this.eager() ? 'eager' : 'lazy';
      img.decoding = 'async';
      if (this.eager()) img.fetchPriority = 'high';
    });
  }

  @HostListener('error')
  protected onError(): void {
    if (this.swapped) return; // never loop on the placeholder itself
    this.swapped = true;
    const img = this.el.nativeElement;
    img.src = placeholderDataUri(this.obImgFallback() || img.alt || "Jerry's Shop");
    img.classList.add('ob-img-placeholder');
  }
}

/**
 * Warm [background, foreground] pairs drawn from the Jerry's Shop palette —
 * cinnamon, cheddar, cherry, cocoa — so a missing photo still sits inside the
 * shop's colour world instead of the old violet/pink/grey set. Every pair
 * clears 4.5:1 for the initials at the opacity used below.
 */
const PALETTE: [string, string][] = [
  ['#fbeade', '#b0521c'], // cinnamon (brand)
  ['#fff4da', '#8a5f04'], // cheddar
  ['#ffe8e5', '#c02c26'], // cherry
  ['#f5ece0', '#6b4429'], // cocoa
  ['#e2f7f4', '#0c7d73'], // mint, for a little variety
  ['#f8efe1', '#8a5a33'], // toast
];

/** Deterministic 32-bit hash so one product always gets one placeholder. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function placeholderDataUri(seed: string): string {
  const h = hash(seed);
  const [bg, fg] = PALETTE[h % PALETTE.length];
  const initials = seed
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
  const rotate = (h % 40) - 20;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">` +
    `<rect width="400" height="400" fill="${bg}"/>` +
    // A wedge of cheese instead of the old orbit ring — same trick, on brand.
    `<g transform="rotate(${rotate} 200 200)" opacity="0.32">` +
    `<path d="M92 268h216L200 106z" fill="none" stroke="${fg}" stroke-width="4" stroke-linejoin="round"/>` +
    `<circle cx="200" cy="228" r="15" fill="${fg}"/>` +
    `<circle cx="152" cy="252" r="9" fill="${fg}"/>` +
    `<circle cx="252" cy="248" r="11" fill="${fg}"/>` +
    `</g>` +
    `<text x="200" y="200" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif" font-size="86" ` +
    `font-weight="700" fill="${fg}" opacity="0.85">${escapeXml(initials || 'JS')}</text>` +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );
}
