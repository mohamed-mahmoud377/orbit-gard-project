import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DEMO_CREDENTIALS, DemoStore } from '../../data-access';
import { StatusView } from '../../shared/ui/status-view';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth-card" data-node-id="6:2">
      <header>
        <h1>Welcome back</h1>
        <p>Sign in to your Orbit wallet</p>
      </header>

      @if (error()) {
        <div class="notice notice-danger" role="alert">{{ error() }}</div>
      }

      <form class="auth-form" [formGroup]="form" (ngSubmit)="submit()">
        <div class="field">
          <label for="login-username">Username or email</label>
          <input
            class="input"
            id="login-username"
            formControlName="username"
            autocomplete="username"
            placeholder="you@example.com"
          />
        </div>
        <div class="field">
          <label for="login-password">Password</label>
          <div class="password-input">
            <input
              class="input"
              id="login-password"
              formControlName="password"
              [type]="showPassword() ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="Enter your password"
            />
            <button
              class="password-toggle"
              type="button"
              (click)="showPassword.set(!showPassword())"
            >
              {{ showPassword() ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>
        <div class="remember-row">
          <label><input type="checkbox" formControlName="remember" /> Remember me for 30 days</label>
          <a class="text-link" routerLink="/auth/forgot-password">Forgot password?</a>
        </div>
        <button class="btn btn-primary" type="submit" [disabled]="form.invalid">Sign in</button>
      </form>

      <div class="demo-hint">
        <strong>Demo accounts</strong>
        <span>Parent: mohamed / {{ parentPassword }}</span>
        <span>Child: youssef / {{ childPassword }}</span>
      </div>

      <footer class="auth-footer">
        <span>New to Orbit?</span>
        <a class="text-link" routerLink="/auth/sign-up">Create an account</a>
      </footer>
    </section>
  `,
  styleUrl: './auth-pages.scss',
})
export default class LoginPage {
  private readonly store = inject(DemoStore);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly error = signal('');
  protected readonly showPassword = signal(false);
  protected readonly parentPassword = DEMO_CREDENTIALS.parent.password;
  protected readonly childPassword = DEMO_CREDENTIALS.child.password;
  protected readonly form = this.fb.nonNullable.group({
    username: [DEMO_CREDENTIALS.parent.username, Validators.required],
    password: [DEMO_CREDENTIALS.parent.password, Validators.required],
    remember: [true],
  });

  protected submit(): void {
    this.error.set('');
    const result = this.store.login(this.form.getRawValue());
    if (!result.ok) {
      this.error.set(result.message);
      return;
    }
    void this.router.navigateByUrl(result.value.user.role === 'child' ? '/my-wallet' : '/dashboard');
  }
}

@Component({
  selector: 'app-sign-up-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth-card" data-node-id="9:2">
      <header>
        <h1>Create your Orbit account</h1>
        <p>Start your wallet and add family members when you are ready.</p>
      </header>
      @if (error()) {
        <div class="notice notice-danger" role="alert">{{ error() }}</div>
      }
      <form class="auth-form" [formGroup]="form" (ngSubmit)="submit()">
        <div class="grid-2">
          <div class="field">
            <label for="full-name">Full name</label>
            <input class="input" id="full-name" formControlName="fullName" placeholder="Mohamed Mahmoud" />
          </div>
          <div class="field">
            <label for="username">Username</label>
            <input class="input" id="username" formControlName="username" placeholder="mohamed" />
          </div>
        </div>
        <div class="field">
          <label for="email">Email</label>
          <input class="input" id="email" formControlName="email" type="email" placeholder="you@example.com" />
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="new-password">Password</label>
            <input class="input" id="new-password" formControlName="password" type="password" />
          </div>
          <div class="field">
            <label for="confirm-password">Confirm password</label>
            <input class="input" id="confirm-password" formControlName="confirmPassword" type="password" />
          </div>
        </div>
        <div class="field">
          <label for="promo">Promotional code <span class="muted">(optional)</span></label>
          <input class="input" id="promo" formControlName="promoCode" placeholder="ORBIT500" />
        </div>
        <button class="btn btn-primary" type="submit" [disabled]="form.invalid">Create account</button>
      </form>
      <footer class="auth-footer">
        <span>Already have an account?</span>
        <a class="text-link" routerLink="/auth/login">Sign in</a>
      </footer>
    </section>
  `,
  styleUrl: './auth-pages.scss',
})
export class SignUpPage {
  private readonly store = inject(DemoStore);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly error = signal('');
  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    username: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
    promoCode: [''],
  });

  protected submit(): void {
    this.error.set('');
    const value = this.form.getRawValue();
    if (value.password !== value.confirmPassword) {
      this.error.set('The passwords do not match.');
      return;
    }
    if (value.promoCode && value.promoCode !== 'ORBIT500') {
      this.error.set('PROMO_CODE_EXPIRED · This promotional code is no longer valid.');
      return;
    }
    const result = this.store.signUp(value);
    if (!result.ok) {
      this.error.set(result.message);
      return;
    }
    void this.router.navigate(['/auth/verify'], {
      queryParams: { user: result.value.user.id },
    });
  }
}

