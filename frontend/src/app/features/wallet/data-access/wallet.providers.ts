import { Provider } from '@angular/core';

import { WALLET_GATEWAY } from './wallet.gateway';
import { HttpWalletGateway } from './http-wallet.gateway';

export function provideWalletGateway(): Provider {
  return {
    provide: WALLET_GATEWAY,
    useExisting: HttpWalletGateway,
  };
}
