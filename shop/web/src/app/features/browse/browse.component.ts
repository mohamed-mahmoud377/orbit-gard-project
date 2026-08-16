import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { CatalogStore } from '../../core/catalog.store';
import { ProductSearchResponse } from '../../core/models';
import { AccentDirective } from '../../shared/accent.directive';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { IconComponent } from '../../shared/icon.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { PaginationComponent } from '../../shared/pagination.component';
import { ProductCardComponent } from '../../shared/product-card.component';
import { SkeletonComponent } from '../../shared/skeleton.component';
import { FilterSidebarComponent } from './filter-sidebar.component';
import { CLEAR_ALL_PATCH, SORT_OPTIONS, activeChips, readState, toApiQuery } from './filters';

type Patch = Record<string, string | string[] | null>;

/**
 * Browse and search. One component serves `/search`, `/c/:categorySlug` and
 * `/c/:categorySlug/:subSlug` — the only difference is where the category
 * comes from, and `readState` normalises that away.
 *
 * Every filter lives in the query string, so the page is shareable and the
 * back button walks the filter history.
 */
@Component({
  selector: 'ob-browse',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AccentDirective,
    EmptyStateComponent,
    FilterSidebarComponent,
    IconComponent,
    PaginationComponent,
    ProductCardComponent,
    SkeletonComponent,
  ],
  host: { class: 'block' },
  template: `
    <!-- ========================================================== banner -->
    @if (category(); as cat) {
      <div [obAccent]="cat.accent" class="border-b border-line bg-surface">
        <div class="ob-container flex items-center gap-4 py-5">
          <span
            class="grid size-12 shrink-0 place-items-center rounded-2xl text-[color:var(--cat-accent)]"
            [style.background]="'var(--cat-accent-soft)'"
          >
            <ob-icon [name]="cat.icon" [size]="24" />
          </span>
          <div class="min-w-0">
            <h1 class="truncate text-xl font-extrabold tracking-tight sm:text-2xl">
              {{ subcategory()?.name ?? cat.name }}
            </h1>
            <p class="ob-clamp-1 text-sm text-muted">
              {{ subcategory() ? cat.name : cat.tagline }}
            </p>
          </div>
        </div>
      </div>
    }

    <div class="ob-container py-5">
      <!-- ==================================================== breadcrumb -->
      <nav aria-label="Breadcrumb" class="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <a routerLink="/" class="transition hover:text-brand">Home</a>
        <ob-icon name="chevron-right" [size]="12" />
        @if (category(); as cat) {
          <a [routerLink]="['/c', cat.slug]" class="transition hover:text-brand">{{ cat.name }}</a>
          @if (subcategory(); as sub) {
            <ob-icon name="chevron-right" [size]="12" />
            <span class="font-semibold text-body">{{ sub.name }}</span>
          }
        } @else {
          <span class="font-semibold text-body">
            {{ state().q ? 'Search results' : 'All products' }}
          </span>
        }
      </nav>

      <div class="flex gap-6">
        <!-- =================================================== sidebar -->
        <aside class="hidden w-64 shrink-0 lg:block xl:w-72">
          <ob-filter-sidebar
            [state]="state()"
            [facets]="result()?.facets ?? null"
            (patch)="apply($event)"
          />
        </aside>

        <!-- ==================================================== results -->
        <div class="min-w-0 flex-1">
          <!-- toolbar -->
          <div class="ob-panel mb-4 flex flex-wrap items-center gap-3 px-3.5 py-3">
            <p class="text-sm">
              @if (loading()) {
                <span class="ob-skeleton inline-block h-4 w-32 rounded align-middle"></span>
              } @else {
                <span class="font-bold">{{ total() }}</span>
                <span class="text-muted">
                  {{ total() === 1 ? 'result' : 'results' }}
                  @if (state().q) {
                    for “<span class="font-semibold text-body">{{ state().q }}</span
                    >”
                  }
                </span>
              }
            </p>

            <div class="ml-auto flex items-center gap-2">
              <button
                type="button"
                class="ob-btn ob-btn-ghost ob-btn-sm lg:hidden"
                (click)="sheetOpen.set(true)"
              >
                <ob-icon name="sliders" [size]="15" />
                Filters
                @if (chips().length) {
                  <span
                    class="grid size-4 place-items-center rounded-full bg-brand text-[10px] font-bold text-white"
                    >{{ chips().length }}</span
                  >
                }
              </button>

              <label class="relative flex items-center">
                <span class="sr-only">Sort results</span>
                <select
                  class="ob-input cursor-pointer appearance-none py-2 pr-8 pl-3 text-[13px] font-semibold"
                  [value]="state().sort"
                  (change)="apply({ sort: $any($event.target).value, page: null })"
                >
                  @for (option of sortOptions; track option.value) {
                    <option [value]="option.value">{{ option.label }}</option>
                  }
                </select>
                <ob-icon
                  name="chevron-down"
                  [size]="14"
                  class="pointer-events-none absolute right-2.5 text-muted"
                />
              </label>

              <div class="hidden items-center rounded-xl border border-line p-0.5 sm:flex">
                @for (mode of viewModes; track mode.value) {
                  <button
                    type="button"
                    class="grid size-8 place-items-center rounded-lg transition"
                    [class]="
                      state().view === mode.value ? 'bg-brand text-white' : 'text-muted hover:bg-line-soft'
                    "
                    [attr.aria-pressed]="state().view === mode.value"
                    [attr.aria-label]="mode.label"
                    (click)="apply({ view: mode.value === 'grid' ? null : mode.value })"
                  >
                    <ob-icon [name]="mode.icon" [size]="16" />
                  </button>
                }
              </div>
            </div>
          </div>

          <!-- active chips -->
          @if (chips().length) {
            <div class="mb-4 flex flex-wrap items-center gap-2">
              <span class="text-xs font-bold text-muted">Filters:</span>
              @for (chip of chips(); track chip.label) {
                <button
                  type="button"
                  class="ob-chip transition hover:border-pop hover:bg-pop-soft hover:text-pop"
                  (click)="apply(chip.patch)"
                >
                  {{ chip.label }}
                  <ob-icon name="x" [size]="12" />
                </button>
              }
              <button
                type="button"
                class="text-xs font-bold text-brand underline underline-offset-2 hover:text-brand-dark"
                (click)="apply(clearAll)"
              >
                Clear all
              </button>
            </div>
          }

          <!-- grid -->
          @if (loading()) {
            <ob-skeleton variant="grid" [count]="12" />
          } @else if (failed()) {
            <ob-empty-state
              art="error"
              title="We couldn't load those results"
              message="The catalogue service didn't answer. Try again in a moment."
            >
              <button type="button" class="ob-btn ob-btn-brand" (click)="apply({})">
                <ob-icon name="refresh" [size]="16" /> Retry
              </button>
            </ob-empty-state>
          } @else if (items().length === 0) {
            <ob-empty-state
              art="search"
              title="Nothing matched those filters"
              [message]="emptyMessage()"
            >
              @if (chips().length) {
                <button type="button" class="ob-btn ob-btn-brand" (click)="apply(clearAll)">
                  Clear all filters
                </button>
              }
              <a routerLink="/" class="ob-btn ob-btn-ghost">Back to home</a>
            </ob-empty-state>
          } @else {
            <ul
              [class]="
                state().view === 'list'
                  ? 'space-y-3'
                  : 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4'
              "
            >
              @for (product of items(); track product.id; let i = $index) {
                <li class="ob-anim-fade-up" [style.animation-delay.ms]="i < 8 ? i * 25 : 0">
                  <ob-product-card
                    [product]="product"
                    [layout]="state().view"
                    [eager]="i < 4"
                  />
                </li>
              }
            </ul>

            <div class="mt-8">
              <ob-pagination
                [page]="state().page ?? 1"
                [totalPages]="result()?.totalPages ?? 1"
                (pageChange)="goToPage($event)"
              />
              <p class="mt-3 text-center text-xs text-muted">
                Showing {{ firstIndex() }}–{{ lastIndex() }} of {{ total() }} products
              </p>
            </div>
          }
        </div>
      </div>
    </div>

    <!-- ================================================= mobile sheet -->
    @if (sheetOpen()) {
      <div class="fixed inset-0 z-[70] lg:hidden">
        <button
          type="button"
          class="ob-anim-fade-in absolute inset-0 bg-ink/60 backdrop-blur-sm"
          aria-label="Close filters"
          (click)="sheetOpen.set(false)"
        ></button>
        <div
          class="ob-anim-slide-up absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl bg-canvas shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
        >
          <div
            class="flex items-center justify-between border-b border-line bg-surface px-4 py-3 rounded-t-2xl"
          >
            <h2 class="text-base font-bold">Filters</h2>
            <div class="flex items-center gap-2">
              @if (chips().length) {
                <button
                  type="button"
                  class="text-xs font-bold text-brand"
                  (click)="apply(clearAll)"
                >
                  Clear all
                </button>
              }
              <button
                type="button"
                class="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-line-soft"
                aria-label="Close filters"
                (click)="sheetOpen.set(false)"
              >
                <ob-icon name="x" [size]="19" />
              </button>
            </div>
          </div>

          <div class="ob-scroll-y min-h-0 flex-1 p-4">
            <ob-filter-sidebar
              [state]="state()"
              [facets]="result()?.facets ?? null"
              (patch)="apply($event)"
            />
          </div>

          <div class="border-t border-line bg-surface p-4">
            <button type="button" class="ob-btn ob-btn-primary w-full" (click)="sheetOpen.set(false)">
              Show {{ total() }} {{ total() === 1 ? 'result' : 'results' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class BrowseComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly catalog = inject(CatalogStore);

  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly clearAll = CLEAR_ALL_PATCH;
  protected readonly sheetOpen = signal(false);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);

  protected readonly viewModes = [
    { value: 'grid' as const, icon: 'grid', label: 'Grid view' },
    { value: 'list' as const, icon: 'list', label: 'List view' },
  ];

  private readonly state$ = combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(
    map(([params, query]) => readState(params, query)),
  );

  protected readonly state = toSignal(this.state$, {
    initialValue: readState(this.route.snapshot.paramMap, this.route.snapshot.queryParamMap),
  });

  protected readonly result = toSignal(
    this.state$.pipe(
      tap(() => {
        this.loading.set(true);
        this.failed.set(false);
      }),
      switchMap((state) =>
        this.api.products(toApiQuery(state)).pipe(
          catchError(() => {
            this.failed.set(true);
            return of(null);
          }),
        ),
      ),
      tap(() => this.loading.set(false)),
    ),
    { initialValue: null as ProductSearchResponse | null },
  );

  protected readonly emptyMessage = computed(() => {
    const q = this.state().q;
    return q
      ? `We couldn't find anything for “${q}”. Try fewer words, or loosen the filters.`
      : 'Try widening the price range or clearing a filter or two.';
  });

  protected readonly items = computed(() => this.result()?.items ?? []);
  protected readonly total = computed(() => this.result()?.total ?? 0);

  protected readonly category = computed(() => {
    const slug = this.state().category;
    return slug ? this.catalog.find(slug) : undefined;
  });

  protected readonly subcategory = computed(() => {
    const slug = this.state().subcategory;
    return slug ? this.category()?.subcategories.find((s) => s.slug === slug) : undefined;
  });

  protected readonly chips = computed(() =>
    activeChips(this.state(), (cents) => new MoneyPipe().transform(cents, 'short')),
  );

  protected readonly firstIndex = computed(() => {
    const result = this.result();
    if (!result || result.total === 0) return 0;
    return (result.page - 1) * result.pageSize + 1;
  });

  protected readonly lastIndex = computed(() => {
    const result = this.result();
    if (!result) return 0;
    return Math.min(result.total, result.page * result.pageSize);
  });

  constructor() {
    // Route-level `title` can't see the category, so it is set here instead. This
    // has to be an effect rather than a state$ subscription: the category name
    // comes from the catalog signal, which resolves after the first route event.
    effect(() => this.updateTitle());
  }

  /** Merge a patch into the query string; `null` removes a key. */
  protected apply(patch: Patch): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: patch,
      queryParamsHandling: 'merge',
    });
    this.sheetOpen.set(false);
  }

  protected goToPage(page: number): void {
    this.apply({ page: page === 1 ? null : String(page) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private updateTitle(): void {
    const state = this.state();
    const category = this.category();
    const name = this.subcategory()?.name ?? category?.name;
    if (state.q) this.title.setTitle(`“${state.q}” — Jerry's Shop`);
    else if (name) this.title.setTitle(`${name} — Jerry's Shop`);
    else this.title.setTitle("All products — Jerry's Shop");
  }
}
