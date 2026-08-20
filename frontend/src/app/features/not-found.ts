import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthFacade } from './auth/data-access';
import { OrbitLogo } from '../shared/ui/orbit-logo';

@Component({
  imports: [RouterLink, OrbitLogo],
  template: `
    <main class="not-found">
      <a [routerLink]="home()" aria-label="Orbit home">
        <app-orbit-logo />
      </a>
      <p class="overline">404</p>
      <h1>This page left Orbit</h1>
      <p class="muted">The route does not exist in this demo.</p>
      <a class="btn btn-primary" [routerLink]="home()">{{ homeLabel() }}</a>
    </main>
  `,
  styleUrl: './not-found.scss',
})
export default class NotFound {
  private readonly auth = inject(AuthFacade);

  private readonly signedIn = computed(() => this.auth.isAuthenticated() || this.auth.canRefresh());

  /**
   * Where "home" is depends on who is asking.
   *
   * This used to be a hardcoded /dashboard, which is a route a signed-out
   * visitor cannot open — parentGuard bounces them to the login form — so
   * the only button on the 404 page led somewhere they never asked to go.
   * Signed out, home is the landing page.
   */
  protected readonly home = computed(() => {
    if (!this.signedIn()) return '/';
    return this.auth.accountType() === 'CHILD' ? '/my-wallet' : '/dashboard';
  });

  protected readonly homeLabel = computed(() => {
    if (!this.signedIn()) return 'Back to Orbit';
    return this.auth.accountType() === 'CHILD' ? 'Back to my wallet' : 'Back to dashboard';
  });
}
