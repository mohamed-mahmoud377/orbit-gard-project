import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, switchMap } from 'rxjs';
import { AssetUrlPipe } from '../../core/asset-url';
import { AuthFacade } from '../auth/data-access';
import { LoadingSpinner } from '../../shared/ui/loading-spinner';
import { PageHeader } from '../../shared/ui/page-header';
import { StatusView } from '../../shared/ui/status-view';
import { TransactionList, TransactionListItem } from '../../shared/ui/transaction-list';
import {
  formatMoney,
  parseMoney,
  sanitizeMoneyInput,
} from '../../shared/utils/money';
import {
  bannerMessageFromWalletError,
  WalletApiError,
  WalletFacade,
} from '../wallet/data-access';
import {
  bannerMessageFromFamilyError,
  dailyResetLabel,
  fieldErrorsFromFamilyApi,
  monthlyResetLabel,
  ChildActivitySummary,
  ChildSelfFacade,
  ChildWalletSnapshot,
  FamilyApiError,
  FamilyChildCard,
  FamilyChildDetail,
  FamilyFacade,
  FAMILY_MESSAGES,
  TRANSFER_MAX_MAJOR,
  TRANSFER_MIN_MAJOR,
} from './data-access';
import {
  blockedAttemptsLabel,
  childDetailSubtitle,
  childInitials,
  limitProgressDanger,
  limitProgressLabel,
  limitProgressPercent,
  statusLabel,
  statusPillClass,
} from './family-limit.utils';

function majorFromInput(value: string): number {
  return parseMoney(value) / 100;
}

function isValidLimitOrder(perMajor: number, dailyMajor: number, monthlyMajor: number): boolean {
  return perMajor <= dailyMajor && dailyMajor <= monthlyMajor;
}

@Component({
  selector: 'app-family-page',
  imports: [RouterLink, PageHeader, LoadingSpinner, StatusView],
  template: `
    <section class="page stack" data-node-id="15:2">
      <app-page-header
        title="Family"
        subtitle="Wallets you fund and supervise. Spending rules apply automatically."
      >
        <a class="btn btn-primary" routerLink="/family/add">Add a child</a>
      </app-page-header>
      @if (loading()) {
        <div class="page-center">
          <app-loading-spinner label="Loading family wallets…" />
        </div>
      } @else if (error()) {
        <div class="page-center">
          <app-status-view title="Unable to load family" [message]="error()" tone="danger" />
        </div>
      } @else {
        <div class="family-summary">
          <div class="summary-stat">
            <span>Children</span>
            <strong>{{ overview()?.childrenCount ?? 0 }}</strong>
          </div>
          <div class="summary-stat summary-stat-allocated">
            <span>Allocated this month</span>
            <strong>{{ money(overview()?.allocatedThisMonthMinor ?? 0) }}</strong>
          </div>
          <div class="summary-stat">
            <span>Spent this month</span>
            <strong>{{ money(overview()?.spentThisMonthMinor ?? 0) }}</strong>
          </div>
          <div class="summary-stat summary-stat-blocked">
            <span>Blocked by limits</span>
            <strong>{{ blockedLabel(overview()?.blockedAttempts ?? 0) }}</strong>
          </div>
        </div>
        <div class="children-grid">
          @for (child of children(); track child.id) {
            <article class="card child-card">
              <header class="child-heading">
                <span class="child-avatar">{{ initials(child.name) }}</span>
                <div>
                  <strong>{{ child.name }}</strong>
                  <small>{{ child.handle }}</small>
                </div>
                <span [class]="statusPill(child.status)">{{ statusText(child.status) }}</span>
              </header>
              <div class="child-balance">
                <span class="overline">Available</span>
                <strong class="amount">{{ money(child.availableMinor) }}</strong>
                <div class="child-balance-sub">
                  <span class="muted">Balance {{ money(child.balanceMinor) }}</span>
                  <span class="held-amount">Held {{ money(child.heldMinor) }}</span>
                </div>
              </div>
              <div class="limits-panel">
                <div class="limit-row">
                  <div class="limit-copy">
                    <span>Today</span>
                    <span [class.limit-danger]="todayDanger(child)">
                      {{ limitLabel(child.limits.today.spentMinor, child.limits.today.maxMinor) }}
                    </span>
                  </div>
                  <div class="progress">
                    <span
                      [style.width.%]="todayPercent(child)"
                      [style.background]="todayDanger(child) ? 'var(--danger)' : ''"
                    ></span>
                  </div>
                </div>
                <div class="limit-row">
                  <div class="limit-copy">
                    <span>This month</span>
                    <span>
                      {{ limitLabel(child.limits.month.spentMinor, child.limits.month.maxMinor) }}
                    </span>
                  </div>
                  <div class="progress">
                    <span [style.width.%]="monthPercent(child)"></span>
                  </div>
                </div>
                <div class="limit-copy limit-per-transaction">
                  <span>Per transaction</span>
                  <span>Max {{ money(child.limits.perTransactionMinor) }}</span>
                </div>
              </div>
              <div class="child-actions">
                <a
                  class="btn btn-primary"
                  [routerLink]="['/family', child.id]"
                  [queryParams]="{ action: 'fund' }"
                >
                  Add money
                </a>
                <a class="btn btn-secondary" [routerLink]="['/family', child.id]">View activity</a>
              </div>
            </article>
          }
          <a class="add-card" routerLink="/family/add">
            <span>+</span><strong>Add a child</strong>
            <small>Open a wallet you fund and control</small>
          </a>
        </div>
      }
    </section>
  `,
  styleUrl: './family-pages.scss',
})
export default class FamilyPage implements OnInit {
  private readonly family = inject(FamilyFacade);

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly overview = signal<import('./data-access/family.models').FamilyOverview | null>(
    null,
  );
  protected readonly children = signal<readonly FamilyChildCard[]>([]);
  protected readonly money = formatMoney;
  protected readonly initials = childInitials;
  protected readonly limitLabel = limitProgressLabel;
  protected readonly blockedLabel = blockedAttemptsLabel;
  protected readonly statusPill = statusPillClass;
  protected readonly statusText = statusLabel;

