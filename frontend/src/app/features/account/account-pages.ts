import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  PasswordApiError,
  PasswordFacade,
  ProfileApiError,
  ProfileFacade,
  SessionApiError,
  SessionFacade,
  SessionSummary,
  bannerMessageFromSessionApi,
} from './data-access';
import {
  formatLastActive,
  isUnrecognisedSession,
  toApiPhone,
  toDisplayPhone,
} from './account-session.utils';
import { AuthFacade } from '../auth/data-access';
import { LoadingSpinner } from '../../shared/ui/loading-spinner';
import { PageHeader } from '../../shared/ui/page-header';
import { StatusView } from '../../shared/ui/status-view';

/** Figma journey 32:156 — Account & security (30:129, 30:2, 30:279, 30:314). */
const FIGMA_JOURNEY_ACCOUNT_SECURITY = '32:156';

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule, RouterLink, PageHeader, StatusView, LoadingSpinner],
  template: `
    <section class="page stack" [attr.data-figma-journey]="figmaJourney" data-node-id="30:129">
      @if (loading()) {
        <div class="page-center">
          <app-loading-spinner label="Fetching your profile…" />
        </div>
      } @else if (loadError()) {
        <div class="page-center">
          <app-status-view title="Unable to load settings" [message]="loadError()" tone="danger" />
        </div>
      } @else {
        <app-page-header title="Settings" subtitle="Your personal details and security." />
        <div class="settings-layout">
          <form class="card panel settings-form" (ngSubmit)="save()">
            <h2>Personal details</h2>
            <div class="grid-2">
              <div class="field">
                <label for="first-name">First name</label>
                <input class="input" id="first-name" [(ngModel)]="firstName" name="firstName" [disabled]="saving()" />
              </div>
              <div class="field">
                <label for="last-name">Last name</label>
                <input class="input" id="last-name" [(ngModel)]="lastName" name="lastName" [disabled]="saving()" />
              </div>
            </div>
            <div class="field">
              <div class="label-row">
                <label for="settings-username">Username</label>
                <span class="label-meta">Cannot be changed</span>
              </div>
              <input
                class="input input-readonly"
                id="settings-username"
                [value]="'@' + username"
                disabled
              />
              <p class="field-hint">
                <span class="hint-dot" aria-hidden="true"></span>
                Others use this to send you money, so it is fixed once your account is created.
              </p>
            </div>
            <!-- Figma 30:129: email shown read-only; profile API does not support updates yet. -->
            <div class="field">
              <label for="settings-email">Email</label>
              <input
                class="input input-readonly"
                id="settings-email"
                [value]="email"
                type="email"
                disabled
                autocomplete="email"
              />
            </div>
            <div class="field">
              <label for="settings-phone">Phone number</label>
              <div class="phone-input">
                <span class="phone-prefix" aria-hidden="true">EG +20</span>
                <input
                  class="input"
                  id="settings-phone"
                  [(ngModel)]="phoneLocal"
                  name="phoneLocal"
                  inputmode="tel"
                  placeholder="10 1234 5678"
                  [disabled]="saving()"
                />
              </div>
              <p class="field-hint">
                <span class="hint-dot" aria-hidden="true"></span>
                Egyptian mobile numbers only
              </p>
            </div>
            @if (saveError()) { <div class="notice notice-danger">{{ saveError() }}</div> }
            @if (saved()) { <div class="notice notice-info">Your changes were saved.</div> }
            <div class="quick-actions">
              <button class="btn btn-primary" type="submit" [disabled]="saving()">
                {{ saving() ? 'Saving…' : 'Save changes' }}
              </button>
              <button class="btn btn-secondary" type="button" (click)="restore()" [disabled]="saving()">Cancel</button>
            </div>
          </form>
          <aside class="card panel security-card">
            <h2>Security</h2>
            <div class="security-row">
              <div class="security-row-copy">
                <strong>Password</strong>
                <!-- Figma includes "Last changed …"; omitted until backend exposes passwordLastChangedAt. -->
                <p>Changing it signs out every device.</p>
              </div>
              <a class="btn btn-secondary" routerLink="/settings/password">Change password</a>
            </div>
            <div class="security-row">
              <div class="security-row-copy">
                <strong>Devices and sessions</strong>
                <p>{{ sessionLabel() }} Sign out any device remotely.</p>
              </div>
              <a class="btn btn-secondary" routerLink="/settings/devices">Manage devices</a>
            </div>
            <!--
              Signing out of THIS device. "Manage devices" deliberately cannot
              do it — the backend refuses with CANNOT_SIGN_OUT_CURRENT_DEVICE —
              and the sidebar button that used to be the only way out is
              display:none on phones, which left a signed-in mobile user with
              no control anywhere on screen to leave.
            -->
            <div class="security-row">
              <div class="security-row-copy">
                <strong>This device</strong>
                <p>End your session on this phone or computer.</p>
              </div>
              <button
                class="btn btn-secondary"
                type="button"
                [disabled]="signingOutThisDevice()"
                (click)="signOutThisDevice()"
              >
                {{ signingOutThisDevice() ? 'Signing out…' : 'Sign out' }}
              </button>
            </div>
          </aside>
        </div>
      }
    </section>
  `,
  styleUrl: './account-pages.scss',
})
export default class SettingsPage implements OnInit {
  protected readonly figmaJourney = FIGMA_JOURNEY_ACCOUNT_SECURITY;
  private readonly profile = inject(ProfileFacade);
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);
  protected readonly signingOutThisDevice = signal(false);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly saveError = signal('');
  protected readonly activeSessionCount = signal<number | null>(null);
  protected firstName = '';
  protected lastName = '';
  protected username = '';
  protected email = '';
  protected phoneLocal = '';
  private snapshot = { firstName: '', lastName: '', phoneLocal: '' };

  /**
   * Mirrors the sidebar's logout: revoke the session server-side, clear it
   * locally, then replace the current history entry so Back cannot aim at a
   * screen this session no longer opens.
   */
  protected signOutThisDevice(): void {
    if (this.signingOutThisDevice()) return;
    this.signingOutThisDevice.set(true);
    this.auth.logout().subscribe(() => {
      void this.router.navigateByUrl('/auth/login', { replaceUrl: true });
    });
  }

  ngOnInit(): void {
    this.profile.getProfile().subscribe({
      next: (profile) => {
        this.applyProfile(profile);
        this.activeSessionCount.set(profile.nonRevokedSessionCount ?? null);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(
          error instanceof ProfileApiError
            ? (error.detail ?? error.message)
            : 'We could not load your profile right now.',
        );
        this.loading.set(false);
      },
    });
  }

  protected sessionLabel(): string {
    const count = this.activeSessionCount();
    if (count === null) {
      return 'Active sessions unavailable.';
    }
    return `${count} active session${count === 1 ? '' : 's'}.`;
  }

  protected save(): void {
    this.saveError.set('');
    this.saved.set(false);
    this.saving.set(true);
    this.profile
      .updateProfile({
        firstName: this.firstName.trim(),
        lastName: this.lastName.trim(),
        phoneNumber: toApiPhone(this.phoneLocal),
        username: this.username,
      })
      .subscribe({
        next: (profile) => {
          this.applyProfile(profile);
          this.saving.set(false);
          this.saved.set(true);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.saveError.set(
            error instanceof ProfileApiError
              ? (error.detail ?? error.message)
              : 'We could not save your changes right now.',
          );
        },
      });
  }

  protected restore(): void {
    this.firstName = this.snapshot.firstName;
    this.lastName = this.snapshot.lastName;
    this.phoneLocal = this.snapshot.phoneLocal;
    this.saved.set(false);
    this.saveError.set('');
  }

  private applyProfile(profile: {
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    phoneNumber: string;
  }): void {
    this.firstName = profile.firstName;
    this.lastName = profile.lastName;
    this.username = profile.username;
    this.email = profile.email;
    this.phoneLocal = toDisplayPhone(profile.phoneNumber);
    this.snapshot = { firstName: profile.firstName, lastName: profile.lastName, phoneLocal: this.phoneLocal };
  }
}

