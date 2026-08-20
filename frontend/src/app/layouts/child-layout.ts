import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthFacade } from '../features/auth/data-access';
import { UserAccountSummary } from '../features/wallet/data-access/user-api.adapter';
import { WalletFacade } from '../features/wallet/data-access/wallet.facade';
import { OrbitLogo } from '../shared/ui/orbit-logo';

@Component({
  selector: 'app-child-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, OrbitLogo],
  template: `
    <div class="child-shell">
      <aside>
        <a routerLink="/my-wallet"><app-orbit-logo /></a>
        <div class="child-badge">Child wallet</div>
        <nav>
          <a routerLink="/my-wallet" routerLinkActive="active">◉ <span>My wallet</span></a>
          <a routerLink="/my-activity" routerLinkActive="active">↔ <span>My activity</span></a>
        </nav>
        <div class="spacer"></div>
            <button class="sign-out" type="button" (click)="logout()">Sign out</button>
        <div class="account">
          <span>{{ initials() }}</span>
          <div>
            <strong>{{ firstName() }}</strong>
            @if (parentFirstName(); as parent) {
              <small>Managed by {{ parent }}</small>
            }
          </div>
        </div>
      </aside>
      <main><router-outlet /></main>
    </div>
  `,
  styleUrl: './child-layout.scss',
})
export class ChildLayout {
  private readonly auth = inject(AuthFacade);
  private readonly wallet = inject(WalletFacade);
  private readonly router = inject(Router);

  /**
   * Seeded from the session so the chip renders a real name on first paint,
   * then refreshed from GET /users/me — the session copy carries no parent name.
   */
  private readonly account = signal<UserAccountSummary | null>(this.sessionAccount());

  protected readonly firstName = computed(() => this.account()?.firstName ?? '');

  protected readonly parentFirstName = computed(() => this.account()?.parentFirstName ?? null);

  protected readonly initials = computed(() => {
    const account = this.account();
    if (!account) {
      return '';
    }
    return `${account.firstName.charAt(0)}${account.lastName.charAt(0)}`.toUpperCase();
  });

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
      // Mirrors the login navigation — see the note in parent-layout.
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
