import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MoneyPipe, splitMoney } from './money.pipe';

/**
 * The price treatment: large integer part, superscript piastres, the struck
 * list price beside it and a computed discount chip.
 */
@Component({
  selector: 'ob-price',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyPipe],
  host: { class: 'flex flex-wrap items-baseline gap-x-2 gap-y-1' },
  template: `
    <span class="flex items-baseline font-semibold tracking-tight text-body" [class]="sizeClass()">
      <span class="mr-1 self-start text-[0.6em] font-bold text-muted" [style.line-height]="1.9"
        >EGP</span
      >
      <span>{{ parts().whole }}</span>
      <span class="self-start text-[0.62em] font-bold" [style.line-height]="1.9">{{
        parts().fraction
      }}</span>
    </span>

    @if (hasDiscount()) {
      <span class="text-xs text-muted line-through decoration-muted/60">{{
        listCents() | money
      }}</span>
      <span class="ob-badge bg-pop-soft text-pop">-{{ discountPercent() }}%</span>
    }
  `,
})
export class PriceComponent {
  readonly cents = input.required<number>();
  readonly listCents = input<number | null>(null);
  readonly discountPercent = input<number>(0);
  readonly size = input<'sm' | 'md' | 'lg' | 'xl'>('md');

  protected readonly parts = computed(() => splitMoney(this.cents()));

  protected readonly hasDiscount = computed(() => {
    const list = this.listCents();
    return list !== null && list > this.cents() && this.discountPercent() > 0;
  });

  protected readonly sizeClass = computed(
    () =>
      ({
        sm: 'text-base',
        md: 'text-xl',
        lg: 'text-2xl',
        xl: 'text-4xl',
      })[this.size()],
  );
}
