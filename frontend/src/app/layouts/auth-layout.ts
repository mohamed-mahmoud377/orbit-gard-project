import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { OrbitLogo } from '../shared/ui/orbit-logo';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, OrbitLogo],
  template: `
    <main class="auth-shell">
      <section class="brand-panel" aria-label="Orbit">
        <div class="brand-content">
          <app-orbit-logo />
          <h1>Your money moves around you.</h1>
          <p>One wallet, and the people you are responsible for orbiting your rules.</p>
        </div>
        <img class="rings" src="/assets/auth-rings.svg" alt="" aria-hidden="true" />
      </section>
      <section class="form-panel">
        <router-outlet />
      </section>
    </main>
  `,
  styleUrl: './auth-layout.scss',
})
export class AuthLayout {}
