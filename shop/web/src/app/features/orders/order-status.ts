import { OrderStatus, PaymentStatus } from '../../core/models';

export interface StatusStyle {
  label: string;
  classes: string;
  icon: string;
}

const ORDER_STATUS: Record<OrderStatus, StatusStyle> = {
  PENDING: { label: 'Awaiting payment', classes: 'bg-accent-soft text-accent-dark', icon: 'clock' },
  PAID: { label: 'Paid', classes: 'bg-teal-soft text-teal', icon: 'check-circle' },
  PROCESSING: { label: 'Processing', classes: 'bg-brand-soft text-brand', icon: 'package' },
  SHIPPED: { label: 'Shipped', classes: 'bg-brand-soft text-brand', icon: 'truck' },
  DELIVERED: { label: 'Delivered', classes: 'bg-teal-soft text-teal', icon: 'check-circle' },
  CANCELLED: { label: 'Cancelled', classes: 'bg-line-soft text-muted', icon: 'x' },
  // Never styled as a failure: the money may well have left the wallet.
  NEEDS_REVIEW: { label: 'On hold — under review', classes: 'bg-warn-soft text-warn', icon: 'alert-triangle' },
};

const PAYMENT_STATUS: Record<PaymentStatus, StatusStyle> = {
  UNPAID: { label: 'Unpaid', classes: 'bg-accent-soft text-accent-dark', icon: 'clock' },
  PAID: { label: 'Paid', classes: 'bg-teal-soft text-teal', icon: 'check-circle' },
  FAILED: { label: 'Payment failed', classes: 'bg-pop-soft text-pop', icon: 'alert-circle' },
  UNCERTAIN: { label: 'Payment unconfirmed', classes: 'bg-warn-soft text-warn', icon: 'alert-triangle' },
};

export function orderStatusStyle(status: OrderStatus): StatusStyle {
  return ORDER_STATUS[status] ?? { label: status, classes: 'bg-line-soft text-muted', icon: 'info' };
}

export function paymentStatusStyle(status: PaymentStatus): StatusStyle {
  return (
    PAYMENT_STATUS[status] ?? { label: status, classes: 'bg-line-soft text-muted', icon: 'info' }
  );
}

/** The stages shown in the tracker, in order. Review/cancel sit outside it. */
export const TRACK_STAGES: { status: OrderStatus; label: string; icon: string }[] = [
  { status: 'PAID', label: 'Paid', icon: 'credit-card' },
  { status: 'PROCESSING', label: 'Packing', icon: 'package' },
  { status: 'SHIPPED', label: 'On its way', icon: 'truck' },
  { status: 'DELIVERED', label: 'Delivered', icon: 'home' },
];
