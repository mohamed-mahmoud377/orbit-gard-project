import { Provider } from '@angular/core';

import { FAMILY_GATEWAY } from './family.gateway';
import { HttpFamilyGateway } from './http-family.gateway';

export function provideFamilyGateway(): Provider {
  return {
    provide: FAMILY_GATEWAY,
    useExisting: HttpFamilyGateway,
  };
}
