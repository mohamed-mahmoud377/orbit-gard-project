import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { authBearerInterceptor } from './core/auth/auth-bearer.interceptor';
import { ChunkLoadErrorHandler } from './core/chunk-load-error.handler';
import { provideAuthGateway } from './features/auth/data-access';
import { providePasswordGateway, provideProfileGateway, provideSessionGateway } from './features/account/data-access';
import { provideFamilyGateway } from './features/family/data-access';
import { provideInstapayGateway, providePaymentGateway, provideWalletGateway } from './features/wallet/data-access';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Recovers a tab that is running against a build the server has already
    // replaced — see ChunkLoadErrorHandler for why that happens on deploy.
    { provide: ErrorHandler, useClass: ChunkLoadErrorHandler },
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authBearerInterceptor])),
    provideAuthGateway(),
    providePaymentGateway(),
    provideInstapayGateway(),
    provideWalletGateway(),
    provideFamilyGateway(),
    provideProfileGateway(),
    providePasswordGateway(),
    provideSessionGateway(),
    {
      provide: APP_BASE_HREF,
      useFactory: (platformLocation: PlatformLocation) => platformLocation.getBaseHrefFromDOM(),
      deps: [PlatformLocation],
    },
  ],
};
