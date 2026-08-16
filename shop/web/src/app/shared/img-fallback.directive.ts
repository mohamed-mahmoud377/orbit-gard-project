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
    img.src = placeholderDataUri(this.obImgFallback() || img.alt || 'Orbit Bazaar');
    img.classList.add('ob-img-placeholder');
  }
}

const PALETTE: [string, string][] = [
  ['#efe7fb', '#6c2bd9'],
  ['#fff1dc', '#b26400'],
  ['#e6f6f4', '#0f9b8e'],
  ['#ffe6ec', '#e5385f'],
  ['#e7edfb', '#2f5bd0'],
  ['#f2f0ea', '#6d6580'],
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
    `<g transform="rotate(${rotate} 200 200)" opacity="0.35">` +
    `<circle cx="200" cy="200" r="130" fill="none" stroke="${fg}" stroke-width="2"/>` +
    `<ellipse cx="200" cy="200" rx="170" ry="66" fill="none" stroke="${fg}" stroke-width="2"/>` +
    `<circle cx="370" cy="200" r="11" fill="${fg}"/>` +
    `</g>` +
    `<text x="200" y="200" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif" font-size="86" ` +
    `font-weight="700" fill="${fg}" opacity="0.85">${escapeXml(initials || 'OB')}</text>` +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );
}
