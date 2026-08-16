import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogStore } from '../../core/catalog.store';
import { Category, Facets } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { StarRatingComponent } from '../../shared/star-rating.component';
import { BADGE_LABELS, BrowseState } from './filters';

type Patch = Record<string, string | string[] | null>;

/**
 * The left-hand filter rail. Emits query-param patches rather than mutating
 * state directly — the URL stays the single source of truth (CONTRACT §9).
 */
@Component({
  selector: 'ob-filter-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, MoneyPipe, StarRatingComponent],
  host: { class: 'block' },
  template: `
    <div class="space-y-5">
      <!-- ====================================================== category -->
      <section class="ob-panel p-4">
        <h3 class="mb-3 text-xs font-extrabold tracking-wider text-muted uppercase">Department</h3>

        @if (activeCategory(); as category) {
          <a
            routerLink="/search"
            class="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
          >
            <ob-icon name="arrow-left" [size]="13" />
            All departments
          </a>
          <p class="mb-2 text-sm font-bold">{{ category.name }}</p>
          <ul class="space-y-0.5">
            @for (sub of category.subcategories; track sub.slug) {
              <li>
                <a
                  [routerLink]="['/c', category.slug, sub.slug]"
                  class="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13px] transition"
                  [class]="
                    state().subcategory === sub.slug
                      ? 'bg-brand-soft font-bold text-brand-dark'
                      : 'text-body hover:bg-line-soft'
                  "
                >
                  <span class="truncate">{{ sub.name }}</span>
                  <span class="shrink-0 text-[11px] text-muted">{{ sub.productCount }}</span>
                </a>
              </li>
            }
          </ul>
        } @else {
          <ul class="ob-scroll-y max-h-72 space-y-0.5 pr-1">
            @for (category of catalog.categories(); track category.slug) {
              <li>
                <a
                  [routerLink]="['/c', category.slug]"
                  class="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13px] text-body transition hover:bg-line-soft"
                >
                  <span class="truncate">{{ category.name }}</span>
                  <span class="shrink-0 text-[11px] text-muted">{{ category.productCount }}</span>
                </a>
              </li>
            }
          </ul>
        }
      </section>

      <!-- ========================================================= price -->
      <section class="ob-panel p-4">
        <h3 class="mb-3 text-xs font-extrabold tracking-wider text-muted uppercase">Price</h3>

        <div class="mb-4 flex items-center justify-between text-sm font-bold">
          <span>{{ lowValue() | money: 'short' }}</span>
          <span class="text-muted">to</span>
          <span>{{ highValue() | money: 'short' }}</span>
        </div>

        <div class="ob-range-dual relative h-5">
          <span class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line"></span>
          <span
            class="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand"
            [style.left.%]="lowPercent()"
            [style.right.%]="100 - highPercent()"
          ></span>
          <input
            type="range"
            class="ob-range absolute inset-0 w-full"
            [min]="bounds().min"
            [max]="bounds().max"
            [step]="step()"
            [value]="lowValue()"
            aria-label="Minimum price"
            (input)="onLow($event)"
            (change)="commitPrice()"
          />
          <input
            type="range"
            class="ob-range absolute inset-0 w-full"
            [min]="bounds().min"
            [max]="bounds().max"
            [step]="step()"
            [value]="highValue()"
            aria-label="Maximum price"
            (input)="onHigh($event)"
            (change)="commitPrice()"
          />
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2">
          @for (preset of pricePresets(); track preset.label) {
            <button
              type="button"
              class="rounded-lg border border-line px-2 py-1.5 text-[11px] font-semibold text-body transition hover:border-brand hover:bg-brand-soft"
              (click)="applyPreset(preset)"
            >
              {{ preset.label }}
            </button>
          }
        </div>
      </section>

      <!-- ========================================================= brand -->
      @if (facets()?.brands?.length) {
        <section class="ob-panel p-4">
          <h3 class="mb-3 text-xs font-extrabold tracking-wider text-muted uppercase">Brand</h3>
          @if (facets()!.brands.length > 8) {
            <label class="mb-2 block">
              <span class="sr-only">Filter brands</span>
              <input
                type="search"
                class="ob-input py-1.5 text-xs"
                placeholder="Find a brand…"
                [value]="brandFilter()"
                (input)="brandFilter.set($any($event.target).value)"
              />
            </label>
          }
          <ul class="ob-scroll-y max-h-64 space-y-0.5 pr-1">
            @for (brand of visibleBrands(); track brand.value) {
              <li>
                <label
                  class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-line-soft"
                >
                  <input
                    type="checkbox"
                    class="size-4 shrink-0 rounded"
                    [checked]="selectedBrands().has(brand.value)"
                    (change)="toggleBrand(brand.value)"
                  />
                  <span class="min-w-0 flex-1 truncate text-[13px]">{{ brand.value }}</span>
                  <span class="shrink-0 text-[11px] text-muted">{{ brand.count }}</span>
                </label>
              </li>
            } @empty {
              <li class="px-2 py-1.5 text-xs text-muted">No brands match that.</li>
            }
          </ul>
        </section>
      }

      <!-- ======================================================== rating -->
      <section class="ob-panel p-4">
        <h3 class="mb-3 text-xs font-extrabold tracking-wider text-muted uppercase">
          Customer rating
        </h3>
        <ul class="space-y-0.5">
          @for (rating of facets()?.ratings ?? []; track rating.value) {
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition"
                [class]="
                  state().minRating === rating.value
                    ? 'bg-brand-soft font-bold'
                    : 'hover:bg-line-soft'
                "
                [attr.aria-pressed]="state().minRating === rating.value"
                (click)="toggleRating(rating.value)"
              >
                <ob-star-rating [rating]="rating.value" [size]="13" />
                <span class="text-[13px]">&amp; up</span>
                <span class="ml-auto text-[11px] text-muted">{{ rating.count }}</span>
              </button>
            </li>
          }
        </ul>
      </section>

      <!-- ==================================================== badge/stock -->
      <section class="ob-panel p-4">
        <h3 class="mb-3 text-xs font-extrabold tracking-wider text-muted uppercase">
          Availability &amp; offers
        </h3>

        <label
          class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-line-soft"
        >
          <input
            type="checkbox"
            class="size-4 rounded"
            [checked]="!!state().inStock"
            (change)="emit({ inStock: state().inStock ? null : '1', page: null })"
          />
          <span class="text-[13px]">In stock only</span>
        </label>

        <div class="mt-2 space-y-0.5">
          @for (badge of badgeKeys; track badge) {
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] transition"
              [class]="
                state().badge === badge ? 'bg-brand-soft font-bold text-brand-dark' : 'hover:bg-line-soft'
              "
              [attr.aria-pressed]="state().badge === badge"
              (click)="emit({ badge: state().badge === badge ? null : badge, page: null })"
            >
              {{ badgeLabels[badge] }}
              @if (state().badge === badge) {
                <ob-icon name="check" [size]="14" />
              }
            </button>
          }
        </div>
      </section>
    </div>
  `,
})
export class FilterSidebarComponent {
  protected readonly catalog = inject(CatalogStore);

