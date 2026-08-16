import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { ApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { ReviewsResponse } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { IconComponent } from '../../shared/icon.component';
import { SkeletonComponent } from '../../shared/skeleton.component';
import { StarRatingComponent } from '../../shared/star-rating.component';

/**
 * Review histogram, review list and the write-a-review form.
 *
 * The API allows one review per user per product and answers 409
 * `REVIEW_EXISTS` on a second attempt, which is surfaced inline rather than as
 * a generic failure.
 */
@Component({
  selector: 'ob-reviews-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    EmptyStateComponent,
    IconComponent,
    SkeletonComponent,
    StarRatingComponent,
  ],
  host: { class: 'block' },
  template: `
    <div class="grid gap-8 lg:grid-cols-[19rem_1fr]">
      <!-- ===================================================== histogram -->
      <div>
        @if (loading()) {
          <div class="ob-skeleton h-56 rounded-xl"></div>
        } @else if (data(); as reviews) {
          <div class="ob-panel p-5">
            <div class="flex items-baseline gap-2">
              <span class="text-4xl font-extrabold tracking-tight">{{
                displayAverage().toFixed(1)
              }}</span>
              <span class="text-sm text-muted">out of 5</span>
            </div>
            <ob-star-rating [rating]="displayAverage()" [size]="18" class="mt-1" />
            <p class="mt-1.5 text-xs text-muted">
              {{ reviews.total }} written {{ reviews.total === 1 ? 'review' : 'reviews' }}
              @if (catalogCount() > reviews.total) {
                · {{ catalogCount() }} ratings overall
              }
            </p>

            <ul class="mt-4 space-y-1.5">
              @for (bucket of histogram(); track bucket.stars) {
                <li class="flex items-center gap-2 text-xs">
                  <span class="w-10 shrink-0 font-semibold">{{ bucket.stars }} star</span>
                  <span class="h-2 flex-1 overflow-hidden rounded-full bg-line">
                    <span
                      class="block h-full rounded-full bg-accent transition-[width] duration-500"
                      [style.width.%]="bucket.percent"
                    ></span>
                  </span>
                  <span class="w-8 shrink-0 text-right text-muted">{{ bucket.count }}</span>
                </li>
              }
            </ul>
          </div>

          <!-- ================================================ write form -->
          <div class="ob-panel mt-4 p-5">
            <h3 class="text-sm font-bold">Review this product</h3>

            @if (!auth.isAuthenticated()) {
              <p class="mt-2 text-xs leading-relaxed text-muted">
                You need an account to leave a review.
              </p>
              <a routerLink="/login" [queryParams]="{ returnUrl: '/p/' + slug() }" class="ob-btn ob-btn-ghost ob-btn-sm mt-3 w-full"
                >Sign in to review</a
              >
            } @else if (submitted()) {
              <p
                class="mt-3 flex items-start gap-2 rounded-lg bg-teal-soft p-3 text-xs leading-relaxed text-teal"
              >
                <ob-icon name="check-circle" [size]="15" class="mt-px shrink-0" />
                Thanks — your review is live.
              </p>
            } @else {
              <form class="mt-3 space-y-3" (submit)="submit($event)">
                <fieldset>
                  <legend class="ob-label">Your rating</legend>
                  <div class="flex gap-1">
                    @for (star of [1, 2, 3, 4, 5]; track star) {
                      <button
                        type="button"
                        class="rounded p-0.5 transition hover:scale-110"
                        [class]="star <= draftRating() ? 'text-accent' : 'text-line'"
                        [attr.aria-label]="star + ' star' + (star === 1 ? '' : 's')"
                        [attr.aria-pressed]="star === draftRating()"
                        (click)="draftRating.set(star)"
                      >
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <svg:path
                            d="m12 2.6 2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.44 6.19 20.5l1.11-6.47L2.6 9.45l6.5-.95z"
                          />
                        </svg>
                      </button>
                    }
                  </div>
                </fieldset>

                <label class="block">
                  <span class="ob-label">Headline</span>
                  <input
                    class="ob-input"
                    name="title"
                    maxlength="120"
                    placeholder="Sum it up in a few words"
                    [value]="draftTitle()"
                    (input)="draftTitle.set($any($event.target).value)"
                  />
                </label>

                <label class="block">
                  <span class="ob-label">Your review</span>
                  <textarea
                    class="ob-input min-h-24 resize-y"
                    name="body"
                    maxlength="4000"
                    placeholder="What did you like, or not?"
                    [value]="draftBody()"
                    (input)="draftBody.set($any($event.target).value)"
                  ></textarea>
                </label>

                @if (formError()) {
                  <p class="ob-field-error" role="alert">{{ formError() }}</p>
                }

                <button type="submit" class="ob-btn ob-btn-brand w-full" [disabled]="saving()">
                  @if (saving()) {
                    <ob-icon name="loader" [size]="15" class="ob-spin" /> Posting…
                  } @else {
                    Post review
                  }
                </button>
              </form>
            }
          </div>
        }
      </div>

      <!-- ========================================================= list -->
      <div>
        @if (loading()) {
          <div class="space-y-5">
            @for (i of [0, 1, 2]; track i) {
              <div class="ob-panel p-5">
                <ob-skeleton variant="lines" [count]="4" />
              </div>
            }
          </div>
        } @else if (data(); as reviews) {
          @if (reviews.items.length === 0) {
            <ob-empty-state
              art="search"
              title="No written reviews yet"
              message="This product has star ratings but nobody has written it up. Be the first."
            />
          } @else {
            <ul class="space-y-4">
              @for (review of reviews.items; track review.id) {
                <li class="ob-panel p-5">
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span
                      class="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-extrabold text-brand"
                      >{{ initials(review.author) }}</span
                    >
                    <span class="text-sm font-bold">{{ review.author }}</span>
                    <span class="text-xs text-muted">{{ review.createdAt | date: 'mediumDate' }}</span>
                  </div>
                  <div class="mt-2 flex items-center gap-2">
                    <ob-star-rating [rating]="review.rating" [size]="14" />
                    @if (review.title) {
                      <span class="text-sm font-bold">{{ review.title }}</span>
                    }
                  </div>
                  @if (review.body) {
                    <p class="mt-2 text-sm leading-relaxed whitespace-pre-line text-body/90">
                      {{ review.body }}
                    </p>
                  }
                </li>
              }
            </ul>

            @if (reviews.total > reviews.items.length) {
              <button
                type="button"
                class="ob-btn ob-btn-ghost mt-5 w-full"
                [disabled]="loadingMore()"
                (click)="loadMore()"
              >
                @if (loadingMore()) {
                  <ob-icon name="loader" [size]="15" class="ob-spin" /> Loading…
                } @else {
                  Show more reviews ({{ reviews.total - reviews.items.length }} left)
                }
              </button>
            }
          }
        }
      </div>
    </div>
  `,
})
export class ReviewsPanelComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);

  readonly slug = input.required<string>();
  /** The denormalised rating on `products`, which includes seeded ratings. */
  readonly catalogRating = input.required<number>();
  readonly catalogCount = input.required<number>();

  protected readonly data = signal<ReviewsResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly formError = signal('');

  protected readonly draftRating = signal(5);
  protected readonly draftTitle = signal('');
  protected readonly draftBody = signal('');

  private page = 1;

  constructor() {
    // Required inputs are not readable from the constructor (NG0950), and the
    // panel is reused when the router swaps products, so the fetch is keyed on
    // the slug rather than run once at construction.
    effect(() => {
      const slug = this.slug();
      untracked(() => {
        this.page = 1;
        this.submitted.set(false);
        this.load(slug);
      });
    });
  }

  /** Written reviews are sparse in the seed, so fall back to the catalog figure. */
  protected readonly displayAverage = computed(() => {
    const reviews = this.data();
    return reviews && reviews.total > 0 ? reviews.summary.average : this.catalogRating();
  });

  protected readonly histogram = computed(() => {
    const counts = this.data()?.summary.counts ?? {};
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    return [5, 4, 3, 2, 1].map((stars) => {
      const count = counts[String(stars)] ?? 0;
      return { stars, count, percent: total === 0 ? 0 : (count / total) * 100 };
    });
  });

  protected initials(name: string): string {
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('') || '?'
    );
  }

  protected loadMore(): void {
    this.loadingMore.set(true);
    this.page += 1;
    this.api.reviews(this.slug(), this.page, 10).subscribe({
      next: (res) => {
        this.data.update((current) =>
          current ? { ...res, items: [...current.items, ...res.items] } : res,
        );
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.formError.set('');
    this.saving.set(true);

    this.api
      .createReview(this.slug(), {
        rating: this.draftRating(),
        title: this.draftTitle().trim() || undefined,
        body: this.draftBody().trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.submitted.set(true);
          this.toast.success('Review posted', 'Thanks for helping other shoppers.');
          this.page = 1;
          this.load(this.slug());
        },
        error: (err: ApiError) => {
          this.saving.set(false);
          this.formError.set(err.message);
        },
      });
  }

  private load(slug: string): void {
    this.loading.set(true);
    this.api.reviews(slug, 1, 10).subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
