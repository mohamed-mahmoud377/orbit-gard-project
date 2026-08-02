import { Component, input } from '@angular/core';
import { AssetUrlPipe } from '../../core/asset-url';

@Component({
  selector: 'app-orbit-logo',
  imports: [AssetUrlPipe],
  template: `
    <div class="logo" [class.compact]="compact()">
      <img [src]="'assets/orbit-mark.svg' | assetUrl" alt="" aria-hidden="true" />
      <span>Orbit</span>
    </div>
  `,
  styleUrl: './orbit-logo.scss',
})
export class OrbitLogo {
  readonly compact = input(false);
}
