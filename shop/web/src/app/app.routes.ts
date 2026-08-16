import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

/** CONTRACT §9. Every feature is its own lazy chunk. */
export const routes: Routes = [
  {
    path: '',
    title: "Jerry's Shop — small mouse, big cart",
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'search',
    title: "Search — Jerry's Shop",
    loadComponent: () => import('./features/browse/browse.component').then((m) => m.BrowseComponent),
  },
  {
    path: 'c/:categorySlug',
    loadComponent: () => import('./features/browse/browse.component').then((m) => m.BrowseComponent),
  },
  {
    path: 'c/:categorySlug/:subSlug',
    loadComponent: () => import('./features/browse/browse.component').then((m) => m.BrowseComponent),
  },
  {
    path: 'p/:slug',
    loadComponent: () =>
      import('./features/product/product.component').then((m) => m.ProductComponent),
  },
  {
    path: 'cart',
    title: "Your cart — Jerry's Shop",
    loadComponent: () => import('./features/cart/cart.component').then((m) => m.CartComponent),
  },
  {
    path: 'checkout',
    title: "Checkout — Jerry's Shop",
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/checkout/checkout.component').then((m) => m.CheckoutComponent),
  },
  {
    path: 'orders',
    title: "Your orders — Jerry's Shop",
    canActivate: [authGuard],
    loadComponent: () => import('./features/orders/orders.component').then((m) => m.OrdersComponent),
  },
  {
    path: 'orders/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/orders/order-detail.component').then((m) => m.OrderDetailComponent),
  },
  {
    path: 'account',
    title: "Your account — Jerry's Shop",
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/account/account.component').then((m) => m.AccountComponent),
  },
  {
    path: 'wishlist',
    title: "Your wishlist — Jerry's Shop",
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/wishlist/wishlist.component').then((m) => m.WishlistComponent),
  },
  {
    path: 'login',
    title: "Sign in — Jerry's Shop",
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    title: "Create an account — Jerry's Shop",
    loadComponent: () =>
      import('./features/auth/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: '**',
    title: "Page not found — Jerry's Shop",
    loadComponent: () =>
      import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];
