import { Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthFacade } from '../data-access/auth.facade';
import { AuthApiError } from '../data-access/auth.models';

@Component({
  selector: 'app-reset-password-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    @if (success()) {
      <section class="auth-card">
      <div class="blur-circle blur-1"></div>
      <div class="blur-circle blur-2"></div>
      <div class="blur-circle blur-3"></div>
      <div class="blur-circle blur-4"></div>
        <header>
          <h1>Password reset successful</h1>
          <p>
            Your password has been changed successfully. You can now sign in
            with your new password.
          </p>
        </header>

        <button
          class="btn btn-primary"
          type="button"
          (click)="goToLogin()"
        >
          Back to sign in
        </button>
      </section>
    } @else {
      <section class="auth-card">
        <header>
          <h1>Choose a new password</h1>
          <p>
            Enter your new password below.
          </p>
        </header>

        @if (errorMessage()) {
          <div class="notice notice-danger" role="alert">
            {{ errorMessage() }}
          </div>
        }

        <form
          class="auth-form"
          [formGroup]="form"
          (ngSubmit)="submit()"
          novalidate
        >
          <div class="field">
            <label for="new-password">New password</label>

            <input
              class="input"
              id="new-password"
              formControlName="newPassword"
              type="password"
              autocomplete="new-password"
            />

            @if (
              form.controls.newPassword.touched &&
              form.controls.newPassword.invalid
            ) {
              <p class="field-error">
                Password must be 8 to 64 characters and contain at least one
                letter and one number.
              </p>
            }
          </div>

          <div class="field">
            <label for="confirm-new-password">
              Confirm new password
            </label>

            <input
              class="input"
              id="confirm-new-password"
              formControlName="confirmNewPassword"
              type="password"
              autocomplete="new-password"
            />

            @if (
              form.controls.confirmNewPassword.touched &&
              form.controls.confirmNewPassword.invalid
            ) {
              <p class="field-error">
                Please confirm your new password.
              </p>
            }
          </div>

          @if (
            form.controls.confirmNewPassword.touched &&
            form.controls.newPassword.value !==
              form.controls.confirmNewPassword.value
          ) {
            <p class="field-error">
              Passwords do not match.
            </p>
          }

          <button
            class="btn btn-primary"
            type="submit"
            [disabled]="submitting() || form.invalid"
          >
            {{ submitting() ? 'Updating password…' : 'Choose new password' }}
          </button>
        </form>

        <a class="text-link" routerLink="/auth/login">
          Back to sign in
        </a>
      </section>
    }
  `,
  styleUrl: '../auth-pages.scss',
})
export class ResetPasswordPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly authFacade = inject(AuthFacade);

  protected readonly submitting = signal(false);
  protected readonly success = signal(false);
  protected readonly errorMessage = signal('');

  protected readonly form = this.fb.nonNullable.group({
    newPassword: [
      '',
      [
        Validators.required,
        Validators.minLength(8),
        Validators.maxLength(64),
        Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/),
      ],
    ],
    confirmNewPassword: ['', [Validators.required]],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      this.errorMessage.set('This password reset link is invalid.');
      return;
    }

    const newPassword = this.form.controls.newPassword.value;
    const confirmNewPassword =
      this.form.controls.confirmNewPassword.value;

    if (newPassword !== confirmNewPassword) {
      this.errorMessage.set('Passwords do not match.');
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set('');

    this.authFacade
      .confirmPasswordReset({
        token,
        newPassword,
        confirmNewPassword,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.success.set(true);
        },
        error: (error: unknown) => {
          this.submitting.set(false);

          if (error instanceof AuthApiError) {
            switch (error.code) {
              case 'TOKEN_INVALID':
                this.errorMessage.set(
                  'This password reset link is invalid.',
                );
                break;

              case 'TOKEN_EXPIRED':
              case 'TOKEN_ALREADY_USED':
                this.errorMessage.set(
                  'This password reset link has expired or was already used.',
                );
                break;

              case 'PASSWORD_MISMATCH':
              case 'PASSWORD_CONFIRMATION_MISMATCH':
                this.errorMessage.set('Passwords do not match.');
                break;

              case 'PASSWORD_REUSE':
                this.errorMessage.set(
                  'Choose a password you have not used before.',
                );
                break;

              case 'PASSWORD_TOO_WEAK':
              case 'PASSWORD_INVALID':
                this.errorMessage.set(
                  'Password must be 8 to 64 characters and contain at least one letter and one number.',
                );
                break;

              default:
                this.errorMessage.set(
                  error.detail || 'Unable to reset your password.',
                );
            }
          } else {
            this.errorMessage.set(
              'Unable to reset your password. Please try again.',
            );
          }
        },
      });
  }

  protected goToLogin(): void {
    void this.router.navigateByUrl('/auth/login');
  }
}