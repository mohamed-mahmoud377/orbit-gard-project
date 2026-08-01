import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthFacade } from '../features/auth/data-access';
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
          <span>YO</span>
          <div><strong>Youssef</strong><small>Managed by Mohamed</small></div>
        </div>
      </aside>
      <main><router-outlet /></main>
    </div>
  `,
  styleUrl: './child-layout.scss',
})
export class ChildLayout {
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);

  protected logout(): void {
    this.auth.logoutLocal();
    void this.router.navigateByUrl('/auth/login');
  }
}
