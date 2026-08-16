import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AssetUrlPipe } from '../core/asset-url';
import { OrbitLogo } from '../shared/ui/orbit-logo';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, OrbitLogo, AssetUrlPipe],
  template: `
    <main class="auth-shell">
      <section class="brand-panel" aria-label="Orbit">
        <div class="brand-content">
          <app-orbit-logo />
          <h1>Your money moves around you.</h1>
          <p>One wallet, and the people you are responsible for orbiting your rules.</p>
        </div>
        <img class="rings" [src]="'assets/auth-rings.svg' | assetUrl" alt="" aria-hidden="true" />
      </section>
      <section class="form-panel">
      
       <div class="blur-circle blur-1"></div>
       <div class="blur-circle blur-2"></div>
       <div class="blur-circle blur-3"></div>
       <div class="blur-circle blur-4"></div>
        <router-outlet />
      </section>
    </main>
  `,
  styleUrl: './auth-layout.scss',
})
export class AuthLayout {}