  ngOnInit(): void {
    this.family.loadFamilyPage().subscribe({
      next: ({ overview, children }) => {
        this.overview.set(overview);
        this.children.set(children);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(
          err instanceof FamilyApiError
            ? bannerMessageFromFamilyError(err)
            : FAMILY_MESSAGES.loadFamilyError,
        );
      },
    });
  }

  protected todayPercent(child: FamilyChildCard): number {
    return limitProgressPercent(child.limits.today.spentMinor, child.limits.today.maxMinor);
  }

  protected monthPercent(child: FamilyChildCard): number {
    return limitProgressPercent(child.limits.month.spentMinor, child.limits.month.maxMinor);
  }

  protected todayDanger(child: FamilyChildCard): boolean {
    return limitProgressDanger(child.limits.today.spentMinor, child.limits.today.maxMinor);
  }
}

@Component({
  selector: 'app-child-detail-page',
  imports: [FormsModule, RouterLink, PageHeader, TransactionList, LoadingSpinner, StatusView],
  template: `
    <section class="page stack" data-node-id="17:2">
      <app-page-header
        [title]="detail()?.name ?? 'Child wallet'"
        [subtitle]="detailSubtitle(detail()?.walletOpenedAt)"
      >
        <a class="btn btn-secondary" routerLink="/family">Back to family</a>
      </app-page-header>
      @if (loading()) {
        <div class="page-center">
          <app-loading-spinner label="Loading child wallet…" />
        </div>
      } @else if (loadError()) {
        <div class="page-center">
          <app-status-view title="Unable to load child wallet" [message]="loadError()" tone="danger" />
        </div>
      } @else if (detail(); as child) {
        <div class="child-detail-identity">
          <span class="child-avatar">{{ initials(child.name) }}</span>
          <div>
            <strong>{{ child.name }}</strong>
            <small>{{ child.handle }}</small>
          </div>
          <span [class]="statusPill(child.status)">{{ statusText(child.status) }}</span>
        </div>
        <div class="detail-layout">
          <div class="stack">
            <article class="hero-child">
              <div>
                <span class="overline">Available to spend</span>
                <h2 class="amount">{{ money(child.availableMinor) }}</h2>
                <div class="child-balance-sub">
                  <span class="muted">Balance {{ money(child.balanceMinor) }}</span>
                  <span class="held-amount">Held {{ money(child.heldMinor) }}</span>
                </div>
              </div>
            </article>
            <p class="child-detail-allocated">
              Allocated this month <strong>{{ money(child.allocatedThisMonthMinor) }}</strong>
            </p>
            <section class="limits-panel child-detail-limits">
              <div class="limit-row">
                <div class="limit-copy">
                  <span>Today</span>
                  <span [class.limit-danger]="todayDanger(child)">
                    {{ limitLabel(child.limits.today.spentMinor, child.limits.today.maxMinor) }}
                  </span>
                </div>
                <div class="progress">
                  <span
                    [style.width.%]="todayPercent(child)"
                    [style.background]="todayDanger(child) ? 'var(--danger)' : ''"
                  ></span>
                </div>
                <small class="muted limit-remaining">
                  {{ money(child.limits.today.remainingMinor) }} remaining today
                </small>
              </div>
              <div class="limit-row">
                <div class="limit-copy">
                  <span>This month</span>
                  <span>
                    {{ limitLabel(child.limits.month.spentMinor, child.limits.month.maxMinor) }}
                  </span>
                </div>
                <div class="progress">
                  <span [style.width.%]="monthPercent(child)"></span>
                </div>
                <small class="muted limit-remaining">
                  {{ money(child.limits.month.remainingMinor) }} remaining this month
                </small>
              </div>
              <div class="limit-copy limit-per-transaction">
                <span>Per transaction</span>
                <span>Max {{ money(child.limits.perTransactionMinor) }}</span>
              </div>
            </section>
            <section class="card panel">
              <header class="activity-header">
                <h2>Activity</h2>
              </header>
              @if (activityError()) {
                <div class="notice notice-danger">{{ activityError() }}</div>
              } @else {
                <app-transaction-list [transactions]="activity()" />
              }
            </section>
          </div>
          <aside class="stack">
            <article class="card panel limits-form">
              <h2>Edit spending limits</h2>
              <div class="field" [class.field-invalid]="fieldErrors()['dailyLimit']">
                <label for="daily">Daily</label>
                <input class="input" id="daily" [(ngModel)]="daily" />
                @if (fieldErrors()['dailyLimit']) {
                  <p class="field-error">{{ fieldErrors()['dailyLimit'] }}</p>
                }
              </div>
              <div class="field" [class.field-invalid]="fieldErrors()['monthlyLimit']">
                <label for="monthly">Monthly</label>
                <input class="input" id="monthly" [(ngModel)]="monthly" />
                @if (fieldErrors()['monthlyLimit']) {
                  <p class="field-error">{{ fieldErrors()['monthlyLimit'] }}</p>
                }
              </div>
              <div class="field" [class.field-invalid]="fieldErrors()['maxPerTransaction']">
                <label for="single">Per transaction</label>
                <input class="input" id="single" [(ngModel)]="single" />
                @if (fieldErrors()['maxPerTransaction']) {
                  <p class="field-error">{{ fieldErrors()['maxPerTransaction'] }}</p>
                }
              </div>
              <button
                class="btn btn-primary"
                type="button"
                [disabled]="savingLimits()"
                (click)="saveLimits()"
              >
                {{ savingLimits() ? 'Saving…' : 'Save limits' }}
              </button>
            </article>
            <article class="card panel stack" id="fund-panel">
              <h2>Add money</h2>
              <div class="field">
                <label for="funding">Amount</label>
                <input
                  class="input"
                  id="funding"
                  [(ngModel)]="funding"
                  (input)="onFundingInput($event)"
                />
              </div>
              <button
                class="btn btn-outline"
                type="button"
                [disabled]="fundingChild()"
                (click)="fund()"
              >
                {{ fundingChild() ? 'Adding…' : 'Add to child wallet' }}
              </button>
            </article>
            @if (message()) {
              <div class="notice" [class.notice-danger]="isError()" [class.notice-info]="!isError()">
                {{ message() }}
              </div>
            }
          </aside>
        </div>
      } @else {
        <div class="notice notice-danger">{{ FAMILY_MESSAGES.childNotFound }}</div>
      }
    </section>
  `,
  styleUrl: './family-pages.scss',
})
export class ChildDetailPage implements OnInit {
  private readonly family = inject(FamilyFacade);
  private readonly wallet = inject(WalletFacade);
  private readonly route = inject(ActivatedRoute);

