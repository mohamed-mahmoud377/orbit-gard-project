import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogStore } from '../core/catalog.store';
import { IconComponent } from '../shared/icon.component';
import { LogoComponent } from './logo.component';

interface FooterColumn {
  heading: string;
  links: { label: string; path: string; params?: Record<string, string> }[];
}

@Component({
  selector: 'ob-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, LogoComponent],
  host: { class: 'block' },
  template: `
    <!-- trust strip -->
    <div class="border-t border-line bg-surface">
      <div class="ob-container grid gap-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
        @for (promise of promises; track promise.title) {
          <div class="flex items-start gap-3">
            <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <ob-icon [name]="promise.icon" [size]="21" />
            </span>
            <div>
              <p class="text-sm font-bold text-body">{{ promise.title }}</p>
              <p class="mt-0.5 text-xs leading-relaxed text-muted">{{ promise.body }}</p>
            </div>
          </div>
        }
      </div>
    </div>

    <button
      type="button"
      class="w-full bg-ink-soft py-3 text-xs font-bold tracking-wider text-white/80 uppercase transition hover:bg-ink-line"
      (click)="toTop()"
    >
      Back to top
    </button>

    <footer class="bg-ink text-white/70">
      <div class="ob-container grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div class="sm:col-span-2 lg:col-span-1">
          <ob-logo class="text-white" />
          <p class="mt-4 max-w-xs text-xs leading-relaxed">
            Small mouse, big cart. A demonstration storefront for the Orbit platform — every
            product, review and price on this site is fictional.
          </p>
          <div class="mt-5 flex gap-2">
            @for (social of socials; track social.label) {
              <span
                class="grid size-9 place-items-center rounded-lg bg-white/10 text-white/80"
                [attr.title]="social.label"
              >
                <ob-icon [name]="social.icon" [size]="16" [label]="social.label" />
              </span>
            }
          </div>
        </div>

        @for (column of columns(); track column.heading) {
          <nav>
            <h3 class="mb-3 text-[11px] font-extrabold tracking-[0.14em] text-white uppercase">
              {{ column.heading }}
            </h3>
            <ul class="space-y-2">
              @for (link of column.links; track link.label) {
                <li>
                  <a
                    [routerLink]="link.path"
                    [queryParams]="link.params ?? null"
                    class="text-[13px] transition hover:text-accent"
                    >{{ link.label }}</a
                  >
                </li>
              }
            </ul>
          </nav>
        }
      </div>

      <div class="border-t border-ink-line">
        <div
          class="ob-container flex flex-col items-center justify-between gap-3 py-5 text-xs sm:flex-row"
        >
          <p>
            © {{ year }} Jerry&rsquo;s Shop · A fictional storefront for testing. No cheese was
            harmed.
          </p>
          <p class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span class="inline-flex items-center gap-1.5">
              <ob-icon name="lock" [size]="13" /> Secure checkout
            </span>
            <span class="inline-flex items-center gap-1.5">
              <ob-icon name="wallet" [size]="13" /> Orbit E-Wallet
            </span>
            <span>Prices in EGP · VAT included at 14%</span>
          </p>
        </div>
      </div>
    </footer>
  `,
})
export class FooterComponent {
  private readonly catalog = inject(CatalogStore);

  protected readonly year = new Date().getFullYear();

  protected readonly promises = [
    {
      icon: 'truck',
      title: 'Free delivery over EGP 1,000',
      body: 'Standard shipping is on us once your basket passes a thousand pounds.',
    },
    {
      icon: 'rotate-ccw',
      title: '30-day returns',
      body: 'Changed your mind? Send it back within a month, no questions asked.',
    },
    {
      icon: 'shield-check',
      title: 'Two-year warranty',
      body: 'Every item is covered against manufacturing faults for twenty-four months.',
    },
    {
      icon: 'headset',
      title: 'Support, 7 days a week',
      body: 'Real people in Cairo, 9am to 9pm, including weekends and holidays.',
    },
  ];

  protected readonly socials = [
    { icon: 'mail', label: 'Email' },
    { icon: 'phone', label: 'Phone' },
    { icon: 'external-link', label: 'Website' },
  ];

  /** Two of the columns are generated from the live category tree. */
  protected readonly columns = computed<FooterColumn[]>(() => {
    const categories = this.catalog.categories();
    const columns: FooterColumn[] = [
      {
        heading: 'Shop',
        links: [
          { label: "Today's deals", path: '/search', params: { badge: 'DEAL' } },
          { label: 'New arrivals', path: '/search', params: { sort: 'newest' } },
          { label: 'Best sellers', path: '/search', params: { badge: 'BEST_SELLER' } },
          { label: 'Top rated', path: '/search', params: { sort: 'rating', minRating: '4.5' } },
          { label: 'Under EGP 500', path: '/search', params: { maxPrice: '50000' } },
        ],
      },
      {
        heading: 'Departments',
        links: categories.slice(0, 6).map((c) => ({ label: c.name, path: `/c/${c.slug}` })),
      },
      {
        heading: 'More to explore',
        links: categories.slice(6, 12).map((c) => ({ label: c.name, path: `/c/${c.slug}` })),
      },
      {
        heading: 'Your account',
        links: [
          { label: 'Sign in', path: '/login' },
          { label: 'Create an account', path: '/register' },
          { label: 'Your orders', path: '/orders' },
          { label: 'Your wishlist', path: '/wishlist' },
          { label: 'Account settings', path: '/account' },
        ],
      },
    ];
    return columns;
  });

  protected toTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