@Component({
  selector: 'app-devices-page',
  imports: [PageHeader, StatusView, LoadingSpinner],
  template: `
    <section class="page stack" [attr.data-figma-journey]="figmaJourney" data-node-id="30:2">
      @if (loading()) {
        <div class="page-center">
          <app-loading-spinner label="Fetching your active devices…" />
        </div>
      } @else if (loadError()) {
        <div class="page-center">
          <app-status-view title="Unable to load sessions" [message]="loadError()" tone="danger" />
        </div>
      } @else {
        <app-page-header
          title="Devices and sessions"
          subtitle="Everywhere you are signed in. Signing out a device ends its session immediately."
        />
        @if (message()) { <div class="notice notice-info">{{ message() }}</div> }
        @if (currentSession(); as current) {
          <section class="card panel current-device-card">
            <div class="current-device-row">
              <span class="device-icon" aria-hidden="true">●</span>
              <div>
                <div class="device-name-row">
                  <strong>{{ current.deviceLabel }}</strong>
                  <span class="pill" style="background: var(--accent-wash); color: var(--accent-dim)">THIS DEVICE</span>
                </div>
                <p class="device-meta">
                  {{ current.location ?? 'Unknown location' }} · {{ formatLastActive(current.lastUsedAt, true) }}
                </p>
              </div>
            </div>
          </section>
        }
        <section class="card panel other-sessions-card">
          <div class="other-sessions-header">
            <h2>Other active sessions</h2>
            @if (otherSessions().length) {
              <button
                class="btn btn-danger-outline"
                type="button"
                [disabled]="signingOutAll() || refreshing()"
                (click)="signOutAllOthers()"
              >
                {{ signingOutAll() ? 'Signing out…' : 'Sign out all others' }}
              </button>
            }
          </div>
          @for (session of otherSessions(); track session.id) {
            <article class="session-row" [class.session-row-danger]="isUnrecognised(session)">
              <span
                class="device-icon"
                [class.device-icon-danger]="isUnrecognised(session)"
                aria-hidden="true"
              >
                {{ isUnrecognised(session) ? '!' : '▣' }}
              </span>
              <div class="session-copy">
                <strong>{{ session.deviceLabel }}</strong>
                <small>{{ session.location ?? 'Unknown location' }}</small>
              </div>
              <span class="session-last-active">{{ formatLastActive(session.lastUsedAt, false) }}</span>
              <button
                class="btn btn-secondary"
                type="button"
                [disabled]="signingOutId() === session.id || refreshing()"
                (click)="signOut(session.id)"
              >
                {{ signingOutId() === session.id ? 'Signing out…' : 'Sign out' }}
              </button>
            </article>
          } @empty {
            <p class="muted" style="padding: 14px 16px 18px">No other active sessions.</p>
          }
        </section>
        <div class="notice notice-held notice-dot">
          <span class="hint-dot" aria-hidden="true"></span>
          <p>
            Do not recognise a device? Sign it out and change your password. Changing your password signs out every device automatically.
          </p>
        </div>
      }
    </section>
  `,
  styleUrl: './account-pages.scss',
})
export class DevicesPage implements OnInit {
  protected readonly figmaJourney = FIGMA_JOURNEY_ACCOUNT_SECURITY;
  private readonly sessions = inject(SessionFacade);
  protected readonly loading = signal(true);
  protected readonly refreshing = signal(false);
  protected readonly loadError = signal('');
  protected readonly message = signal('');
  protected readonly signingOutId = signal<string | null>(null);
  protected readonly signingOutAll = signal(false);
  protected readonly allSessions = signal<SessionSummary[]>([]);
  protected readonly currentSession = computed(() =>
    this.allSessions().find((session) => session.currentDevice) ?? null,
  );
  protected readonly otherSessions = computed(() =>
    this.allSessions().filter((session) => !session.currentDevice),
  );
  protected readonly formatLastActive = formatLastActive;
  protected readonly isUnrecognised = isUnrecognisedSession;