  readonly state = input.required<BrowseState>();
  readonly facets = input<Facets | null>(null);

  readonly patch = output<Patch>();

  protected readonly badgeKeys = Object.keys(BADGE_LABELS) as (keyof typeof BADGE_LABELS)[];
  protected readonly badgeLabels = BADGE_LABELS;
  protected readonly brandFilter = signal('');

  /** Local slider positions; committed to the URL on release. */
  private readonly lowDraft = signal<number | null>(null);
  private readonly highDraft = signal<number | null>(null);

  constructor() {
    // Whenever the URL changes underneath us (back button, chip removal) the
    // drafts must be dropped or the thumbs would stick at stale positions.
    effect(() => {
      this.state();
      this.lowDraft.set(null);
      this.highDraft.set(null);
    });
  }

  protected readonly activeCategory = computed<Category | undefined>(() => {
    const slug = this.state().category;
    return slug ? this.catalog.find(slug) : undefined;
  });

  protected readonly bounds = computed(() => {
    const range = this.facets()?.priceRange;
    const min = range?.minCents ?? 0;
    const max = Math.max(min + 1000, range?.maxCents ?? 1_000_000);
    return { min, max };
  });

  protected readonly step = computed(() =>
    Math.max(100, Math.round((this.bounds().max - this.bounds().min) / 200 / 100) * 100),
  );

  protected readonly lowValue = computed(
    () => this.lowDraft() ?? this.state().minPrice ?? this.bounds().min,
  );
  protected readonly highValue = computed(
    () => this.highDraft() ?? this.state().maxPrice ?? this.bounds().max,
  );

  protected readonly lowPercent = computed(() => this.percent(this.lowValue()));
  protected readonly highPercent = computed(() => this.percent(this.highValue()));

  protected readonly selectedBrands = computed(() => new Set(this.state().brand ?? []));

  protected readonly visibleBrands = computed(() => {
    const needle = this.brandFilter().trim().toLowerCase();
    const brands = this.facets()?.brands ?? [];
    return needle ? brands.filter((b) => b.value.toLowerCase().includes(needle)) : brands;
  });

  protected readonly pricePresets = computed(() => {
    const { max } = this.bounds();
    return [
      { label: 'Under EGP 500', min: null, max: 50_000 },
      { label: 'EGP 500 – 2,000', min: 50_000, max: 200_000 },
      { label: 'EGP 2,000 – 10,000', min: 200_000, max: 1_000_000 },
      { label: 'EGP 10,000+', min: 1_000_000, max: max > 1_000_000 ? null : null },
    ];
  });

  protected toggleRating(value: number): void {
    this.patch.emit({
      minRating: this.state().minRating === value ? null : String(value),
      page: null,
    });
  }

  protected emit(patch: Patch): void {
    this.patch.emit(patch);
  }

  protected toggleBrand(brand: string): void {
    const selected = new Set(this.state().brand ?? []);
    if (selected.has(brand)) selected.delete(brand);
    else selected.add(brand);
    this.patch.emit({ brand: [...selected], page: null });
  }

  protected onLow(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.lowDraft.set(Math.min(value, this.highValue() - this.step()));
  }

  protected onHigh(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.highDraft.set(Math.max(value, this.lowValue() + this.step()));
  }

  protected commitPrice(): void {
    const { min, max } = this.bounds();
    const low = this.lowValue();
    const high = this.highValue();
    this.patch.emit({
      minPrice: low > min ? String(low) : null,
      maxPrice: high < max ? String(high) : null,
      page: null,
    });
  }

  protected applyPreset(preset: { min: number | null; max: number | null }): void {
    this.patch.emit({
      minPrice: preset.min === null ? null : String(preset.min),
      maxPrice: preset.max === null ? null : String(preset.max),
      page: null,
    });
  }

  private percent(value: number): number {
    const { min, max } = this.bounds();
    return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  }
}
