import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HeroSlide } from '../../core/models';
import { AccentDirective } from '../../shared/accent.directive';
import { IconComponent } from '../../shared/icon.component';
import { ImgFallbackDirective } from '../../shared/img-fallback.directive';

const ROTATE_MS = 6500;

/**
 * Auto-rotating hero. Pauses on hover and on keyboard focus, and stops
 * entirely when the user takes manual control, which is the behaviour people
 * expect once they've clicked a dot.
 */
@Component({
  selector: 'ob-hero-carousel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AccentDirective, IconComponent, ImgFallbackDirective],
  host: { class: 'block' },
  template: `
    <section
      class="relative overflow-hidden rounded-2xl bg-ink"
      aria-roledescription="carousel"
      aria-label="Featured departments"
      (mouseenter)="paused.set(true)"
      (mouseleave)="paused.set(false)"
      (focusin)="paused.set(true)"
      (focusout)="paused.set(false)"
    >
      <div class="relative aspect-[16/10] sm:aspect-[21/9] lg:aspect-[2.6/1]">
        @for (slide of slides(); track slide.categorySlug; let i = $index) {
          <div
            class="absolute inset-0 transition-opacity duration-700 ease-out"
            [class.opacity-0]="i !== index()"
            [class.pointer-events-none]="i !== index()"
            [attr.aria-hidden]="i !== index()"
            role="group"
            aria-roledescription="slide"
            [attr.aria-label]="'Slide ' + (i + 1) + ' of ' + slides().length"
            [obAccent]="slide.accent"
          >
            @if (slide.image) {
              <img
                [src]="slide.image"
                [alt]="slide.title"
                [obImgFallback]="slide.title"
                [eager]="i === 0"
                class="absolute inset-0 size-full object-cover"
              />
            }
            <div
              class="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/25 sm:to-transparent"
            ></div>
            <div
              class="absolute inset-0 opacity-45 mix-blend-multiply"
              [style.background]="
                'linear-gradient(120deg, var(--cat-accent-dark) 0%, transparent 65%)'
              "
            ></div>

            <div class="ob-container relative flex h-full items-center">
              <div class="max-w-lg py-6 text-white">
                <span
                  class="ob-badge mb-3 gap-1.5 bg-white/15 px-2.5 py-1 text-[10px] text-white backdrop-blur"
                >
                  <ob-icon [name]="slide.icon" [size]="13" />
                  Featured department
                </span>
                <h2
                  class="text-2xl leading-[1.08] font-extrabold tracking-tight text-balance sm:text-4xl lg:text-5xl"
                >
                  {{ slide.title }}
                </h2>
                @if (slide.tagline) {
                  <p class="mt-3 max-w-md text-sm leading-relaxed text-white/75 sm:text-base">
                    {{ slide.tagline }}
                  </p>
                }
                <div class="mt-6 flex flex-wrap items-center gap-3">
                  <a [routerLink]="['/c', slide.categorySlug]" class="ob-btn ob-btn-primary ob-btn-lg">
                    Shop {{ slide.title }}
                    <ob-icon name="arrow-right" [size]="17" />
                  </a>
                  <a
                    routerLink="/search"
                    [queryParams]="{ category: slide.categorySlug, badge: 'DEAL' }"
                    class="ob-btn ob-btn-lg border border-white/25 bg-white/10 text-white backdrop-blur hover:bg-white/20"
                  >
                    See the deals
                  </a>
                </div>
              </div>
            </div>
          </div>
        }
      </div>

      <!-- arrows -->
      @if (slides().length > 1) {
        <button
          type="button"
          class="absolute top-1/2 left-3 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-ink/50 text-white backdrop-blur transition hover:bg-ink/80 sm:grid"
          aria-label="Previous slide"
          (click)="go(-1)"
        >
          <ob-icon name="chevron-left" [size]="20" />
        </button>
        <button
          type="button"
          class="absolute top-1/2 right-3 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-ink/50 text-white backdrop-blur transition hover:bg-ink/80 sm:grid"
          aria-label="Next slide"
          (click)="go(1)"
        >
          <ob-icon name="chevron-right" [size]="20" />
        </button>

        <!-- dots -->
        <div class="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2">
          @for (slide of slides(); track slide.categorySlug; let i = $index) {
            <button
              type="button"
              class="h-1.5 rounded-full transition-all duration-300"
              [class]="i === index() ? 'w-7 bg-accent' : 'w-3 bg-white/40 hover:bg-white/70'"
              [attr.aria-label]="'Go to slide ' + (i + 1) + ': ' + slide.title"
              [attr.aria-current]="i === index()"
              (click)="select(i)"
            ></button>
          }
        </div>
      }
    </section>
  `,
})
export class HeroCarouselComponent {
  readonly slides = input.required<HeroSlide[]>();

  protected readonly index = signal(0);
  protected readonly paused = signal(false);
  private readonly manual = signal(false);

  private readonly autoplay = computed(() => !this.paused() && !this.manual());

  constructor() {
    const timer = setInterval(() => {
      if (this.autoplay() && this.slides().length > 1) this.advance(1);
    }, ROTATE_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected go(delta: 1 | -1): void {
    this.manual.set(true);
    this.advance(delta);
  }

  protected select(index: number): void {
    this.manual.set(true);
    this.index.set(index);
  }

  private advance(delta: number): void {
    const count = this.slides().length;
    if (count === 0) return;
    this.index.update((i) => (i + delta + count) % count);
  }
}
