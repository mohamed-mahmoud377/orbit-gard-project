import { ErrorHandler, Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/core';

/** Set once per reload attempt so a genuinely broken deploy cannot loop. */
const RELOAD_FLAG = 'orbit.chunk-reload-attempted';

/**
 * A lazy chunk that fails to load means the page is running against a build
 * that no longer exists on the server.
 *
 * Every route in this app is `loadComponent`, and production builds hash
 * their filenames, so a deploy deletes the exact files the currently-open
 * page will ask for the next time the user navigates. The browser cannot
 * recover from that on its own: the import rejects, the route never
 * activates, and the user is left on a screen where tapping does nothing —
 * or, if it happens during bootstrap, on a blank page.
 *
 * Reloading fetches a fresh index.html, which points at the filenames that
 * do exist. nginx now sends `Cache-Control: no-cache` for index.html so
 * that reload is guaranteed to revalidate rather than replay the same stale
 * document — but this handler is what rescues a browser that cached the old
 * index.html *before* that header shipped, and what covers a deploy landing
 * while somebody has the app open.
 *
 * The sessionStorage flag makes this recover-once, not retry-forever. If the
 * reload lands on a build that still cannot load its chunks, the error is
 * allowed through to the default handler rather than reloading in a loop.
 */
@Injectable()
export class ChunkLoadErrorHandler implements ErrorHandler {
  private readonly document = inject(DOCUMENT);
  private readonly delegate = new ErrorHandler();

  handleError(error: unknown): void {
    if (this.isChunkLoadFailure(error) && !this.alreadyTried()) {
      this.markTried();
      this.document.defaultView?.location.reload();
      return;
    }

    this.delegate.handleError(error);
  }

  /**
   * Matched on message text because there is no shared error type here.
   * Angular's own `ChunkLoadError` name, the browser's dynamic-import
   * rejection, and Vite/esbuild's preload failure all describe the same
   * situation in different words, and the wording differs per engine —
   * Chrome, Safari and Firefox each phrase it their own way.
   */
  private isChunkLoadFailure(error: unknown): boolean {
    const message = [
      (error as { name?: unknown })?.name,
      (error as { message?: unknown })?.message,
    ]
      .filter((part): part is string => typeof part === 'string')
      .join(' ');

    if (!message) return false;

    return (
      /ChunkLoadError/i.test(message) ||
      /Loading chunk .* failed/i.test(message) ||
      /Failed to fetch dynamically imported module/i.test(message) ||
      /Importing a module script failed/i.test(message) ||
      /error loading dynamically imported module/i.test(message)
    );
  }

  private alreadyTried(): boolean {
    try {
      return this.document.defaultView?.sessionStorage.getItem(RELOAD_FLAG) === '1';
    } catch {
      // Private mode can refuse sessionStorage. Treat that as "already
      // tried" rather than reloading blind on every error.
      return true;
    }
  }

  private markTried(): void {
    try {
      this.document.defaultView?.sessionStorage.setItem(RELOAD_FLAG, '1');
    } catch {
      // Ignored — alreadyTried() fails closed, so the reload still happens
      // at most once.
    }
  }
}
