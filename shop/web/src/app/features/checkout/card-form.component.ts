import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { CardBrandComponent } from './card-brand.component';
import {
  CardDraft,
  CardFieldErrors,
  TEST_CARDS,
  cvvLength,
  detectBrand,
  formatExpiry,
  formatPan,
  normalisePan,
  panMaxLength,
  validateCard,
} from './card';

/**
 * Card entry with live formatting, a brand mark that appears as the IIN is
 * recognised, and Luhn + expiry + CVV validation before anything is submitted.
 *
 * The collapsible test-cards panel is deliberate: this is a demonstration
 * store, and the scripted PANs from CONTRACT §7 are useless if nobody can
 * find them.
 */
@Component({
  selector: 'ob-card-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, CardBrandComponent],
  host: { class: 'block' },
  template: `
    <div class="space-y-4">
      <!-- number -->
      <label class="block">
        <span class="ob-label">Card number</span>
        <span class="relative block">
          <input
            class="ob-input pr-16 font-mono tracking-wider"
            inputmode="numeric"
            autocomplete="cc-number"
            placeholder="4242 4242 4242 4242"
            [attr.maxlength]="brand() === 'Amex' ? 17 : 23"
            [value]="draft().number"
            [attr.aria-invalid]="shownError('number') ? 'true' : null"
            (input)="onNumber($event)"
            (blur)="touch('number')"
          />
          <span class="absolute top-1/2 right-3 -translate-y-1/2">
            <ob-card-brand [brand]="brand()" [width]="36" />
          </span>
        </span>
        @if (shownError('number'); as message) {
          <span class="ob-field-error">{{ message }}</span>
        }
      </label>

      <!-- holder -->
      <label class="block">
        <span class="ob-label">Name on card</span>
        <input
          class="ob-input uppercase"
          autocomplete="cc-name"
          placeholder="OMAR HASSAN"
          [value]="draft().holder"
          [attr.aria-invalid]="shownError('holder') ? 'true' : null"
          (input)="patch({ holder: $any($event.target).value })"
          (blur)="touch('holder')"
        />
        @if (shownError('holder'); as message) {
          <span class="ob-field-error">{{ message }}</span>
        }
      </label>

      <div class="grid grid-cols-2 gap-4">
        <!-- expiry -->
        <label class="block">
          <span class="ob-label">Expires</span>
          <input
            class="ob-input font-mono"
            inputmode="numeric"
            autocomplete="cc-exp"
            placeholder="MM/YY"
            maxlength="5"
            [value]="draft().expiry"
            [attr.aria-invalid]="shownError('expiry') ? 'true' : null"
            (input)="onExpiry($event)"
            (blur)="touch('expiry')"
          />
          @if (shownError('expiry'); as message) {
            <span class="ob-field-error">{{ message }}</span>
          }
        </label>

        <!-- cvv -->
        <label class="block">
          <span class="ob-label">
            Security code
            <span class="font-normal text-muted">({{ cvvDigits() }} digits)</span>
          </span>
          <span class="relative block">
            <input
              class="ob-input pr-10 font-mono"
              inputmode="numeric"
              autocomplete="cc-csc"
              [attr.maxlength]="cvvDigits()"
              [attr.placeholder]="cvvDigits() === 4 ? '••••' : '•••'"
              [value]="draft().cvv"
              [attr.aria-invalid]="shownError('cvv') ? 'true' : null"
              (input)="onCvv($event)"
              (blur)="touch('cvv')"
            />
            <ob-icon
              name="lock"
              [size]="15"
              class="absolute top-1/2 right-3 -translate-y-1/2 text-muted"
            />
          </span>
          @if (shownError('cvv'); as message) {
            <span class="ob-field-error">{{ message }}</span>
          }
        </label>
      </div>

      <p class="flex items-start gap-2 text-xs leading-relaxed text-muted">
        <ob-icon name="shield" [size]="14" class="mt-px shrink-0 text-teal" />
        This is a simulated processor. Card numbers are never stored — only the brand and the last
        four digits are kept against the order.
      </p>

      <!-- ============================================== test cards panel -->
      <div class="overflow-hidden rounded-xl border border-dashed border-brand/40 bg-brand-soft/40">
        <button
          type="button"
          class="flex w-full items-center gap-2 px-4 py-3 text-left text-xs font-bold text-brand-dark"
          [attr.aria-expanded]="showTestCards()"
          (click)="showTestCards.set(!showTestCards())"
        >
          <ob-icon name="info" [size]="15" />
          <span class="flex-1">Test cards — which number triggers which outcome</span>
          <ob-icon [name]="showTestCards() ? 'chevron-up' : 'chevron-down'" [size]="15" />
        </button>

        @if (showTestCards()) {
          <div class="ob-anim-fade-in border-t border-brand/20 px-4 py-3">
            <p class="mb-3 text-xs leading-relaxed text-muted">
              Any expiry in the future and any correct-length CVV will do. Any other Luhn-valid
              number is approved.
            </p>
            <ul class="space-y-1.5">
              @for (card of testCards; track card.number) {
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 rounded-lg bg-surface px-3 py-2 text-left transition hover:ring-2 hover:ring-brand/40"
                    (click)="useTestCard(card.number)"
                  >
                    <code class="font-mono text-xs font-bold tracking-wide">{{ card.number }}</code>
                    <span class="ml-auto text-[11px] font-semibold" [class]="toneClass(card.tone)">
                      {{ card.outcome }}
                    </span>
                    <ob-icon name="arrow-right" [size]="13" class="text-muted" />
                  </button>
                </li>
              }
            </ul>
            <p class="mt-2.5 text-[11px] text-muted">Tap a row to fill the form with it.</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class CardFormComponent {
  /**
   * The draft lives in the parent, because this component is destroyed when
   * the shopper moves from the Payment step to the Review step — the entered
   * card would otherwise be lost exactly when it is needed.
   */
  readonly initial = input<CardDraft | null>(null);
  /** Set by the parent after a server-side `CARD_INVALID`, to reveal everything. */
  readonly showErrors = input(false);

  /** Emits on every change so the parent can enable/disable "Pay". */
  readonly changed = output<{ draft: CardDraft; valid: boolean }>();

  protected readonly testCards = TEST_CARDS;
  protected readonly showTestCards = signal(false);

  protected readonly draft = signal<CardDraft>({ number: '', expiry: '', cvv: '', holder: '' });
  private readonly touched = signal<ReadonlySet<keyof CardDraft>>(new Set());

  constructor() {
    // Restore whatever the parent is holding. Once running, `initial` is the
    // very object this component last emitted, so `set` is a no-op and there
    // is no feedback loop.
    effect(() => {
      const restore = this.initial();
      if (restore) untracked(() => this.draft.set(restore));
    });
  }

  protected readonly brand = computed(() => detectBrand(normalisePan(this.draft().number)));
  protected readonly cvvDigits = computed(() => cvvLength(this.brand()));

  protected readonly errors = computed<CardFieldErrors>(() => validateCard(this.draft()));
  protected readonly valid = computed(() => Object.keys(this.errors()).length === 0);

  protected shownError(field: keyof CardDraft): string | null {
    if (!this.showErrors() && !this.touched().has(field)) return null;
    return this.errors()[field] ?? null;
  }

  protected touch(field: keyof CardDraft): void {
    this.touched.update((set) => new Set(set).add(field));
  }

  protected onNumber(event: Event): void {
    const input = event.target as HTMLInputElement;
    const formatted = formatPan(input.value);
    input.value = formatted;
    this.patch({ number: formatted });
    // Auto-advance feel: once the PAN is full, the CVV length may change.
    if (normalisePan(formatted).length >= panMaxLength(this.brand())) this.touch('number');
  }

  protected onExpiry(event: Event): void {
    const input = event.target as HTMLInputElement;
    const formatted = formatExpiry(input.value);
    input.value = formatted;
    this.patch({ expiry: formatted });
  }

  protected onCvv(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, this.cvvDigits());
    input.value = digits;
    this.patch({ cvv: digits });
  }

  protected useTestCard(number: string): void {
    this.patch({
      number,
      expiry: this.draft().expiry || defaultExpiry(),
      cvv: this.draft().cvv || '123',
      holder: this.draft().holder || 'OMAR HASSAN',
    });
    this.showTestCards.set(false);
  }

  protected toneClass(tone: 'good' | 'bad' | 'warn'): string {
    return { good: 'text-teal', bad: 'text-pop', warn: 'text-warn' }[tone];
  }

  protected patch(partial: Partial<CardDraft>): void {
    this.draft.update((current) => ({ ...current, ...partial }));
    this.changed.emit({ draft: this.draft(), valid: this.valid() });
  }
}

/** Two years out, which is always in the future and always valid. */
function defaultExpiry(): string {
  const date = new Date();
  const year = (date.getFullYear() + 2) % 100;
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(year).padStart(2, '0')}`;
}
