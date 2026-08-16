import { Provider } from '@angular/core';

import { PASSWORD_GATEWAY } from './password.gateway';
import { HttpPasswordGateway } from './http-password.gateway';

export function providePasswordGateway(): Provider {
  return {
    provide: PASSWORD_GATEWAY,
    useExisting: HttpPasswordGateway,
  };
}
