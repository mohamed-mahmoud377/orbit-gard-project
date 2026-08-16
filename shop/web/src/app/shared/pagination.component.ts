import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from './icon.component';

/** Windowed pager with first/last anchors and ellipses. */
@Component({
  selector: 'ob-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { class: 'block' },
  template: `
    @if (totalPages() > 1) {
      <nav class="flex items-center justify-center gap-1.5" aria-label="Pagination">
        <button
          type="button"
          class="ob-btn ob-btn-ghost ob-btn-sm gap-1"
          [disabled]="page() <= 1"
          (click)="go(page() - 1)"
        >
          <ob-icon name="chevron-left" [size]="15" />
          <span class="hidden sm:inline">Previous</span>
        </button>

        @for (entry of window(); track $index) {
          @if (entry === null) {
            <span class="px-1 text-sm text-muted" aria-hidden="true">…</span>
          } @else {
            <button
              type="button"
              class="grid size-9 place-items-center rounded-lg border text-sm font-semibold transition"
              [class]="
                entry === page()
                  ? 'border-brand bg-brand text-white shadow-sm'
                  : 'border-line bg-surface text-body hover:bg-line-soft'
              "
              [attr.aria-current]="entry === page() ? 'page' : null"
              [attr.aria-label]="'Page ' + entry"
              (click)="go(entry)"
            >
              {{ entry }}
            </button>
          }
        }

        <button
          type="button"
          class="ob-btn ob-btn-ghost ob-btn-sm gap-1"
          [disabled]="page() >= totalPages()"
          (click)="go(page() + 1)"
        >
          <span class="hidden sm:inline">Next</span>
          <ob-icon name="chevron-right" [size]="15" />
        </button>
      </nav>
    }
  `,
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();

  readonly pageChange = output<number>();

  /** `null` renders an ellipsis. */
  protected readonly window = computed<(number | null)[]>(() => {
    const total = this.totalPages();
    const current = this.page();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages = new Set<number>([1, total, current]);
    for (const offset of [-1, 1]) {
      const candidate = current + offset;
      if (candidate > 1 && candidate < total) pages.add(candidate);
    }
    // Keep the row a constant width near the ends.
    if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
    if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => pages.add(p));

    const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
    const out: (number | null)[] = [];
    let previous = 0;
    for (const p of sorted) {
      if (previous && p - previous > 1) out.push(null);
      out.push(p);
      previous = p;
    }
    return out;
  });

  protected go(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.pageChange.emit(page);
  }
}
