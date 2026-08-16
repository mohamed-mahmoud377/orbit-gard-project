import { ApiError } from '../../core/api-error';

/**
 * What the UI should do next after an Orbit failure.
 *
 * `restart`  — the session is dead; go back to the credentials form.
 * `confirm`  — the token was never redeemed, so the same session can be
 *              confirmed again once the shopper has fixed the cause.
 * `verify`   — nothing was sent; sign in again and retry the whole thing.
 * `card`     — offer the card path instead.
 * `order`    — send them to the order; the state is only knowable there.
 * `none`     — deliberately no retry (the uncertain case, CONTRACT §8).
 */
export type WalletRecovery = 'restart' | 'confirm' | 'verify' | 'card' | 'order' | 'none';

export interface WalletFault {
  /** Amber for "we don't know", red for "it definitely didn't happen". */
  tone: 'error' | 'warning';
  title: string;
  /** The user-safe message from the API (CONTRACT §5). */
  message: string;
  /** What we add on top: the next step, in plain words. */
  guidance: string;
  recovery: WalletRecovery;
  /** Also offer "pay by card instead" alongside the primary recovery. */
  offerCard: boolean;
}

/**
 * Every code from CONTRACT §8, mapped to a specific message and a sensible
 * recovery. Anything unmapped degrades to a generic retry rather than a
 * blank screen.
 */
