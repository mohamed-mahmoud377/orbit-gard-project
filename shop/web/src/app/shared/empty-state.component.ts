import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Empty / zero-result state with a hand-drawn inline illustration. Each art
 * variant is drawn from the same orbit motif as the logo so the empty screens
 * feel like part of the store rather than a stock graphic.
 */
@Component({
  selector: 'ob-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mx-auto flex max-w-md flex-col items-center px-6 py-14 text-center">
      <svg
        viewBox="0 0 200 160"
        class="mb-6 h-36 w-auto"
        fill="none"
        aria-hidden="true"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <svg:ellipse
          cx="100"
          cy="132"
          rx="62"
          ry="10"
          class="fill-line-soft"
        />
        <svg:ellipse
          cx="100"
          cy="74"
          rx="76"
          ry="30"
          class="stroke-line"
          stroke-width="2"
          stroke-dasharray="5 7"
        />

        @switch (art()) {
          @case ('cart') {
            <svg:path
              d="M52 44h12l9 46a7 7 0 0 0 7 5.5h35a7 7 0 0 0 6.9-5.6L128 60H68"
              class="stroke-brand"
              stroke-width="3.5"
            />
            <svg:circle cx="84" cy="112" r="6" class="fill-brand" />
            <svg:circle cx="118" cy="112" r="6" class="fill-brand" />
            <svg:path d="M92 74h24M104 62v24" class="stroke-accent" stroke-width="3.5" />
          }
          @case ('search') {
            <svg:circle cx="92" cy="70" r="28" class="stroke-brand" stroke-width="3.5" />
            <svg:path d="m113 91 20 20" class="stroke-brand" stroke-width="4.5" />
            <svg:path d="M80 66h24M84 78h16" class="stroke-accent" stroke-width="3" />
          }
          @case ('heart') {
            <svg:path
              d="M100 108 68 78a19 19 0 0 1 27-27l5 5 5-5a19 19 0 0 1 27 27z"
              class="stroke-pop"
              stroke-width="3.5"
            />
          }
          @case ('package') {
            <svg:path
              d="M100 34 62 54v42l38 20 38-20V54z"
              class="stroke-brand"
              stroke-width="3.5"
            />
            <svg:path d="M62 54l38 20 38-20M100 74v42" class="stroke-brand" stroke-width="2.5" />
            <svg:path d="M81 44l38 20" class="stroke-accent" stroke-width="3" />
          }
          @case ('error') {
            <svg:path
              d="M100 40 62 106h76z"
              class="stroke-pop"
              stroke-width="3.5"
            />
            <svg:path d="M100 66v20M100 96h.01" class="stroke-pop" stroke-width="4" />
          }
        }
      </svg>

      <h2 class="text-xl font-bold tracking-tight text-body">{{ title() }}</h2>
      @if (message()) {
        <p class="mt-2 text-sm leading-relaxed text-muted">{{ message() }}</p>
      }
      <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
        <ng-content />
      </div>
    </div>
  `,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly message = input<string>('');
  readonly art = input<'cart' | 'search' | 'heart' | 'package' | 'error'>('search');
}
