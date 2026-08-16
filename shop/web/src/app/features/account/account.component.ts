import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { ApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { CartService } from '../../core/cart.service';
import { Address } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { WishlistService } from '../../core/wishlist.service';
import { AddressFormComponent } from '../../shared/address-form.component';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'ob-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    FormsModule,
    AddressFormComponent,
    IconComponent,
  ],
  host: { class: 'block' },
  template: `
    <div class="ob-container py-6">
      <h1 class="mb-1 text-2xl font-extrabold tracking-tight">Your account</h1>
      <p class="mb-6 text-sm text-muted">Manage your details, addresses and security.</p>

      <div class="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <!-- ==================================================== profile -->
        <aside class="space-y-5">
          <div class="ob-panel p-5 text-center">
            <span
              class="mx-auto grid size-16 place-items-center rounded-full bg-brand text-xl font-extrabold text-white"
              >{{ auth.initials() }}</span
            >
            <p class="mt-3 text-base font-bold">{{ auth.user()?.name }}</p>
            <p class="text-sm text-muted">{{ auth.user()?.email }}</p>
            @if (auth.user()?.createdAt; as created) {
              <p class="mt-1 text-xs text-muted">
                Member since {{ created | date: 'MMMM y' }}
              </p>
            }
          </div>

          <nav class="ob-panel divide-y divide-line overflow-hidden">
            @for (link of links; track link.path) {
              <a
                [routerLink]="link.path"
                class="flex items-center gap-3 px-4 py-3 text-sm font-medium transition hover:bg-line-soft"
              >
                <ob-icon [name]="link.icon" [size]="17" class="text-brand" />
                <span class="flex-1">{{ link.label }}</span>
                <span class="text-xs font-bold text-muted">{{ link.count() }}</span>
                <ob-icon name="chevron-right" [size]="15" class="text-muted" />
              </a>
            }
          </nav>

          <button type="button" class="ob-btn ob-btn-ghost w-full" (click)="signOut()">
            <ob-icon name="log-out" [size]="16" /> Sign out
          </button>
        </aside>

        <div class="space-y-5">
          <!-- ================================================ addresses -->
          <section class="ob-panel p-5">
            <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 class="text-base font-bold">Delivery addresses</h2>
              @if (!formOpen()) {
                <button type="button" class="ob-btn ob-btn-ghost ob-btn-sm" (click)="openNew()">
                  <ob-icon name="plus" [size]="15" /> Add address
                </button>
              }
            </div>

            @if (formOpen()) {
              <div class="rounded-xl border border-brand/30 bg-brand-soft/40 p-4">
                <h3 class="mb-4 text-sm font-bold">
                  {{ editing() ? 'Edit address' : 'New delivery address' }}
                </h3>
                <ob-address-form
                  [existing]="editing()"
                  (saved)="onSaved()"
                  (cancelled)="closeForm()"
                />
              </div>
            } @else if (loading()) {
              <div class="space-y-3">
                @for (i of [0, 1]; track i) {
                  <div class="ob-skeleton h-28 rounded-xl"></div>
                }
              </div>
            } @else if (addresses().length === 0) {
              <p class="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
                No addresses saved yet. Add one to speed up checkout.
              </p>
            } @else {
              <ul class="grid gap-3 sm:grid-cols-2">
                @for (address of addresses(); track address.id) {
                  <li
                    class="rounded-xl border p-4"
                    [class]="address.isDefault ? 'border-brand bg-brand-soft/40' : 'border-line'"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <p class="text-sm font-bold">
                        {{ address.label || address.fullName }}
                      </p>
                      @if (address.isDefault) {
                        <span class="ob-badge bg-brand text-white">Default</span>
                      }
                    </div>
                    <address class="mt-1.5 text-xs leading-relaxed not-italic text-muted">
                      {{ address.fullName }}<br />
                      {{ address.line1 }}@if (address.line2) {, {{ address.line2 }}}<br />
                      {{ address.city }}, {{ address.governorate }}<br />
                      {{ address.phone }}
                    </address>
                    <div class="mt-3 flex flex-wrap gap-3 text-xs font-bold">
                      <button type="button" class="text-brand hover:underline" (click)="openEdit(address)">
                        Edit
                      </button>
                      @if (!address.isDefault) {
                        <button
                          type="button"
                          class="text-brand hover:underline"
                          (click)="makeDefault(address)"
                        >
                          Make default
                        </button>
                        <button type="button" class="text-pop hover:underline" (click)="remove(address)">
                          Delete
                        </button>
                      }
                    </div>
                  </li>
                }
              </ul>
            }
          </section>

          <!-- ================================================= security -->
          <section class="ob-panel p-5">
            <h2 class="text-base font-bold">Password</h2>
            <p class="mt-0.5 mb-4 text-sm text-muted">
              Choose something at least 8 characters long.
            </p>

            <form class="max-w-sm" (ngSubmit)="changePassword()" novalidate>
              @if (passwordError()) {
                <p class="mb-3 rounded-lg bg-pop-soft p-3 text-sm font-semibold text-pop" role="alert">
                  {{ passwordError() }}
                </p>
              }
              @if (passwordDone()) {
                <p class="mb-3 rounded-lg bg-teal-soft p-3 text-sm font-semibold text-teal">
                  Your password has been changed.
                </p>
              }

              <label class="block">
                <span class="ob-label">Current password</span>
                <input
                  class="ob-input"
                  type="password"
                  name="currentPassword"
                  autocomplete="current-password"
                  required
                  [(ngModel)]="currentPassword"
                />
              </label>

              <label class="mt-3 block">
                <span class="ob-label">New password</span>
                <input
                  class="ob-input"
                  type="password"
                  name="newPassword"
                  autocomplete="new-password"
                  minlength="8"
                  required
                  [(ngModel)]="newPassword"
                />
              </label>

              <button
                type="submit"
                class="ob-btn ob-btn-brand mt-4"
                [disabled]="savingPassword() || newPassword.length < 8"
              >
                @if (savingPassword()) {
                  <ob-icon name="loader" [size]="16" class="ob-spin" /> Updating…
                } @else {
                  Update password
                }
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  `,
})
export class AccountComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly cart = inject(CartService);
  protected readonly auth = inject(AuthService);
  protected readonly wishlist = inject(WishlistService);

  protected readonly addresses = signal<Address[]>([]);
  protected readonly loading = signal(true);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Address | null>(null);

  protected currentPassword = '';
  protected newPassword = '';
  protected readonly savingPassword = signal(false);
  protected readonly passwordError = signal('');
  protected readonly passwordDone = signal(false);

  protected readonly links = [
    { path: '/orders', label: 'Your orders', icon: 'package', count: () => '' },
    { path: '/wishlist', label: 'Your wishlist', icon: 'heart', count: () => this.wishlist.count() },
    { path: '/cart', label: 'Your cart', icon: 'shopping-cart', count: () => this.cart.itemCount() },
  ];

  constructor() {
    this.loadAddresses();
    this.wishlist.refresh();
  }

  protected openNew(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(address: Address): void {
    this.editing.set(address);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }

  protected onSaved(): void {
    this.closeForm();
    this.loadAddresses();
  }

  protected makeDefault(address: Address): void {
    this.api.updateAddress(address.id, { isDefault: true }).subscribe({
      next: () => this.loadAddresses(),
      error: (err: ApiError) => this.toast.error("Couldn't update that address", err.message),
    });
  }

  protected remove(address: Address): void {
    this.api.deleteAddress(address.id).subscribe({
      next: () => {
        this.toast.info('Address deleted');
        this.loadAddresses();
      },
      error: (err: ApiError) => this.toast.error("Couldn't delete that address", err.message),
    });
  }

  protected changePassword(): void {
    this.passwordError.set('');
    this.passwordDone.set(false);
    this.savingPassword.set(true);

    this.api
      .changePassword({ currentPassword: this.currentPassword, newPassword: this.newPassword })
      .subscribe({
        next: () => {
          this.savingPassword.set(false);
          this.passwordDone.set(true);
          this.currentPassword = '';
          this.newPassword = '';
          this.toast.success('Password updated');
        },
        error: (err: ApiError) => {
          this.savingPassword.set(false);
          this.passwordError.set(err.message);
        },
      });
  }

  protected signOut(): void {
    this.auth.logout();
    void this.router.navigate(['/']);
  }

  private loadAddresses(): void {
    this.loading.set(true);
    this.api.addresses().subscribe({
      next: (res) => {
        this.addresses.set(res.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