export function mapWalletError(error: ApiError): WalletFault {
  const retryableSession = error.details?.sessionRetryable === true;

  switch (error.code) {
    case 'ORBIT_INVALID_CREDENTIALS':
      return {
        tone: 'error',
        title: 'Those Orbit details were not accepted',
        message: error.message,
        guidance:
          'Check the username and password you use for the Orbit app and enter them again. Nothing has been charged.',
        recovery: 'restart',
        offerCard: false,
      };

    case 'ORBIT_ACCOUNT_NOT_VERIFIED':
      return {
        tone: 'error',
        title: 'Your Orbit account is not verified yet',
        message: error.message,
        guidance:
          'Open the Orbit app and finish activating the account, then come back and sign in again. Your order is saved.',
        recovery: 'restart',
        offerCard: true,
      };

    case 'ORBIT_ACCOUNT_SUSPENDED':
      return {
        tone: 'error',
        title: 'This Orbit account is suspended',
        message: error.message,
        guidance:
          'Orbit support will need to lift the suspension before the wallet can be used. In the meantime you can pay by card.',
        recovery: 'card',
        offerCard: false,
      };

    case 'ORBIT_SESSION_INVALID':
      return {
        tone: 'error',
        title: 'That wallet session is no longer valid',
        message: error.message,
        guidance: 'Sign in to your wallet again to start a fresh session. Nothing has been charged.',
        recovery: 'restart',
        offerCard: true,
      };

    case 'ORBIT_SESSION_EXPIRED':
      return {
        tone: 'error',
        title: 'Your wallet session expired',
        message: error.message,
        guidance:
          'Wallet sign-in lasts one hour. Sign in again to get a new session — your order and its price are unchanged.',
        recovery: 'restart',
        offerCard: true,
      };

    case 'ORBIT_SESSION_USED':
      return {
        tone: 'warning',
        title: 'That session has already been used',
        message: error.message,
        guidance:
          'This usually means the payment already went through. Open the order to see its current status before trying again.',
        recovery: 'order',
        offerCard: false,
      };

    case 'ORBIT_INSUFFICIENT_BALANCE':
      return {
        tone: 'error',
        title: 'Not enough balance in your wallet',
        message: error.message,
        guidance:
          'Top the wallet up in the Orbit app and confirm again — your session is still open — or pay by card instead.',
        recovery: retryableSession ? 'confirm' : 'restart',
        offerCard: true,
      };

    case 'ORBIT_DAILY_LIMIT':
      return {
        tone: 'error',
        title: 'This would exceed your daily limit',
        message: error.message,
        guidance:
          'Orbit caps how much you can spend in a single day. Either raise the limit in the Orbit app, try again tomorrow, or pay by card.',
        recovery: retryableSession ? 'confirm' : 'restart',
        offerCard: true,
      };

    case 'ORBIT_MONTHLY_LIMIT':
      return {
        tone: 'error',
        title: 'This would exceed your monthly limit',
        message: error.message,
        guidance:
          'Orbit caps how much you can spend in a calendar month. Raise the limit in the Orbit app, or pay by card.',
        recovery: retryableSession ? 'confirm' : 'restart',
        offerCard: true,
      };

    case 'ORBIT_PER_TXN_LIMIT':
      return {
        tone: 'error',
        title: 'This order is over your per-transaction limit',
        message: error.message,
        guidance:
          'Orbit caps the size of a single payment. Raise the limit in the Orbit app, split the order into smaller ones, or pay by card.',
        recovery: retryableSession ? 'confirm' : 'restart',
        offerCard: true,
      };

    case 'ORBIT_AMOUNT_INVALID':
      return {
        tone: 'error',
        title: "We couldn't charge that amount",
        message: error.message,
        guidance: 'Go back to your cart, refresh it, and place the order again.',
        recovery: 'order',
        offerCard: true,
      };

    case 'ORBIT_BAD_REQUEST':
      return {
        tone: 'error',
        title: 'Something was missing from the payment request',
        message: error.message,
        guidance: 'Sign in to your wallet again and retry. Nothing has been charged.',
        recovery: 'restart',
        offerCard: true,
      };

    case 'ORBIT_UNAVAILABLE':
      return {
        tone: 'error',
        title: "We couldn't reach Orbit",
        message: error.message,
        guidance:
          'The request never left our side, so nothing was charged. Your order is saved — try again in a moment.',
        recovery: 'verify',
        offerCard: true,
      };

    /* -------------------------------------------------------------------
     * CONTRACT §8, "the uncertain case". This is a WARNING, never a
     * failure: the wallet may well have been debited. The contract is
     * explicit that we must not offer a one-click retry for this order.
     * ----------------------------------------------------------------- */
    case 'ORBIT_UNCERTAIN':
      return {
        tone: 'warning',
        title: 'We lost contact with Orbit mid-payment',
        message: error.message,
        guidance:
          "We can't tell yet whether your wallet was debited, so this order is on hold and we will not retry it — that is what stops you being charged twice. Check your Orbit transactions: if the payment went through, the order completes on its own. If it did not, place a new order.",
        recovery: 'none',
        offerCard: false,
      };

    case 'ORBIT_PAYMENT_IN_PROGRESS':
      return {
        tone: 'warning',
        title: 'A payment for this order is already going through',
        message: error.message,
        guidance: 'Give it a few seconds, then open the order to see whether it completed.',
        recovery: 'order',
        offerCard: false,
      };

    case 'ORDER_UNDER_REVIEW':
      return {
        tone: 'warning',
        title: 'This order is on hold',
        message: error.message,
        guidance:
          "We're confirming an earlier payment attempt with Orbit. Check your Orbit transactions — we will not let you be charged twice.",
        recovery: 'none',
        offerCard: false,
      };

    case 'ORDER_ALREADY_PAID':
      return {
        tone: 'warning',
        title: 'This order has already been paid',
        message: error.message,
        guidance: 'Open the order to see your receipt.',
        recovery: 'order',
        offerCard: false,
      };

    case 'RATE_LIMITED':
      return {
        tone: 'error',
        title: 'Too many payment attempts',
        message: error.message,
        guidance: 'Wait a few minutes before trying again. Nothing has been charged.',
        recovery: 'none',
        offerCard: false,
      };

    default:
      return {
        tone: 'error',
        title: "That payment didn't go through",
        message: error.message,
        guidance: 'Nothing has been charged. Try again, or pay by card instead.',
        recovery: 'restart',
        offerCard: true,
      };
  }
}