  ngOnInit(): void {
    this.loadSessions();
  }

  protected signOut(sessionId: string): void {
    this.message.set('');
    this.signingOutId.set(sessionId);
    this.sessions.signOutSession(sessionId).subscribe({
      next: () => {
        this.signingOutId.set(null);
        this.message.set('Session signed out.');
        this.loadSessions(true);
      },
      error: (error: unknown) => {
        this.signingOutId.set(null);
        this.message.set(
          error instanceof SessionApiError
            ? bannerMessageFromSessionApi(error, 'We could not sign out that device.')
            : 'We could not sign out that device.',
        );
      },
    });
  }

  protected signOutAllOthers(): void {
    this.message.set('');
    this.signingOutAll.set(true);
    this.sessions.signOutAllOthers().subscribe({
      next: () => {
        this.signingOutAll.set(false);
        this.message.set('All other sessions were signed out.');
        this.loadSessions(true);
      },
      error: (error: unknown) => {
        this.signingOutAll.set(false);
        this.message.set(
          error instanceof SessionApiError
            ? bannerMessageFromSessionApi(error, 'We could not sign out the other sessions.')
            : 'We could not sign out the other sessions.',
        );
      },
    });
  }

  private loadSessions(silent = false): void {
    if (silent) {
      this.refreshing.set(true);
    } else {
      this.loading.set(true);
    }
    this.loadError.set('');
    this.sessions.listActiveSessions().subscribe({
      next: (sessions) => {
        this.allSessions.set(sessions);
        this.loading.set(false);
        this.refreshing.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(
          error instanceof SessionApiError
            ? bannerMessageFromSessionApi(error, 'We could not load your sessions right now.')
            : 'We could not load your sessions right now.',
        );
        this.loading.set(false);
        this.refreshing.set(false);
      },
    });
  }
}

