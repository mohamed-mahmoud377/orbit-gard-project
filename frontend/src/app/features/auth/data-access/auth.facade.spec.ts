import { TestBed } from '@angular/core/testing';
import { delay, firstValueFrom, forkJoin, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { DemoStore } from '../../../data-access';
import { AUTH_GATEWAY } from './auth.gateway';
import { AuthFacade, resetAuthRefreshStateForTests } from './auth.facade';
import { AuthTokenStore } from './auth-token.store';
import { LoginResponse } from './auth.models';

describe('AuthFacade refreshSessionOnce', () => {
  const loginResponse = (accessToken: string, refreshToken: string): LoginResponse => ({
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: 900,
    user: {
      id: '1',
      username: 'mohamed',
      firstName: 'Mohamed',
      lastName: 'Mahmoud',
      accountType: 'USER',
    },
  });

  let facade: AuthFacade;
  let tokens: AuthTokenStore;
  let refreshMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetAuthRefreshStateForTests();
    localStorage.clear();
    refreshMock = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        AuthFacade,
        AuthTokenStore,
        DemoStore,
        {
          provide: AUTH_GATEWAY,
          useValue: {
            refresh: refreshMock,
          },
        },
      ],
    });

    facade = TestBed.inject(AuthFacade);
    tokens = TestBed.inject(AuthTokenStore);
    tokens.hydrateFromLogin(
      {
        ...loginResponse('stale-access', 'refresh-token'),
        expiresIn: -1,
      },
      false,
    );
  });

  afterEach(() => {
    resetAuthRefreshStateForTests();
    localStorage.clear();
  });

  it('runs only one gateway refresh for concurrent refreshSessionOnce calls', async () => {
    refreshMock.mockImplementation(() =>
      of(loginResponse('renewed-access', 'renewed-refresh')).pipe(delay(20)),
    );

    const [first, second] = await firstValueFrom(
      forkJoin([facade.refreshSessionOnce(), facade.refreshSessionOnce()]),
    );

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(first.accessToken).toBe('renewed-access');
    expect(second.accessToken).toBe('renewed-access');
    expect(tokens.accessToken()).toBe('renewed-access');
  });

  it('allows a new refresh after the previous attempt fails', async () => {
    refreshMock
      .mockImplementationOnce(() => throwError(() => new Error('invalid refresh')))
      .mockImplementation(() => of(loginResponse('retry-access', 'retry-refresh')));

    await expect(firstValueFrom(facade.refreshSessionOnce())).rejects.toThrow('invalid refresh');

    const response = await firstValueFrom(facade.refreshSessionOnce());
    expect(refreshMock).toHaveBeenCalledTimes(2);
    expect(response.accessToken).toBe('retry-access');
  });
});
