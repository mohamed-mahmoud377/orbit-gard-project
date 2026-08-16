import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { CartService } from '../../core/cart.service';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { AuthShellComponent } from './auth-shell.component';

@Component({
  selector: 'ob-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, AuthShellComponent, IconComponent],
  host: { class: 'block' },
  template: `
    <ob-auth-shell
      heading="Welcome back"
      subheading="Sign in to see your cart, orders and wishlist."
    >
      <form (ngSubmit)="submit()" #form="ngForm" novalidate>
        @if (error()) {
          <p
            class="mb-4 flex items-start gap-2 rounded-xl bg-pop-soft p-3 text-sm font-semibold text-pop"
            role="alert"
          >
            <ob-icon name="alert-circle" [size]="17" class="mt-px shrink-0" />
            {{ error() }}
          </p>
        }

        <label class="block">
          <span class="ob-label">Email address</span>
          <input
            class="ob-input"
            type="email"
            name="email"
            autocomplete="email"
            required
            [(ngModel)]="email"
            [attr.aria-invalid]="fieldError('email') ? 'true' : null"
          />
          @if (fieldError('email'); as message) {
            <span class="ob-field-error">{{ message }}</span>
          }
        </label>

        <label class="mt-4 block">
          <span class="ob-label">Password</span>
          <span class="relative block">
            <input
              class="ob-input pr-11"
              [type]="showPassword() ? 'text' : 'password'"
              name="password"
              autocomplete="current-password"
              required
              [(ngModel)]="password"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted transition hover:text-body"
              [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
              (click)="showPassword.set(!showPassword())"
            >
              <ob-icon [name]="showPassword() ? 'eye-off' : 'eye'" [size]="17" />
            </button>
          </span>
          @if (fieldError('password'); as message) {
            <span class="ob-field-error">{{ message }}</span>
          }
        </label>

        <button type="submit" class="ob-btn ob-btn-primary ob-btn-lg mt-6 w-full" [disabled]="busy()">
          @if (busy()) {
            <ob-icon name="loader" [size]="17" class="ob-spin" /> Signing in…
          } @else {
            Sign in
          }
        </button>

        @if (guestLines() > 0) {
          <p class="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted">
            <ob-icon name="shopping-cart" [size]="13" />
            {{ guestLines() }} {{ guestLines() === 1 ? 'item' : 'items' }} in your guest cart will
            move across.
          </p>
        }

        <p class="mt-6 border-t border-line pt-5 text-center text-sm text-muted">
          New to Orbit Bazaar?
          <a routerLink="/register" [queryParams]="{ returnUrl: returnUrl() }" class="ob-link"
            >Create an account</a
          >
        </p>
      </form>
    </ob-auth-shell>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly cart = inject(CartService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  protected email = '';
  protected password = '';

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly showPassword = signal(false);
  private readonly fieldErrors = signal<Record<string, string>>({});

  protected readonly guestLines = computed(() => this.cart.cart().items.length);

  protected returnUrl(): string {
    return this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
  }

  protected fieldError(field: string): string | null {
    return this.fieldErrors()[field] ?? null;
  }

  protected submit(): void {
    this.error.set('');
    this.fieldErrors.set({});
    this.busy.set(true);

    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success('Signed in', 'Welcome back to Orbit Bazaar.');
        void this.router.navigateByUrl(this.returnUrl());
      },
      error: (err: ApiError) => {
        this.busy.set(false);
        this.error.set(err.message);
        this.fieldErrors.set(err.fieldErrors);
      },
    });
  }
}