@Component({
  selector: 'app-change-password-page',
  imports: [FormsModule, RouterLink, StatusView],
  template: `
    <section class="password-page" [attr.data-figma-journey]="figmaJourney" data-node-id="30:279">
      @if (complete()) {
        <div class="password-wrap" data-node-id="30:314">
          <app-status-view
            title="Password changed"
            [message]="successMessage()"
            tone="success"
            actionLabel="Continue to sign in"
            (action)="goLogin()"
          />
          <!-- Figma 30:314: title + dynamic sign-out copy + Continue to sign in CTA. -->
        </div>
      } @else {
        <div class="password-wrap">
          <form class="card panel password-card" (ngSubmit)="change()">
            <div class="password-headings">
              <h1>Change password</h1>
              <p>Choose something you have not used before.</p>
            </div>
            <div class="field">
              <label for="current-password">Current password</label>
              <div class="password-input">
                <input
                  class="input"
                  id="current-password"
                  [(ngModel)]="currentPassword"
                  name="currentPassword"
                  [type]="showCurrent() ? 'text' : 'password'"
                  placeholder="Enter your current password"
                  [disabled]="submitting()"
                />
                <button class="password-toggle" type="button" (click)="showCurrent.set(!showCurrent())">
                  {{ showCurrent() ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>
            <div class="field">
              <label for="new-password">New password</label>
              <div class="password-input">
                <input
                  class="input"
                  id="new-password"
                  [(ngModel)]="newPassword"
                  name="newPassword"
                  [type]="showNew() ? 'text' : 'password'"
                  placeholder="At least 8 characters"
                  [disabled]="submitting()"
                />
                <button class="password-toggle" type="button" (click)="showNew.set(!showNew())">
                  {{ showNew() ? 'Hide' : 'Show' }}
                </button>
              </div>
              <p class="field-hint">
                <span class="hint-dot" aria-hidden="true"></span>
                At least 8 characters, with a letter and a number
              </p>
            </div>
            <div class="field">
              <label for="confirm-new-password">Confirm new password</label>
              <div class="password-input">
                <input
                  class="input"
                  id="confirm-new-password"
                  [(ngModel)]="confirmPassword"
                  name="confirmPassword"
                  [type]="showConfirm() ? 'text' : 'password'"
                  placeholder="Repeat the new password"
                  [disabled]="submitting()"
                />
                <button class="password-toggle" type="button" (click)="showConfirm.set(!showConfirm())">
                  {{ showConfirm() ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>
            <div class="notice notice-held notice-dot">
              <span class="hint-dot" aria-hidden="true"></span>
              <p>{{ signOutNotice() }}</p>
            </div>
            @if (error()) { <div class="notice notice-danger">{{ error() }}</div> }
            <div class="password-actions">
              <a class="btn btn-secondary" routerLink="/settings">Cancel</a>
              <button class="btn btn-primary" type="submit" [disabled]="submitting()">
                {{ submitting() ? 'Updating password…' : 'Update password' }}
              </button>
            </div>
          </form>
        </div>
      }
    </section>
  `,
  styleUrl: './account-pages.scss',
})
export class ChangePasswordPage implements OnInit {
  protected readonly figmaJourney = FIGMA_JOURNEY_ACCOUNT_SECURITY;
  private readonly password = inject(PasswordFacade);
  private readonly profile = inject(ProfileFacade);
  private readonly router = inject(Router);
  protected readonly error = signal('');
  protected readonly complete = signal(false);
  protected readonly submitting = signal(false);
  protected readonly devicesSignedOut = signal(0);
  protected readonly activeSessionCount = signal<number | null>(null);
  protected readonly showCurrent = signal(false);
  protected readonly showNew = signal(false);
  protected readonly showConfirm = signal(false);
  protected currentPassword = '';
  protected newPassword = '';
  protected confirmPassword = '';

