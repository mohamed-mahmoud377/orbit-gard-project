import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { ApiError } from '../core/api-error';
import { Address, AddressInput } from '../core/models';
import { ToastService } from '../core/toast.service';
import { IconComponent } from './icon.component';

/** The 27 Egyptian governorates, as the API's `governorate` free-text field. */
export const GOVERNORATES = [
  'Cairo',
  'Giza',
  'Alexandria',
  'Qalyubia',
  'Port Said',
  'Suez',
  'Dakahlia',
  'Sharqia',
  'Gharbia',
  'Monufia',
  'Beheira',
  'Kafr El Sheikh',
  'Damietta',
  'Ismailia',
  'Faiyum',
  'Beni Suef',
  'Minya',
  'Asyut',
  'Sohag',
  'Qena',
  'Luxor',
  'Aswan',
  'Red Sea',
  'New Valley',
  'Matrouh',
  'North Sinai',
  'South Sinai',
];

/**
 * Create/edit form for a delivery address. Server-side validation errors from
 * CONTRACT §5 (`details.fieldErrors`) are bound straight onto the fields — the
 * phone rule in particular is stricter than anything worth duplicating here.
 */
@Component({
  selector: 'ob-address-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IconComponent],
  host: { class: 'block' },
  template: `
    <form (ngSubmit)="submit()" novalidate>
      @if (error()) {
        <p
          class="mb-4 flex items-start gap-2 rounded-xl bg-pop-soft p-3 text-sm font-semibold text-pop"
          role="alert"
        >
          <ob-icon name="alert-circle" [size]="17" class="mt-px shrink-0" />
          {{ error() }}
        </p>
      }

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block sm:col-span-2">
          <span class="ob-label">Recipient's full name</span>
          <input
            class="ob-input"
            name="fullName"
            autocomplete="name"
            required
            [(ngModel)]="model.fullName"
            [attr.aria-invalid]="err('fullName') ? 'true' : null"
          />
          @if (err('fullName'); as message) {
            <span class="ob-field-error">{{ message }}</span>
          }
        </label>

        <label class="block">
          <span class="ob-label">Mobile number</span>
          <input
            class="ob-input"
            name="phone"
            inputmode="tel"
            autocomplete="tel"
            placeholder="01xxxxxxxxx"
            required
            [(ngModel)]="model.phone"
            [attr.aria-invalid]="err('phone') ? 'true' : null"
          />
          @if (err('phone'); as message) {
            <span class="ob-field-error">{{ message }}</span>
          } @else {
            <span class="mt-1 block text-xs text-muted">Egyptian mobile, e.g. 01012345678</span>
          }
        </label>

        <label class="block">
          <span class="ob-label">Label <span class="font-normal text-muted">(optional)</span></span>
          <input
            class="ob-input"
            name="label"
            placeholder="Home, Work…"
            maxlength="40"
            [(ngModel)]="model.label"
          />
        </label>

        <label class="block sm:col-span-2">
          <span class="ob-label">Street address</span>
          <input
            class="ob-input"
            name="line1"
            autocomplete="address-line1"
            placeholder="Building number, street name"
            required
            [(ngModel)]="model.line1"
            [attr.aria-invalid]="err('line1') ? 'true' : null"
          />
          @if (err('line1'); as message) {
            <span class="ob-field-error">{{ message }}</span>
          }
        </label>

        <label class="block sm:col-span-2">
          <span class="ob-label">
            Apartment, floor, landmark <span class="font-normal text-muted">(optional)</span>
          </span>
          <input
            class="ob-input"
            name="line2"
            autocomplete="address-line2"
            [(ngModel)]="model.line2"
          />
        </label>

        <label class="block">
          <span class="ob-label">City / district</span>
          <input
            class="ob-input"
            name="city"
            autocomplete="address-level2"
            required
            [(ngModel)]="model.city"
            [attr.aria-invalid]="err('city') ? 'true' : null"
          />
          @if (err('city'); as message) {
            <span class="ob-field-error">{{ message }}</span>
          }
        </label>

        <label class="block">
          <span class="ob-label">Governorate</span>
          <span class="relative block">
            <select
              class="ob-input cursor-pointer appearance-none pr-9"
              name="governorate"
              required
              [(ngModel)]="model.governorate"
              [attr.aria-invalid]="err('governorate') ? 'true' : null"
            >
              <option value="" disabled>Choose a governorate</option>
              @for (governorate of governorates; track governorate) {
                <option [value]="governorate">{{ governorate }}</option>
              }
            </select>
            <ob-icon
              name="chevron-down"
              [size]="15"
              class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
            />
          </span>
          @if (err('governorate'); as message) {
            <span class="ob-field-error">{{ message }}</span>
          }
        </label>

        <label class="block">
          <span class="ob-label">
            Postal code <span class="font-normal text-muted">(optional)</span>
          </span>
          <input
            class="ob-input"
            name="postalCode"
            autocomplete="postal-code"
            [(ngModel)]="model.postalCode"
          />
        </label>
      </div>

      <label class="mt-4 flex cursor-pointer items-center gap-2.5">
        <input type="checkbox" class="size-4" name="isDefault" [(ngModel)]="model.isDefault" />
        <span class="text-sm">Make this my default delivery address</span>
      </label>

      <div class="mt-5 flex flex-wrap gap-2">
        <button type="submit" class="ob-btn ob-btn-brand" [disabled]="busy()">
          @if (busy()) {
            <ob-icon name="loader" [size]="16" class="ob-spin" /> Saving…
          } @else {
            {{ existing() ? 'Save changes' : 'Save address' }}
          }
        </button>
        <button type="button" class="ob-btn ob-btn-ghost" (click)="cancelled.emit()">Cancel</button>
      </div>
    </form>
  `,
})
export class AddressFormComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly existing = input<Address | null>(null);

  readonly saved = output<Address>();
  readonly cancelled = output<void>();

  protected readonly governorates = GOVERNORATES;
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly fieldErrors = signal<Record<string, string>>({});

  protected model: AddressInput = {
    fullName: '',
    phone: '',
    label: '',
    line1: '',
    line2: '',
    city: '',
    governorate: '',
    postalCode: '',
    isDefault: false,
  };

  constructor() {
    // `existing` is only read once, when the form is opened for an edit.
    queueMicrotask(() => {
      const address = this.existing();
      if (!address) return;
      this.model = {
        fullName: address.fullName,
        phone: address.phone,
        label: address.label ?? '',
        line1: address.line1,
        line2: address.line2 ?? '',
        city: address.city,
        governorate: address.governorate,
        postalCode: address.postalCode ?? '',
        isDefault: address.isDefault,
      };
    });
  }

  protected err(field: string): string | null {
    return this.fieldErrors()[field] ?? null;
  }

  protected submit(): void {
    this.error.set('');
    this.fieldErrors.set({});
    this.busy.set(true);

    const payload: AddressInput = {
      ...this.model,
      label: this.model.label?.trim() || undefined,
      line2: this.model.line2?.trim() || undefined,
      postalCode: this.model.postalCode?.trim() || undefined,
    };

    const existing = this.existing();
    const request = existing
      ? this.api.updateAddress(existing.id, payload)
      : this.api.createAddress(payload);

    request.subscribe({
      next: (res) => {
        this.busy.set(false);
        this.toast.success(existing ? 'Address updated' : 'Address saved');
        this.saved.emit(res.address);
      },
      error: (err: ApiError) => {
        this.busy.set(false);
        this.error.set(err.message);
        this.fieldErrors.set(err.fieldErrors);
      },
    });
  }
}
