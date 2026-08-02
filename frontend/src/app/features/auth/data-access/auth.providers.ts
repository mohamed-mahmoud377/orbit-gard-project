import { Provider } from '@angular/core';

import { environment } from '../../../../environments/environment';
import { AUTH_GATEWAY } from './auth.gateway';
import { HttpAuthGateway } from './http-auth.gateway';
import { MockAuthGateway } from './mock-auth.gateway';

export function provideAuthGateway(): Provider {
  return {
    provide: AUTH_GATEWAY,
    useExisting: environment.useMockAuth ? MockAuthGateway : HttpAuthGateway,
  };
}
