import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DemoStore } from '../data-access';
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, OrbitLogo],
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
            <img src="/assets/nav-family.svg" alt="" aria-hidden="true" />
            <span>Family</span>
            <span class="badge">2</span>
          </a>
        </nav>

        <div class="sidebar-spacer"></div>

        <a class="nav-item" routerLink="/settings" routerLinkActive="active">
          <img src="/assets/nav-settings.svg" alt="" aria-hidden="true" />
          <span>Settings</span>
        </a>

        <div class="settlement-card">
          <span class="settlement-ring" aria-hidden="true"></span>
          <div><strong>Next settlement</strong><span>in 24 minutes</span></div>
        </div>

            <button class="nav-item" type="button" (click)="logout()">
              <span aria-hidden="true">↪</span>
              <span>Sign out</span>
            </button>

        <a class="account-chip" routerLink="/settings">
          <span class="avatar">MM</span>
          <span><strong>Mohamed Mahmoud</strong><small>&#64;mohamed</small></span>
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
  private readonly store = inject(DemoStore);
  private readonly router = inject(Router);

  protected readonly mainNavigation: readonly NavigationItem[] = [
    {
      label: 'Dashboard',
      route: '/dashboard',
      icon: '/assets/nav-dashboard.svg',
      exact: true,
    },
  ];

  protected readonly moneyNavigation: readonly NavigationItem[] = [
    { label: 'Top up', route: '/top-up', icon: '/assets/nav-topup.svg' },
    { label: 'Send money', route: '/send', icon: '/assets/nav-send.svg' },
    {
      label: 'Transactions',
      route: '/transactions',
      icon: '/assets/nav-transactions.svg',
      badge: '2',
    },
  ];

  protected readonly mobileNavigation: readonly NavigationItem[] = [
    ...this.mainNavigation,
    ...this.moneyNavigation.slice(0, 2),
    { label: 'Family', route: '/family', icon: '/assets/nav-family.svg' },
    { label: 'Settings', route: '/settings', icon: '/assets/nav-settings.svg' },
  ];

  protected logout(): void {
    this.store.logout();
    void this.router.navigateByUrl('/auth/login');
  }
}
