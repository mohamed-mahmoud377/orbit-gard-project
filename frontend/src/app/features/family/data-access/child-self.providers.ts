import { Provider } from '@angular/core';

import { CHILD_SELF_GATEWAY } from './child-self.gateway';
import { HttpChildSelfGateway } from './http-child-self.gateway';

export function provideChildSelfGateway(): Provider {
  return {
    provide: CHILD_SELF_GATEWAY,
    useExisting: HttpChildSelfGateway,
  };
}