  protected readonly FAMILY_MESSAGES = FAMILY_MESSAGES;
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly activityError = signal('');
  protected readonly detail = signal<FamilyChildDetail | null>(null);
  protected readonly activity = signal<TransactionListItem[]>([]);
  protected readonly message = signal('');
  protected readonly isError = signal(false);
  protected readonly savingLimits = signal(false);
  protected readonly fundingChild = signal(false);
  protected readonly fieldErrors = signal<Record<string, string>>({});
  protected daily = '';
  protected monthly = '';
  protected single = '';
  protected funding = '200';
  protected readonly money = formatMoney;
  protected readonly initials = childInitials;
  protected readonly limitLabel = limitProgressLabel;
  protected readonly statusPill = statusPillClass;
  protected readonly statusText = statusLabel;
  protected readonly detailSubtitle = childDetailSubtitle;

  private readonly childId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('childId') ?? '')),
    { initialValue: '' },
  );

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const childId = params.get('childId') ?? '';
      if (!childId) {
        this.loading.set(false);
        this.detail.set(null);
        return;
      }
      this.loadChild(childId);
      if (this.route.snapshot.queryParamMap.get('action') === 'fund') {
        setTimeout(() => {
          document.getElementById('fund-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
      }
    });
  }

  private loadChild(childId: string): void {
    this.loading.set(true);
    this.loadError.set('');
    this.activityError.set('');
    this.message.set('');
    this.fieldErrors.set({});

    this.family.loadChildDetail(childId).subscribe({
      next: (child) => {
        this.detail.set(child);
        this.populateLimitFields(child);
        this.loading.set(false);
        this.loadActivity(childId);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.detail.set(null);
        this.loadError.set(
          err instanceof FamilyApiError
            ? bannerMessageFromFamilyError(err)
            : FAMILY_MESSAGES.loadChildError,
        );
      },
    });
  }

  private loadActivity(childId: string): void {
    this.family.loadChildActivity(childId, 0, 20).subscribe({
      next: (page) => this.activity.set([...page.items]),
      error: (err: unknown) => {
        this.activityError.set(
          err instanceof FamilyApiError
            ? bannerMessageFromFamilyError(err)
            : FAMILY_MESSAGES.loadActivityError,
        );
      },
    });
  }

  private populateLimitFields(child: FamilyChildDetail): void {
    this.daily = String(child.limits.today.maxMinor / 100);
    this.monthly = String(child.limits.month.maxMinor / 100);
    this.single = String(child.limits.perTransactionMinor / 100);
  }

  protected onFundingInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const sanitized = sanitizeMoneyInput(input.value);
    this.funding = sanitized;
    input.value = sanitized;
  }

  protected saveLimits(): void {
    const childId = this.childId();
    const perMajor = majorFromInput(this.single);
    const dailyMajor = majorFromInput(this.daily);
    const monthlyMajor = majorFromInput(this.monthly);

    if (perMajor <= 0 || dailyMajor <= 0 || monthlyMajor <= 0) {
      this.showResult(false, FAMILY_MESSAGES.amountInvalid);
      return;
    }
    if (!isValidLimitOrder(perMajor, dailyMajor, monthlyMajor)) {
      this.showResult(false, FAMILY_MESSAGES.limitOrderInvalid);
      return;
    }

    this.savingLimits.set(true);
    this.fieldErrors.set({});
    this.family
      .saveLimits(childId, {
        maxPerTransactionMajor: perMajor,
        dailyLimitMajor: dailyMajor,
        monthlyLimitMajor: monthlyMajor,
      })
      .subscribe({
        next: (updated) => {
          this.detail.set(updated);
          this.populateLimitFields(updated);
          this.savingLimits.set(false);
          this.showResult(true, FAMILY_MESSAGES.limitsUpdated);
        },
        error: (err: unknown) => {
          this.savingLimits.set(false);
          if (err instanceof FamilyApiError) {
            this.fieldErrors.set(fieldErrorsFromFamilyApi(err));
            this.showResult(false, bannerMessageFromFamilyError(err));
          } else {
            this.showResult(false, FAMILY_MESSAGES.limitsSaveFailed);
          }
        },
      });
  }

  protected fund(): void {
    const child = this.detail();
    if (!child) return;

    const amountMajor = majorFromInput(this.funding);
    if (amountMajor < TRANSFER_MIN_MAJOR) {
      this.showResult(false, FAMILY_MESSAGES.amountBelowMinimum);
      return;
    }
    if (amountMajor > TRANSFER_MAX_MAJOR) {
      this.showResult(false, FAMILY_MESSAGES.amountAboveMaximum);
      return;
    }

    this.fundingChild.set(true);
    this.wallet
      .internalTransfer({ receiverUsername: child.username, amountMajor })
      .pipe(
        switchMap(() => this.family.loadChildDetail(child.id)),
      )
      .subscribe({
        next: (updated) => {
          this.detail.set(updated);
          this.fundingChild.set(false);
          this.showResult(true, FAMILY_MESSAGES.fundSuccess);
        },
        error: (err: unknown) => {
          this.fundingChild.set(false);
          const message =
            err instanceof WalletApiError
              ? bannerMessageFromWalletError(err)
              : FAMILY_MESSAGES.networkError;
          this.showResult(false, message);
        },
      });
  }

  private showResult(ok: boolean, text: string): void {
    this.isError.set(!ok);
    this.message.set(text);
  }

  protected todayPercent(child: FamilyChildDetail): number {
    return limitProgressPercent(child.limits.today.spentMinor, child.limits.today.maxMinor);
  }

  protected monthPercent(child: FamilyChildDetail): number {
    return limitProgressPercent(child.limits.month.spentMinor, child.limits.month.maxMinor);
  }

  protected todayDanger(child: FamilyChildDetail): boolean {
    return limitProgressDanger(child.limits.today.spentMinor, child.limits.today.maxMinor);
  }
}

