import { Provider } from '@angular/core';

import { INSTAPAY_GATEWAY } from './instapay.gateway';
import { HttpInstapayGateway } from './http-instapay.gateway';

export function provideInstapayGateway(): Provider {
  return {
    provide: INSTAPAY_GATEWAY,
    useExisting: HttpInstapayGateway,
  };
}
