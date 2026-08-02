import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AssetUrlPipe } from '../../core/asset-url';
import { DemoStore } from '../../data-access';
import { ChildLimits, ChildWallet, Transaction, User } from '../../shared/models';
import { PageHeader } from '../../shared/ui/page-header';
import { StatusView } from '../../shared/ui/status-view';
import { TransactionList, TransactionListItem } from '../../shared/ui/transaction-list';
import { formatMoney, parseMoney } from '../../shared/utils/money';

function childInitials(user: User | undefined): string {
  return (
    user?.fullName
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2) ?? 'CH'
  );
}

function childActivityItem(transaction: Transaction): TransactionListItem {
  const positive = transaction.type === 'transfer-in' || transaction.type === 'top-up';
  return {
    id: transaction.id,
    title: transaction.title,
    subtitle: transaction.subtitle,
    amount: positive ? transaction.amountMinor : -transaction.amountMinor,
    status: transaction.status === 'completed' ? 'DONE' : transaction.status.toUpperCase(),
    createdAt: transaction.occurredAt,
  };
}

@Component({
  selector: 'app-family-page',
  imports: [RouterLink, PageHeader],
  template: `
    <section class="page stack" data-node-id="15:2">
      <app-page-header
        title="Family"
        subtitle="Wallets you fund and supervise. Spending rules apply automatically."
      >
        <a class="btn btn-primary" routerLink="/family/add">Add a child</a>
      </app-page-header>
      <div class="family-summary">
        <div><span>Children</span><strong>{{ store.myChildren().length }}</strong></div>
        <div><span>Allocated this month</span><strong>EGP 800.00</strong></div>
        <div><span>Spent this month</span><strong>EGP 415.00</strong></div>
        <div><span>Blocked by limits</span><strong>3 attempts</strong></div>
      </div>
      <div class="children-grid">
        @for (child of store.myChildren(); track child.id) {
          <article class="card child-card">
            <header class="child-heading">
              <span class="child-avatar">{{ initials(user(child)) }}</span>
              <div>
                <strong>{{ user(child)?.fullName }}</strong>
                <small>&#64;{{ user(child)?.username }}</small>
              </div>
              <span class="pill pill-completed">ACTIVE</span>
            </header>
            <div class="child-balance">
              <span class="overline">Available</span>
              <strong class="amount">{{ money(child.snapshot.availableMinor) }}</strong>
              <small class="muted">
                Balance {{ money(child.snapshot.totalMinor) }} · Held {{ money(child.snapshot.heldMinor) }}
              </small>
            </div>
            <div class="limits">
              <div class="limit-row">
                <div class="limit-copy"><span>Today</span><span>{{ child.nickname === 'Nour' ? 'EGP 90 of EGP 100' : 'EGP 60 of EGP 150' }}</span></div>
                <div class="progress"><span [style.width.%]="child.nickname === 'Nour' ? 90 : 40" [style.background]="child.nickname === 'Nour' ? 'var(--danger)' : ''"></span></div>
              </div>
              <div class="limit-row">
                <div class="limit-copy"><span>This month</span><span>{{ child.nickname === 'Nour' ? 'EGP 160 of EGP 600' : 'EGP 255 of EGP 1,000' }}</span></div>
                <div class="progress"><span [style.width.%]="child.nickname === 'Nour' ? 27 : 26"></span></div>
              </div>
              <small class="muted">Max {{ money(child.limits.singlePurchaseMinor) }} per purchase</small>
            </div>
            <div class="quick-actions">
              <a class="btn btn-outline" [routerLink]="['/family', child.childId]" [queryParams]="{ action: 'fund' }">Add money</a>
              <a class="btn btn-secondary" [routerLink]="['/family', child.childId]">View activity</a>
            </div>
          </article>
        }
        <a class="add-card" routerLink="/family/add">
          <span>+</span><strong>Add a child</strong>
          <small>Open a wallet you fund and control</small>
        </a>
      </div>
    </section>
  `,
  styleUrl: './family-pages.scss',
})
export default class FamilyPage {
  protected readonly store = inject(DemoStore);
  protected readonly money = formatMoney;
  protected readonly initials = childInitials;

  protected user(child: ChildWallet): User | undefined {
    return this.store.users().find((candidate) => candidate.id === child.childId);
  }
}