@Component({
  selector: 'app-add-child-page',
  imports: [FormsModule, RouterLink, PageHeader, StatusView],
  template: `
    <section class="page stack" data-node-id="27:2">
      <app-page-header
        title="Add a child"
        subtitle="Open a wallet you fund and control with automatic spending rules."
      />
      @if (createdName()) {
        <div style="display:grid;place-items:center">
          <app-status-view
            title="Child wallet created"
            [message]="createdName() + ' can now sign in to their restricted wallet.'"
            tone="success"
            actionLabel="Back to family"
            (action)="goFamily()"
          />
        </div>
      } @else {
        <div class="detail-layout">
          <form class="card panel stack" (ngSubmit)="create()">
            <h2>Child account</h2>
            <div class="grid-2">
              <div class="field" [class.field-invalid]="fieldErrors()['firstName']">
                <label for="child-first-name">First name</label>
                <input
                  class="input"
                  id="child-first-name"
                  [(ngModel)]="firstName"
                  name="firstName"
                  required
                />
                @if (fieldErrors()['firstName']) {
                  <p class="field-error">{{ fieldErrors()['firstName'] }}</p>
                }
              </div>
              <div class="field" [class.field-invalid]="fieldErrors()['lastName']">
                <label for="child-last-name">Last name</label>
                <input
                  class="input"
                  id="child-last-name"
                  [(ngModel)]="lastName"
                  name="lastName"
                  required
                />
                @if (fieldErrors()['lastName']) {
                  <p class="field-error">{{ fieldErrors()['lastName'] }}</p>
                }
              </div>
            </div>
            <div class="field" [class.field-invalid]="fieldErrors()['username']">
              <label for="child-username">Username</label>
              <input
                class="input"
                id="child-username"
                [(ngModel)]="username"
                name="username"
                required
              />
              @if (fieldErrors()['username']) {
                <p class="field-error">{{ fieldErrors()['username'] }}</p>
              }
            </div>
            <div class="field" [class.field-invalid]="fieldErrors()['password']">
              <label for="child-password">Temporary password</label>
              <input
                class="input"
                id="child-password"
                [(ngModel)]="password"
                name="password"
                type="password"
              />
              @if (fieldErrors()['password']) {
                <p class="field-error">{{ fieldErrors()['password'] }}</p>
              }
            </div>
            <div class="field" [class.field-invalid]="fieldErrors()['confirmPassword']">
              <label for="child-confirm-password">Confirm password</label>
              <input
                class="input"
                id="child-confirm-password"
                [(ngModel)]="confirmPassword"
                name="confirmPassword"
                type="password"
              />
              @if (fieldErrors()['confirmPassword']) {
                <p class="field-error">{{ fieldErrors()['confirmPassword'] }}</p>
              }
            </div>
            <div class="field">
              <label for="initial-funding">Initial allocation (optional)</label>
              <input
                class="input"
                id="initial-funding"
                [(ngModel)]="funding"
                name="funding"
                (input)="onFundingInput($event)"
              />
            </div>
            @if (error()) {
              <div class="notice notice-danger">{{ error() }}</div>
            }
            <button class="btn btn-primary" type="submit" [disabled]="submitting()">
              {{ submitting() ? 'Creating…' : 'Create child wallet' }}
            </button>
            <a class="btn btn-secondary" routerLink="/family">Cancel</a>
          </form>
          <aside class="card panel limits-form">
            <h2>Spending rules</h2>
            <div class="field" [class.field-invalid]="fieldErrors()['dailyLimit']">
              <label for="new-daily">Daily limit</label>
              <input class="input" id="new-daily" [(ngModel)]="daily" name="daily" />
              @if (fieldErrors()['dailyLimit']) {
                <p class="field-error">{{ fieldErrors()['dailyLimit'] }}</p>
              }
            </div>
            <div class="field" [class.field-invalid]="fieldErrors()['monthlyLimit']">
              <label for="new-monthly">Monthly limit</label>
              <input class="input" id="new-monthly" [(ngModel)]="monthly" name="monthly" />
              @if (fieldErrors()['monthlyLimit']) {
                <p class="field-error">{{ fieldErrors()['monthlyLimit'] }}</p>
              }
            </div>
            <div class="field" [class.field-invalid]="fieldErrors()['maxPerTransaction']">
              <label for="new-single">Maximum purchase</label>
              <input class="input" id="new-single" [(ngModel)]="single" name="single" />
              @if (fieldErrors()['maxPerTransaction']) {
                <p class="field-error">{{ fieldErrors()['maxPerTransaction'] }}</p>
              }
            </div>
          </aside>
        </div>
      }
    </section>
  `,
  styleUrl: './family-pages.scss',
})
export class AddChildPage {
  private readonly family = inject(FamilyFacade);
  private readonly router = inject(Router);

