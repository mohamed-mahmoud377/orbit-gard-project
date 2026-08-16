import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductCard } from '../core/models';
import { IconComponent } from './icon.component';
import { ProductCardComponent } from './product-card.component';
import { SkeletonComponent } from './skeleton.component';

/**
 * Horizontally scrollable product strip with arrow controls. The arrows
 * disable themselves at each end, and scrolling is by a whole "page" of tiles
 * so repeated clicks never leave a card half-cut.
 */
@Component({
  selector: 'ob-product-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, ProductCardComponent, SkeletonComponent],
  host: { class: 'block' },
  template: `
    <section class="relative">
      <header class="mb-3 flex items-end justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            @if (icon()) {
              <span
                class="grid size-8 place-items-center rounded-lg text-[color:var(--cat-accent)]"
                [style.background]="'var(--cat-accent-soft)'"
              >
                <ob-icon [name]="icon()" [size]="18" />
              </span>
            }
            <h2 class="truncate text-lg font-bold tracking-tight text-body sm:text-xl">
              {{ title() }}
            </h2>
          </div>
          @if (subtitle()) {
            <p class="mt-0.5 truncate text-sm text-muted">{{ subtitle() }}</p>
          }
        </div>

        <div class="flex shrink-0 items-center gap-2">
          @if (seeAllLink()) {
            <a [routerLink]="seeAllLink()" [queryParams]="seeAllParams()" class="ob-btn ob-btn-ghost ob-btn-sm">
              See all
              <ob-icon name="arrow-right" [size]="14" />
            </a>
          }
          <div class="hidden items-center gap-1.5 sm:flex">
            <button
              type="button"
              class="grid size-9 place-items-center rounded-full border border-line bg-surface text-body transition hover:bg-line-soft disabled:opacity-35"
              [disabled]="atStart()"
              (click)="scrollBy(-1)"
              [attr.aria-label]="'Scroll ' + title() + ' left'"
            >
              <ob-icon name="chevron-left" [size]="17" />
            </button>
            <button
              type="button"
              class="grid size-9 place-items-center rounded-full border border-line bg-surface text-body transition hover:bg-line-soft disabled:opacity-35"
              [disabled]="atEnd()"
              (click)="scrollBy(1)"
              [attr.aria-label]="'Scroll ' + title() + ' right'"
            >
              <ob-icon name="chevron-right" [size]="17" />
            </button>
          </div>
        </div>
      </header>

      @if (loading()) {
        <ob-skeleton variant="rail" [count]="6" />
      } @else if (products().length === 0) {
        <p class="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Nothing to show here yet.
        </p>
      } @else {
        <div #track class="ob-rail" (scroll)="onScroll()">
          @for (product of products(); track product.id) {
            <div class="w-[168px] sm:w-[210px] lg:w-[228px]">
              <ob-product-card [product]="product" />
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class ProductRailComponent {
  readonly title = input.required<string>();
  readonly products = input.required<ProductCard[]>();
  readonly subtitle = input<string>('');
  readonly icon = input<string | null>(null);
  readonly loading = input(false);
  readonly seeAllLink = input<unknown[] | string | null>(null);
  readonly seeAllParams = input<Record<string, string> | null>(null);

  private readonly track = viewChild<ElementRef<HTMLElement>>('track');

  protected readonly atStart = signal(true);
  protected readonly atEnd = signal(true);

  constructor() {
    // Re-evaluate the arrows whenever the rail's contents change, so a strip
    // that already fits doesn't offer a scroll button that does nothing.
    afterRenderEffect(() => {
      this.products();
      this.onScroll();
    });
  }

  protected scrollBy(direction: 1 | -1): void {
    const el = this.track()?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(240, el.clientWidth * 0.85), behavior: 'smooth' });
  }

  protected onScroll(): void {
    const el = this.track()?.nativeElement;
    if (!el) return;
    this.atStart.set(el.scrollLeft <= 4);
    this.atEnd.set(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }
}