@Component({
  selector: 'app-child-detail-page',
  imports: [FormsModule, RouterLink, PageHeader, TransactionList],
  template: `
    <section class="page stack" data-node-id="17:2">
      <app-page-header
        [title]="childUser()?.fullName ?? 'Child wallet'"
        [subtitle]="'@' + (childUser()?.username ?? 'child') + ' · Limits and activity'"
      >
        <a class="btn btn-secondary" routerLink="/family">Back to family</a>
      </app-page-header>
      @if (child(); as wallet) {
        <div class="detail-layout">
          <div class="stack">
            <article class="hero-child">
              <span class="overline">Available to spend</span>
              <h2 class="amount">{{ money(wallet.snapshot.availableMinor) }}</h2>
              <p>Balance {{ money(wallet.snapshot.totalMinor) }} · Held {{ money(wallet.snapshot.heldMinor) }}</p>
            </article>
            <section class="card panel">
              <h2>Activity</h2>
              <app-transaction-list [transactions]="activity()" />
            </section>
          </div>
          <aside class="stack">
            <article class="card panel limits-form">
              <h2>Spending limits</h2>
              <div class="field"><label for="daily">Daily</label><input class="input" id="daily" [(ngModel)]="daily" /></div>
              <div class="field"><label for="monthly">Monthly</label><input class="input" id="monthly" [(ngModel)]="monthly" /></div>
              <div class="field"><label for="single">Per purchase</label><input class="input" id="single" [(ngModel)]="single" /></div>
              <button class="btn btn-primary" type="button" (click)="saveLimits()">Save limits</button>
            </article>
            <article class="card panel stack">
              <h2>Add money</h2>
              <div class="field"><label for="funding">Amount</label><input class="input" id="funding" [(ngModel)]="funding" /></div>
              <button class="btn btn-outline" type="button" (click)="fund()">Add to child wallet</button>
            </article>
            @if (message()) {
              <div class="notice" [class.notice-danger]="isError()" [class.notice-info]="!isError()">{{ message() }}</div>
            }
          </aside>
        </div>
      } @else {
        <div class="notice notice-danger">Child wallet not found.</div>
      }
    </section>
  `,
  styleUrl: './family-pages.scss',
})
export class ChildDetailPage {
  protected readonly store = inject(DemoStore);
  private readonly route = inject(ActivatedRoute);
  protected readonly money = formatMoney;
  protected readonly message = signal('');
  protected readonly isError = signal(false);
  protected daily = '';
  protected monthly = '';
  protected single = '';
  protected funding = '200';

  protected readonly childId = this.route.snapshot.paramMap.get('childId') ?? '';
  protected readonly child = computed(() =>
    this.store.myChildren().find((candidate) => candidate.childId === this.childId),
  );
  protected readonly childUser = computed(() =>
    this.store.users().find((candidate) => candidate.id === this.childId),
  );
  protected readonly activity = computed(() =>
    this.store
      .transactions()
      .filter((transaction) => transaction.walletOwnerId === this.childId)
      .map(childActivityItem),
  );

  constructor() {
    const limits = this.child()?.limits;
    if (limits) {
      this.daily = String(limits.dailySpendMinor / 100);
      this.monthly = String(limits.monthlySpendMinor / 100);
      this.single = String(limits.singlePurchaseMinor / 100);
    }
  }

  protected saveLimits(): void {
    const limits: ChildLimits = {
      dailySpendMinor: parseMoney(this.daily),
      monthlySpendMinor: parseMoney(this.monthly),
      singlePurchaseMinor: parseMoney(this.single),
    };
    const result = this.store.updateChildLimits(this.childId, limits);
    this.showResult(result.ok, result.ok ? 'Limits updated.' : result.message);
  }

  protected fund(): void {
    const result = this.store.fundChild(this.childId, parseMoney(this.funding));
    this.showResult(result.ok, result.ok ? 'Money added to the child wallet.' : result.message);
  }

