import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  of,
  switchMap,
  catchError,
} from 'rxjs';

import { AuthFacade } from '../data-access/auth.facade';
import { AuthApiError } from '../data-access/auth.models';
import { fieldErrorsFromApi, bannerMessageFromApi } from '../data-access/auth-error.mapper';
import {
  AUTH_MESSAGES,
  FieldErrors,
  isValidUsername,
  normalizeUsername,
  validateRegisterForm,
} from '../data-access/auth.messages';

type AvailabilityState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
type PromoState = 'idle' | 'checking' | 'valid' | 'invalid' | 'expired';

@Component({
  selector: 'app-sign-up-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth-card auth-card-wide" data-node-id="9:2">
      <header>
        <h1>Create your Orbit account</h1>
        <p>Start your wallet and add family members when you are ready.</p>
      </header>

      @if (banner()) {
        <div class="notice notice-danger" role="alert" tabindex="-1">{{ banner() }}</div>
      }

      <form class="auth-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="grid-2">
          <div class="field" [class.field-invalid]="fieldErrors()['firstName']">
            <label for="first-name">First name</label>
            <input
              class="input"
              id="first-name"
              formControlName="firstName"
              autocomplete="given-name"
              placeholder="Omar"
              [attr.aria-invalid]="!!fieldErrors()['firstName']"
              [attr.aria-describedby]="fieldErrors()['firstName'] ? 'first-name-error' : null"
            />
            @if (fieldErrors()['firstName']) {
              <p class="field-error" id="first-name-error">{{ fieldErrors()['firstName'] }}</p>
            }
          </div>
          <div class="field" [class.field-invalid]="fieldErrors()['lastName']">
            <label for="last-name">Last name</label>
            <input
              class="input"
              id="last-name"
              formControlName="lastName"
              autocomplete="family-name"
              placeholder="Hassan"
              [attr.aria-invalid]="!!fieldErrors()['lastName']"
              [attr.aria-describedby]="fieldErrors()['lastName'] ? 'last-name-error' : null"
            />
            @if (fieldErrors()['lastName']) {
              <p class="field-error" id="last-name-error">{{ fieldErrors()['lastName'] }}</p>
            }
          </div>
        </div>

        <div class="field" [class.field-invalid]="usernameShowsInvalid()">
          <label for="username">Username</label>
          <input
            class="input"
            id="username"
            formControlName="username"
            autocomplete="username"
            placeholder="omar.hassan"
            [attr.aria-invalid]="usernameShowsInvalid()"
            [attr.aria-describedby]="usernameDescribedBy()"
          />
          @if (availability() === 'checking') {
            <p class="field-hint" id="username-availability">Checking availability…</p>
          } @else if (availability() === 'available') {
            <p class="field-hint field-hint-success" id="username-availability">
              {{ AUTH_MESSAGES.usernameAvailable }}
            </p>
          } @else if (availability() === 'taken') {
            <p class="field-error" id="username-availability">{{ AUTH_MESSAGES.usernameTaken }}</p>

          } @else if (availability() === 'invalid' && form.controls.username.value.trim()) {
            <p class="field-error" id="username-availability">
            @if (usernameHasUppercase) {
              <p class="field-error" id="username-lowercase-error">
                Username must be written in lowercase letters.
              </p>
            }
            {{ AUTH_MESSAGES.usernameInvalid }}</p>
          }
          @if (fieldErrors()['username'] && availability() === 'idle') {
            <p class="field-error" id="username-error">{{ fieldErrors()['username'] }}</p>
          }
        </div>

        <div class="field" [class.field-invalid]="fieldErrors()['email']">
          <label for="email">Email address</label>
          <input
            class="input"
            id="email"
            formControlName="email"
            type="email"
            autocomplete="email"
            placeholder="omar.hassan@example.com"
            [attr.aria-invalid]="!!fieldErrors()['email']"
            [attr.aria-describedby]="fieldErrors()['email'] ? 'email-error' : null"
          />
          @if (fieldErrors()['email']) {
            <p class="field-error" id="email-error">{{ fieldErrors()['email'] }}</p>
          }
        </div>

        <div class="field" [class.field-invalid]="fieldErrors()['phoneNumber']">
          <label for="phone">Mobile number</label>
          <div class="phone-input">
            <span class="phone-prefix" aria-hidden="true">+20</span>
            <input
              class="input"
              id="phone"
              formControlName="phoneNumber"
              autocomplete="tel"
              inputmode="tel"
              placeholder="1012345678"
              [attr.aria-invalid]="!!fieldErrors()['phoneNumber']"
              [attr.aria-describedby]="fieldErrors()['phoneNumber'] ? 'phone-error' : null"
            />
          </div>
          @if (fieldErrors()['phoneNumber']) {
            <p class="field-error" id="phone-error">{{ fieldErrors()['phoneNumber'] }}</p>
          }
        </div>

        <div class="grid-2">
          <div class="field" [class.field-invalid]="fieldErrors()['password']">
            <label for="new-password">Password</label>
            <div class="password-input">
              <input
                class="input"
                id="new-password"
                formControlName="password"
                [type]="showPassword() ? 'text' : 'password'"
                autocomplete="new-password"
                [attr.aria-invalid]="!!fieldErrors()['password']"
                [attr.aria-describedby]="fieldErrors()['password'] ? 'password-error' : null"
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
              <p class="field-error" id="password-error">{{ fieldErrors()['password'] }}</p>
            }
          </div>
          <div class="field" [class.field-invalid]="fieldErrors()['confirmPassword']">
            <label for="confirm-password">Confirm password</label>
            <input
              class="input"
              id="confirm-password"
              formControlName="confirmPassword"
              type="password"
              autocomplete="new-password"
              [attr.aria-invalid]="!!fieldErrors()['confirmPassword']"
              [attr.aria-describedby]="fieldErrors()['confirmPassword'] ? 'confirm-error' : null"
            />
            @if (fieldErrors()['confirmPassword']) {
              <p class="field-error" id="confirm-error">{{ fieldErrors()['confirmPassword'] }}</p>
            }
          </div>
        </div>

        <div class="field" [class.field-invalid]="promoShowsInvalid()">
          <label for="promo">Promotional code <span class="muted">(optional)</span></label>
          <input
            class="input"
            id="promo"
            formControlName="promoCode"
            placeholder="WELCOME50"
            maxlength="32"
            [attr.aria-describedby]="promoDescribedBy()"
          />
          @if (promoState() === 'checking') {
            <p class="field-hint" id="promo-status">Checking promotional code…</p>
          } @else if (promoState() === 'valid' && promoAmount() !== null) {
            <p class="field-hint field-hint-success" id="promo-status">
              {{ AUTH_MESSAGES.promoValid(promoAmount()!) }}
            </p>
          } @else if (promoState() === 'invalid') {
            <p class="field-error" id="promo-status">{{ AUTH_MESSAGES.promoInvalid }}</p>
          } @else if (promoState() === 'expired') {
            <p class="field-error" id="promo-status">{{ AUTH_MESSAGES.promoExpired }}</p>
          }
          @if (fieldErrors()['promoCode']) {
            <p class="field-error">{{ fieldErrors()['promoCode'] }}</p>
          }
        </div>

        <button
          class="btn btn-primary"
          type="submit"
          [disabled]="submitting() || availability() === 'taken' || availability() === 'checking' || availability() === 'invalid' || promoState() === 'checking' || promoState() === 'invalid' || promoState() === 'expired'"
        >
          {{ submitting() ? 'Creating account…' : 'Create account' }}
        </button>
      </form>

      <footer class="auth-footer">
        <span>Already have an account?</span>
        <a class="text-link" routerLink="/auth/login">Sign in</a>
      </footer>
    </section>
  `,
  styleUrl: '../auth-pages.scss',
})
export class SignUpPage {
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  usernameHasUppercase = false;

  protected readonly AUTH_MESSAGES = AUTH_MESSAGES;
  protected readonly banner = signal('');
  protected readonly fieldErrors = signal<Record<string, string>>({});
  protected readonly availability = signal<AvailabilityState>('idle');
  protected readonly promoState = signal<PromoState>('idle');
  protected readonly promoAmount = signal<number | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    firstName: [''],
    lastName: [''],
    username: [''],
    email: [''],
    phoneNumber: [''],
    password: [''],
    confirmPassword: [''],
    promoCode: [''],
  });

  constructor() {
    this.form.controls.username.valueChanges
      .pipe(
        debounceTime(400),
        distinctUntilChanged(),
        switchMap((value) => {
          const trimmed = value.trim();
          this.clearFieldError('username');
          if (!trimmed) {
            this.availability.set('idle');
            return of(null);
          }
          if (!isValidUsername(trimmed)) {
            this.availability.set('invalid');
            return of(null);
          }
          if (trimmed !== trimmed.toLowerCase()) {
            this.availability.set('invalid');
            this.usernameHasUppercase = true;
            return of(null);
          }
          this.usernameHasUppercase = false;
          this.availability.set('checking');
          const requested = normalizeUsername(trimmed);
          return this.auth.checkUsername(trimmed).pipe(
            catchError(() => {
              this.availability.set('idle');
              return of(null);
            }),
            // Ignore stale responses.
            filter((response) => response === null || response.username === requested),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        if (!response) return;
        if (response.available) this.availability.set('available');
        else if (response.reason === 'TAKEN') this.availability.set('taken');
        else this.availability.set('invalid');
      });

    this.form.controls.promoCode.valueChanges
      .pipe(
        debounceTime(400),
        distinctUntilChanged(),
        switchMap((value) => {
          const trimmed = value.trim();
          this.clearFieldError('promoCode');
          if (!trimmed) {
            this.promoState.set('idle');
            this.promoAmount.set(null);
            return of(null);
          }
          this.promoState.set('checking');
          const requested = trimmed.toUpperCase();
          return this.auth.validatePromoCode(trimmed).pipe(
            catchError(() => {
              this.promoState.set('idle');
              this.promoAmount.set(null);
              return of(null);
            }),
            filter((response) => response === null || value.trim().toUpperCase() === requested),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        if (!response) return;
        if (response.status === 'VALID') {
          this.promoState.set('valid');
          this.promoAmount.set(response.amount);
          return;
        }
        this.promoAmount.set(null);
        if (response.status === 'EXPIRED') this.promoState.set('expired');
        else this.promoState.set('invalid');
      });
  }

  protected usernameDescribedBy(): string | null {
    if (this.availability() !== 'idle') return 'username-availability';
    if (this.fieldErrors()['username']) return 'username-error';
    return null;
  }

  protected usernameShowsInvalid(): boolean {
    const avail = this.availability();
    if (avail === 'taken' || avail === 'invalid') return true;
    if (avail === 'available' || avail === 'checking') return false;
    return !!this.fieldErrors()['username'];
  }

  protected promoDescribedBy(): string | null {
    if (this.promoState() !== 'idle') return 'promo-status';
    if (this.fieldErrors()['promoCode']) return 'promo-error';
    return null;
  }

  protected promoShowsInvalid(): boolean {
    const state = this.promoState();
    if (state === 'invalid' || state === 'expired') return true;
    if (state === 'valid' || state === 'checking' || state === 'idle') return false;
    return !!this.fieldErrors()['promoCode'];
  }

  protected submit(): void {
    this.banner.set('');
    const value = this.form.getRawValue();
    const localErrors = validateRegisterForm(value);
    if (this.availability() === 'taken') {
      localErrors.username = AUTH_MESSAGES.usernameTaken;
    } else if (this.availability() === 'invalid') {
      localErrors.username = AUTH_MESSAGES.usernameInvalid;
    } else if (this.availability() === 'available') {
      delete localErrors.username;
    }
    const promo = value.promoCode.trim();
    if (promo) {
      if (this.promoState() === 'invalid') {
        localErrors.promoCode = AUTH_MESSAGES.promoInvalid;
      } else if (this.promoState() === 'expired') {
        localErrors.promoCode = AUTH_MESSAGES.promoExpired;
      } else if (this.promoState() !== 'valid') {
        localErrors.promoCode = 'Enter a valid promotional code or leave this field empty.';
      }
    }
    this.fieldErrors.set(localErrors);
    if (Object.keys(localErrors).length) {
      this.focusFirstError();
      return;
    }

    this.submitting.set(true);
    this.auth
      .register({
        ...value,
        promoCode: value.promoCode.trim() || undefined,
      })
      .subscribe({
        next: (response) => {
          this.submitting.set(false);
          void this.router.navigate(['/auth/check-inbox'], {
            queryParams: { email: response.email },
          });
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          if (error instanceof AuthApiError) {
            const mapped = fieldErrorsFromApi(error);
            this.fieldErrors.set(mapped);
            if (!Object.keys(mapped).length) {
              this.banner.set(bannerMessageFromApi(error));
            } else {
              this.focusFirstError();
            }
          } else {
            this.banner.set(AUTH_MESSAGES.networkError);
          }
        },
      });
  }

  private focusFirstError(): void {
    queueMicrotask(() => {
      document.querySelector<HTMLElement>('.field-invalid .input')?.focus();
    });
  }

  private clearFieldError(field: keyof FieldErrors): void {
    if (!this.fieldErrors()[field]) return;
    const next = { ...this.fieldErrors() };
    delete next[field];
    this.fieldErrors.set(next);
  }
}
