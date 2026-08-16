import { Component, input, output } from '@angular/core';

export type StatusTone = 'info' | 'success' | 'pending' | 'danger';

@Component({
  selector: 'app-status-view',
  template: `
    <section
      class="status-card"
      [class.card]="presentation() === 'card'"
      [class.status-card-plain]="presentation() === 'plain'"
      [attr.data-tone]="tone()"
    >
      <div class="status-icon" aria-hidden="true">
        @switch (tone()) {
          @case ('success') { ✓ }
          @case ('danger') { ! }
          @case ('pending') { … }
          @default { i }
        }
      </div>
      <div>
        <h1>{{ title() }}</h1>
        <p>{{ message() }}</p>
      </div>
      @if (actionLabel()) {
        <button class="btn btn-primary" type="button" (click)="action.emit()">
          {{ actionLabel() }}
        </button>
      }
    </section>
  `,
  styleUrl: './status-view.scss',
})
export class StatusView {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly tone = input<StatusTone>('info');
  readonly presentation = input<'card' | 'plain'>('card');
  readonly actionLabel = input('');
  readonly action = output<void>();
}
