import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';

import { AssetUrlPipe } from '../../../core/asset-url';
import { formatMoney } from '../../../shared/utils/money';
import {
  INSTAPAY_ACCEPTED_TYPES,
  INSTAPAY_MESSAGES,
  InstapayAccount,
  InstapayApiError,
  InstapayFacade,
  bannerMessageFromInstapayError,
  instapayAmountToMinor,
  localFileError,
} from '../data-access';

/** "1 MB", "512 KB" — for the limit the server actually enforces. */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

@Component({
  selector: 'app-instapay-top-up',
  imports: [AssetUrlPipe, RouterLink],
  template: `
    <div class="feature-grid instapay-grid" data-node-id="448:333">
      <article class="card panel instapay-transfer-card" data-node-id="448:334">
        <ng-content />

        <h2 class="instapay-step-heading" data-node-id="448:340">
          Step 1 · Send the money to this InstaPay number
        </h2>

        @if (accountError()) {
          <div class="notice notice-danger" role="alert">{{ accountError() }}</div>
        } @else {
          <div class="instapay-details" data-node-id="448:341">
            <!--
              The InstaPay mark, at the moment it is most useful: the user is
              about to leave for their bank app and needs to be sure this is
              the same network they are sending on.
            -->
            <div class="instapay-details-head">
              <img
                class="instapay-logo"
                [src]="'assets/instapay-logo.png' | assetUrl"
                alt="InstaPay"
                width="28"
                height="28"
              />
              <p class="instapay-details-label" data-node-id="448:342">INSTAPAY MOBILE NUMBER</p>
            </div>
            <div class="instapay-number-row" data-node-id="448:343">
              <p class="instapay-number" data-node-id="448:344">
                {{ account()?.accountNumber ?? '—' }}
              </p>
              <button
                class="instapay-copy-btn"
                type="button"
                [disabled]="!account()"
                (click)="copyNumber()"
                [attr.aria-label]="'Copy the InstaPay number ' + (account()?.accountNumber ?? '')"
                data-node-id="448:345"
              >
                {{ copied() ? INSTAPAY_MESSAGES.numberCopied : 'Copy' }}
              </button>
            </div>
            <div class="instapay-details-divider" aria-hidden="true" data-node-id="448:347"></div>
            <div class="instapay-name-row" data-node-id="448:348">
              <p class="instapay-name-label">Account name</p>
              <p class="instapay-name-value">{{ account()?.accountName ?? '—' }}</p>
            </div>
          </div>
        }

        <h2 class="instapay-step-heading" data-node-id="448:351">
          Step 2 · Upload the transfer confirmation
        </h2>

        <div class="instapay-requirement" data-node-id="451:482">
          <span class="instapay-requirement-mark" aria-hidden="true" data-node-id="451:483">!</span>
          <div class="instapay-requirement-body" data-node-id="451:485">
            <p class="instapay-requirement-title" data-node-id="451:486">
              The reference number must be visible in your screenshot
            </p>
            <ul class="instapay-checklist" data-node-id="451:487">
              <li><span class="instapay-check" aria-hidden="true">✓</span>The reference or transaction number</li>
              <li><span class="instapay-check" aria-hidden="true">✓</span>The amount you sent</li>
              <li>
                <span class="instapay-check" aria-hidden="true">✓</span>The recipient name —
                {{ account()?.accountName ?? 'the account name shown above' }}
              </li>
            </ul>
            <p class="instapay-requirement-note" data-node-id="451:497">
              Capture the whole confirmation screen. A cropped screenshot with no readable reference
              is rejected automatically.
            </p>
          </div>
        </div>

        <input
          #fileInput
          class="instapay-file-input"
          type="file"
          [accept]="acceptAttr"
          (change)="onFileChosen($event)"
          tabindex="-1"
          aria-hidden="true"
        />

        @if (selectedFile(); as file) {
          <div class="instapay-dropzone instapay-dropzone-filled">
            <img class="instapay-preview" [src]="previewUrl()" alt="" />
            <div class="instapay-preview-meta">
              <p class="instapay-preview-name">{{ file.name }}</p>
              <p class="instapay-preview-size">{{ formatBytes(file.size) }}</p>
            </div>
            <button
              class="instapay-preview-remove"
              type="button"
              [disabled]="submitting()"
              (click)="clearFile()"
            >
              Remove
            </button>
          </div>
        } @else {
          <button
            class="instapay-dropzone"
            type="button"
            [class.instapay-dropzone-active]="dragging()"
            (click)="fileInput.click()"
            (dragover)="onDragOver($event)"
            (dragleave)="onDragLeave($event)"
            (drop)="onDrop($event)"
            data-node-id="448:352"
          >
            <span class="instapay-dropzone-icon" aria-hidden="true" data-node-id="448:353">↑</span>
            <span class="instapay-dropzone-title" data-node-id="448:355">
              Drag your screenshot here, or browse
            </span>
            <span class="instapay-dropzone-hint" data-node-id="448:356">
              PNG or JPG · maximum {{ maxImageLabel() }} · the reference number must be readable
            </span>
          </button>
        }

        @if (error()) {
          <div class="notice notice-danger" role="alert">{{ error() }}</div>
        }

        <button
          class="btn btn-primary instapay-submit"
          type="button"
          [disabled]="!selectedFile() || submitting()"
          (click)="submit()"
          data-node-id="448:357"
        >
          {{ submitting() ? 'Uploading…' : 'Submit for review' }}
        </button>
      </article>

      <aside class="instapay-side" data-node-id="448:359">
        <div class="card panel instapay-how" data-node-id="448:360">
          <h2 class="instapay-how-title">How it works</h2>

          <div class="instapay-how-step" data-node-id="448:362">
            <span class="instapay-how-number" aria-hidden="true">1</span>
            <div>
              <p class="instapay-how-step-title">You send the transfer</p>
              <p class="instapay-how-step-desc">
                Open your bank app or InstaPay and send any amount from {{ minLabel() }} up to
                {{ maxLabel() }} to the number shown.
              </p>
            </div>
          </div>

          <div class="instapay-how-step" data-node-id="448:368">
            <span class="instapay-how-number" aria-hidden="true">2</span>
            <div>
              <p class="instapay-how-step-title">You upload the receipt</p>
              <p class="instapay-how-step-desc">
                Screenshot the whole confirmation screen. The reference number must be visible — it
                is how we make sure a transfer is only ever credited once.
              </p>
            </div>
          </div>

          <div class="instapay-how-step" data-node-id="448:374">
            <span class="instapay-how-number" aria-hidden="true">3</span>
            <div>
              <p class="instapay-how-step-title">We check and credit</p>
              <p class="instapay-how-step-desc">
                Usually within a few minutes. Until then the request sits in your InstaPay requests
                list.
              </p>
            </div>
          </div>

          <div class="instapay-single-use" data-node-id="448:380">
            <img
              class="instapay-single-use-dot"
              [src]="'assets/instapay-note-dot.svg' | assetUrl"
              width="7"
              height="7"
              alt=""
              aria-hidden="true"
            />
            <p>
              Each transfer can be submitted once. A screenshot we have already seen is rejected
              automatically.
            </p>
          </div>
        </div>

        <div class="instapay-link-row" data-node-id="448:383">
          <a class="instapay-link" routerLink="/top-up/instapay/requests" data-node-id="448:384">
            View your InstaPay requests&nbsp;&nbsp;→
          </a>
        </div>
      </aside>
    </div>
  `,
  styleUrl: './instapay-top-up.section.scss',
})
export class InstapayTopUpSection {
  private readonly instapay = inject(InstapayFacade);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  protected readonly INSTAPAY_MESSAGES = INSTAPAY_MESSAGES;
  protected readonly acceptAttr = INSTAPAY_ACCEPTED_TYPES.join(',');
  protected readonly formatBytes = formatBytes;

