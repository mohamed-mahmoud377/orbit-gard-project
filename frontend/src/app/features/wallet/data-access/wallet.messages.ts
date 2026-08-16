import { WalletApiError } from './wallet.models';

export const TRANSFER_MIN_MAJOR = 0.01;
export const TRANSFER_MAX_MAJOR = 100_000;
export const TRANSFER_MIN_MINOR = 1;
export const TRANSFER_MAX_MINOR = TRANSFER_MAX_MAJOR * 100;

export const WALLET_MESSAGES = {
  networkError: 'We could not reach Orbit. Check your connection and try again.',
  loadDashboardError: 'We could not load your wallet right now. Please try again shortly.',
  loadTransactionsError: 'We could not load your transactions right now. Please try again shortly.',
  loadSummaryError: 'We could not load your monthly summary right now.',
  transactionNotFound: 'Transaction not found.',
  transferSuccess: 'Your transfer was recorded.',
  insufficientBalance: 'The available balance is too low for this transfer.',
  receiverNotFound: 'No Orbit user found with that username.',
  selfTransfer: 'You cannot send money to yourself.',
  transferFailed: 'We could not complete this transfer. Please try again.',
  amountInvalid: 'Enter a valid amount greater than zero.',
  amountBelowMinimum: `Enter an amount of at least EGP ${TRANSFER_MIN_MAJOR.toFixed(2)}.`,
  amountAboveMaximum: `Enter an amount up to EGP ${TRANSFER_MAX_MAJOR.toLocaleString('en-EG')}.`,
} as const;

export function bannerMessageFromWalletError(error: WalletApiError): string {
  switch (error.code) {
    case 'INSUFFICIENT_BALANCE':
      return WALLET_MESSAGES.insufficientBalance;
    case 'RECEIVER_NOT_FOUND':
      return WALLET_MESSAGES.receiverNotFound;
    case 'SELF_TRANSFER_NOT_ALLOWED':
      return WALLET_MESSAGES.selfTransfer;
    default:
      return error.detail ?? error.message ?? WALLET_MESSAGES.transferFailed;
  }
}
