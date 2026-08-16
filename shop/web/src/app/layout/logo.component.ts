import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The orbit mark: a planet with a tilted ring and a marigold satellite. */
@Component({
  selector: 'ob-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-2.5' },
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      class="shrink-0"
    >
      <svg:circle cx="20" cy="20" r="9.5" class="fill-brand" />
      <svg:circle cx="20" cy="20" r="9.5" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="1" />
      <svg:ellipse
        cx="20"
        cy="20"
        rx="18"
        ry="7"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        transform="rotate(-24 20 20)"
        opacity="0.75"
      />
      <svg:circle cx="35.4" cy="13.2" r="3.2" class="fill-accent" />
    </svg>
    @if (wordmark() !== 'none') {
      <span
        class="flex-col leading-none"
        [class]="wordmark() === 'sm-up' ? 'hidden sm:flex' : 'flex'"
      >
        <span class="text-[1.0625rem] font-extrabold tracking-tight">Orbit Bazaar</span>
        <span class="mt-0.5 text-[10px] font-semibold tracking-[0.16em] uppercase opacity-60"
          >Everything, in orbit</span
        >
      </span>
    }
  `,
})
export class LogoComponent {
  readonly size = input(34);

  /**
   * Responsive visibility is handled *inside* this component on purpose.
   *
   * The host sets `inline-flex`, and Tailwind emits `.hidden` before
   * `.inline-flex`, so a `hidden` utility applied by a parent would lose to
   * the host class and the wordmark would never actually hide. Owning the
   * breakpoint here keeps that footgun out of every call site.
   */
  readonly wordmark = input<'always' | 'sm-up' | 'none'>('always');
}
