import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DemoStore, DEMO_CREDENTIALS } from '../../data-access';
import { AuthFacade } from '../auth/data-access';
import { MOCK_AUTH_SEED } from '../auth/data-access/mock-auth.gateway';
import { PageHeader } from '../../shared/ui/page-header';
import { StatusView } from '../../shared/ui/status-view';

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule, RouterLink, PageHeader],
  template: `
    <section class="page stack" data-node-id="30:129">
      <app-page-header title="Settings" subtitle="Your personal details and security." />
      <div class="settings-layout">
        <form class="card panel settings-form" (ngSubmit)="save()">
          <h2>Personal details</h2>
          <div class="grid-2">
            <div class="field"><label for="first-name">First name</label><input class="input" id="first-name" [(ngModel)]="firstName" name="firstName" /></div>
            <div class="field"><label for="last-name">Last name</label><input class="input" id="last-name" [(ngModel)]="lastName" name="lastName" /></div>
          </div>
          <div class="field">
            <label for="settings-username">Username</label>
            <input class="input" id="settings-username" [value]="'@' + (store.currentUser()?.username ?? 'mohamed')" disabled />
            <small class="muted">Others use this to send you money, so it is fixed once your account is created.</small>
          </div>
          <div class="field">
            <label for="settings-email">Email</label>
            <input class="input" id="settings-email" [(ngModel)]="email" name="email" type="email" />
            <small style="color:var(--success)">Verified</small>
          </div>
          <div class="field">
            <label for="settings-phone">Phone number</label>
            <input class="input" id="settings-phone" [(ngModel)]="phone" name="phone" />
            <small class="muted">Egyptian mobile numbers only</small>
          </div>
          @if (saved()) { <div class="notice notice-info">Changes saved in this browser demo.</div> }
          <div class="quick-actions">
            <button class="btn btn-primary" type="submit">Save changes</button>
            <button class="btn btn-secondary" type="button" (click)="restore()">Cancel</button>
          </div>
        </form>
        <aside class="card panel security-card">
          <h2>Security</h2>
          <div class="security-row">
            <div><strong>Password</strong><p>Last changed 12 June 2026. Changing it signs out every device.</p></div>
            <a class="btn btn-secondary" routerLink="/settings/password">Change password</a>
          </div>
          <div class="security-row">
            <div><strong>Devices and sessions</strong><p>{{ store.activeSessions().length }} active sessions. Sign out any device remotely.</p></div>
            <a class="btn btn-secondary" routerLink="/settings/devices">Manage devices</a>
          </div>
          <div class="security-row">
            <div><strong>Promotional code</strong><p>ORBIT500 redeemed on 12 June 2026. One code per account.</p></div>
            <button class="btn btn-secondary" type="button">View history</button>
          </div>
          <div class="security-row">
            <div><strong>Demo data</strong><p>Restore balances, children, transactions and credentials.</p></div>
            <button class="btn btn-secondary" type="button" (click)="resetDemo()">Reset demo</button>
          </div>
        </aside>
      </div>
    </section>
  `,
  styleUrl: './account-pages.scss',
})
export default class SettingsPage {
  protected readonly store = inject(DemoStore);
  private readonly auth = inject(AuthFacade);
  protected readonly saved = signal(false);
  protected firstName = 'Mohamed';
  protected lastName = 'Mahmoud';
  protected email = 'mohamed@example.com';
  protected phone = '+20 10 1234 5678';

  protected save(): void {
    this.saved.set(true);
  }

  protected restore(): void {
    this.firstName = 'Mohamed';
    this.lastName = 'Mahmoud';
    this.email = 'mohamed@example.com';
    this.phone = '+20 10 1234 5678';
    this.saved.set(false);
  }

  protected resetDemo(): void {
    this.store.resetDemoData();
    this.restore();
    this.auth.logoutLocal();
    this.auth
      .login({
        username: MOCK_AUTH_SEED.parent.username,
        password: MOCK_AUTH_SEED.parent.password,
        rememberMe: false,
      })
      .subscribe({
        next: () => this.saved.set(true),
        error: () => this.saved.set(false),
      });
  }
}

