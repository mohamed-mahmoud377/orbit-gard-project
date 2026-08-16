import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

/**
 * Counts down to a target instant. Ticks once a second and stops itself when
 * it reaches zero rather than running a dead interval for the session.
 */
@Component({
  selector: 'ob-countdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-1.5' },
  template: `
    @for (part of parts(); track part.label) {
      <span class="flex flex-col items-center">
        <span
          class="grid min-w-[2.25rem] place-items-center rounded-lg px-1.5 py-1 text-base font-extrabold tabular-nums"
          [class]="chipClass()"
          >{{ part.value }}</span
        >
        <span class="mt-0.5 text-[9px] font-bold tracking-wider uppercase opacity-70">{{
          part.label
        }}</span>
      </span>
      @if (!$last) {
        <span class="-mt-3 text-base font-bold opacity-40">:</span>
      }
    }
  `,
})
export class CountdownComponent {
  readonly until = input.required<Date | string>();
  readonly chipClass = input('bg-ink text-white');

  private readonly now = signal(Date.now());

  constructor() {
    const timer = setInterval(() => {
      this.now.set(Date.now());
      if (this.remainingMs() <= 0) clearInterval(timer);
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private readonly remainingMs = computed(() => {
    const target = this.until();
    const ms = (target instanceof Date ? target : new Date(target)).getTime() - this.now();
    return Math.max(0, ms);
  });

  readonly expired = computed(() => this.remainingMs() === 0);

  protected readonly parts = computed(() => {
    const total = Math.floor(this.remainingMs() / 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const hours = Math.floor(total / 3600);
    return [
      { label: 'hrs', value: pad(hours) },
      { label: 'min', value: pad(Math.floor((total % 3600) / 60)) },
      { label: 'sec', value: pad(total % 60) },
    ];
  });
}
