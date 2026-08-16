import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CatalogStore } from '../../core/catalog.store';
import { HomeResponse } from '../../core/models';
import { AccentDirective } from '../../shared/accent.directive';
import { CountdownComponent } from '../../shared/countdown.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { IconComponent } from '../../shared/icon.component';
import { ImgFallbackDirective } from '../../shared/img-fallback.directive';
import { ProductCardComponent } from '../../shared/product-card.component';
import { ProductRailComponent } from '../../shared/product-rail.component';
import { SkeletonComponent } from '../../shared/skeleton.component';
import { HeroCarouselComponent } from './hero-carousel.component';

/** Deals reset at midnight local time — the countdown needs a real target. */
function endOfDay(): Date {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

@Component({
  selector: 'ob-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AccentDirective,
    CountdownComponent,
    EmptyStateComponent,
    HeroCarouselComponent,
    IconComponent,
    ImgFallbackDirective,
    ProductCardComponent,
    ProductRailComponent,
    SkeletonComponent,
  ],
  host: { class: 'block' },
  template: `
    <div class="ob-container py-5 sm:py-6">
      <!-- ============================================================ hero -->
      @if (loading()) {
        <div class="ob-skeleton aspect-[16/10] w-full rounded-2xl sm:aspect-[21/9] lg:aspect-[2.6/1]"></div>
      } @else if (data(); as home) {
        <ob-hero-carousel [slides]="home.heroSlides" />
      } @else if (failed()) {
        <ob-empty-state
          art="error"
          title="We couldn't load the storefront"
          message="The catalogue service didn't answer. It's usually back within a moment."
        >
          <button type="button" class="ob-btn ob-btn-brand" (click)="reload()">
            <ob-icon name="refresh" [size]="16" /> Try again
          </button>
        </ob-empty-state>
      }

      <!-- ====================================================== categories -->
      <section class="mt-10">
        <header class="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 class="text-lg font-bold tracking-tight sm:text-xl">Shop by department</h2>
            <p class="mt-0.5 text-sm text-muted">
              {{ catalog.categories().length || 30 }} departments, 500 products, one very
              determined mouse.
            </p>
          </div>
        </header>

        @if (!catalog.loaded()) {
          <div class="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-10">
            @for (i of skeletonTiles; track i) {
              <div class="ob-skeleton aspect-square rounded-xl"></div>
            }
          </div>
        } @else {
          <ul class="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-10">
            @for (category of catalog.categories(); track category.slug) {
              <li>
                <a
                  [routerLink]="['/c', category.slug]"
                  [obAccent]="category.accent"
                  class="group flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface p-2 text-center transition duration-200 hover:-translate-y-1 hover:border-[color:var(--cat-accent)] hover:shadow-[var(--shadow-lift)]"
                >
                  <span
                    class="grid size-11 place-items-center rounded-xl text-[color:var(--cat-accent)] transition-transform duration-200 group-hover:scale-110"
                    [style.background]="'var(--cat-accent-soft)'"
                  >
                    <ob-icon [name]="category.icon" [size]="22" />
                  </span>
                  <span class="ob-clamp-2 text-[11px] leading-tight font-semibold">{{
                    category.name
                  }}</span>
                </a>
              </li>
            }
          </ul>
        }
      </section>

      <!-- =========================================================== deals -->
      <section class="mt-10">
        <div
          class="overflow-hidden rounded-2xl border border-pop/20 bg-gradient-to-br from-pop-soft via-accent-soft to-surface"
        >
          <header
            class="flex flex-wrap items-center justify-between gap-4 border-b border-pop/15 px-4 py-4 sm:px-6"
          >
            <div class="flex items-center gap-3">
              <span class="grid size-11 place-items-center rounded-xl bg-pop text-white">
                <ob-icon name="zap" [size]="22" />
              </span>
              <div>
                <h2 class="text-lg font-extrabold tracking-tight sm:text-xl">Deals of the day</h2>
                <p class="text-xs text-muted">The steepest discounts in the catalogue, right now.</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="hidden text-xs font-bold tracking-wide text-pop uppercase sm:block"
                >Ends in</span
              >
              <ob-countdown [until]="dealsEnd" chipClass="bg-pop text-white" />
            </div>
          </header>

          <div class="px-4 pt-4 sm:px-6">
            @if (loading()) {
              <ob-skeleton variant="rail" [count]="6" />
            } @else if (data(); as home) {
              <div class="ob-rail">
                @for (product of home.dealsOfTheDay; track product.id) {
                  <div class="w-[168px] sm:w-[210px] lg:w-[228px]">
                    <ob-product-card [product]="product" />
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </section>

      <!-- =========================================================== rails -->
      @if (loading()) {
        <div class="mt-10 space-y-10">
          @for (i of [0, 1]; track i) {
            <div>
              <div class="ob-skeleton mb-4 h-6 w-48 rounded"></div>
              <ob-skeleton variant="rail" [count]="6" />
            </div>
          }
        </div>
      } @else if (data(); as home) {
        <div class="mt-10">
          <ob-product-rail
            title="New arrivals"
            subtitle="Fresh into the warehouse this month"
            icon="sparkles"
            [products]="home.newArrivals"
            seeAllLink="/search"
            [seeAllParams]="{ sort: 'newest' }"
          />
        </div>

        <!-- Editorial band splits the page so it doesn't read as ten identical rails. -->
        <section class="mt-10 grid gap-4 md:grid-cols-3">
          @for (promo of promos; track promo.title) {
            <a
              [routerLink]="promo.path"
              [queryParams]="promo.params"
              [obAccent]="promo.accent"
              class="group relative overflow-hidden rounded-2xl border border-line bg-surface p-6 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
            >
              <span
                class="absolute -top-8 -right-8 size-32 rounded-full opacity-15 transition-transform duration-500 group-hover:scale-125"
                [style.background]="'var(--cat-accent)'"
              ></span>
              <span
                class="relative grid size-11 place-items-center rounded-xl text-[color:var(--cat-accent)]"
                [style.background]="'var(--cat-accent-soft)'"
              >
                <ob-icon [name]="promo.icon" [size]="22" />
              </span>
              <h3 class="relative mt-4 text-base font-bold">{{ promo.title }}</h3>
              <p class="relative mt-1 text-sm leading-relaxed text-muted">{{ promo.body }}</p>
              <span
                class="relative mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-[color:var(--cat-accent)]"
              >
                {{ promo.cta }}
                <ob-icon name="arrow-right" [size]="15" />
              </span>
            </a>
          }
        </section>

        <div class="mt-10">
          <ob-product-rail
            title="Best sellers"
            subtitle="What everyone else is putting in their basket"
            icon="tag"
            [products]="home.bestSellers"
            seeAllLink="/search"
            [seeAllParams]="{ badge: 'BEST_SELLER' }"
          />
        </div>

        <!-- Below the fold: deferred so the first paint isn't paying for six
             more rails of imagery. -->
        @defer (on viewport) {
          <div class="mt-10 space-y-10">
            @for (rail of home.categoryRails; track rail.category.slug) {
              <div [obAccent]="rail.category.accent">
                <ob-product-rail
                  [title]="rail.category.name"
                  [subtitle]="rail.category.tagline ?? ''"
                  [icon]="rail.category.icon"
                  [products]="rail.products"
                  [seeAllLink]="['/c', rail.category.slug]"
                />
              </div>
            }
          </div>
        } @placeholder (minimum 100ms) {
          <div class="mt-10 space-y-10">
            @for (i of [0, 1, 2]; track i) {
              <div>
                <div class="ob-skeleton mb-4 h-6 w-56 rounded"></div>
                <ob-skeleton variant="rail" [count]="6" />
              </div>
            }
          </div>
        }

        <!-- =================================================== departments -->
        @defer (on viewport) {
          <section class="mt-12">
            <h2 class="mb-4 text-lg font-bold tracking-tight sm:text-xl">Browse every department</h2>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              @for (category of catalog.categories(); track category.slug) {
                <a
                  [routerLink]="['/c', category.slug]"
                  [obAccent]="category.accent"
                  class="group flex items-center gap-4 overflow-hidden rounded-2xl border border-line bg-surface p-3 transition hover:-translate-y-0.5 hover:border-[color:var(--cat-accent)] hover:shadow-[var(--shadow-lift)]"
                >
                  <span class="ob-media size-20 shrink-0 rounded-xl">
                    @if (category.heroImage) {
                      <img
                        [src]="category.heroImage"
                        [alt]="category.name"
                        [obImgFallback]="category.name"
                        class="transition-transform duration-500 group-hover:scale-110"
                      />
                    }
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="flex items-center gap-1.5">
                      <span class="text-[color:var(--cat-accent)]">
                        <ob-icon [name]="category.icon" [size]="15" />
                      </span>
                      <span class="truncate text-sm font-bold">{{ category.name }}</span>
                    </span>
                    <span class="ob-clamp-1 mt-0.5 block text-xs text-muted">{{
                      category.tagline
                    }}</span>
                    <span class="mt-1 block text-[11px] font-semibold text-muted"
                      >{{ category.productCount }} products ·
                      {{ category.subcategories.length }} sections</span
                    >
                  </span>
                  <ob-icon
                    name="chevron-right"
                    [size]="18"
                    class="shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-[color:var(--cat-accent)]"
                  />
                </a>
              }
            </div>
          </section>
        } @placeholder {
          <div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            @for (i of [0, 1, 2, 3, 4, 5]; track i) {
              <div class="ob-skeleton h-[104px] rounded-2xl"></div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class HomeComponent {
  private readonly api = inject(ApiService);
  protected readonly catalog = inject(CatalogStore);

  protected readonly data = signal<HomeResponse | null>(null);
  protected readonly failed = signal(false);
  protected readonly loading = computed(() => this.data() === null && !this.failed());

  protected readonly dealsEnd = endOfDay();
  protected readonly skeletonTiles = Array.from({ length: 10 }, (_, i) => i);

  protected readonly promos = [
    {
      icon: 'truck',
      accent: 'teal',
      title: 'Free delivery over EGP 1,000',
      body: 'Fill the basket past a thousand pounds and standard shipping costs you nothing.',
      cta: 'Find something to add',
      path: '/search',
      params: { sort: 'popular' },
    },
    {
      icon: 'wallet',
      // Orbit blue rather than the retired violet — it is the wallet's own colour
      // and it reads as a deliberate nod rather than a leftover brand hue.
      accent: 'blue',
      title: 'Pay with your Orbit wallet',
      body: 'Two taps at checkout. Your wallet credentials go straight to Orbit, never to us.',
      cta: 'How it works',
      path: '/cart',
      params: {},
    },
    {
      icon: 'star',
      accent: 'amber',
      title: 'Rated 4.5 and above',
      body: 'The part of the catalogue that shoppers keep coming back to.',
      cta: 'Browse top rated',
      path: '/search',
      params: { minRating: '4.5', sort: 'rating' },
    },
  ];

  constructor() {
    this.load();
  }

  protected reload(): void {
    this.failed.set(false);
    this.load();
  }

  private load(): void {
    this.api.home().subscribe({
      next: (res) => this.data.set(res),
      error: () => this.failed.set(true),
    });
  }
}
