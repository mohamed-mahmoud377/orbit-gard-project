import { Injectable, computed, signal } from '@angular/core';

import { AuthUserSummary, LoginResponse, StoredAuthSession } from './auth.models';

const STORAGE_KEY = 'orbit.auth-session.v1';

@Injectable({ providedIn: 'root' })
export class AuthTokenStore {
  private readonly session = signal<StoredAuthSession | null>(this.read());

  readonly currentSession = computed(() => this.session());
  readonly currentUser = computed(() => this.session()?.user ?? null);
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);
  readonly isAccessTokenValid = computed(() => {
    const current = this.session();
    return current !== null && current.expiresAt > Date.now();
  });
  /** True while the access token is still within its TTL. */
  readonly isAuthenticated = this.isAccessTokenValid;
  readonly canRefresh = computed(() => {
    const current = this.session();
    return current !== null && !!current.refreshToken && !!current.user;
  });
  readonly refreshToken = computed(() => this.session()?.refreshToken ?? null);
  readonly rememberMe = computed(() => this.session()?.rememberMe ?? false);
  readonly accountType = computed(() => this.session()?.user.accountType ?? null);

  hydrateFromLogin(response: LoginResponse, rememberMe?: boolean): void {
    const current = this.session();
    const stored: StoredAuthSession = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      tokenType: response.tokenType,
      expiresAt: Date.now() + response.expiresIn * 1000,
      user: response.user,
      rememberMe: rememberMe ?? current?.rememberMe ?? false,
    };
    this.session.set(stored);
    this.write(stored);
  }

  updateUser(user: AuthUserSummary): void {
    const current = this.session();
    if (!current) return;
    const next = { ...current, user };
    this.session.set(next);
    this.write(next);
  }

  clear(): void {
    this.session.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  private read(): StoredAuthSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredAuthSession;
      if (!parsed.accessToken || !parsed.refreshToken || !parsed.user || !parsed.expiresAt) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private write(session: StoredAuthSession): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
}
