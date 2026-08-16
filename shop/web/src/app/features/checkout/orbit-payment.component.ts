import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { ApiError } from '../../core/api-error';
import { OrbitVerifyResponse, PaymentResultResponse } from '../../core/models';
import { CountdownComponent } from '../../shared/countdown.component';
import { IconComponent } from '../../shared/icon.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { WalletFault, mapWalletError } from './orbit-errors';

type Phase = 'credentials' | 'verifying' | 'session' | 'confirming' | 'failed';

/**
 * Orbit E-Wallet payment, CONTRACT §8.
 *
 * Step A posts the wallet credentials exactly once to
 * `POST /orders/:id/pay/orbit/verify`. Nothing sensitive comes back and
 * nothing is kept: the password is dropped from memory the moment the call
 * returns, and the Orbit token never leaves the server.
 *
 * Step B sends only the `sessionId` to `.../confirm`.
 */
@Component({
  selector: 'ob-orbit-payment',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CountdownComponent, IconComponent, MoneyPipe],
  host: { class: 'block' },
  template: `
    <div class="overflow-hidden rounded-2xl border border-brand/25">
      <!-- Orbit-branded header, visually distinct from the shop chrome so it
           reads as "you are handing this to your bank now". -->
      <header class="relative overflow-hidden bg-ink px-5 py-4 text-white">
        <span class="absolute -top-16 -right-10 size-40 rounded-full bg-brand opacity-40 blur-2xl"></span>
        <div class="relative flex items-center gap-3">
          <span class="grid size-10 place-items-center rounded-xl bg-white/10">
            <ob-icon name="wallet" [size]="21" />
          </span>
          <div>
            <p class="text-sm font-extrabold tracking-tight">Orbit E-Wallet</p>
            <p class="text-xs text-white/60">Secure payment · {{ amountCents() | money }}</p>
          </div>
          <span class="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-white/70">
            <ob-icon name="lock" [size]="13" />
            Encrypted
          </span>
        </div>
      </header>

      <div class="bg-surface p-5">
        @switch (phase()) {
          <!-- ================================================== step A -->
          @case ('credentials') {
            <form (submit)="verify($event)" novalidate>
              <h3 class="text-sm font-bold">Sign in to your wallet</h3>
              <p class="mt-1 text-xs leading-relaxed text-muted">
                Step 1 of 2 — we pass these straight to Orbit to open a payment session. Orbit
                Bazaar never stores your wallet username, password or session token.
              </p>

              <label class="mt-4 block">
                <span class="ob-label">Orbit username</span>
                <input
                  class="ob-input"
                  name="orbitUsername"
                  autocomplete="off"
                  autocapitalize="none"
                  spellcheck="false"
                  required
                  [value]="username()"
                  (input)="username.set($any($event.target).value)"
                />
              </label>

              <label class="mt-3 block">
                <span class="ob-label">Orbit password</span>
                <span class="relative block">
                  <input
                    class="ob-input pr-11"
                    [type]="showPassword() ? 'text' : 'password'"
                    name="orbitPassword"
                    autocomplete="off"
                    required
                    [value]="password()"
                    (input)="password.set($any($event.target).value)"
                  />
                  <button
                    type="button"
                    class="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted transition hover:text-body"
                    [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                    (click)="showPassword.set(!showPassword())"
                  >
                    <ob-icon [name]="showPassword() ? 'eye-off' : 'eye'" [size]="17" />
                  </button>
                </span>
              </label>

              <button
                type="submit"
                class="ob-btn ob-btn-brand ob-btn-lg mt-5 w-full"
                [disabled]="!canVerify()"
              >
                <ob-icon name="lock" [size]="16" />
                Continue to confirm
              </button>

              <p class="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-muted">
                <ob-icon name="shield-check" [size]="14" class="mt-px shrink-0 text-teal" />
                Your credentials are sent once, server-to-server, and are not written to this
                device or to our database.
              </p>
            </form>
          }

          <!-- ============================================== verifying -->
          @case ('verifying') {
            <div class="py-8 text-center">
              <ob-icon name="loader" [size]="30" class="ob-spin mx-auto text-brand" />
              <p class="mt-4 text-sm font-bold">Opening a session with Orbit…</p>
              <p class="mt-1 text-xs text-muted">This usually takes a second or two.</p>
            </div>
          }

          <!-- ================================================== step B -->
          @case ('session') {
            @if (session(); as s) {
              <h3 class="text-sm font-bold">Confirm the payment</h3>
              <p class="mt-1 text-xs leading-relaxed text-muted">
                Step 2 of 2 — Orbit has authorised this session. Nothing has been debited yet.
              </p>

              <dl class="mt-4 divide-y divide-line rounded-xl border border-line">
                <div class="flex items-center justify-between px-4 py-3">
                  <dt class="text-xs font-semibold text-muted">Wallet</dt>
                  <dd class="font-mono text-sm font-bold">{{ s.maskedUsername }}</dd>
                </div>
                <div class="flex items-center justify-between px-4 py-3">
                  <dt class="text-xs font-semibold text-muted">Merchant</dt>
                  <dd class="text-sm font-semibold">Orbit Bazaar</dd>
                </div>
                <div class="flex items-center justify-between px-4 py-3">
                  <dt class="text-xs font-semibold text-muted">Amount to debit</dt>
                  <dd class="text-lg font-extrabold">{{ s.amountCents | money }}</dd>
                </div>
              </dl>

              <div
                class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-3"
              >
                <p class="text-xs font-bold text-accent-dark">Session expires in</p>
                <ob-countdown [until]="s.expiresAt" chipClass="bg-accent text-[#3a2200]" />
              </div>

              <button
                type="button"
                class="ob-btn ob-btn-primary ob-btn-lg mt-4 w-full"
                (click)="confirm()"
              >
                <ob-icon name="check" [size]="17" />
                Confirm payment of {{ s.amountCents | money }}
              </button>

              <button
                type="button"
                class="ob-btn ob-btn-ghost mt-2 w-full"
                (click)="restart()"
              >
                Use a different wallet
              </button>
            }
          }

          <!-- ============================================= confirming -->
          @case ('confirming') {
            <div class="py-8 text-center">
              <ob-icon name="loader" [size]="30" class="ob-spin mx-auto text-brand" />
              <p class="mt-4 text-sm font-bold">Debiting your Orbit wallet…</p>
              <p class="mt-1 text-xs leading-relaxed text-muted">
                Please don't close this page or press back — we're waiting on Orbit.
              </p>
            </div>
          }

          <!-- ================================================= failed -->
          @case ('failed') {
            @if (fault(); as f) {
              <div
                class="rounded-xl border p-4"
                [class]="
                  f.tone === 'warning'
                    ? 'border-warn/35 bg-warn-soft'
                    : 'border-pop/30 bg-pop-soft'
                "
                role="alert"
              >
                <div class="flex items-start gap-3">
                  <ob-icon
                    [name]="f.tone === 'warning' ? 'alert-triangle' : 'alert-circle'"
                    [size]="20"
                    class="mt-0.5 shrink-0"
                    [class]="f.tone === 'warning' ? 'text-warn' : 'text-pop'"
                  />
                  <div class="min-w-0">
                    <p
                      class="text-sm font-bold"
                      [class]="f.tone === 'warning' ? 'text-warn' : 'text-pop'"
                    >
                      {{ f.title }}
                    </p>
                    <p class="mt-1 text-sm leading-relaxed text-body/85">{{ f.message }}</p>
                    <p class="mt-2 text-xs leading-relaxed text-muted">{{ f.guidance }}</p>

                    @if (f.recovery === 'confirm' && shortfallKnown()) {
                      <p class="mt-2 rounded-lg bg-surface px-3 py-2 text-xs font-semibold">
                        You need at least
                        <span class="font-extrabold">{{ requiredCents() | money }}</span>
                        available to complete this order.
                      </p>
                    }
                  </div>
                </div>

                <div class="mt-4 flex flex-wrap gap-2">
                  @switch (f.recovery) {
                    @case ('restart') {
                      <button type="button" class="ob-btn ob-btn-brand ob-btn-sm" (click)="restart()">
                        <ob-icon name="refresh" [size]="14" /> Enter wallet details again
                      </button>
                    }
                    @case ('confirm') {
                      <button type="button" class="ob-btn ob-btn-brand ob-btn-sm" (click)="backToSession()">
                        <ob-icon name="refresh" [size]="14" /> Try the payment again
                      </button>
                    }
                    @case ('verify') {
                      <button type="button" class="ob-btn ob-btn-brand ob-btn-sm" (click)="restart()">
                        <ob-icon name="refresh" [size]="14" /> Retry
                      </button>
                    }
                    @case ('order') {
                      <a [routerLink]="['/orders', orderId()]" class="ob-btn ob-btn-brand ob-btn-sm">
                        <ob-icon name="package" [size]="14" /> Open the order
                      </a>
                    }
                    @case ('card') {
                      <button
                        type="button"
                        class="ob-btn ob-btn-brand ob-btn-sm"
                        (click)="switchToCard.emit()"
                      >
                        <ob-icon name="credit-card" [size]="14" /> Pay by card instead
                      </button>
                    }
                    @case ('none') {
                      <!-- CONTRACT §8: no one-click retry for this order. -->
                      <a [routerLink]="['/orders', orderId()]" class="ob-btn ob-btn-ghost ob-btn-sm">
                        <ob-icon name="package" [size]="14" /> View this order
                      </a>
                      <a routerLink="/" class="ob-btn ob-btn-ghost ob-btn-sm">Back to the shop</a>
                    }
                  }

                  @if (f.offerCard && f.recovery !== 'card') {
                    <button
                      type="button"
                      class="ob-btn ob-btn-ghost ob-btn-sm"
                      (click)="switchToCard.emit()"
                    >
                      <ob-icon name="credit-card" [size]="14" /> Pay by card instead
                    </button>
                  }
                </div>
              </div>
            }
          }
        }
      </div>
    </div>
  `,
})
export class OrbitPaymentComponent {
  private readonly api = inject(ApiService);

