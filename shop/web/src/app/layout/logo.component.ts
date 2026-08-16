import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Jerry, the shop's mouse mascot.
 *
 * Drawn here rather than shipped as an asset: it is a couple of hundred bytes
 * inline, stays crisp at every size, needs no extra request, and can be tinted
 * from the theme. Original artwork — a cheerful cartoon mouse — not the Warner
 * Bros. character.
 */
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
      <!-- ears, drawn first so the head overlaps their base -->
      <svg:circle cx="9.5" cy="11" r="7.2" fill="#C98243" />
      <svg:circle cx="9.5" cy="11" r="4.3" fill="#F0A2A8" />
      <svg:circle cx="30.5" cy="11" r="7.2" fill="#C98243" />
      <svg:circle cx="30.5" cy="11" r="4.3" fill="#F0A2A8" />

      <!-- head -->
      <svg:ellipse cx="20" cy="23.4" rx="11.6" ry="10.6" fill="#D9985A" />
      <!-- muzzle -->
      <svg:ellipse cx="20" cy="27.6" rx="7.6" ry="5.4" fill="#FBEBD3" />

      <!-- eyes -->
      <svg:ellipse cx="15.9" cy="20.4" rx="1.85" ry="2.35" fill="#2B1B10" />
      <svg:ellipse cx="24.1" cy="20.4" rx="1.85" ry="2.35" fill="#2B1B10" />
      <svg:circle cx="16.6" cy="19.5" r="0.72" fill="#ffffff" />
      <svg:circle cx="24.8" cy="19.5" r="0.72" fill="#ffffff" />

      <!-- nose and grin -->
      <svg:ellipse cx="20" cy="25.4" rx="2.05" ry="1.55" fill="#E4666F" />
      <svg:path
        d="M20 27v1.5"
        stroke="#9C6533"
        stroke-width="1.05"
        stroke-linecap="round"
      />
      <svg:path
        d="M20 28.5q-2.7 2.1-4.9.3M20 28.5q2.7 2.1 4.9.3"
        stroke="#9C6533"
        stroke-width="1.05"
        stroke-linecap="round"
        fill="none"
      />

      <!-- whiskers -->
      <svg:path
        d="M12.4 26.2 7.1 24.9M12.3 28.2 6.9 28.6M27.6 26.2 32.9 24.9M27.7 28.2 33.1 28.6"
        stroke="#FBEBD3"
        stroke-width="1.05"
        stroke-linecap="round"
        opacity="0.95"
      />

      <!-- a wedge of cheese, because he is running a shop -->
      <svg:path
        d="M31.8 31.2h6.4l-3.2-5.1z"
        fill="#F5B325"
        stroke="#B8800F"
        stroke-width="0.9"
        stroke-linejoin="round"
      />
      <svg:circle cx="34.6" cy="29.9" r="0.62" fill="#B8800F" />
      <svg:circle cx="36.2" cy="30.6" r="0.45" fill="#B8800F" />
    </svg>
    @if (wordmark() !== 'none') {
      <span
        class="flex-col leading-none"
        [class]="wordmark() === 'sm-up' ? 'hidden sm:flex' : 'flex'"
      >
        <span class="text-[1.0625rem] font-extrabold tracking-tight">Jerry&rsquo;s Shop</span>
        <span class="mt-0.5 text-[10px] font-semibold tracking-[0.16em] uppercase opacity-60"
          >Small mouse, big cart</span
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
