import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AssetUrlPipe } from '../core/asset-url';
import { OrbitLogo } from '../shared/ui/orbit-logo';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, RouterLink, OrbitLogo, AssetUrlPipe],
  template: `
    <main class="auth-shell">
      <section class="brand-panel" aria-label="Orbit">
        <div class="brand-content">
          <!--
            The way back out of the auth screens. Anyone looking at this
            layout is signed out by definition — guestGuard sends everyone
            else to their dashboard — so the logo goes to the landing page.
          -->
          <a class="brand-logo-link" routerLink="/" aria-label="Orbit home">
            <app-orbit-logo />
          </a>
          <h1>Your money moves around you.</h1>
          <p>One wallet, and the people you are responsible for orbiting your rules.</p>
        </div>
        <img class="rings" [src]="'assets/auth-rings.svg' | assetUrl" alt="" aria-hidden="true" />
      </section>
      <section class="form-panel">
        <router-outlet />
      </section>
    </main>
  `,
  styleUrl: './auth-layout.scss',
})
export class AuthLayout {}
