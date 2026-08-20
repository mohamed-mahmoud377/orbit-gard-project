import { Routes } from '@angular/router';
import { childGuard, guestGuard, parentGuard } from './core/guards';

export const routes: Routes = [
  // The marketing landing page is the front door. guestGuard is the same one
  // the /auth screens use, so a signed-in visitor who types the bare domain
  // lands on their dashboard rather than on a page inviting them to sign up.
  {
    path: '',
    pathMatch: 'full',
    canActivate: [guestGuard],
    title: 'Orbit · A digital wallet built for Egypt',
    loadComponent: () => import('./features/marketing/landing.page'),
  },
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('./layouts/auth-layout').then((module) => module.AuthLayout),
    children: [
      {
        path: 'login',
        title: 'Sign in · Orbit',
        loadComponent: () => import('./features/auth/pages/login.page'),
      },
      {
        path: 'sign-up',
        title: 'Create account · Orbit',
        loadComponent: () =>
          import('./features/auth/pages/sign-up.page').then((module) => module.SignUpPage),
      },
      {
        path: 'check-inbox',
        title: 'Check your inbox · Orbit',
        loadComponent: () =>
          import('./features/auth/pages/check-inbox.page').then(
            (module) => module.CheckInboxPage,
          ),
      },
      {
        path: 'verify',
        pathMatch: 'full',
        redirectTo: 'check-inbox',
      },
      {
        path: 'forgot-password',
        title: 'Reset password · Orbit',
        loadComponent: () =>
          import('./features/auth/pages/forgot-password.page').then(
            (module) => module.ForgotPasswordPage,
          ),
      },
      { path: '', pathMatch: 'full', redirectTo: 'login' },
    ],
  },

  {
    path: 'reset-password',
    title: 'Choose a new password · Orbit',
    loadComponent: () =>
      import('./features/auth/pages/reset-password.page').then(
        (module) => module.ResetPasswordPage,
      ),
  },

  {
    path: 'activate',
    title: 'Activate wallet · Orbit',
    loadComponent: () =>
      import('./features/auth/pages/activate.page').then((module) => module.ActivatePage),
  },
  {
    path: 'payment/callback',
    title: 'Top up · Orbit',
    loadComponent: () =>
      import('./features/wallet/pages/top-up-callback.page').then(
        (module) => module.TopUpCallbackPage,
      ),
  },
  {
    path: '',
    canActivateChild: [parentGuard],
    loadComponent: () =>
      import('./layouts/parent-layout').then((module) => module.ParentLayout),
    children: [
      {
        path: 'dashboard',
        title: 'Dashboard · Orbit',
        loadComponent: () => import('./features/wallet/wallet-pages'),
      },
      {
        path: 'top-up',
        title: 'Top up · Orbit',
        loadComponent: () =>
          import('./features/wallet/wallet-pages').then((module) => module.TopUpPage),
      },
      {
        path: 'top-up/instapay/requests',
        title: 'InstaPay requests · Orbit',
        loadComponent: () =>
          import('./features/wallet/pages/instapay-requests.page').then(
            (module) => module.InstapayRequestsPage,
          ),
      },
      {
        path: 'send',
        title: 'Send money · Orbit',
        loadComponent: () =>
          import('./features/wallet/wallet-pages').then((module) => module.SendMoneyPage),
      },
      {
        path: 'transactions',
        title: 'Transactions · Orbit',
        loadComponent: () =>
          import('./features/wallet/wallet-pages').then((module) => module.TransactionsPage),
      },
      {
        path: 'transactions/:id',
        title: 'Transaction details · Orbit',
        loadComponent: () =>
          import('./features/wallet/wallet-pages').then(
            (module) => module.TransactionDetailPage,
          ),
      },
      {
        path: 'family',
        title: 'Family · Orbit',
        loadComponent: () => import('./features/family/family-pages'),
      },
      {
        path: 'family/add',
        title: 'Add a child · Orbit',
        loadComponent: () =>
          import('./features/family/family-pages').then((module) => module.AddChildPage),
      },
      {
        path: 'family/:childId',
        title: 'Child wallet · Orbit',
        loadComponent: () =>
          import('./features/family/family-pages').then((module) => module.ChildDetailPage),
      },
      {
        path: 'settings',
        title: 'Settings · Orbit',
        loadComponent: () => import('./features/account/account-pages'),
      },
      {
        path: 'settings/devices',
        title: 'Devices · Orbit',
        loadComponent: () =>
          import('./features/account/account-pages').then((module) => module.DevicesPage),
      },
      {
        path: 'settings/password',
        title: 'Change password · Orbit',
        loadComponent: () =>
          import('./features/account/account-pages').then(
            (module) => module.ChangePasswordPage,
          ),
      },
    ],
  },
  {
    path: '',
    canActivateChild: [childGuard],
    loadComponent: () =>
      import('./layouts/child-layout').then((module) => module.ChildLayout),
    children: [
      {
        path: 'my-wallet',
        title: 'My wallet · Orbit',
        loadComponent: () =>
          import('./features/family/family-pages').then((module) => module.ChildWalletPage),
      },
      {
        path: 'my-activity',
        title: 'My activity · Orbit',
        loadComponent: () =>
          import('./features/family/family-pages').then((module) => module.ChildActivityPage),
      },
    ],
  },
  {
    path: 'pay/:merchantSlug',
    title: 'Pay with Orbit',
    loadComponent: () => import('./features/merchant/merchant-pay'),
  },
  {
    path: '**',
    title: 'Page not found · Orbit',
    loadComponent: () => import('./features/not-found'),
  },
];