@Component({
  selector: 'app-verify-page',
  imports: [ReactiveFormsModule, RouterLink, StatusView],
  template: `
    @if (complete()) {
      <app-status-view
        title="Your account is active"
        message="Your email is verified. You can now sign in to Orbit."
        tone="success"
        actionLabel="Continue to sign in"
        (action)="goToLogin()"
      />
    } @else if (expired()) {
      <app-status-view
        title="This link has expired"
        message="TOKEN_EXPIRED · 410. Request a new verification link to continue."
        tone="danger"
        actionLabel="Request a new link"
        (action)="expired.set(false)"
      />
    } @else {
      <section class="auth-card" data-node-id="10:2">
        <header>
          <h1>Check your inbox</h1>
          <p>We sent a verification link. For this demo, enter code 123456.</p>
        </header>
        @if (error()) {
          <div class="notice notice-danger" role="alert">{{ error() }}</div>
        }
        <form class="auth-form" [formGroup]="form" (ngSubmit)="submit()">
          <div class="field">
            <label for="verification-code">Verification code</label>
            <input
              class="input verification-code"
              id="verification-code"
              formControlName="code"
              inputmode="numeric"
              maxlength="6"
            />
          </div>
          <button class="btn btn-primary" type="submit">Verify account</button>
        </form>
        <a class="text-link" routerLink="/auth/login">Back to sign in</a>
      </section>
    }
  `,
  styleUrl: './auth-pages.scss',
})
export class VerifyPage {
  private readonly store = inject(DemoStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly error = signal('');
  protected readonly complete = signal(false);
  protected readonly expired = signal(this.route.snapshot.queryParamMap.get('expired') === '1');
  protected readonly form = this.fb.nonNullable.group({ code: ['123456', Validators.required] });

  protected submit(): void {
    const userId =
      this.route.snapshot.queryParamMap.get('user') ??
      [...this.store.users()].reverse().find((user) => user.status === 'pending-verification')?.id;
    if (!userId) {
      this.error.set('The account was not found.');
      return;
    }
    const result = this.store.verify(userId, this.form.controls.code.value);
    if (!result.ok) {
      this.error.set(result.message);
      return;
    }
    this.complete.set(true);
  }

  protected goToLogin(): void {
    void this.router.navigateByUrl('/auth/login');
  }
}

@Component({
  selector: 'app-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink, StatusView],
  template: `
    @if (sent()) {
      <app-status-view
        title="Reset link sent"
        message="If that account exists, a reset link is on its way. In this demo, return to sign in."
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
        <form class="auth-form" [formGroup]="form" (ngSubmit)="sent.set(true)">
          <div class="field">
            <label for="reset-email">Email address</label>
            <input class="input" id="reset-email" formControlName="email" type="email" />
          </div>
          <button class="btn btn-primary" type="submit" [disabled]="form.invalid">Send reset link</button>
        </form>
        <a class="text-link" routerLink="/auth/login">Back to sign in</a>
      </section>
    }
  `,
  styleUrl: './auth-pages.scss',
})
export class ForgotPasswordPage {
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly sent = signal(false);
  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected goToLogin(): void {
    void this.router.navigateByUrl('/auth/login');
  }
}