  ngOnInit(): void {
    this.profile.getProfile().subscribe({
      next: (profile) =>
        this.activeSessionCount.set(profile.nonRevokedSessionCount ?? null),
      error: () => this.activeSessionCount.set(null),
    });
  }

  protected signOutNotice(): string {
    const count = this.activeSessionCount();
    if (count === null) {
      return 'You will be signed out on every device, including this one. You will need to sign in again.';
    }
    return `You will be signed out on all ${count} device${count === 1 ? '' : 's'}, including this one. You will need to sign in again.`;
  }

  protected successMessage(): string {
    const count = this.devicesSignedOut();
    return `All ${count} active session${count === 1 ? '' : 's'} ${count === 1 ? 'was' : 'were'} signed out. Sign in again with your new password.`;
  }

  protected change(): void {
    this.error.set('');
    if (this.newPassword !== this.confirmPassword) {
      this.error.set('The passwords do not match.');
      return;
    }
    this.submitting.set(true);
    this.password
      .changePassword({
        currentPassword: this.currentPassword,
        newPassword: this.newPassword,
        confirmNewPassword: this.confirmPassword,
      })
      .subscribe({
        next: (response) => {
          this.devicesSignedOut.set(response.devicesSignedOut);
          this.password.logoutAfterPasswordChange();
          this.submitting.set(false);
          this.complete.set(true);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          if (error instanceof PasswordApiError) {
            const mismatch = error.fieldErrors.find(
              (item) => item.code === 'PASSWORD_CONFIRMATION_MISMATCH',
            );
            if (mismatch) {
              this.error.set('The passwords do not match.');
              return;
            }
            this.error.set(error.detail ?? error.message);
            return;
          }
          this.error.set('We could not change your password right now.');
        },
      });
  }

  protected goLogin(): void {
    void this.router.navigateByUrl('/auth/login');
  }
}
