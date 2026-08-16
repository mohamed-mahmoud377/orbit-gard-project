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
  selector: 'ob-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, AuthShellComponent, IconComponent],
  host: { class: 'block' },
  template: `
    <ob-auth-shell
      heading="Create your account"
      subheading="It takes about twenty seconds and your cart comes with you."
    >
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

        <label class="block">
          <span class="ob-label">Full name</span>
          <input
            class="ob-input"
            name="name"
            autocomplete="name"
            required
            [(ngModel)]="name"
            [attr.aria-invalid]="fieldError('name') ? 'true' : null"
          />
          @if (fieldError('name'); as message) {
            <span class="ob-field-error">{{ message }}</span>
          }
        </label>

        <label class="mt-4 block">
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

        <!-- The strength meter is deliberately a sibling of the <label>, not a
             child: inside it, its text would be folded into the field's
             accessible name ("Password Use at least 8 characters"). -->
        <label class="mt-4 block" for="ob-register-password">
          <span class="ob-label">Password</span>
        </label>
        <div class="relative">
          <input
            id="ob-register-password"
            class="ob-input pr-11"
            [type]="showPassword() ? 'text' : 'password'"
            name="password"
            autocomplete="new-password"
            required
            minlength="8"
            aria-describedby="ob-password-strength"
            [(ngModel)]="password"
            [attr.aria-invalid]="fieldError('password') ? 'true' : null"
          />
          <button
            type="button"
            class="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted transition hover:text-body"
            [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
            (click)="showPassword.set(!showPassword())"
          >
            <ob-icon [name]="showPassword() ? 'eye-off' : 'eye'" [size]="17" />
          </button>
        </div>

        <!-- strength meter -->
        <div class="mt-2 flex gap-1" aria-hidden="true">
          @for (i of [0, 1, 2, 3]; track i) {
            <span
              class="h-1 flex-1 rounded-full transition-colors"
              [class]="i < strength().score ? strength().colour : 'bg-line'"
            ></span>
          }
        </div>
        <p
          id="ob-password-strength"
          class="mt-1 text-xs"
          aria-live="polite"
          [class]="strength().score >= 3 ? 'text-teal' : 'text-muted'"
        >
          {{ strength().label }}
        </p>

        @if (fieldError('password'); as message) {
          <p class="ob-field-error">{{ message }}</p>
        }

        <button
          type="submit"
          class="ob-btn ob-btn-primary ob-btn-lg mt-6 w-full"
          [disabled]="busy() || password.length < 8"
        >
          @if (busy()) {
            <ob-icon name="loader" [size]="17" class="ob-spin" /> Creating your account…
          } @else {
            Create account
          }
        </button>

        @if (guestLines() > 0) {
          <p class="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted">
            <ob-icon name="shopping-cart" [size]="13" />
            {{ guestLines() }} {{ guestLines() === 1 ? 'item' : 'items' }} in your guest cart will
            move across.
          </p>
        }

        <p class="mt-4 text-center text-[11px] leading-relaxed text-muted">
          This is a demonstration store. Don't reuse a real password here.
        </p>

        <p class="mt-6 border-t border-line pt-5 text-center text-sm text-muted">
          Already have an account?
          <a routerLink="/login" [queryParams]="{ returnUrl: returnUrl() }" class="ob-link">Sign in</a>
        </p>
      </form>
    </ob-auth-shell>
  `,
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly cart = inject(CartService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  protected name = '';
  protected email = '';
  protected password = '';

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly showPassword = signal(false);
  private readonly fieldErrors = signal<Record<string, string>>({});

  protected readonly guestLines = computed(() => this.cart.cart().items.length);

  /** Purely advisory — the server's rule is simply "at least 8 characters". */
  protected readonly strength = computed(() => {
    const value = this.password;
    let score = 0;
    if (value.length >= 8) score++;
    if (value.length >= 12) score++;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
    if (/\d/.test(value) && /[^\w\s]/.test(value)) score++;

    const labels = [
      'Use at least 8 characters',
      'Weak — add a few more characters',
      'Fair — mix in upper and lower case',
      'Good',
      'Strong',
    ];
    const colours = ['bg-line', 'bg-pop', 'bg-accent', 'bg-teal', 'bg-teal'];
    return { score, label: labels[score], colour: colours[score] };
  });

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

    this.auth.register(this.name.trim(), this.email.trim(), this.password).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success('Account created', "Welcome to Jerry's Shop.");
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
