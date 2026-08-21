/**
 * Test environment shims.
 *
 * The unit-test builder runs specs in jsdom, which supplies `window`,
 * `document`, `navigator` and — oddly — `sessionStorage`, but leaves
 * `localStorage` undefined. Every spec that touches the auth session died on
 * that: AuthTokenStore reads and writes localStorage, so auth-token.store,
 * auth.facade, auth-bearer.interceptor and mock-auth.gateway all failed in
 * `beforeEach` with "Cannot read properties of undefined (reading 'clear')".
 *
 * That is 18 tests, and they are the only automated coverage the login and
 * refresh flow has — so the app's most security-sensitive path was the one
 * part of the suite proving nothing.
 *
 * This adds a minimal spec-compliant Storage only when the environment has
 * not provided one. A real browser run (`--browsers`) is untouched.
 *
 * Registered via `setupFiles` in angular.json. If the auth specs start
 * failing on `localStorage` again, check that entry is still there before
 * looking anywhere else.
 */
function createMemoryStorage(): Storage {
  const entries = new Map<string, string>();

  return {
    get length(): number {
      return entries.size;
    },
    key(index: number): string | null {
      return Array.from(entries.keys())[index] ?? null;
    },
    getItem(key: string): string | null {
      return entries.has(key) ? (entries.get(key) as string) : null;
    },
    setItem(key: string, value: string): void {
      entries.set(String(key), String(value));
    },
    removeItem(key: string): void {
      entries.delete(String(key));
    },
    clear(): void {
      entries.clear();
    },
  } as Storage;
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const host = globalThis as unknown as Record<string, unknown>;
  if (!host[name]) {
    Object.defineProperty(globalThis, name, {
      value: createMemoryStorage(),
      configurable: true,
      writable: false,
    });
  }
}
