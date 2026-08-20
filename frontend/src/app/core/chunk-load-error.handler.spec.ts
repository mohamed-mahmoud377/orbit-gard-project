import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ChunkLoadErrorHandler } from './chunk-load-error.handler';

/**
 * The handler exists to rescue a tab running against a build the server has
 * already replaced. Getting the match wrong in either direction is bad: too
 * narrow and the user keeps the white screen, too broad and ordinary runtime
 * errors start reloading the page underneath them.
 */
describe('ChunkLoadErrorHandler', () => {
  let reload: ReturnType<typeof vi.fn>;
  let store: Record<string, string>;

  function build(): ChunkLoadErrorHandler {
    reload = vi.fn();
    store = {};
    const documentStub = {
      defaultView: {
        location: { reload },
        sessionStorage: {
          getItem: (k: string) => store[k] ?? null,
          setItem: (k: string, v: string) => {
            store[k] = v;
          },
        },
      },
    };

    TestBed.configureTestingModule({
      providers: [ChunkLoadErrorHandler, { provide: DOCUMENT, useValue: documentStub }],
    });
    return TestBed.inject(ChunkLoadErrorHandler);
  }

  // Each engine words the same failure differently, so all of these have to hit.
  const CHUNK_FAILURES = [
    { name: 'ChunkLoadError', message: 'Loading chunk 5 failed.' },
    new Error('Failed to fetch dynamically imported module: /orbit/chunk-ABC123.js'),
    new Error('Importing a module script failed.'),
    new Error('error loading dynamically imported module'),
  ];

  for (const failure of CHUNK_FAILURES) {
    const label = (failure as Error).message ?? String(failure);
    it(`reloads once for: ${label.slice(0, 48)}`, () => {
      const handler = build();
      handler.handleError(failure);
      expect(reload).toHaveBeenCalledTimes(1);
    });
  }

  it('does not reload for an ordinary application error', () => {
    const handler = build();
    handler.handleError(new Error('Cannot read properties of undefined (reading Ax)'));
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload for an HTTP failure', () => {
    const handler = build();
    handler.handleError(new Error('Http failure response for /api/v1/wallet: 500'));
    expect(reload).not.toHaveBeenCalled();
  });

  /**
   * The one that matters most. If the fresh build still cannot load its
   * chunks, reloading again would put the phone in a refresh loop that is
   * worse than the blank page it was meant to fix.
   */
  it('reloads at most once, even if the chunk still fails afterwards', () => {
    const handler = build();
    handler.handleError({ name: 'ChunkLoadError', message: 'Loading chunk 5 failed.' });
    handler.handleError({ name: 'ChunkLoadError', message: 'Loading chunk 5 failed.' });
    handler.handleError({ name: 'ChunkLoadError', message: 'Loading chunk 9 failed.' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('survives errors that are not objects', () => {
    const handler = build();
    expect(() => handler.handleError(null)).not.toThrow();
    expect(() => handler.handleError('some string')).not.toThrow();
    expect(reload).not.toHaveBeenCalled();
  });
});