  protected readonly account = signal<InstapayAccount | null>(null);
  protected readonly accountError = signal('');
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly previewUrl = signal('');
  protected readonly dragging = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected readonly copied = signal(false);

  /**
   * Every limit on this screen comes from the API rather than the design copy.
   *
   * The account number arrives through an environment variable, and the
   * amounts are InstaPay's own rather than Orbit's — a hardcoded "EGP 70,000"
   * or a hardcoded number is one deploy away from being a lie that costs
   * somebody real money. The fallbacks below are only for the moment before
   * the first response lands.
   */
  protected readonly minLabel = computed(() => {
    const account = this.account();
    return account ? formatMoney(instapayAmountToMinor(account.minAmount)) : '…';
  });

  protected readonly maxLabel = computed(() => {
    const account = this.account();
    return account ? formatMoney(instapayAmountToMinor(account.maxAmount)) : '…';
  });

  protected readonly maxImageLabel = computed(() => {
    const account = this.account();
    return account ? formatBytes(account.maxImageBytes) : '1 MB';
  });

  constructor() {
    this.instapay
      .getAccount()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (account) => this.account.set(account),
        error: () => this.accountError.set(INSTAPAY_MESSAGES.accountUnavailable),
      });

    this.destroyRef.onDestroy(() => this.revokePreview());
  }

  protected async copyNumber(): Promise<void> {
    const number = this.account()?.accountNumber;
    if (!number) return;

    try {
      await navigator.clipboard.writeText(number);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1_600);
    } catch {
      // Clipboard access can be refused outright (insecure origin, denied
      // permission). The number is on screen in 28px type either way, so
      // there is nothing to recover from and nothing worth interrupting for.
    }
  }

  protected onFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.acceptFile(input.files?.[0] ?? null);
    // Cleared so choosing the same file twice in a row still fires a change
    // event — otherwise a user who removes a file cannot re-pick it.
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.acceptFile(event.dataTransfer?.files?.[0] ?? null);
  }

  protected clearFile(): void {
    this.revokePreview();
    this.selectedFile.set(null);
    this.previewUrl.set('');
    this.error.set('');
  }

  protected submit(): void {
    const file = this.selectedFile();
    if (!file || this.submitting()) return;

    this.error.set('');
    this.submitting.set(true);

    this.instapay
      .uploadReceipt(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.clearFile();
          // Straight to the requests page. The 202 means the row is already
          // committed as PENDING, so it is on the list by the time that page
          // makes its first call — and because it is unresolved, the
          // one-second refresh starts on arrival without being asked. The
          // new row appearing at the top reading "Waiting to be read" is the
          // upload confirmation; a banner here would say the same thing on a
          // screen the user is about to leave.
          void this.router.navigate(['/top-up/instapay/requests']);
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.error.set(
            err instanceof InstapayApiError
              ? bannerMessageFromInstapayError(err)
              : INSTAPAY_MESSAGES.networkError,
          );
        },
      });
  }

  /**
   * Checks what the browser can check before spending a round trip.
   *
   * The server re-checks all of it against the real magic bytes, and its
   * answer is the one that decides — a file named .png is not a PNG. This
   * only makes the obvious mistakes free.
   */
  private acceptFile(file: File | null): void {
    if (!file) {
      return;
    }

    const account = this.account();
    const localError = localFileError(file, account?.maxImageBytes ?? 1_048_576);
    if (localError) {
      this.clearFile();
      this.error.set(localError);
      return;
    }

    this.revokePreview();
    this.error.set('');
    this.selectedFile.set(file);
    this.previewUrl.set(URL.createObjectURL(file));
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
