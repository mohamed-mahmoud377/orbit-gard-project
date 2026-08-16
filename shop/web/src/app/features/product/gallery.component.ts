import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { ImgFallbackDirective, placeholderDataUri } from '../../shared/img-fallback.directive';

/**
 * Product gallery: a thumbnail strip, a main frame with hover-pan zoom on
 * pointer devices, and a click-to-open lightbox for a proper look.
 */
@Component({
  selector: 'ob-gallery',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ImgFallbackDirective],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col-reverse gap-3 sm:flex-row">
      <!-- thumbnails -->
      @if (images().length > 1) {
        <div
          class="ob-noscroll flex shrink-0 gap-2 overflow-x-auto sm:max-h-[30rem] sm:flex-col sm:overflow-x-visible sm:overflow-y-auto"
        >
          @for (image of images(); track image; let i = $index) {
            <button
              type="button"
              class="ob-media size-16 shrink-0 rounded-lg border-2 transition sm:size-[4.5rem]"
              [class]="i === index() ? 'border-brand' : 'border-line hover:border-muted'"
              [attr.aria-label]="'View image ' + (i + 1) + ' of ' + images().length"
              [attr.aria-current]="i === index()"
              (click)="index.set(i)"
              (mouseenter)="index.set(i)"
            >
              <img [src]="image" [alt]="alt() + ' — view ' + (i + 1)" [obImgFallback]="alt()" />
            </button>
          }
        </div>
      }

      <!-- main frame -->
      <div class="min-w-0 flex-1">
        <div
          class="ob-media group aspect-square w-full cursor-zoom-in rounded-2xl border border-line bg-surface"
          (mousemove)="onMove($event)"
          (mouseleave)="zooming.set(false)"
          (mouseenter)="zooming.set(true)"
          (click)="lightbox.set(true)"
          (keydown.enter)="lightbox.set(true)"
          tabindex="0"
          role="button"
          [attr.aria-label]="'Enlarge image of ' + alt()"
        >
          <img
            [src]="current()"
            [alt]="alt()"
            [obImgFallback]="alt()"
            [eager]="true"
            class="transition-transform duration-200 ease-out"
            [style.transform]="zooming() ? 'scale(2)' : 'scale(1)'"
            [style.transform-origin]="origin()"
          />
          <span
            class="pointer-events-none absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 backdrop-blur transition group-hover:opacity-100"
          >
            <ob-icon name="search" [size]="12" />
            Hover to zoom · click to enlarge
          </span>
        </div>

        @if (images().length > 1) {
          <p class="mt-2 text-center text-xs text-muted sm:hidden">
            {{ index() + 1 }} / {{ images().length }}
          </p>
        }
      </div>
    </div>

    <!-- lightbox -->
    @if (lightbox()) {
      <div
        class="ob-anim-fade-in fixed inset-0 z-[90] flex flex-col bg-ink/95 p-4 backdrop-blur"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="alt()"
        (keydown.escape)="lightbox.set(false)"
      >
        <div class="flex items-center justify-between text-white">
          <p class="ob-clamp-1 text-sm font-semibold">{{ alt() }}</p>
          <button
            type="button"
            class="grid size-10 place-items-center rounded-lg transition hover:bg-white/10"
            aria-label="Close image viewer"
            (click)="lightbox.set(false)"
          >
            <ob-icon name="x" [size]="22" />
          </button>
        </div>

        <div class="relative flex min-h-0 flex-1 items-center justify-center py-4">
          <img
            [src]="current()"
            [alt]="alt()"
            [obImgFallback]="alt()"
            class="max-h-full max-w-full rounded-xl object-contain"
          />
          @if (images().length > 1) {
            <button
              type="button"
              class="absolute left-0 grid size-11 place-items-center rounded-full border border-white/20 bg-ink/60 text-white transition hover:bg-ink"
              aria-label="Previous image"
              (click)="step(-1)"
            >
              <ob-icon name="chevron-left" [size]="22" />
            </button>
            <button
              type="button"
              class="absolute right-0 grid size-11 place-items-center rounded-full border border-white/20 bg-ink/60 text-white transition hover:bg-ink"
              aria-label="Next image"
              (click)="step(1)"
            >
              <ob-icon name="chevron-right" [size]="22" />
            </button>
          }
        </div>

        <div class="flex justify-center gap-2">
          @for (image of images(); track image; let i = $index) {
            <button
              type="button"
              class="ob-media size-14 rounded-lg border-2 transition"
              [class]="i === index() ? 'border-accent' : 'border-white/20'"
              [attr.aria-label]="'View image ' + (i + 1)"
              (click)="index.set(i)"
            >
              <img [src]="image" [alt]="alt() + ' — view ' + (i + 1)" [obImgFallback]="alt()" />
            </button>
          }
        </div>
      </div>
    }
  `,
})
export class GalleryComponent {
  readonly images = input.required<string[]>();
  readonly alt = input.required<string>();

  protected readonly index = signal(0);
  protected readonly zooming = signal(false);
  protected readonly lightbox = signal(false);
  protected readonly origin = signal('50% 50%');

  constructor() {
    // Navigating between products reuses this component instance.
    effect(() => {
      this.images();
      this.index.set(0);
      this.lightbox.set(false);
    });
  }

  protected readonly current = computed(
    () => this.images()[this.index()] ?? placeholderDataUri(this.alt()),
  );

  protected onMove(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    this.origin.set(`${x}% ${y}%`);
  }

  protected step(delta: number): void {
    const count = this.images().length;
    if (count === 0) return;
    this.index.update((i) => (i + delta + count) % count);
  }
}
