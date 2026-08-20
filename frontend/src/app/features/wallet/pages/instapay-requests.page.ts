import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { LoadingSpinner } from '../../../shared/ui/loading-spinner';
import { PageHeader } from '../../../shared/ui/page-header';
import { formatMoney } from '../../../shared/utils/money';
import {
  INSTAPAY_MESSAGES,
  INSTAPAY_STATUS_SUMMARY,
  InstapayApiError,
  InstapayFacade,
  InstapayRequest,
  InstapayRequestStatus,
  bannerMessageFromInstapayError,
  instapayAmountToMinor,
  instapayRejectionMessage,
} from '../data-access';

/** "Today, 21:04" · "Yesterday, 18:22" · "14 Aug, 11:07" — as designed. */
function formatSubmittedAt(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return '—';
  }

  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const daysAgo = Math.floor((startOfToday.getTime() - at.getTime()) / 86_400_000);

  if (daysAgo < 0) return `Today, ${time}`;
  if (daysAgo === 0) return `Yesterday, ${time}`;

  const date = at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${date}, ${time}`;
}

interface RequestRow {
  readonly id: string;
  readonly status: InstapayRequestStatus;
  readonly submitted: string;
  readonly title: string;
  readonly detail: string;
  /** The reference is the only thing shown in full-strength type. */
  readonly hasReference: boolean;
  readonly amount: string;
  readonly hasAmount: boolean;
}

@Component({
  selector: 'app-instapay-requests-page',
  imports: [LoadingSpinner, PageHeader, RouterLink],
  template: `
    <section class="page stack" data-node-id="450:404">
      <app-page-header
        title="InstaPay requests"
        subtitle="Every transfer you have sent us, and where it has got to."
      >
        @if (live()) {
          <span class="instapay-live" role="status">
            <span class="instapay-live-dot" aria-hidden="true"></span>
            Updating live
          </span>
        }
      </app-page-header>

      @if (error()) {
        <div class="notice notice-danger" role="alert">{{ error() }}</div>
      }

      @if (loading()) {
        <app-loading-spinner label="Loading your InstaPay requests…" />
      } @else if (rows().length === 0) {
        <div class="card instapay-empty" data-node-id="450:557">
          <span class="instapay-empty-icon" aria-hidden="true">↑</span>
          <p class="instapay-empty-title">No InstaPay requests yet</p>
          <p class="instapay-empty-copy">
            When you send us an InstaPay transfer and upload the confirmation, it will appear here
            while we check it.
          </p>
          <a class="instapay-empty-cta" routerLink="/top-up" data-node-id="450:562">
            Top up with InstaPay
          </a>
        </div>
      } @else {
        <div class="card instapay-table" data-node-id="450:408">
          <div class="instapay-thead" data-node-id="450:409">
            <span class="col-submitted">SUBMITTED</span>
            <span class="col-reference">REFERENCE</span>
            <span class="col-amount">AMOUNT</span>
            <span class="col-status">STATUS</span>
          </div>

          @for (row of rows(); track row.id) {
            <div class="instapay-row">
              <span class="col-submitted instapay-submitted">{{ row.submitted }}</span>

              <div class="col-reference instapay-reference">
                <p class="instapay-reference-title" [class.is-muted]="!row.hasReference">
                  {{ row.title }}
                </p>
                @if (row.detail) {
                  <p class="instapay-reference-detail">{{ row.detail }}</p>
                }
              </div>

              <span class="col-amount instapay-amount" [class.is-muted]="!row.hasAmount">
                {{ row.amount }}
              </span>

              <span class="col-status">
                <span class="instapay-badge" [class]="'instapay-badge ' + badgeClass(row.status)">
                  {{ row.status }}
                </span>
              </span>
            </div>
          }
        </div>
      }
    </section>
  `,
  styleUrl: './instapay-requests.page.scss',
})
export class InstapayRequestsPage implements OnInit {
  private readonly instapay = inject(InstapayFacade);
  private readonly destroyRef = inject(DestroyRef);

  private readonly requests = signal<readonly InstapayRequest[]>([]);
  /**
   * Needed only so WRONG_RECIPIENT can name the account. Its absence must not
   * block the table, so the rows fall back to neutral wording until it lands.
   */
  private readonly accountName = signal('the account shown on the top-up page');

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  /** True exactly while the one-second refresh is running. */
  protected readonly live = signal(false);

  protected readonly rows = computed<RequestRow[]>(() => {
    const accountName = this.accountName();
    return this.requests().map((request) => this.toRow(request, accountName));
  });

  ngOnInit(): void {
    this.instapay
      .getAccount()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (account) => this.accountName.set(account.accountName),
        error: () => {
          // The table is still perfectly readable without it.
        },
      });

    this.loadThenWatch();
  }

  protected badgeClass(status: InstapayRequestStatus): string {
    return `instapay-badge-${status.toLowerCase()}`;
  }

  /**
   * The first load is a plain request so a failure is visible; only once it
   * succeeds does the one-second refresh start, and only if there is anything
   * unresolved to refresh for. Polling a settled list forever would be a
   * request a second that can never change its own answer.
   */
  private loadThenWatch(): void {
    this.instapay
      .listRequests()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.requests.set(list.content);
          this.loading.set(false);
          this.error.set('');
          if (list.anyUnresolved) {
            this.watch();
          }
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.error.set(
            err instanceof InstapayApiError
              ? bannerMessageFromInstapayError(err)
              : INSTAPAY_MESSAGES.networkError,
          );
        },
      });
  }

  private watch(): void {
    this.live.set(true);
    this.instapay
      .watchRequests()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => this.requests.set(list.content),
        // The stream ends by itself once nothing is PENDING or PROCESSING —
        // that completion is the signal that everything has settled.
        complete: () => this.live.set(false),
      });
  }

  private toRow(request: InstapayRequest, accountName: string): RequestRow {
    const summary = INSTAPAY_STATUS_SUMMARY[request.status];
    // Absent, not null: Jackson omits the key entirely on an unread row.
    const hasReference = request.referenceNumber !== undefined;
    const hasAmount = request.amount !== undefined;

    let detail = summary.detail;
    if (request.status === 'REJECTED' && request.rejectionReason) {
      detail = instapayRejectionMessage(request.rejectionReason, accountName);
    }

    return {
      id: request.id,
      status: request.status,
      submitted: formatSubmittedAt(request.submittedAt),
      title: hasReference ? request.referenceNumber! : summary.title,
      detail,
      hasReference,
      amount: hasAmount ? formatMoney(instapayAmountToMinor(request.amount!)) : '—',
      hasAmount,
    };
  }
}
