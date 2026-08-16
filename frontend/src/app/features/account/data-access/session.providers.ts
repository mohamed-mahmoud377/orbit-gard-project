import { Provider } from '@angular/core';

import { HttpSessionGateway } from './http-session.gateway';
import { SESSION_GATEWAY } from './session.gateway';

export function provideSessionGateway(): Provider {
  return {
    provide: SESSION_GATEWAY,
    useExisting: HttpSessionGateway,
  };
}