  protected readonly error = signal('');
  protected readonly createdName = signal('');
  protected readonly submitting = signal(false);
  protected readonly fieldErrors = signal<Record<string, string>>({});
  protected firstName = '';
  protected lastName = '';
  protected username = '';
  protected password = '';
  protected confirmPassword = '';
  protected funding = '';
  protected daily = '150';
  protected monthly = '1000';
  protected single = '100';

  protected onFundingInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const sanitized = sanitizeMoneyInput(input.value);
    this.funding = sanitized;
    input.value = sanitized;
  }

  protected create(): void {
    this.error.set('');
    this.fieldErrors.set({});

    const perMajor = majorFromInput(this.single);
    const dailyMajor = majorFromInput(this.daily);
    const monthlyMajor = majorFromInput(this.monthly);
    const fundingMajor = this.funding.trim() ? majorFromInput(this.funding) : undefined;

    if (!this.firstName.trim() || !this.lastName.trim() || !this.username.trim()) {
      this.error.set(FAMILY_MESSAGES.required);
      return;
    }
    if (perMajor <= 0 || dailyMajor <= 0 || monthlyMajor <= 0) {
      this.error.set(FAMILY_MESSAGES.amountInvalid);
      return;
    }
    if (!isValidLimitOrder(perMajor, dailyMajor, monthlyMajor)) {
      this.error.set(FAMILY_MESSAGES.limitOrderInvalid);
      return;
    }
    if (fundingMajor != null && fundingMajor < TRANSFER_MIN_MAJOR) {
      this.error.set(FAMILY_MESSAGES.amountBelowMinimum);
      return;
    }
    if (fundingMajor != null && fundingMajor > TRANSFER_MAX_MAJOR) {
      this.error.set(FAMILY_MESSAGES.amountAboveMaximum);
      return;
    }

    this.submitting.set(true);
    this.family
      .addChild({
        firstName: this.firstName.trim(),
        lastName: this.lastName.trim(),
        username: this.username.trim(),
        password: this.password,
        confirmPassword: this.confirmPassword,
        maxPerTransactionMajor: perMajor,
        dailyLimitMajor: dailyMajor,
        monthlyLimitMajor: monthlyMajor,
        ...(fundingMajor != null ? { startingAllocationMajor: fundingMajor } : {}),
      })
      .subscribe({
        next: (result) => {
          this.submitting.set(false);
          this.createdName.set(`${result.firstName} ${result.lastName}`);
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          if (err instanceof FamilyApiError) {
            this.fieldErrors.set(fieldErrorsFromFamilyApi(err));
            this.error.set(bannerMessageFromFamilyError(err));
          } else {
            this.error.set(FAMILY_MESSAGES.addChildFailed);
          }
        },
      });
  }

  protected goFamily(): void {
    void this.router.navigateByUrl('/family');
  }
}

