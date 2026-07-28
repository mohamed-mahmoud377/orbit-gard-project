import { Component, input } from '@angular/core';

@Component({
  selector: 'app-orbit-logo',
  template: `
    <div class="logo" [class.compact]="compact()">
      <img src="/assets/orbit-mark.svg" alt="" aria-hidden="true" />
      <span>Orbit</span>
    </div>
  `,
  styleUrl: './orbit-logo.scss',
})
export class OrbitLogo {
  readonly compact = input(false);
}
