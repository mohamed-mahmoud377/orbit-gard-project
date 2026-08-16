import { Component, input } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  template: `
    <div class="loading-spinner" role="status" [attr.aria-label]="label() || 'Loading'">
      <span class="loading-spinner-ring" aria-hidden="true"></span>
      @if (label()) {
        <span class="loading-spinner-label">{{ label() }}</span>
      }
    </div>
  `,
  styleUrl: './loading-spinner.scss',
})
export class LoadingSpinner {
  readonly label = input('');
}
