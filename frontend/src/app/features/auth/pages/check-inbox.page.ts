import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthFacade } from '../data-access/auth.facade';
import { AuthApiError } from '../data-access/auth.models';
import { AUTH_MESSAGES, formatCountdown, isValidEmail } from '../data-access/auth.messages';
import { bannerMessageFromApi } from '../data-access/auth-error.mapper';

const RESEND_DEADLINE_KEY = 'orbit.auth.resend-deadline';

@Component({
  selector: 'app-check-inbox-page',
  imports: [RouterLink],
  template: `
    <section class="auth-card" data-node-id="10:2">
      <header>
        <h1>{{ resent() ? 'Check your inbox again' : 'Check your inbox' }}</h1>
        <p>
          @if (email()) {
            We sent a confirmation link to <strong>{{ email() }}</strong>.
          } @else {
            We sent a confirmation link to your email address.
          }
        </p>
      </header>

      <div class="notice notice-info" role="status">
        The link expires in 12 hours and can only be used once.
        @if (resent()) {
          The link in the earlier email no longer works.
        }
      </div>

      @if (banner()) {
        <div class="notice" [class.notice-danger]="bannerTone() === 'danger'" [class.notice-success]="bannerTone() === 'success'" role="alert">
          {{ banner() }}
        </div>
      }

      <div class="auth-actions">
        <a class="btn btn-primary" routerLink="/auth/login">I have confirmed — sign in</a>

        @if (secondsLeft() > 0) {
          <button class="btn btn-secondary" type="button" disabled>
            You can request another link in {{ countdownLabel() }}
          </button>
        } @else {
          <button
            class="btn btn-secondary"
            type="button"
            [disabled]="resending() || !email()"
            (click)="resend()"
          >
            {{ resending() ? 'Sending…' : 'Resend confirmation email' }}
          </button>
        }
      </div>

      <a class="text-link" routerLink="/auth/login">Back to sign in</a>
    </section>
  `,
  styleUrl: '../auth-pages.scss',
})
export class CheckInboxPage implements OnDestroy {
  private readonly auth = inject(AuthFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private timer: ReturnType<typeof setInterval> | null = null;

  protected readonly email = signal(
    this.route.snapshot.queryParamMap.get('email')?.trim().toLowerCase() ?? '',
  );
  protected readonly resent = signal(
    this.route.snapshot.queryParamMap.get('resent') === '1' || this.hasActiveDeadline(),
  );
  protected readonly banner = signal('');
  protected readonly bannerTone = signal<'danger' | 'success'>('success');
  protected readonly resending = signal(false);
  protected readonly secondsLeft = signal(this.remainingSeconds());

  constructor() {
    if (!this.email() || !isValidEmail(this.email())) {
      void this.router.navigateByUrl('/auth/sign-up');
      return;
    }
    this.startTicker();
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  protected countdownLabel(): string {
    return formatCountdown(this.secondsLeft());
  }

  protected resend(): void {
    if (!this.email() || this.secondsLeft() > 0) return;
    this.resending.set(true);
    this.banner.set('');
    this.auth.resendVerification({ email: this.email() }).subscribe({
      next: (response) => {
        this.resending.set(false);
        this.resent.set(true);
        this.bannerTone.set('success');
        this.banner.set(AUTH_MESSAGES.resendSent(this.email()));
        this.setDeadline(response.retryAfterSeconds);
        this.secondsLeft.set(response.retryAfterSeconds);
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { email: this.email(), resent: '1' },
          replaceUrl: true,
        });
      },
      error: (error: unknown) => {
        this.resending.set(false);
        if (error instanceof AuthApiError) {
          if (error.code === 'RATE_LIMITED' && error.retryAfterSeconds != null) {
            this.setDeadline(error.retryAfterSeconds);
            this.secondsLeft.set(error.retryAfterSeconds);
          }
          this.bannerTone.set('danger');
          this.banner.set(bannerMessageFromApi(error));
        } else {
          this.bannerTone.set('danger');
          this.banner.set(AUTH_MESSAGES.networkError);
        }
      },
    });
  }

  private startTicker(): void {
    this.timer = setInterval(() => {
      this.secondsLeft.set(this.remainingSeconds());
    }, 250);
  }

  private remainingSeconds(): number {
    const deadline = Number(localStorage.getItem(this.deadlineKey()) ?? '0');
    if (!deadline) return 0;
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  }

  private hasActiveDeadline(): boolean {
    return this.remainingSeconds() > 0;
  }

  private setDeadline(retryAfterSeconds: number): void {
    localStorage.setItem(
      this.deadlineKey(),
      String(Date.now() + retryAfterSeconds * 1000),
    );
  }

  private deadlineKey(): string {
    return `${RESEND_DEADLINE_KEY}:${this.email()}`;
  }
}
