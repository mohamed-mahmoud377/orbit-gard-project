import { Provider } from '@angular/core';

import { PAYMENT_GATEWAY } from './payment.gateway';
import { HttpPaymentGateway } from './http-payment.gateway';

export function providePaymentGateway(): Provider {
  return {
    provide: PAYMENT_GATEWAY,
    useExisting: HttpPaymentGateway,
  };
}
