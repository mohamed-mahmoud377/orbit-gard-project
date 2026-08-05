import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { sanitizeReturnUrl } from '../../../core/navigation/return-url';

import { AuthFacade } from '../data-access/auth.facade';
import { AuthApiError } from '../data-access/auth.models';
import { bannerMessageFromApi } from '../data-access/auth-error.mapper';
import { AUTH_MESSAGES, validateLoginForm } from '../data-access/auth.messages';
import { MOCK_AUTH_SEED } from '../data-access/mock-auth.gateway';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth-card" data-node-id="6:2">
      <header>
        <h1>Welcome back</h1>
        <p>Sign in to your Orbit wallet</p>
      </header>

      @if (banner()) {
        <div class="notice notice-danger" role="alert" aria-live="assertive">
          {{ banner() }}
        </div>
      }

      <form class="auth-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field" [class.field-invalid]="fieldErrors()['username']">
          <label for="login-username">Username</label>
          <input
            class="input"
            id="login-username"
            formControlName="username"
            autocomplete="username"
            placeholder="Enter your username"
            [attr.aria-invalid]="!!fieldErrors()['username']"
            [attr.aria-describedby]="fieldErrors()['username'] ? 'login-username-error' : null"
          />
          @if (fieldErrors()['username']) {
            <p class="field-error" id="login-username-error">{{ fieldErrors()['username'] }}</p>
          }
        </div>

        <div class="field" [class.field-invalid]="fieldErrors()['password']">
          <label for="login-password">Password</label>
          <div class="password-input">
            <input
              class="input"
              id="login-password"
              formControlName="password"
              [type]="showPassword() ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="Enter your password"
              [attr.aria-invalid]="!!fieldErrors()['password']"
              [attr.aria-describedby]="fieldErrors()['password'] ? 'login-password-error' : null"
            />
            <button
              class="password-toggle"
              type="button"
              [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
              (click)="showPassword.set(!showPassword())"
            >
              {{ showPassword() ? 'Hide' : 'Show' }}
            </button>
          </div>
          @if (fieldErrors()['password']) {
            <p class="field-error" id="login-password-error">{{ fieldErrors()['password'] }}</p>
          }
        </div>

        <div class="remember-row">
          <label>
            <input type="checkbox" formControlName="rememberMe" />
            Remember me for 30 days
          </label>
          <a class="text-link" routerLink="/auth/forgot-password">Forgot password?</a>
        </div>

        <button class="btn btn-primary" type="submit" [disabled]="submitting()">
          {{ submitting() ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      @if (showDemoHint) {
        <div class="demo-hint">
          <strong>Mock auth accounts</strong>
          <span>Parent: {{ parentUsername }} / {{ parentPassword }}</span>
          <span>Child: {{ childUsername }} / {{ childPassword }}</span>
        </div>
      }

      <footer class="auth-footer">
        <span>New to Orbit?</span>
        <a class="text-link" routerLink="/auth/sign-up">Create an account</a>
      </footer>
    </section>
  `,
  styleUrl: '../auth-pages.scss',
})
export default class LoginPage {
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly banner = signal('');
  protected readonly fieldErrors = signal<Record<string, string>>({});
  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly showDemoHint = environment.useMockAuth;
  protected readonly parentUsername = MOCK_AUTH_SEED.parent.username;
  protected readonly parentPassword = MOCK_AUTH_SEED.parent.password;
  protected readonly childUsername = MOCK_AUTH_SEED.child.username;
  protected readonly childPassword = MOCK_AUTH_SEED.child.password;

  protected readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
    rememberMe: [false],
  });

  protected submit(): void {
    this.banner.set('');
    const value = this.form.getRawValue();
    const localErrors = validateLoginForm(value);
    this.fieldErrors.set(localErrors);
    if (Object.keys(localErrors).length) {
      this.focusFirstError();
      return;
    }

    this.submitting.set(true);
    this.auth.login(value).subscribe({
      next: (response) => {
        this.submitting.set(false);
        const returnUrl = sanitizeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
        if (returnUrl) {
          void this.router.navigateByUrl(returnUrl);
          return;
        }
        void this.router.navigateByUrl(
          response.user.accountType === 'CHILD' ? '/my-wallet' : '/dashboard',
        );
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        if (error instanceof AuthApiError) {
          this.banner.set(bannerMessageFromApi(error));
        } else {
          this.banner.set(AUTH_MESSAGES.networkError);
        }
        // Preserve typed values — never clear the form on failure.
      },
    });
  }

  private focusFirstError(): void {
    queueMicrotask(() => {
      const first = document.querySelector<HTMLElement>('.field-invalid .input');
      first?.focus();
    });
  }
}
