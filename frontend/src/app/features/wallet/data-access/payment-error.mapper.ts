import { PAYMENT_MESSAGES } from './payment.messages';
import { PaymentApiError, PaymentErrorCode } from './payment.models';

const BANNER_MESSAGE: Partial<Record<PaymentErrorCode, string>> = {
  AMOUNT_BELOW_MINIMUM: PAYMENT_MESSAGES.amountBelowMinimum,
  AMOUNT_ABOVE_MAXIMUM: PAYMENT_MESSAGES.amountAboveMaximum,
  AMOUNT_INVALID: PAYMENT_MESSAGES.amountInvalid,
  CHILD_CANNOT_TOP_UP: PAYMENT_MESSAGES.childCannotTopUp,
  PAYMOB_UNREACHABLE: PAYMENT_MESSAGES.paymobUnreachable,
  PAYMENT_NOT_FOUND: PAYMENT_MESSAGES.paymentNotFound,
  NETWORK_ERROR: PAYMENT_MESSAGES.networkError,
  UNKNOWN: PAYMENT_MESSAGES.networkError,
};

export function bannerMessageFromPaymentError(error: PaymentApiError): string {
  return BANNER_MESSAGE[error.code] ?? PAYMENT_MESSAGES.networkError;
}