  private showResult(ok: boolean, message: string): void {
    this.isError.set(!ok);
    this.message.set(message);
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
              <div class="field"><label for="child-name">Full name</label><input class="input" id="child-name" [(ngModel)]="fullName" name="fullName" required /></div>
              <div class="field"><label for="child-username">Username</label><input class="input" id="child-username" [(ngModel)]="username" name="username" required /></div>
            </div>
            <div class="field"><label for="child-password">Temporary password</label><input class="input" id="child-password" [(ngModel)]="password" name="password" type="password" /></div>
            <div class="field"><label for="initial-funding">Initial allocation</label><input class="input" id="initial-funding" [(ngModel)]="funding" name="funding" /></div>
            @if (error()) { <div class="notice notice-danger">{{ error() }}</div> }
            <button class="btn btn-primary" type="submit">Create child wallet</button>
            <a class="btn btn-secondary" routerLink="/family">Cancel</a>
          </form>
          <aside class="card panel limits-form">
            <h2>Spending rules</h2>
            <div class="field"><label for="new-daily">Daily limit</label><input class="input" id="new-daily" [(ngModel)]="daily" /></div>
            <div class="field"><label for="new-monthly">Monthly limit</label><input class="input" id="new-monthly" [(ngModel)]="monthly" /></div>
            <div class="field"><label for="new-single">Maximum purchase</label><input class="input" id="new-single" [(ngModel)]="single" /></div>
          </aside>
        </div>
      }
    </section>
  `,
  styleUrl: './family-pages.scss',
})
export class AddChildPage {
  private readonly store = inject(DemoStore);
  private readonly router = inject(Router);
  protected readonly error = signal('');
  protected readonly createdName = signal('');
  protected fullName = 'Mariam Mahmoud';
  protected username = 'mariam';
  protected password = 'Mariam@123';
  protected funding = '200';
  protected daily = '150';
  protected monthly = '1000';
  protected single = '100';

  protected create(): void {
    const result = this.store.addChild({
      fullName: this.fullName,
      username: this.username,
      password: this.password,
      initialFundingMinor: parseMoney(this.funding),
      limits: {
        dailySpendMinor: parseMoney(this.daily),
        monthlySpendMinor: parseMoney(this.monthly),
        singlePurchaseMinor: parseMoney(this.single),
      },
    });
    if (!result.ok) {
      this.error.set(result.message);
      return;
    }
    this.createdName.set(result.value.child.fullName);
  }

  protected goFamily(): void {
    void this.router.navigateByUrl('/family');
  }
}

@Component({
  selector: 'app-child-wallet-page',
  imports: [RouterLink, PageHeader, TransactionList, AssetUrlPipe],
  template: `
    <section class="page stack" data-node-id="31:2">
      <app-page-header
        [title]="'Hi ' + (store.currentUser()?.fullName?.split(' ')?.[0] ?? 'Youssef')"
        subtitle="Mohamed adds money to your wallet. You cannot add money or send it to other people."
      />
      <article class="hero-child">
        <div>
          <span class="overline">You can spend</span>
          <h2 class="amount">{{ money(store.wallet()?.availableMinor ?? 0) }}</h2>
          <p>
            Money in your wallet {{ money(store.wallet()?.totalMinor ?? 0) }} · Being checked
            {{ money(store.wallet()?.heldMinor ?? 0) }}
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
          <div class="limit-row"><div class="limit-copy"><span>Today</span><span>EGP 90.00 of EGP 150.00</span></div><div class="progress"><span style="width:60%"></span></div><small class="muted">Resets at midnight</small></div>
          <div class="limit-row"><div class="limit-copy"><span>This month</span><span>EGP 745.00 of EGP 1,000.00</span></div><div class="progress"><span style="width:74.5%"></span></div><small class="muted">Resets on 1 August</small></div>
          <div class="summary-row"><span>Most you can spend at one time</span><strong>EGP 100.00</strong></div>
        </section>
        <section class="card panel stack">
          <h2>Being checked</h2>
          <div class="notice notice-held">{{ money(store.wallet()?.heldMinor ?? 0) }} is waiting for settlement.</div>
        </section>
      </div>
      <section class="card panel">
        <div class="activity-header"><h2>Recent activity</h2><a routerLink="/my-activity">View all</a></div>
        <app-transaction-list [transactions]="activity()" />
      </section>
    </section>
  `,
  styleUrl: './family-pages.scss',
})
export class ChildWalletPage {
  protected readonly store = inject(DemoStore);
  protected readonly money = formatMoney;
  protected readonly activity = computed(() => this.store.recentActivity().map(childActivityItem));
}

@Component({
  selector: 'app-child-activity-page',
  imports: [PageHeader, TransactionList],
  template: `
    <section class="page stack" data-node-id="31:194">
      <app-page-header title="My activity" subtitle="Every movement in your child wallet." />
      <section class="card panel">
        <app-transaction-list [transactions]="activity()" [showDate]="true" />
      </section>
    </section>
  `,
  styleUrl: './family-pages.scss',
})
export class ChildActivityPage {
  private readonly store = inject(DemoStore);
  protected readonly activity = computed(() => this.store.recentActivity().map(childActivityItem));
}
