import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CartService } from '../core/cart.service';
import { CatalogStore } from '../core/catalog.store';
import { Category } from '../core/models';
import { WishlistService } from '../core/wishlist.service';
import { AccentDirective } from '../shared/accent.directive';
import { IconComponent } from '../shared/icon.component';
import { MoneyPipe } from '../shared/money.pipe';
import { LogoComponent } from './logo.component';
import { SearchBarComponent } from './search-bar.component';

/**
 * Sticky store header.
 *
 * Row 1: logo · search (with scope + live suggestions) · account · wishlist · cart
 * Row 2: the department bar, whose "All departments" trigger and per-category
 *        hover targets open a mega-menu of subcategories.
 *
 * The mega-menu opens on hover *and* on focus/click, and closes on Escape, so
 * it is fully usable from the keyboard.
 */
@Component({
  selector: 'ob-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    AccentDirective,
    IconComponent,
    LogoComponent,
    SearchBarComponent,
    MoneyPipe,
  ],
  host: { class: 'sticky top-0 z-50 block' },
  template: `
    <a
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:font-semibold focus:text-brand"
      href="#ob-main"
      >Skip to content</a
    >

    <header>
      <!-- ========================================================== row 1 -->
      <div class="bg-ink text-white">
      <div class="ob-container flex items-center gap-3 py-2.5 lg:gap-5">
        <button
          type="button"
          class="grid size-10 shrink-0 place-items-center rounded-lg transition hover:bg-white/10 lg:hidden"
          aria-label="Open menu"
          [attr.aria-expanded]="drawerOpen()"
          (click)="drawerOpen.set(true)"
        >
          <ob-icon name="menu" [size]="22" />
        </button>

        <a routerLink="/" class="shrink-0 rounded-lg px-1 py-1 transition hover:opacity-90">
          <ob-logo wordmark="sm-up" class="text-white" />
        </a>

        <div class="hidden min-w-0 flex-1 lg:block">
          <ob-search-bar />
        </div>

        <div class="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          <!-- account ------------------------------------------------ -->
          <div class="relative">
            <button
              type="button"
              class="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-white/10"
              [attr.aria-expanded]="accountOpen()"
              aria-haspopup="menu"
              (click)="accountOpen.set(!accountOpen())"
            >
              @if (auth.isAuthenticated()) {
                <span
                  class="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-extrabold text-[#3a2200]"
                  >{{ auth.initials() }}</span
                >
              } @else {
                <ob-icon name="user" [size]="20" />
              }
              <span class="hidden leading-tight sm:block">
                <span class="block text-[10px] text-white/60">{{
                  auth.isAuthenticated() ? 'Hello,' : 'Sign in'
                }}</span>
                <span class="block max-w-[7rem] truncate text-xs font-bold">{{
                  auth.isAuthenticated() ? firstName() : 'Account'
                }}</span>
              </span>
              <span class="hidden opacity-70 sm:block">
                <ob-icon name="chevron-down" [size]="13" />
              </span>
            </button>

            @if (accountOpen()) {
              <div
                class="ob-anim-fade-in absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface text-body shadow-[var(--shadow-pop)]"
                role="menu"
              >
                @if (auth.isAuthenticated()) {
                  <div class="border-b border-line bg-line-soft px-4 py-3">
                    <p class="truncate text-sm font-bold">{{ auth.user()?.name }}</p>
                    <p class="truncate text-xs text-muted">{{ auth.user()?.email }}</p>
                  </div>
                  <nav class="p-1.5">
                    @for (item of accountLinks; track item.path) {
                      <a
                        role="menuitem"
                        [routerLink]="item.path"
                        class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-brand-soft hover:text-brand-dark"
                        (click)="accountOpen.set(false)"
                      >
                        <ob-icon [name]="item.icon" [size]="16" />
                        {{ item.label }}
                      </a>
                    }
                  </nav>
                  <div class="border-t border-line p-1.5">
                    <button
                      role="menuitem"
                      type="button"
                      class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-pop transition hover:bg-pop-soft"
                      (click)="signOut()"
                    >
                      <ob-icon name="log-out" [size]="16" />
                      Sign out
                    </button>
                  </div>
                } @else {
                  <div class="p-4">
                    <a
                      routerLink="/login"
                      class="ob-btn ob-btn-primary w-full"
                      (click)="accountOpen.set(false)"
                      >Sign in</a
                    >
                    <p class="mt-3 text-center text-xs text-muted">
                      New to Jerry&rsquo;s Shop?
                      <a
                        routerLink="/register"
                        class="ob-link"
                        (click)="accountOpen.set(false)"
                        >Create an account</a
                      >
                    </p>
                  </div>
                  <nav class="border-t border-line p-1.5">
                    <a
                      routerLink="/orders"
                      class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-brand-soft"
                      (click)="accountOpen.set(false)"
                    >
                      <ob-icon name="package" [size]="16" />
                      Track an order
                    </a>
                  </nav>
                }
              </div>
            }
          </div>

          <!-- wishlist ----------------------------------------------- -->
          <a
            routerLink="/wishlist"
            class="relative hidden items-center gap-2 rounded-lg px-2.5 py-1.5 transition hover:bg-white/10 sm:flex"
          >
            <span class="relative">
              <ob-icon name="heart" [size]="20" />
              @if (wishlist.count() > 0) {
                <span
                  class="absolute -top-1.5 -right-2 grid min-w-[17px] place-items-center rounded-full bg-pop px-1 text-[10px] font-extrabold text-white"
                  >{{ wishlist.count() }}</span
                >
              }
            </span>
            <span class="hidden leading-tight xl:block">
              <span class="block text-[10px] text-white/60">Saved</span>
              <span class="block text-xs font-bold">Wishlist</span>
            </span>
          </a>

          <!-- cart --------------------------------------------------- -->
          <a
            routerLink="/cart"
            class="flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition hover:bg-white/10"
          >
            <span class="relative">
              <ob-icon name="shopping-cart" [size]="22" />
              <span
                class="absolute -top-1.5 -right-2.5 grid min-w-[19px] place-items-center rounded-full bg-accent px-1 text-[11px] font-extrabold text-[#3a2200] transition-transform"
                [class.scale-0]="cart.itemCount() === 0"
                >{{ cart.itemCount() }}</span
              >
            </span>
            <span class="hidden leading-tight xl:block">
              <span class="block text-[10px] text-white/60">Cart</span>
              <span class="block text-xs font-bold">{{ cart.cart().totalCents | money: 'short' }}</span>
            </span>
          </a>
        </div>
      </div>

      <!-- mobile search row -->
      <div class="ob-container pb-2.5 lg:hidden">
        <ob-search-bar placeholder="Search Jerry&rsquo;s Shop…" />
      </div>
    </div>

    <!-- ============================================================ row 2 -->
    <nav
      class="relative hidden border-b border-ink-line bg-ink-soft text-white lg:block"
      aria-label="Departments"
      (mouseleave)="closeMega()"
    >
      <div class="ob-container flex items-center gap-1 overflow-x-auto ob-noscroll">
        <button
          type="button"
          class="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-bold transition hover:bg-white/10"
          [class.ob-nav-open]="megaSlug() === ALL"
          [attr.aria-expanded]="megaSlug() === ALL"
          (click)="toggleMega(ALL)"
          (mouseenter)="openMega(ALL)"
        >
          <ob-icon name="menu" [size]="17" />
          All departments
        </button>

        @for (category of topCategories(); track category.slug) {
          <a
            [routerLink]="['/c', category.slug]"
            routerLinkActive="ob-nav-open"
            class="shrink-0 rounded-lg px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition hover:bg-white/10"
            [class.ob-nav-open]="megaSlug() === category.slug"
            (mouseenter)="openMega(category.slug)"
            (focus)="openMega(category.slug)"
          >
            {{ category.name }}
          </a>
        }

        <a
          routerLink="/search"
          [queryParams]="{ badge: 'DEAL', sort: 'rating' }"
          class="ml-auto shrink-0 rounded-lg px-3 py-2.5 text-[13px] font-bold whitespace-nowrap text-accent transition hover:bg-white/10"
        >
          Today's deals
        </a>
      </div>

      <!-- mega-menu ------------------------------------------------- -->
      @if (megaCategory(); as mega) {
        <div
          class="ob-anim-fade-in absolute inset-x-0 top-full z-40 border-b border-line bg-surface text-body shadow-[var(--shadow-pop)]"
          [obAccent]="mega.accent"
        >
          <div class="ob-container grid gap-6 py-6 md:grid-cols-[1fr_18rem]">
            <div>
              <div class="mb-4 flex items-center gap-3">
                <span
                  class="grid size-10 place-items-center rounded-xl text-[color:var(--cat-accent)]"
                  [style.background]="'var(--cat-accent-soft)'"
                >
                  <ob-icon [name]="mega.icon" [size]="21" />
                </span>
                <div>
                  <h2 class="text-base font-bold">{{ mega.name }}</h2>
                  <p class="text-xs text-muted">{{ mega.tagline }}</p>
                </div>
              </div>
              <ul class="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                @for (sub of mega.subcategories; track sub.slug) {
                  <li>
                    <a
                      [routerLink]="['/c', mega.slug, sub.slug]"
                      class="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm transition hover:bg-[color:var(--cat-accent-soft)] hover:text-[color:var(--cat-accent-dark)]"
                      (click)="closeMega()"
                    >
                      <span class="truncate">{{ sub.name }}</span>
                      <span class="shrink-0 text-[11px] text-muted">{{ sub.productCount }}</span>
                    </a>
                  </li>
                }
                <li>
                  <a
                    [routerLink]="['/c', mega.slug]"
                    class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-bold text-[color:var(--cat-accent)] transition hover:bg-[color:var(--cat-accent-soft)]"
                    (click)="closeMega()"
                  >
                    All {{ mega.productCount }} products
                    <ob-icon name="arrow-right" [size]="14" />
                  </a>
                </li>
              </ul>
            </div>

            <a
              [routerLink]="['/c', mega.slug]"
              class="ob-media hidden aspect-[4/3] rounded-xl border border-line md:block"
              (click)="closeMega()"
            >
              @if (mega.heroImage) {
                <img [src]="mega.heroImage" [alt]="mega.name" loading="lazy" decoding="async" />
              }
              <span
                class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 to-transparent p-4 text-sm font-bold text-white"
                >Shop {{ mega.name }}</span
              >
            </a>
          </div>
        </div>
      } @else if (megaSlug() === ALL) {
        <div
          class="ob-anim-fade-in absolute inset-x-0 top-full z-40 border-b border-line bg-surface text-body shadow-[var(--shadow-pop)]"
        >
          <div class="ob-container py-6">
            <h2 class="mb-4 text-sm font-bold tracking-wider text-muted uppercase">
              All {{ catalog.categories().length }} departments
            </h2>
            <ul class="grid gap-x-5 gap-y-1 sm:grid-cols-3 lg:grid-cols-5">
              @for (category of catalog.categories(); track category.slug) {
                <li>
                  <a
                    [routerLink]="['/c', category.slug]"
                    class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition hover:bg-[color:var(--cat-accent-soft)]"
                    [obAccent]="category.accent"
                    (click)="closeMega()"
                  >
                    <span class="text-[color:var(--cat-accent)]">
                      <ob-icon [name]="category.icon" [size]="17" />
                    </span>
                    <span class="truncate">{{ category.name }}</span>
                  </a>
                </li>
              }
            </ul>
          </div>
        </div>
      }
    </nav>

    </header>

    <!-- ================================================ mobile drawer -->
    @if (drawerOpen()) {
      <div class="fixed inset-0 z-[60] lg:hidden">
        <button
          type="button"
          class="ob-anim-fade-in absolute inset-0 bg-ink/60 backdrop-blur-sm"
          aria-label="Close menu"
          (click)="drawerOpen.set(false)"
        ></button>

        <div
          class="ob-anim-slide-in absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col bg-surface shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-label="Departments"
        >
          <div class="flex items-center justify-between bg-ink px-4 py-3.5 text-white">
            <ob-logo [size]="30" wordmark="always" />
            <button
              type="button"
              class="grid size-9 place-items-center rounded-lg transition hover:bg-white/10"
              aria-label="Close menu"
              (click)="drawerOpen.set(false)"
            >
              <ob-icon name="x" [size]="20" />
            </button>
          </div>

          <div class="ob-scroll-y min-h-0 flex-1 p-3">
            <div class="mb-3 grid grid-cols-2 gap-2">
              <a
                routerLink="/wishlist"
                class="ob-btn ob-btn-ghost ob-btn-sm justify-start"
                (click)="drawerOpen.set(false)"
              >
                <ob-icon name="heart" [size]="16" /> Wishlist ({{ wishlist.count() }})
              </a>
              <a
                routerLink="/orders"
                class="ob-btn ob-btn-ghost ob-btn-sm justify-start"
                (click)="drawerOpen.set(false)"
              >
                <ob-icon name="package" [size]="16" /> Orders
              </a>
            </div>

            <p class="px-2 pt-2 pb-1 text-[11px] font-bold tracking-wider text-muted uppercase">
              Departments
            </p>
            <ul>
              @for (category of catalog.categories(); track category.slug) {
                <li class="border-b border-line-soft last:border-0">
                  <div class="flex items-stretch">
                    <a
                      [routerLink]="['/c', category.slug]"
                      class="flex flex-1 items-center gap-2.5 px-2 py-2.5 text-sm font-medium"
                      [obAccent]="category.accent"
                      (click)="drawerOpen.set(false)"
                    >
                      <span class="text-[color:var(--cat-accent)]">
                        <ob-icon [name]="category.icon" [size]="17" />
                      </span>
                      <span class="truncate">{{ category.name }}</span>
                    </a>
                    @if (category.subcategories.length) {
                      <button
                        type="button"
                        class="grid w-10 place-items-center text-muted"
                        [attr.aria-expanded]="expanded() === category.slug"
                        [attr.aria-label]="'Show ' + category.name + ' subcategories'"
                        (click)="toggleExpanded(category.slug)"
                      >
                        <ob-icon
                          [name]="expanded() === category.slug ? 'chevron-up' : 'chevron-down'"
                          [size]="16"
                        />
                      </button>
                    }
                  </div>
                  @if (expanded() === category.slug) {
                    <ul class="ob-anim-fade-in mb-2 ml-9 space-y-0.5">
                      @for (sub of category.subcategories; track sub.slug) {
                        <li>
                          <a
                            [routerLink]="['/c', category.slug, sub.slug]"
                            class="block rounded-md px-2 py-1.5 text-[13px] text-muted transition hover:bg-line-soft hover:text-body"
                            (click)="drawerOpen.set(false)"
                            >{{ sub.name }}</a
                          >
                        </li>
                      }
                    </ul>
                  }
                </li>
              }
            </ul>
          </div>

          <div class="border-t border-line p-3">
            @if (auth.isAuthenticated()) {
              <button type="button" class="ob-btn ob-btn-ghost w-full" (click)="signOut()">
                <ob-icon name="log-out" [size]="16" /> Sign out
              </button>
            } @else {
              <a
                routerLink="/login"
                class="ob-btn ob-btn-primary w-full"
                (click)="drawerOpen.set(false)"
                >Sign in</a
              >
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class HeaderComponent {
  protected readonly catalog = inject(CatalogStore);
  protected readonly auth = inject(AuthService);
  protected readonly cart = inject(CartService);
  protected readonly wishlist = inject(WishlistService);
  private readonly router = inject(Router);

  protected readonly ALL = '__all__';

  protected readonly megaSlug = signal<string | null>(null);
  protected readonly accountOpen = signal(false);
  protected readonly drawerOpen = signal(false);
  protected readonly expanded = signal<string | null>(null);

  private closeTimer?: ReturnType<typeof setTimeout>;

  protected readonly accountLinks = [
    { path: '/account', label: 'Your account', icon: 'user' },
    { path: '/orders', label: 'Your orders', icon: 'package' },
    { path: '/wishlist', label: 'Your wishlist', icon: 'heart' },
    { path: '/cart', label: 'Your cart', icon: 'shopping-cart' },
  ];

  /** The department bar shows the busiest categories; the rest live in the mega-menu. */
  protected readonly topCategories = computed(() => this.catalog.categories().slice(0, 9));

  protected readonly megaCategory = computed<Category | undefined>(() => {
    const slug = this.megaSlug();
    return slug && slug !== this.ALL ? this.catalog.find(slug) : undefined;
  });

  protected readonly firstName = computed(() => this.auth.user()?.name.split(/\s+/)[0] ?? '');

  protected openMega(slug: string): void {
    clearTimeout(this.closeTimer);
    this.megaSlug.set(slug);
  }

  protected toggleMega(slug: string): void {
    this.megaSlug.update((current) => (current === slug ? null : slug));
  }

  /** Small grace period so a diagonal mouse path to the panel doesn't close it. */
  protected closeMega(): void {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.megaSlug.set(null), 120);
  }

  protected toggleExpanded(slug: string): void {
    this.expanded.update((current) => (current === slug ? null : slug));
  }

  protected signOut(): void {
    this.auth.logout();
    this.accountOpen.set(false);
    this.drawerOpen.set(false);
    void this.router.navigate(['/']);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.megaSlug.set(null);
    this.accountOpen.set(false);
    this.drawerOpen.set(false);
  }

  @HostListener('document:pointerdown', ['$event'])
  protected onPointerDown(event: PointerEvent): void {
    if (!this.accountOpen()) return;
    const target = event.target as HTMLElement;
    if (!target.closest('[aria-haspopup="menu"], [role="menu"]')) this.accountOpen.set(false);
  }
}