@Component({
  selector: 'app-child-wallet-page',
  imports: [RouterLink, PageHeader, TransactionList, LoadingSpinner, StatusView, AssetUrlPipe],
  template: `
    <section class="page stack" data-node-id="31:2">
      <app-page-header [title]="greeting()" [subtitle]="fundingNote()" />
      @if (loading()) {
        <div class="page-center">
          <app-loading-spinner label="Loading your wallet…" />
        </div>
      } @else if (error()) {
        <div class="page-center">
          <app-status-view title="Unable to load your wallet" [message]="error()" tone="danger" />
        </div>
      } @else if (wallet(); as w) {
        <article class="hero-child">
          <div>
            <span class="overline">You can spend</span>
            <h2 class="amount">{{ money(w.availableMinor) }}</h2>
            <p>
              Money in your wallet {{ money(w.balanceMinor) }} · Being checked
              {{ money(w.heldMinor) }}
            </p>
          </div>
          <img [src]="'assets/child-orbit-graphic.svg' | assetUrl" alt="" aria-hidden="true" />
        </article>
        <div class="restriction">
          Your parent funds this wallet. Direct top-ups and transfers are not available.
        </div>
        <div class="detail-layout">
          <section class="card panel stack">
            <h2>What you can spend</h2>
            <div class="limit-row">
              <div class="limit-copy">
                <span>Today</span>
                <span [class.limit-danger]="todayDanger(w)">
                  {{ limitLabel(w.today.spentMinor, w.today.maxMinor) }}
                </span>
              </div>
              <div class="progress">
                <span
                  [style.width.%]="todayPercent(w)"
                  [style.background]="todayDanger(w) ? 'var(--danger)' : ''"
                ></span>
              </div>
              <small class="muted limit-remaining">
                {{ money(w.today.remainingMinor) }} left · {{ dailyReset(w.today.resetsAt) }}
              </small>
            </div>
            <div class="limit-row">
              <div class="limit-copy">
                <span>This month</span>
                <span>{{ limitLabel(w.month.spentMinor, w.month.maxMinor) }}</span>
              </div>
              <div class="progress">
                <span [style.width.%]="monthPercent(w)"></span>
              </div>
              <small class="muted limit-remaining">
                {{ money(w.month.remainingMinor) }} left · {{ monthlyReset(w.month.resetsOn) }}
              </small>
            </div>
            <div class="summary-row">
              <span>Most you can spend at one time</span>
              <strong>{{ money(w.perTransactionMinor) }}</strong>
            </div>
          </section>
          <section class="card panel stack">
            <h2>Being checked</h2>
            @if (w.pending.length) {
              <div class="notice notice-held">
                {{ money(w.heldMinor) }} is waiting for settlement.
              </div>
              <ul class="pending-list">
                @for (item of w.pending; track item.id) {
                  <li class="pending-row">
                    <span class="pending-copy">
                      <strong>{{ item.merchant }}</strong>
                      <small>{{ item.time }}</small>
                    </span>
                    <strong class="amount">{{ money(item.amountMinor) }}</strong>
                  </li>
                }
              </ul>
            } @else {
              <p class="muted">Nothing is being checked right now.</p>
            }
            <div class="summary-row">
              <span>Received this month</span>
              <strong>{{ money(summary()?.receivedThisMonthMinor ?? 0) }}</strong>
            </div>
          </section>
        </div>
        <section class="card panel">
          <div class="activity-header">
            <h2>Recent activity</h2>
            <a routerLink="/my-activity">View all</a>
          </div>
          <app-transaction-list [transactions]="w.recentActivity" />
        </section>
      }
    </section>
  `,
  styleUrl: './family-pages.scss',
})
export class ChildWalletPage implements OnInit {
  private readonly childSelf = inject(ChildSelfFacade);
  private readonly auth = inject(AuthFacade);
  private readonly walletFacade = inject(WalletFacade);

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly wallet = signal<ChildWalletSnapshot | null>(null);
  protected readonly summary = signal<ChildActivitySummary | null>(null);
  protected readonly money = formatMoney;
  protected readonly limitLabel = limitProgressLabel;
  protected readonly dailyReset = dailyResetLabel;
  protected readonly monthlyReset = monthlyResetLabel;

