import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthFacade } from '../data-access/auth.facade';
import { AuthApiError } from '../data-access/auth.models';
import { AUTH_MESSAGES } from '../data-access/auth.messages';

import { StatusView } from '../../../shared/ui/status-view';

const RESET_REQUEST_MESSAGE =
  'If an account exists for that address, a reset link is on its way.';

@Component({
  selector: 'app-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink, StatusView],
  template: `
    @if (sent()) {
      <app-status-view
        title="Reset link sent"
        [message]="confirmationMessage()"
        tone="success"
        actionLabel="Back to sign in"
        (action)="goToLogin()"
      />
    } @else {
      <section class="auth-card" data-node-id="10:42">
        <header>
          <h1>Reset your password</h1>
          <p>Enter your email and we will send you a secure reset link.</p>
        </header>

        @if (banner()) {
          <div class="notice notice-danger" role="alert" aria-live="assertive">
            {{ banner() }}
          </div>
        }

        <form class="auth-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="field" [class.field-invalid]="fieldError()">
            <label for="reset-email">Email address</label>
            <input
              class="input"
              id="reset-email"
              formControlName="email"
              type="email"
              autocomplete="email"
              [attr.aria-invalid]="!!fieldError()"
              [attr.aria-describedby]="fieldError() ? 'reset-email-error' : null"
            />
            @if (fieldError()) {
              <p class="field-error" id="reset-email-error">{{ fieldError() }}</p>
            }
          </div>
          <button class="btn btn-primary" type="submit" [disabled]="submitting() || form.invalid">
            {{ submitting() ? 'Sending…' : 'Send reset link' }}
          </button>
        </form>
        <a class="text-link" routerLink="/auth/login">Back to sign in</a>
      </section>
    }
  `,
  styleUrl: '../auth-pages.scss',
})
export class ForgotPasswordPage {
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly authFacade = inject(AuthFacade);

  protected readonly sent = signal(false);
  protected readonly submitting = signal(false);
  protected readonly banner = signal('');
  protected readonly fieldError = signal('');
  protected readonly confirmationMessage = signal(RESET_REQUEST_MESSAGE);
  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected submit(): void {
    this.banner.set('');
    this.fieldError.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.controls.email.hasError('required')) {
        this.fieldError.set(AUTH_MESSAGES.required);
      } else if (this.form.controls.email.hasError('email')) {
        this.fieldError.set(AUTH_MESSAGES.emailInvalid);
      }
      return;
    }

    const email = this.form.controls.email.value.trim();
    this.submitting.set(true);

    this.authFacade.requestPasswordReset({ email }).subscribe({
      next: (response) => {
        this.submitting.set(false);
        this.confirmationMessage.set(response.message || RESET_REQUEST_MESSAGE);
        this.sent.set(true);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        if (error instanceof AuthApiError) {
          const emailFieldError = error.fieldErrors?.find((field) => field.field === 'email');
          if (emailFieldError) {
            this.fieldError.set(AUTH_MESSAGES.emailInvalid);
            return;
          }
          this.banner.set(error.detail || AUTH_MESSAGES.networkError);
          return;
        }
        this.banner.set(AUTH_MESSAGES.networkError);
      },
    });
  }

  protected goToLogin(): void {
    void this.router.navigateByUrl('/auth/login');
  }
}
