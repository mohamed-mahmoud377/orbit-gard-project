import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../core/api.service';
import { CatalogStore } from '../core/catalog.store';
import { ProductCard } from '../core/models';
import { IconComponent } from '../shared/icon.component';
import { ImgFallbackDirective } from '../shared/img-fallback.directive';
import { MoneyPipe } from '../shared/money.pipe';
import { primaryImage } from '../shared/product-utils';

/**
 * The store search field: a category scope on the left, a debounced suggestion
 * dropdown with thumbnails, and full keyboard navigation.
 *
 * Suggestions hit `/products?q=&pageSize=6` (CONTRACT §6); submitting goes to
 * `/search` so the result is a shareable URL.
 */
@Component({
  selector: 'ob-search-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, ImgFallbackDirective, MoneyPipe],
  host: { class: 'block' },
  template: `
    <div class="relative">
      <form
        role="search"
        class="flex items-stretch overflow-hidden rounded-xl bg-surface shadow-sm ring-1 ring-transparent transition focus-within:ring-2 focus-within:ring-accent"
        (submit)="submit($event)"
      >
        <!-- category scope -->
        <label class="relative hidden shrink-0 items-center sm:flex">
          <span class="sr-only">Search in category</span>
          <select
            class="ob-noscroll h-full max-w-[9.5rem] cursor-pointer appearance-none border-r border-line bg-line-soft py-2.5 pr-7 pl-3 text-xs font-semibold text-body outline-none"
            [value]="scope()"
            (change)="onScope($event)"
          >
            <option value="">All departments</option>
            @for (category of catalog.categories(); track category.slug) {
              <option [value]="category.slug">{{ category.name }}</option>
            }
          </select>
          <ob-icon
            name="chevron-down"
            [size]="14"
            class="pointer-events-none absolute right-2 text-muted"
          />
        </label>

        <input
          #field
          type="search"
          name="q"
          autocomplete="off"
          class="min-w-0 flex-1 bg-surface px-3.5 py-2.5 text-sm text-body outline-none placeholder:text-muted/70"
          [placeholder]="placeholder()"
          [value]="term()"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="ob-search-suggestions"
          [attr.aria-expanded]="open()"
          [attr.aria-activedescendant]="
            activeIndex() >= 0 ? 'ob-suggestion-' + activeIndex() : null
          "
          (input)="onInput($event)"
          (focus)="onFocus()"
          (keydown.arrowdown)="move($event, 1)"
          (keydown.arrowup)="move($event, -1)"
          (keydown.enter)="onEnter($event)"
          (keydown.escape)="close()"
        />

        <button
          type="submit"
          class="grid shrink-0 place-items-center bg-accent px-4 text-[#3a2200] transition hover:bg-[#ffb347]"
          aria-label="Search"
        >
          <ob-icon name="search" [size]="19" [strokeWidth]="2.1" />
        </button>
      </form>

      <!-- suggestions -->
      @if (open()) {
        <div
          class="ob-anim-fade-in absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)]"
        >
          @if (loading()) {
            <div class="space-y-3 p-3">
              @for (i of [0, 1, 2, 3]; track i) {
                <div class="flex items-center gap-3">
                  <div class="ob-skeleton size-11 rounded-lg"></div>
                  <div class="flex-1 space-y-1.5">
                    <div class="ob-skeleton h-3 w-3/4 rounded"></div>
                    <div class="ob-skeleton h-3 w-1/4 rounded"></div>
                  </div>
                </div>
              }
            </div>
          } @else if (results().length === 0) {
            <p class="px-4 py-6 text-center text-sm text-muted">
              No matches for “{{ term() }}”. Try a broader term.
            </p>
          } @else {
            <ul id="ob-search-suggestions" role="listbox" class="max-h-[26rem] overflow-y-auto py-1">
              @for (product of results(); track product.id; let i = $index) {
                <li role="presentation">
                  <a
                    [id]="'ob-suggestion-' + i"
                    role="option"
                    [attr.aria-selected]="i === activeIndex()"
                    [routerLink]="['/p', product.slug]"
                    class="flex items-center gap-3 px-3 py-2 transition"
                    [class.bg-brand-soft]="i === activeIndex()"
                    (click)="close()"
                    (mouseenter)="activeIndex.set(i)"
                  >
                    <span class="ob-media size-11 shrink-0 rounded-lg border border-line">
                      <img [src]="image(product)" [alt]="product.name" [obImgFallback]="product.name" />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="ob-clamp-1 block text-sm font-semibold text-body">{{
                        product.name
                      }}</span>
                      <span class="block text-[11px] text-muted"
                        >{{ product.brand }} · {{ product.category.name }}</span
                      >
                    </span>
                    <span class="shrink-0 text-sm font-bold text-body">{{
                      product.priceCents | money: 'short'
                    }}</span>
                  </a>
                </li>
              }
            </ul>
            <button
              type="button"
              class="flex w-full items-center justify-center gap-1.5 border-t border-line bg-line-soft px-4 py-2.5 text-xs font-bold text-brand transition hover:bg-brand-soft"
              (click)="submit()"
            >
              See all results for “{{ term() }}”
              <ob-icon name="arrow-right" [size]="14" />
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class SearchBarComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly catalog = inject(CatalogStore);

  readonly placeholder = input('Search 500 products across 30 departments…');
  readonly navigated = output<void>();

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly typed = new Subject<string>();

  protected readonly term = signal('');
  protected readonly scope = signal('');
  protected readonly results = signal<ProductCard[]>([]);
  protected readonly loading = signal(false);
  protected readonly open = signal(false);
  protected readonly activeIndex = signal(-1);

  protected readonly image = primaryImage;

  constructor() {
    this.typed
      .pipe(
        debounceTime(220),
        distinctUntilChanged(),
        switchMap((q) => {
          if (q.trim().length < 2) {
            this.loading.set(false);
            return of(null);
          }
          return this.api
            .products({ q, pageSize: 6, category: this.scope() || undefined })
            .pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((res) => {
        this.loading.set(false);
        this.results.set(res?.items ?? []);
        this.activeIndex.set(-1);
        this.open.set(this.term().trim().length >= 2);
      });
  }

  /** Closes the dropdown when focus or a click leaves the search field. */
  close(): void {
    this.open.set(false);
    this.activeIndex.set(-1);
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.term.set(value);
    if (value.trim().length < 2) {
      this.results.set([]);
      this.open.set(false);
      return;
    }
    this.loading.set(true);
    this.open.set(true);
    this.typed.next(value);
  }

  protected onFocus(): void {
    if (this.results().length > 0) this.open.set(true);
  }

  protected onScope(event: Event): void {
    this.scope.set((event.target as HTMLSelectElement).value);
    if (this.term().trim().length >= 2) {
      this.loading.set(true);
      this.typed.next(this.term());
    }
  }

  protected move(event: Event, delta: number): void {
    if (!this.open() || this.results().length === 0) return;
    event.preventDefault();
    const count = this.results().length;
    this.activeIndex.update((i) => {
      const next = i + delta;
      if (next < 0) return count - 1;
      if (next >= count) return 0;
      return next;
    });
  }

  /** Any click landing outside the field dismisses the suggestion list. */
  @HostListener('document:pointerdown', ['$event'])
  protected onDocumentPointerDown(event: PointerEvent): void {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  protected onEnter(event: Event): void {
    const active = this.activeIndex();
    if (active >= 0 && this.results()[active]) {
      event.preventDefault();
      const product = this.results()[active];
      this.close();
      this.field()?.nativeElement.blur();
      void this.router.navigate(['/p', product.slug]);
      this.navigated.emit();
    }
  }

  protected submit(event?: Event): void {
    event?.preventDefault();
    const q = this.term().trim();
    if (!q) return;
    this.close();
    this.field()?.nativeElement.blur();
    void this.router.navigate(['/search'], {
      queryParams: { q, category: this.scope() || null },
    });
    this.navigated.emit();
  }
}
