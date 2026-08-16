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
 *
 * ---------------------------------------------------------------------------
 * Why this panel looks nothing like the rest of the shop
 * ---------------------------------------------------------------------------
 * It is Orbit's surface, not ours. A hosted payment page from a bank never
 * wears the merchant's skin, and the customer needs to see that they have
 * stepped out of Jerry's Shop and are typing their wallet password into
 * something that belongs to Orbit. So the whole panel switches to Orbit's own
 * design language — cool blue on white, 10/14/18px radii, Orbit's card shadow —
 * inside the warm cocoa-and-cheddar shop. The styles live in
 * `styles.css` under `.ob-orbit-*` and the tokens are transcribed from
 * `frontend/src/styles/_tokens.scss`.
 *
 * The Orbit mark (three concentric circles) is reproduced inline: the shop
 * container has no access to the banking app's assets, and an inline SVG is a
 * couple of hundred bytes with no extra request.
 */
@Component({
  selector: 'ob-orbit-payment',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CountdownComponent, IconComponent, MoneyPipe],
  host: { class: 'block' },
  template: `
    <section class="ob-orbit-surface" aria-label="Orbit E-Wallet payment">
      <!-- =================================================== Orbit header -->
      <header class="ob-orbit-head">
        <div class="flex items-center gap-2.5">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true" class="shrink-0">
            <svg:circle cx="16" cy="16" r="15" stroke="#0E2C6B" stroke-width="2" />
            <svg:circle cx="16" cy="16" r="9" stroke="#1A4FB0" stroke-width="2" />
            <svg:circle cx="16" cy="16" r="4" fill="#1A4FB0" />
          </svg>
          <span class="ob-orbit-wordmark">Orbit</span>
          <span class="ob-orbit-rule"></span>
          <span class="ob-orbit-eyebrow">E-Wallet</span>
          <span class="ob-orbit-secure ml-auto">
            <ob-icon name="lock" [size]="12" />
            Secure
          </span>
        </div>
        <p class="ob-orbit-head-note">
          You are signing in directly with Orbit. Jerry&rsquo;s Shop never sees your wallet
          password — it is sent once, server-to-server, and the session token stays with Orbit.
        </p>
      </header>

      <div class="ob-orbit-amount">
        <span>Amount to pay</span>
        <strong>{{ amountCents() | money }}</strong>
      </div>

      <div class="ob-orbit-body">
        @switch (phase()) {
          <!-- ================================================== step A -->
          @case ('credentials') {
            <form (submit)="verify($event)" novalidate>
              <p class="ob-orbit-step">Step 1 of 2</p>
              <h3 class="ob-orbit-title mt-1">Sign in to your wallet</h3>
              <p class="ob-orbit-sub mt-1.5">
                Orbit checks these and opens a one-hour payment session. Nothing is debited at
                this step.
              </p>

              <label class="mt-4 block">
                <span class="ob-orbit-label">Orbit username</span>
                <input
                  class="ob-orbit-input"
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
                <span class="ob-orbit-label">Orbit password</span>
                <span class="relative block">
                  <input
                    class="ob-orbit-input ob-orbit-input-pw"
                    [type]="showPassword() ? 'text' : 'password'"
                    name="orbitPassword"
                    autocomplete="off"
                    required
                    [value]="password()"
                    (input)="password.set($any($event.target).value)"
                  />
                  <button
                    type="button"
                    class="ob-orbit-eye"
                    [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                    (click)="showPassword.set(!showPassword())"
                  >
                    <ob-icon [name]="showPassword() ? 'eye-off' : 'eye'" [size]="17" />
                  </button>
                </span>
              </label>

              <button
                type="submit"
                class="ob-orbit-btn ob-orbit-btn-primary ob-orbit-btn-lg mt-5 w-full"
                [disabled]="!canVerify()"
              >
                <ob-icon name="lock" [size]="15" />
                Continue to confirm
              </button>

              <p class="ob-orbit-muted mt-3 flex items-start gap-2">
                <ob-icon name="shield-check" [size]="14" class="mt-px shrink-0 text-[#0e7c4a]" />
                Your credentials are never written to this device or to the shop's database.
              </p>
            </form>
          }

          <!-- ============================================== verifying -->
          @case ('verifying') {
            <div class="py-8 text-center">
              <ob-icon name="loader" [size]="30" class="ob-spin mx-auto text-[#1a4fb0]" />
              <p class="ob-orbit-title mt-4">Opening a session with Orbit…</p>
              <p class="ob-orbit-sub mt-1">This usually takes a second or two.</p>
            </div>
          }

          <!-- ================================================== step B -->
          @case ('session') {
            @if (session(); as s) {
              <p class="ob-orbit-step">Step 2 of 2</p>
              <h3 class="ob-orbit-title mt-1">Confirm the payment</h3>
              <p class="ob-orbit-sub mt-1.5">
                Orbit has authorised this session. Nothing has been debited yet — confirming
                below is what moves the money.
              </p>

              <dl class="ob-orbit-rows mt-4">
                <div class="ob-orbit-row">
                  <dt>Wallet</dt>
                  <dd class="font-mono">{{ s.maskedUsername }}</dd>
                </div>
                <div class="ob-orbit-row">
                  <dt>Paying</dt>
                  <dd>Jerry&rsquo;s Shop</dd>
                </div>
                <div class="ob-orbit-row ob-orbit-row-total">
                  <dt>Amount to debit</dt>
                  <dd>{{ s.amountCents | money }}</dd>
                </div>
              </dl>

              <div class="ob-orbit-expiry">
                <p>Session expires in</p>
                <ob-countdown [until]="s.expiresAt" chipClass="bg-[#0e2c6b] text-white" />
              </div>

              <button
                type="button"
                class="ob-orbit-btn ob-orbit-btn-primary ob-orbit-btn-lg mt-4 w-full"
                (click)="confirm()"
              >
                <ob-icon name="check" [size]="17" />
                Confirm payment of {{ s.amountCents | money }}
              </button>

              <button
                type="button"
                class="ob-orbit-btn ob-orbit-btn-quiet mt-2 w-full"
                (click)="restart()"
              >
                Use a different wallet
              </button>
            }
          }

          <!-- ============================================= confirming -->
          @case ('confirming') {
            <div class="py-8 text-center">
              <ob-icon name="loader" [size]="30" class="ob-spin mx-auto text-[#1a4fb0]" />
              <p class="ob-orbit-title mt-4">Debiting your Orbit wallet…</p>
              <p class="ob-orbit-sub mt-1">
                Please don't close this page or press back — we're waiting on Orbit.
              </p>
            </div>
          }

          <!-- ================================================= failed -->
          @case ('failed') {
            @if (fault(); as f) {
              <!-- The bg-warn-soft class on the warning tone is load-bearing:
                   the e2e suite asserts amber-not-red by class name, and the
                   shop's warn-soft is within a hair of Orbit's held-wash
                   #fdf2e3, so it also happens to be the right colour. -->
              <div
                class="ob-orbit-alert"
                [class]="
                  f.tone === 'warning'
                    ? 'ob-orbit-alert-warn bg-warn-soft'
                    : 'ob-orbit-alert-danger'
                "
                role="alert"
              >
                <div class="flex items-start gap-3">
                  <span class="ob-orbit-alert-icon mt-0.5 shrink-0">
                    <ob-icon
                      [name]="f.tone === 'warning' ? 'alert-triangle' : 'alert-circle'"
                      [size]="20"
                    />
                  </span>
                  <div class="min-w-0">
                    <p class="ob-orbit-alert-title">{{ f.title }}</p>
                    <p class="ob-orbit-alert-body">{{ f.message }}</p>
                    <p class="ob-orbit-alert-guidance">{{ f.guidance }}</p>

                    @if (f.recovery === 'confirm' && shortfallKnown()) {
                      <p class="ob-orbit-alert-fact">
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
                      <button
                        type="button"
                        class="ob-orbit-btn ob-orbit-btn-primary ob-orbit-btn-sm"
                        (click)="restart()"
                      >
                        <ob-icon name="refresh" [size]="14" /> Enter wallet details again
                      </button>
                    }
                    @case ('confirm') {
                      <button
                        type="button"
                        class="ob-orbit-btn ob-orbit-btn-primary ob-orbit-btn-sm"
                        (click)="backToSession()"
                      >
                        <ob-icon name="refresh" [size]="14" /> Try the payment again
                      </button>
                    }
                    @case ('verify') {
                      <button
                        type="button"
                        class="ob-orbit-btn ob-orbit-btn-primary ob-orbit-btn-sm"
                        (click)="restart()"
                      >
                        <ob-icon name="refresh" [size]="14" /> Retry
                      </button>
                    }
                    @case ('order') {
                      <a
                        [routerLink]="['/orders', orderId()]"
                        class="ob-orbit-btn ob-orbit-btn-primary ob-orbit-btn-sm"
                      >
                        <ob-icon name="package" [size]="14" /> Open the order
                      </a>
                    }
                    @case ('card') {
                      <button
                        type="button"
                        class="ob-orbit-btn ob-orbit-btn-primary ob-orbit-btn-sm"
                        (click)="switchToCard.emit()"
                      >
                        <ob-icon name="credit-card" [size]="14" /> Pay by card instead
                      </button>
                    }
                    @case ('none') {
                      <!-- CONTRACT §8: no one-click retry for this order. -->
                      <a
                        [routerLink]="['/orders', orderId()]"
                        class="ob-orbit-btn ob-orbit-btn-quiet ob-orbit-btn-sm"
                      >
                        <ob-icon name="package" [size]="14" /> View this order
                      </a>
                      <a routerLink="/" class="ob-orbit-btn ob-orbit-btn-quiet ob-orbit-btn-sm"
                        >Back to the shop</a
                      >
                    }
                  }

                  @if (f.offerCard && f.recovery !== 'card') {
                    <button
                      type="button"
                      class="ob-orbit-btn ob-orbit-btn-quiet ob-orbit-btn-sm"
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

      <footer class="ob-orbit-foot">
        <span class="inline-flex items-center gap-1.5">
          <ob-icon name="shield" [size]="12" />
          Processed by Orbit · EGP
        </span>
        <span>Session token never reaches your browser</span>
      </footer>
    </section>
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
