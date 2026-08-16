import { ParamMap } from '@angular/router';
import { Badge, ProductQuery, SortKey } from '../../core/models';

export const PAGE_SIZE = 24;

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'relevance', label: 'Featured' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Customer rating' },
  { value: 'popular', label: 'Most reviewed' },
  { value: 'newest', label: 'Newest first' },
];

const BADGES: Badge[] = ['BEST_SELLER', 'NEW', 'DEAL', 'LIMITED'];

export const BADGE_LABELS: Record<Badge, string> = {
  BEST_SELLER: 'Best sellers',
  NEW: 'New arrivals',
  DEAL: 'On offer',
  LIMITED: 'Limited stock',
};

/** Everything the browse page keeps in the URL, parsed and validated. */
export interface BrowseState extends ProductQuery {
  view: 'grid' | 'list';
}

function toInt(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

function toFloat(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Build the API query from the route. Filters live in the URL so a filtered
 * page is shareable and the browser's back button steps through them.
 */
export function readState(params: ParamMap, query: ParamMap): BrowseState {
  const badge = query.get('badge');
  const sort = query.get('sort');
  const view = query.get('view');

  return {
    q: query.get('q')?.trim() || undefined,
    category: params.get('categorySlug') ?? query.get('category') ?? undefined,
    subcategory: params.get('subSlug') ?? query.get('subcategory') ?? undefined,
    brand: query.getAll('brand').filter(Boolean),
    minPrice: toInt(query.get('minPrice')),
    maxPrice: toInt(query.get('maxPrice')),
    minRating: toFloat(query.get('minRating')),
    badge: badge && (BADGES as string[]).includes(badge) ? (badge as Badge) : undefined,
    inStock: query.get('inStock') === '1' || undefined,
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? (sort as SortKey) : 'relevance',
    page: Math.max(1, toInt(query.get('page')) ?? 1),
    pageSize: PAGE_SIZE,
    view: view === 'list' ? 'list' : 'grid',
  };
}

/** Strip the view-only keys before the state is sent to the API. */
export function toApiQuery(state: BrowseState): ProductQuery {
  const { q, category, subcategory, brand, minPrice, maxPrice, minRating, badge, inStock, sort, page } =
    state;
  return {
    q,
    category,
    subcategory,
    brand: brand?.length ? brand : undefined,
    minPrice,
    maxPrice,
    minRating,
    badge,
    inStock,
    sort,
    page,
    pageSize: PAGE_SIZE,
  };
}

export interface ActiveChip {
  label: string;
  /** Query-param patch that removes this filter. */
  patch: Record<string, string | string[] | null>;
}

export function activeChips(
  state: BrowseState,
  formatMoney: (cents: number) => string,
): ActiveChip[] {
  const chips: ActiveChip[] = [];

  if (state.q) chips.push({ label: `“${state.q}”`, patch: { q: null } });

  for (const brand of state.brand ?? []) {
    chips.push({
      label: brand,
      patch: { brand: (state.brand ?? []).filter((b) => b !== brand) },
    });
  }

  if (state.minPrice !== undefined || state.maxPrice !== undefined) {
    const from = state.minPrice !== undefined ? formatMoney(state.minPrice) : 'Any';
    const to = state.maxPrice !== undefined ? formatMoney(state.maxPrice) : 'Any';
    chips.push({ label: `${from} – ${to}`, patch: { minPrice: null, maxPrice: null } });
  }

  if (state.minRating !== undefined) {
    chips.push({ label: `${state.minRating}★ & up`, patch: { minRating: null } });
  }

  if (state.badge) {
    chips.push({ label: BADGE_LABELS[state.badge], patch: { badge: null } });
  }

  if (state.inStock) {
    chips.push({ label: 'In stock only', patch: { inStock: null } });
  }

  return chips;
}

/** Query params that reset every filter but keep the search term and sort. */
export const CLEAR_ALL_PATCH: Record<string, string | string[] | null> = {
  brand: [],
  minPrice: null,
  maxPrice: null,
  minRating: null,
  badge: null,
  inStock: null,
  page: null,
};
