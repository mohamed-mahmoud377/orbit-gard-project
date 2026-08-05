export const PAYMENT_MESSAGES = {
  amountBelowMinimum: 'Enter an amount between EGP 50.00 and EGP 20,000.00.',
  amountAboveMaximum: 'Enter an amount between EGP 50.00 and EGP 20,000.00.',
  amountInvalid: 'Enter a valid amount greater than zero.',
  childCannotTopUp: 'Child accounts cannot add money to a wallet.',
  paymobUnreachable:
    'Paymob is temporarily unavailable. Your card was not charged. Try again shortly.',
  paymentNotFound: 'We could not find this payment reference.',
  networkError: 'Something went wrong. Check your connection and try again.',
  redirecting: 'Redirecting you to Paymob…',
  confirmingTitle: 'Confirming your top-up',
  confirmingMessage: (amount: string) =>
    `We are waiting for Orbit to confirm your ${amount} payment. This usually takes a few seconds.`,
  stillConfirmingTitle: 'Still confirming',
  stillConfirmingMessage:
    'Your payment is taking longer than usual to confirm. You can check back shortly from your dashboard.',
  successTitle: 'Top-up succeeded',
  successMessage: (amount: string) =>
    `${amount} will appear in your wallet once settlement completes.`,
  failedTitle: 'Top-up failed',
  failedMessage: 'Your card was not charged. Try again or use another method.',
  expiredTitle: 'Top-up expired',
  expiredMessage: 'This payment session expired before it could be completed.',
  invalidReferenceTitle: 'Invalid payment reference',
  invalidReferenceMessage:
    'We could not match this return link to a top-up. Start a new top-up from your wallet.',
} as const;
