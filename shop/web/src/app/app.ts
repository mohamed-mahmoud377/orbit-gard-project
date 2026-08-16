import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { CatalogStore } from './core/catalog.store';
import { FooterComponent } from './layout/footer.component';
import { HeaderComponent } from './layout/header.component';
import { ToastHostComponent } from './layout/toast-host.component';

@Component({
  selector: 'ob-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, HeaderComponent, FooterComponent, ToastHostComponent],
  template: `
    <div class="flex min-h-dvh flex-col">
      <ob-header />
      <main id="ob-main" class="flex-1">
        <router-outlet />
      </main>
      <ob-footer />
    </div>
    <ob-toast-host />
  `,
})
export class App {
  private readonly catalog = inject(CatalogStore);
  private readonly auth = inject(AuthService);

  constructor() {
    // The category tree backs the header, the mega-menu and the browse
    // sidebar, so it is fetched once here rather than per route.
    this.catalog.load().subscribe({ error: () => undefined });
    this.auth.restore();
  }
}
