import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Shimmer placeholder. Every async surface in the app uses one of these
 * variants rather than a spinner, so the page never collapses and re-expands.
 */
@Component({
  selector: 'ob-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'aria-hidden': 'true' },
  template: `
    @switch (variant()) {
      @case ('card') {
        <div class="ob-card overflow-hidden p-3">
          <div class="ob-skeleton mb-3 aspect-square w-full rounded-xl"></div>
          <div class="ob-skeleton mb-2 h-3 w-1/3 rounded"></div>
          <div class="ob-skeleton mb-2 h-4 w-11/12 rounded"></div>
          <div class="ob-skeleton mb-3 h-4 w-2/3 rounded"></div>
          <div class="ob-skeleton h-6 w-1/2 rounded"></div>
        </div>
      }
      @case ('rail') {
        <div class="ob-rail">
          @for (i of repeat(); track i) {
            <div class="w-[220px]">
              <div class="ob-card overflow-hidden p-3">
                <div class="ob-skeleton mb-3 aspect-square w-full rounded-xl"></div>
                <div class="ob-skeleton mb-2 h-3 w-1/3 rounded"></div>
                <div class="ob-skeleton mb-2 h-4 w-11/12 rounded"></div>
                <div class="ob-skeleton h-6 w-1/2 rounded"></div>
              </div>
            </div>
          }
        </div>
      }
      @case ('grid') {
        <div
          class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
          @for (i of repeat(); track i) {
            <div class="ob-card overflow-hidden p-3">
              <div class="ob-skeleton mb-3 aspect-square w-full rounded-xl"></div>
              <div class="ob-skeleton mb-2 h-3 w-1/3 rounded"></div>
              <div class="ob-skeleton mb-2 h-4 w-11/12 rounded"></div>
              <div class="ob-skeleton h-6 w-1/2 rounded"></div>
            </div>
          }
        </div>
      }
      @case ('lines') {
        <div class="space-y-2">
          @for (i of repeat(); track i) {
            <div class="ob-skeleton h-3.5 rounded" [style.width.%]="lineWidth($index)"></div>
          }
        </div>
      }
      @case ('block') {
        <div class="ob-skeleton size-full rounded-xl" [style.height]="height()"></div>
      }
    }
  `,
})
export class SkeletonComponent {
  readonly variant = input<'card' | 'rail' | 'grid' | 'lines' | 'block'>('block');
  readonly count = input(6);
  readonly height = input<string>('100%');

  protected repeat(): number[] {
    return Array.from({ length: this.count() }, (_, i) => i);
  }

  /** Ragged right edge — uniform bars read as a loading bug. */
  protected lineWidth(index: number): number {
    return [100, 92, 97, 74, 88, 96][index % 6];
  }
}