  /** Seeded from the session so the header is never blank on first paint. */
  private readonly firstName = signal(this.auth.currentUser()?.firstName ?? '');
  private readonly parentFirstName = signal<string | null>(null);

  protected readonly greeting = computed(() => {
    const name = this.firstName();
    return name ? `Hi ${name}` : 'My wallet';
  });

  /**
   * Names the parent once /users/me has answered. Until then — and if it
   * fails — the generic wording is still true, so there is nothing to retry.
   */
  protected readonly fundingNote = computed(() => {
    const parent = this.parentFirstName();
    const who = parent ? parent : 'Your parent';
    return `${who} adds money to your wallet. You cannot add money or send it to other people.`;
  });

  ngOnInit(): void {
    this.childSelf.loadWalletPage().subscribe({
      next: ({ wallet, summary }) => {
        this.wallet.set(wallet);
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(
          err instanceof FamilyApiError
            ? bannerMessageFromFamilyError(err)
            : FAMILY_MESSAGES.loadMyWalletError,
        );
      },
    });

    // Only supplies the two names in the header, so a failure here must not
    // take down a wallet that loaded fine.
    this.walletFacade.getCurrentUser().subscribe({
      next: (account) => {
        this.firstName.set(account.firstName);
        this.parentFirstName.set(account.parentFirstName);
      },
      error: () => undefined,
    });
  }

