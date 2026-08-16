import { Provider } from '@angular/core';

import { PROFILE_GATEWAY } from './profile.gateway';
import { HttpProfileGateway } from './http-profile.gateway';

export function provideProfileGateway(): Provider {
  return {
    provide: PROFILE_GATEWAY,
    useExisting: HttpProfileGateway,
  };
}