@Component({
  selector: 'app-devices-page',
  imports: [DatePipe, RouterLink, PageHeader],
  template: `
    <section class="page stack" data-node-id="30:2">
      <app-page-header title="Devices and sessions" subtitle="Review and sign out devices with access to your wallet.">
        <a class="btn btn-secondary" routerLink="/settings">Back to settings</a>
      </app-page-header>
      @if (message()) { <div class="notice notice-info">{{ message() }}</div> }
      <section class="card panel device-list">
        @for (session of store.activeSessions(); track session.id) {
          <article class="device">
            <span class="device-icon" aria-hidden="true">▣</span>
            <div>
              <strong>{{ session.device.name }} @if (session.current) { · This device }</strong>
              <small>{{ session.device.platform }} · {{ session.device.location }}</small>
              <small>Last active {{ session.lastActiveAt | date: 'medium' }}</small>
            </div>
            <button class="btn btn-secondary" type="button" (click)="revoke(session.id)">
              Sign out
            </button>
          </article>
        } @empty {
          <p class="muted">No active sessions.</p>
        }
      </section>
    </section>
  `,
  styleUrl: './account-pages.scss',
})
export class DevicesPage {
  protected readonly store = inject(DemoStore);
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);
  protected readonly message = signal('');

  protected revoke(id: string): void {
    const result = this.store.revokeSession(id);
    if (!result.ok) {
      this.message.set(result.message);
      return;
    }
    if (!this.store.isAuthenticated()) {
      this.auth.logoutLocal();
      void this.router.navigateByUrl('/auth/login');
      return;
    }
    this.message.set('Session signed out.');
  }
}

@Component({
  selector: 'app-change-password-page',
  imports: [FormsModule, RouterLink, PageHeader, StatusView],
  template: `
    <section class="page stack" data-node-id="30:279">
      <app-page-header
        title="Change password"
        subtitle="Changing your password signs out every active session."
      />
      @if (complete()) {
        <app-status-view
          title="Password changed"
          message="All four active sessions were signed out. Sign in again with your new password."
          tone="success"
          actionLabel="Continue to sign in"
          (action)="goLogin()"
        />
      } @else {
        <form class="card panel stack password-card" (ngSubmit)="change()">
          <div class="field"><label for="current-password">Current password</label><input class="input" id="current-password" [(ngModel)]="currentPassword" name="currentPassword" type="password" /></div>
          <div class="field"><label for="new-password">New password</label><input class="input" id="new-password" [(ngModel)]="newPassword" name="newPassword" type="password" /></div>
          <div class="field"><label for="confirm-new-password">Confirm new password</label><input class="input" id="confirm-new-password" [(ngModel)]="confirmPassword" name="confirmPassword" type="password" /></div>
          <p class="muted">At least 8 characters with uppercase, lowercase and a number.</p>
          @if (error()) { <div class="notice notice-danger">{{ error() }}</div> }
          <div class="quick-actions">
            <button class="btn btn-primary" type="submit">Change password</button>
            <a class="btn btn-secondary" routerLink="/settings">Cancel</a>
          </div>
        </form>
      }
    </section>
  `,
  styleUrl: './account-pages.scss',
})
export class ChangePasswordPage {
  private readonly store = inject(DemoStore);
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);
  protected readonly error = signal('');
  protected readonly complete = signal(false);
  protected currentPassword = DEMO_CREDENTIALS.parent.password;
  protected newPassword = 'NewOrbit9';
  protected confirmPassword = 'NewOrbit9';

  protected change(): void {
    if (this.newPassword !== this.confirmPassword) {
      this.error.set('The passwords do not match.');
      return;
    }
    const result = this.store.changePassword({
      currentPassword: this.currentPassword,
      newPassword: this.newPassword,
    });
    if (!result.ok) {
      this.error.set(result.message);
      return;
    }
    this.auth.logoutLocal();
    this.complete.set(true);
  }

  protected goLogin(): void {
    void this.router.navigateByUrl('/auth/login');
  }
}
