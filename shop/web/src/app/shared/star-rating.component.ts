import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Fractional star rating. Two stacked rows — a grey track and a marigold fill
 * clipped to `rating / 5` — so half and quarter stars render exactly rather
 * than being rounded to the nearest half-star glyph.
 */
@Component({
  selector: 'ob-star-rating',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-1.5' },
  template: `
    <span class="relative inline-block leading-none" [style.height.px]="size()">
      <span class="flex" [style.gap.px]="gap()" aria-hidden="true">
        @for (star of stars; track star) {
          <svg
            [attr.width]="size()"
            [attr.height]="size()"
            viewBox="0 0 24 24"
            class="block text-line"
            fill="currentColor"
          >
            <svg:path
              d="m12 2.6 2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.44 6.19 20.5l1.11-6.47L2.6 9.45l6.5-.95z"
            />
          </svg>
        }
      </span>
      <span
        class="absolute inset-y-0 left-0 overflow-hidden"
        [style.width.%]="fillPercent()"
        aria-hidden="true"
      >
        <span class="flex" [style.gap.px]="gap()">
          @for (star of stars; track star) {
            <svg
              [attr.width]="size()"
              [attr.height]="size()"
              viewBox="0 0 24 24"
              class="block text-accent"
              fill="currentColor"
            >
              <svg:path
                d="m12 2.6 2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.44 6.19 20.5l1.11-6.47L2.6 9.45l6.5-.95z"
              />
            </svg>
          }
        </span>
      </span>
      <span class="sr-only">{{ rating().toFixed(1) }} out of 5 stars</span>
    </span>
    @if (showValue()) {
      <span class="text-xs font-semibold text-body">{{ rating().toFixed(1) }}</span>
    }
    @if (count() !== null) {
      <span class="text-xs text-muted">({{ countLabel() }})</span>
    }
  `,
})
export class StarRatingComponent {
  readonly rating = input.required<number>();
  readonly count = input<number | null>(null);
  readonly size = input<number>(14);
  readonly gap = input<number>(1);
  readonly showValue = input(false);

  protected readonly stars = [0, 1, 2, 3, 4];

  protected readonly fillPercent = computed(() => {
    const clamped = Math.max(0, Math.min(5, this.rating()));
    return (clamped / 5) * 100;
  });

  protected readonly countLabel = computed(() => {
    const n = this.count() ?? 0;
    return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n);
  });
}
