import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { AuthApiError } from './auth.models';
import { MockAuthGateway } from './mock-auth.gateway';

describe('MockAuthGateway', () => {
  let gateway: MockAuthGateway;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    gateway = TestBed.inject(MockAuthGateway);
    gateway.reset();
  });

  it('reports username availability states without failing on partial input', async () => {
    const invalid = await firstValueFrom(gateway.checkUsername('om'));
    expect(invalid).toEqual({ username: 'om', available: false, reason: 'INVALID' });

    const taken = await firstValueFrom(gateway.checkUsername('mohamed'));
    expect(taken.available).toBe(false);
    expect(taken.reason).toBe('TAKEN');

    const free = await firstValueFrom(gateway.checkUsername('new.user'));
    expect(free.available).toBe(true);
    expect(free.reason).toBeNull();
  });

  it('registers an account as pending and rejects duplicate phone formats', async () => {
    const created = await firstValueFrom(
      gateway.register({
        firstName: 'Omar',
        lastName: 'Hassan',
        username: 'omar.hassan',
        email: 'omar.hassan@example.com',
        phoneNumber: '01099998888',
        password: 'Passw0rd!',
        confirmPassword: 'Passw0rd!',
        promoCode: 'WELCOME50',
      }),
    );
    expect(created.status).toBe('PENDING_VERIFICATION');

    await expect(
      firstValueFrom(
        gateway.register({
          firstName: 'Omar',
          lastName: 'Hassan',
          username: 'another.omar',
          email: 'another@example.com',
          phoneNumber: '+201099998888',
          password: 'Passw0rd!',
          confirmPassword: 'Passw0rd!',
        }),
      ),
    ).rejects.toMatchObject({ code: 'PHONE_TAKEN' });
  });

  it('activates with a token and treats a second activation as already verified', async () => {
    await firstValueFrom(
      gateway.register({
        firstName: "O'Brien",
        lastName: 'Al-Sayed',
        username: 'obrien.alsayed',
        email: 'obrien@example.com',
        phoneNumber: '01122334455',
        password: 'Passw0rd1',
        confirmPassword: 'Passw0rd1',
      }),
    );
    const token = gateway.peekLatestToken('obrien@example.com');
    expect(token).toBeTruthy();

    const first = await firstValueFrom(gateway.verify({ token: token! }));
    expect(first.status).toBe('ACTIVE');
    expect(first.alreadyVerified).toBeUndefined();

    const second = await firstValueFrom(gateway.verify({ token: token! }));
    expect(second.alreadyVerified).toBe(true);
  });

  it('expires and supersedes verification tokens on resend', async () => {
    await firstValueFrom(
      gateway.register({
        firstName: 'Nour',
        lastName: 'Hassan',
        username: 'nour.hassan',
        email: 'nour@example.com',
        phoneNumber: '01234567890',
        password: 'Passw0rd1',
        confirmPassword: 'Passw0rd1',
      }),
    );
    const firstToken = gateway.peekLatestToken('nour@example.com')!;
    gateway.expireLatestToken('nour@example.com');

    await expect(firstValueFrom(gateway.verify({ token: firstToken }))).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
    });

    gateway.ageLatestTokenBeyondCooldown('nour@example.com');
    await firstValueFrom(gateway.resendVerification({ email: 'nour@example.com' }));
    const secondToken = gateway.peekLatestToken('nour@example.com')!;
    expect(secondToken).not.toBe(firstToken);

    await expect(firstValueFrom(gateway.verify({ token: firstToken }))).rejects.toMatchObject({
      code: 'TOKEN_ALREADY_USED',
    });

    const activated = await firstValueFrom(gateway.verify({ token: secondToken }));
    expect(activated.status).toBe('ACTIVE');
  });

  it('enforces the resend cooldown', async () => {
    await firstValueFrom(
      gateway.register({
        firstName: 'Lina',
        lastName: 'Hassan',
        username: 'lina.hassan',
        email: 'lina@example.com',
        phoneNumber: '01555556666',
        password: 'Passw0rd1',
        confirmPassword: 'Passw0rd1',
      }),
    );

    await expect(
      firstValueFrom(gateway.resendVerification({ email: 'lina@example.com' })),
    ).rejects.toBeInstanceOf(AuthApiError);

    try {
      await firstValueFrom(gateway.resendVerification({ email: 'lina@example.com' }));
    } catch (error) {
      expect(error).toBeInstanceOf(AuthApiError);
      expect((error as AuthApiError).code).toBe('RATE_LIMITED');
      expect((error as AuthApiError).retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('returns one credentials message and blocks unverified sign-in', async () => {
    await firstValueFrom(
      gateway.register({
        firstName: 'Pending',
        lastName: 'User',
        username: 'pending.user',
        email: 'pending@example.com',
        phoneNumber: '01011112222',
        password: 'Passw0rd1',
        confirmPassword: 'Passw0rd1',
      }),
    );

    await expect(
      firstValueFrom(
        gateway.login({ username: 'nobody', password: 'Passw0rd1', rememberMe: false }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    await expect(
      firstValueFrom(
        gateway.login({ username: 'pending.user', password: 'wrong', rememberMe: false }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    await expect(
      firstValueFrom(
        gateway.login({ username: 'pending.user', password: 'Passw0rd1', rememberMe: true }),
      ),
    ).rejects.toMatchObject({ code: 'ACCOUNT_NOT_VERIFIED' });
  });

  it('signs in an active username and returns tokens', async () => {
    const response = await firstValueFrom(
      gateway.login({ username: 'mohamed', password: 'Orbit@123', rememberMe: true }),
    );
    expect(response.accessToken).toBeTruthy();
    expect(response.refreshToken).toBeTruthy();
    expect(response.expiresIn).toBe(900);
    expect(response.user.username).toBe('mohamed');
    expect(response.user.accountType).toBe('USER');
  });
});
