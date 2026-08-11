import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthFacade } from '../data-access/auth.facade';

import { StatusView } from '../../../shared/ui/status-view';

/**
 * Forgot-password UI stub. The request/confirm endpoints are outside the
 * five-endpoint auth baseline, so this screen only preserves the navigation entry.
 */
@Component({
  selector: 'app-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink, StatusView],
  template: `
    @if (sent()) {
      <app-status-view
        title="Reset link sent"
        message="If that account exists, a reset link is on its way. Password reset APIs are not part of this release."
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
        <form class="auth-form" [formGroup]="form" (ngSubmit)="submit()">
          <div class="field">
            <label for="reset-email">Email address</label>
            <input class="input" id="reset-email" formControlName="email" type="email" />
          </div>
          <button class="btn btn-primary" type="submit" [disabled]="form.invalid">
            Send reset link
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
  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
  
    const email = this.form.controls.email.value.trim();
  
    this.authFacade.requestPasswordReset({ email }).subscribe({
      next: () => {
        this.sent.set(true);
      },
      error: () => {

      },
    });
  }

  protected goToLogin(): void {
    void this.router.navigateByUrl('/auth/login');
  }
}
