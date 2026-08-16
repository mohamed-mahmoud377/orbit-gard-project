import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from './icon.component';

/** −/+ quantity control with a typed input. Server cap is 20 per line. */
@Component({
  selector: 'ob-qty-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div
      class="inline-flex items-center rounded-xl border border-line bg-surface"
      [class.opacity-60]="disabled()"
    >
      <button
        type="button"
        class="grid size-9 place-items-center rounded-l-xl text-muted transition hover:bg-line-soft hover:text-body disabled:pointer-events-none disabled:opacity-40"
        [disabled]="disabled() || value() <= min()"
        (click)="step(-1)"
        [attr.aria-label]="'Decrease quantity of ' + label()"
      >
        <ob-icon name="minus" [size]="16" />
      </button>

      <input
        type="text"
        inputmode="numeric"
        class="w-10 border-x border-line bg-transparent py-1.5 text-center text-sm font-semibold tabular-nums outline-none focus-visible:bg-brand-soft"
        [value]="value()"
        [disabled]="disabled()"
        [attr.aria-label]="'Quantity of ' + label()"
        (change)="onType($event)"
      />

      <button
        type="button"
        class="grid size-9 place-items-center rounded-r-xl text-muted transition hover:bg-line-soft hover:text-body disabled:pointer-events-none disabled:opacity-40"
        [disabled]="disabled() || value() >= effectiveMax()"
        (click)="step(1)"
        [attr.aria-label]="'Increase quantity of ' + label()"
      >
        <ob-icon name="plus" [size]="16" />
      </button>
    </div>
  `,
})
export class QtyStepperComponent {
  readonly value = input.required<number>();
  readonly min = input(1);
  readonly max = input(20);
  /** Stock ceiling, when lower than the per-line cap. */
  readonly stock = input<number | null>(null);
  readonly disabled = input(false);
  readonly label = input('item');

  readonly valueChange = output<number>();

  protected readonly effectiveMax = computed(() => {
    const stock = this.stock();
    return stock === null ? this.max() : Math.max(this.min(), Math.min(this.max(), stock));
  });

  protected step(delta: number): void {
    this.emit(this.value() + delta);
  }

  protected onType(event: Event): void {
    const input = event.target as HTMLInputElement;
    const parsed = Number.parseInt(input.value, 10);
    if (Number.isNaN(parsed)) {
      input.value = String(this.value());
      return;
    }
    this.emit(parsed);
  }

  private emit(next: number): void {
    const bounded = Math.max(this.min(), Math.min(this.effectiveMax(), next));
    if (bounded !== this.value()) this.valueChange.emit(bounded);
  }
}
