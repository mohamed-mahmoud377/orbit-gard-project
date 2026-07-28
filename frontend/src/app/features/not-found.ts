import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrbitLogo } from '../shared/ui/orbit-logo';

@Component({
  imports: [RouterLink, OrbitLogo],
  template: `
    <main class="not-found">
      <app-orbit-logo />
      <p class="overline">404</p>
      <h1>This page left Orbit</h1>
      <p class="muted">The route does not exist in this demo.</p>
      <a class="btn btn-primary" routerLink="/dashboard">Back to dashboard</a>
    </main>
  `,
  styleUrl: './not-found.scss',
})
export default class NotFound {}
