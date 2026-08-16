import { describe, expect, it } from 'vitest';

import { normalizeUserProfile } from './user-api.adapter';

describe('user-api.adapter', () => {
  it('maps backend lowercase names to frontend camelCase fields', () => {
    expect(
      normalizeUserProfile({
        firstname: 'Mohamed',
        lastname: 'Mahmoud',
        username: 'mohamed',
        role: 'USER',
      }),
    ).toEqual({
      firstName: 'Mohamed',
      lastName: 'Mahmoud',
      username: 'mohamed',
      accountType: 'USER',
    });
  });

  it('maps child role to CHILD account type', () => {
    expect(
      normalizeUserProfile({
        firstname: 'Youssef',
        lastname: 'Mahmoud',
        username: 'youssef',
        role: 'CHILD',
      }).accountType,
    ).toBe('CHILD');
  });
});
