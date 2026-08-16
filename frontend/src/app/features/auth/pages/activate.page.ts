import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { LoadingSpinner } from '../../../shared/ui/loading-spinner';
import { StatusView } from '../../../shared/ui/status-view';
import { AuthFacade } from '../data-access/auth.facade';
import { AuthApiError } from '../data-access/auth.models';
import { AUTH_MESSAGES, isValidEmail } from '../data-access/auth.messages';
import { bannerMessageFromApi } from '../data-access/auth-error.mapper';

type ActivateState =
  | 'loading'
  | 'success'
  | 'already-active'
  | 'expired'
  | 'used'
  | 'invalid'
  | 'network';

@Component({
  selector: 'app-activate-page',
  imports: [StatusView, LoadingSpinner, RouterLink],
  template: `
    @switch (state()) {
      @case ('loading') {
        <app-loading-spinner label="Confirming your email address…" />
      }
      @case ('success') {
        <app-status-view
          title="Your wallet is ready"
          [message]="AUTH_MESSAGES.verifiedSuccess"
          tone="success"
          actionLabel="Sign in to Orbit"
          (action)="goToLogin()"
        />
      }
      @case ('already-active') {
        <app-status-view
          title="This account is already active"
          [message]="AUTH_MESSAGES.alreadyVerified"
          tone="success"
          actionLabel="Sign in"
          (action)="goToLogin()"
        />
      }
      @case ('expired') {
        <section class="auth-card">
          <app-status-view
            title="This link has expired"
            [message]="AUTH_MESSAGES.tokenExpired"
            tone="danger"
            presentation="plain"
          />
          <div class="auth-actions">
            <button class="btn btn-primary" type="button" [disabled]="resending()" (click)="resend()">
              {{ resending() ? 'Sending…' : 'Send a new link' }}
            </button>
            <a class="text-link" routerLink="/auth/login">Back to sign in</a>
          </div>
          @if (banner()) {
            <div class="notice notice-info" role="status">{{ banner() }}</div>
          }
        </section>
      }
      @case ('used') {
        <section class="auth-card">
          <app-status-view
            title="This link is no longer valid"
            [message]="AUTH_MESSAGES.tokenAlreadyUsed"
            tone="danger"
            presentation="plain"
          />
          <div class="auth-actions">
            <button class="btn btn-primary" type="button" [disabled]="resending()" (click)="resend()">
              {{ resending() ? 'Sending…' : 'Send a new link' }}
            </button>
            <a class="text-link" routerLink="/auth/login">Back to sign in</a>
          </div>
          @if (banner()) {
            <div class="notice notice-info" role="status">{{ banner() }}</div>
          }
        </section>
      }
      @case ('invalid') {
        <section class="auth-card">
          <app-status-view
            title="This confirmation link isn't valid"
            [message]="AUTH_MESSAGES.tokenInvalid"
            tone="danger"
            presentation="plain"
          />
          <div class="auth-actions">
            <button class="btn btn-primary" type="button" [disabled]="resending()" (click)="resend()">
              {{ resending() ? 'Sending…' : 'Send a new link' }}
            </button>
            <a class="text-link" routerLink="/auth/login">Back to sign in</a>
          </div>
          @if (banner()) {
            <div class="notice notice-info" role="status">{{ banner() }}</div>
          }
        </section>
      }
      @default {
        <app-status-view
          title="Something went wrong"
          [message]="AUTH_MESSAGES.networkError"
          tone="danger"
          actionLabel="Try again"
          (action)="activate()"
        />
      }
    }
  `,
  styleUrl: '../auth-pages.scss',
})
export class ActivatePage implements OnInit {
  private readonly auth = inject(AuthFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly AUTH_MESSAGES = AUTH_MESSAGES;
  protected readonly state = signal<ActivateState>('loading');
  protected readonly banner = signal('');
  protected readonly resending = signal(false);
  private emailHint = '';

  ngOnInit(): void {
    this.emailHint =
      this.route.snapshot.queryParamMap.get('email')?.trim().toLowerCase() ??
      (typeof window !== 'undefined'
        ? ((window as unknown as { __orbitLastVerifyEmail?: string }).__orbitLastVerifyEmail ??
          '')
        : '');
    this.activate();
  }

  protected activate(): void {
    const token = this.route.snapshot.queryParamMap.get('token')?.trim() ?? '';
    if (!token) {
      this.state.set('invalid');
      return;
    }

    this.state.set('loading');
    this.auth.verify({ token }).subscribe({
      next: (response) => {
        this.state.set(response.alreadyVerified ? 'already-active' : 'success');
      },
      error: (error: unknown) => {
        if (error instanceof AuthApiError) {
          if (error.code === 'TOKEN_EXPIRED') this.state.set('expired');
          else if (error.code === 'TOKEN_ALREADY_USED') this.state.set('used');
          else if (error.code === 'ALREADY_VERIFIED') this.state.set('already-active');
          else if (error.code === 'TOKEN_INVALID') this.state.set('invalid');
          else this.state.set('network');
        } else {
          this.state.set('network');
        }
      },
    });
  }

  protected resend(): void {
    if (!isValidEmail(this.emailHint)) {
      void this.router.navigateByUrl('/auth/check-inbox');
      return;
    }
    this.resending.set(true);
    this.auth.resendVerification({ email: this.emailHint }).subscribe({
      next: () => {
        this.resending.set(false);
        void this.router.navigate(['/auth/check-inbox'], {
          queryParams: { email: this.emailHint, resent: '1' },
        });
      },
      error: (error: unknown) => {
        this.resending.set(false);
        this.banner.set(
          error instanceof AuthApiError
            ? bannerMessageFromApi(error)
            : AUTH_MESSAGES.networkError,
        );
      },
    });
  }

  protected goToLogin(): void {
    void this.router.navigateByUrl('/auth/login');
  }
}
