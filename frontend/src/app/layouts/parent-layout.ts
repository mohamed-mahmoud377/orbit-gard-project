import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AssetUrlPipe, assetUrl } from '../core/asset-url';
import { AuthFacade } from '../features/auth/data-access';
import { UserAccountSummary } from '../features/wallet/data-access/user-api.adapter';
import { WalletFacade } from '../features/wallet/data-access/wallet.facade';
import { OrbitLogo } from '../shared/ui/orbit-logo';

interface NavigationItem {
  readonly label: string;
  readonly route: string;
  readonly icon: string;
  readonly exact?: boolean;
  readonly badge?: string;
}

@Component({
  selector: 'app-parent-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, OrbitLogo, AssetUrlPipe],
  template: `
    <div class="shell">
      <aside class="sidebar">
        <a class="logo-link" routerLink="/dashboard" aria-label="Orbit dashboard">
          <app-orbit-logo />
        </a>

        <nav aria-label="Parent wallet navigation">
          <div class="nav-group">
            @for (item of mainNavigation; track item.route) {
              <a
                class="nav-item"
                [routerLink]="item.route"
                routerLinkActive="active"
                [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
              >
                <img [src]="item.icon" alt="" aria-hidden="true" />
                <span>{{ item.label }}</span>
                @if (item.badge) {
                  <span class="badge">{{ item.badge }}</span>
                }
              </a>
            }
          </div>

          <p class="nav-heading">Money</p>
          <div class="nav-group">
            @for (item of moneyNavigation; track item.route) {
              <a class="nav-item" [routerLink]="item.route" routerLinkActive="active">
                <img [src]="item.icon" alt="" aria-hidden="true" />
                <span>{{ item.label }}</span>
                @if (item.badge) {
                  <span class="badge">{{ item.badge }}</span>
                }
              </a>
            }
          </div>

          <p class="nav-heading">Family</p>
          <a class="nav-item" routerLink="/family" routerLinkActive="active">
            <img [src]="'assets/nav-family.svg' | assetUrl" alt="" aria-hidden="true" />
            <span>Family</span>
            @if (childrenCount(); as count) {
              <span class="badge">{{ count }}</span>
            }
          </a>
        </nav>

        <div class="sidebar-spacer"></div>

        <a class="nav-item" routerLink="/settings" routerLinkActive="active">
          <img [src]="'assets/nav-settings.svg' | assetUrl" alt="" aria-hidden="true" />
          <span>Settings</span>
        </a>


            <button class="nav-item" type="button" (click)="logout()">
              <span aria-hidden="true">↪</span>
              <span>Sign out</span>
            </button>

        <a class="account-chip" routerLink="/settings">
          <span class="avatar">{{ initials() }}</span>
          <span><strong>{{ fullName() }}</strong><small>&#64;{{ username() }}</small></span>
          <span aria-hidden="true">›</span>
        </a>
      </aside>

      <main class="content"><router-outlet /></main>

      <nav class="mobile-nav" aria-label="Mobile navigation">
        @for (item of mobileNavigation; track item.route) {
          <a [routerLink]="item.route" routerLinkActive="active">
            <img [src]="item.icon" alt="" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </a>
        }
      </nav>
    </div>
  `,
  styleUrl: './parent-layout.scss',
})
export class ParentLayout {
  private readonly auth = inject(AuthFacade);
  private readonly wallet = inject(WalletFacade);
  private readonly router = inject(Router);

  /**
   * Seeded from the session so the chip renders a real name on first paint,
   * then refreshed from GET /users/me — the session copy is only as fresh as
   * the last login.
   */
  private readonly account = signal<UserAccountSummary | null>(this.sessionAccount());

  protected readonly fullName = computed(() => {
    const account = this.account();
    return account ? `${account.firstName} ${account.lastName}`.trim() : '';
  });

  protected readonly username = computed(() => this.account()?.username ?? '');

  /** Null until /users/me answers — the badge stays hidden rather than guessing. */
  protected readonly childrenCount = computed(() => this.account()?.childrenCount ?? null);

  protected readonly initials = computed(() => {
    const account = this.account();
    if (!account) {
      return '';
    }
    return `${account.firstName.charAt(0)}${account.lastName.charAt(0)}`.toUpperCase();
  });

  protected readonly mainNavigation: readonly NavigationItem[] = [
    {
      label: 'Dashboard',
      route: '/dashboard',
      icon: assetUrl('assets/nav-dashboard.svg'),
      exact: true,
    },
  ];

  protected readonly moneyNavigation: readonly NavigationItem[] = [
    { label: 'Top up', route: '/top-up', icon: assetUrl('assets/nav-topup.svg') },
    { label: 'Send money', route: '/send', icon: assetUrl('assets/nav-send.svg') },
    {
      label: 'Transactions',
      route: '/transactions',
      icon: assetUrl('assets/nav-transactions.svg'),
    },
  ];

  protected readonly mobileNavigation: readonly NavigationItem[] = [
    ...this.mainNavigation,
    ...this.moneyNavigation.slice(0, 2),
    { label: 'Family', route: '/family', icon: assetUrl('assets/nav-family.svg') },
    { label: 'Settings', route: '/settings', icon: assetUrl('assets/nav-settings.svg') },
  ];

  constructor() {
    // Keeping the seeded name on failure beats blanking the chip over a
    // transient network error.
    this.wallet.getCurrentUser().subscribe({
      next: (account) => this.account.set(account),
      error: () => undefined,
    });
  }

  protected logout(): void {
    this.auth.logout().subscribe(() => {
      // The mirror of the login navigation: replace the page being left so
      // Back cannot aim at a screen the session no longer opens. parentGuard
      // would refuse it anyway — this just stops the user watching it happen.
      void this.router.navigateByUrl('/auth/login', { replaceUrl: true });
    });
  }

  private sessionAccount(): UserAccountSummary | null {
    const user = this.auth.currentUser();
    if (!user) {
      return null;
    }
    return {
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      accountType: user.accountType,
      childrenCount: null,
      parentFirstName: null,
    };
  }
}
