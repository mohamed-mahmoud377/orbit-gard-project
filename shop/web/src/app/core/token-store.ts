import { Injectable, signal } from '@angular/core';

const TOKEN_KEY = 'ob.token';

/**
 * Holds the shop session JWT.
 *
 * Split out from `AuthService` purely so the auth interceptor can read the
 * token without creating a circular dependency back through `ApiService`.
 *
 * CONTRACT §10.1: only the *shop's own* JWT lives here. Orbit wallet
 * credentials and Orbit verification tokens never touch client storage.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  readonly token = signal<string | null>(readToken());

  set(token: string): void {
    this.token.set(token);
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* private mode / storage disabled — the in-memory signal still works */
    }
  }

  clear(): void {
    this.token.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