  readonly orderId = input.required<string>();
  readonly amountCents = input.required<number>();

  readonly paid = output<PaymentResultResponse>();
  readonly switchToCard = output<void>();
  /** Raised when the shop needs to re-read the order (uncertain / already paid). */
  readonly orderChanged = output<void>();

  protected readonly phase = signal<Phase>('credentials');
  protected readonly session = signal<OrbitVerifyResponse | null>(null);
  protected readonly fault = signal<WalletFault | null>(null);

  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);

  protected readonly requiredCents = signal<number | null>(null);
  protected readonly shortfallKnown = computed(() => this.requiredCents() !== null);

  protected readonly canVerify = computed(
    () => this.username().trim().length > 0 && this.password().length > 0,
  );

  /** Whether a payment is currently in flight, for the parent's step lock. */
  readonly busy = computed(() => this.phase() === 'verifying' || this.phase() === 'confirming');

  protected verify(event?: Event): void {
    // Native submit handler: this component intentionally does not pull in
    // FormsModule (there is no ngModel here), so the default must be stopped
    // explicitly or the browser reloads the page mid-checkout.
    event?.preventDefault();
    if (!this.canVerify()) return;
    this.phase.set('verifying');
    this.fault.set(null);

    const username = this.username().trim();
    const password = this.password();

    this.api.orbitVerify(this.orderId(), { username, password }).subscribe({
      next: (res) => {
        // The password has done its one job. Drop it immediately — it is not
        // needed for the confirm step and must not linger in memory.
        this.password.set('');
        this.session.set(res);
        this.phase.set('session');
      },
      error: (err: ApiError) => {
        this.password.set('');
        this.fail(err);
      },
    });
  }

  protected confirm(): void {
    const session = this.session();
    if (!session) return;
    this.phase.set('confirming');
    this.fault.set(null);

    // Only the session id goes over the wire (CONTRACT §8 step 2).
    this.api.orbitConfirm(this.orderId(), session.sessionId).subscribe({
      next: (res) => this.paid.emit(res),
      error: (err: ApiError) => this.fail(err),
    });
  }

  protected restart(): void {
    this.session.set(null);
    this.fault.set(null);
    this.requiredCents.set(null);
    this.username.set('');
    this.password.set('');
    this.phase.set('credentials');
  }

  /** Go back to the confirm panel with the still-valid session. */
  protected backToSession(): void {
    this.fault.set(null);
    this.phase.set(this.session() ? 'session' : 'credentials');
  }

  private fail(error: ApiError): void {
    const fault = mapWalletError(error);
    this.requiredCents.set(error.details?.requiredCents ?? null);
    this.fault.set(fault);
    this.phase.set('failed');

    // The order row changed server-side in these cases, so the rest of the
    // checkout needs to know it can no longer be paid from here.
    if (fault.recovery === 'none' || fault.recovery === 'order') this.orderChanged.emit();
  }
}