  protected todayPercent(wallet: ChildWalletSnapshot): number {
    return limitProgressPercent(wallet.today.spentMinor, wallet.today.maxMinor);
  }

  protected monthPercent(wallet: ChildWalletSnapshot): number {
    return limitProgressPercent(wallet.month.spentMinor, wallet.month.maxMinor);
  }

  protected todayDanger(wallet: ChildWalletSnapshot): boolean {
    return limitProgressDanger(wallet.today.spentMinor, wallet.today.maxMinor);
  }
}

/** Rows fetched per page on the activity screen. */
const CHILD_ACTIVITY_PAGE_SIZE = 20;

@Component({
  selector: 'app-child-activity-page',
  imports: [PageHeader, TransactionList, LoadingSpinner, StatusView],
  template: `
    <section class="page stack" data-node-id="31:194">
      <app-page-header title="My activity" subtitle="Every movement in your wallet." />
      @if (loading()) {
        <div class="page-center">
          <app-loading-spinner label="Loading your activity…" />
        </div>
      } @else if (error()) {
        <div class="page-center">
          <app-status-view title="Unable to load your activity" [message]="error()" tone="danger" />
        </div>
      } @else {
        @if (summary(); as counters) {
          <div class="family-summary">
            <div class="summary-stat">
              <span>Spent today</span>
              <strong>{{ money(counters.spentTodayMinor) }}</strong>
            </div>
            <div class="summary-stat">
              <span>Spent this month</span>
              <strong>{{ money(counters.spentThisMonthMinor) }}</strong>
            </div>
            <div class="summary-stat summary-stat-allocated">
              <span>Received this month</span>
              <strong>{{ money(counters.receivedThisMonthMinor) }}</strong>
            </div>
            <div class="summary-stat summary-stat-blocked">
              <span>Blocked by limits</span>
              <strong>{{ blockedLabel(counters.blockedCount) }}</strong>
            </div>
          </div>
        }
        <section class="card panel">
          <app-transaction-list [transactions]="activity()" [showDate]="true" />
          @if (!last()) {
            <button
              class="btn btn-secondary"
              type="button"
              [disabled]="loadingMore()"
              (click)="loadMore()"
            >
              {{ loadingMore() ? 'Loading…' : 'Load more' }}
            </button>
          }
        </section>
      }
    </section>
  `,
  styleUrl: './family-pages.scss',
})
export class ChildActivityPage implements OnInit {
  private readonly childSelf = inject(ChildSelfFacade);

  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal('');
  protected readonly activity = signal<TransactionListItem[]>([]);
  protected readonly summary = signal<ChildActivitySummary | null>(null);
  protected readonly last = signal(true);
  protected readonly money = formatMoney;
  protected readonly blockedLabel = blockedAttemptsLabel;

  private page = 0;

  ngOnInit(): void {
    this.childSelf.loadActivity(0, CHILD_ACTIVITY_PAGE_SIZE).subscribe({
      next: (result) => {
        this.activity.set([...result.items]);
        this.last.set(result.last);
        this.page = result.page;
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(
          err instanceof FamilyApiError
            ? bannerMessageFromFamilyError(err)
            : FAMILY_MESSAGES.loadMyActivityError,
        );
      },
    });

    // Counters are a header above the feed, not the feed itself — losing them
    // should not blank the page.
    this.childSelf.loadActivitySummary().subscribe({
      next: (counters) => this.summary.set(counters),
      error: () => undefined,
    });
  }

  protected loadMore(): void {
    if (this.loadingMore() || this.last()) return;

    this.loadingMore.set(true);
    this.childSelf.loadActivity(this.page + 1, CHILD_ACTIVITY_PAGE_SIZE).subscribe({
      next: (result) => {
        this.activity.update((rows) => [...rows, ...result.items]);
        this.last.set(result.last);
        this.page = result.page;
        this.loadingMore.set(false);
      },
      // The rows already on screen stay; the button comes back for a retry.
      error: () => this.loadingMore.set(false),
    });
  }
}
