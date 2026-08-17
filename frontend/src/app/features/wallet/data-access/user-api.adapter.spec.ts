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
        childrenCount: 2,
      }),
    ).toEqual({
      firstName: 'Mohamed',
      lastName: 'Mahmoud',
      username: 'mohamed',
      accountType: 'USER',
      childrenCount: 2,
      parentFirstName: null,
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

  it('keeps the parent first name a child is managed by', () => {
    expect(
      normalizeUserProfile({
        firstname: 'Youssef',
        lastname: 'Mahmoud',
        username: 'youssef',
        role: 'CHILD',
        parentFirstName: 'Mohamed',
      }).parentFirstName,
    ).toBe('Mohamed');
  });

  it('falls back to null when the role-specific fields are absent', () => {
    const profile = normalizeUserProfile({
      firstname: 'Youssef',
      lastname: 'Mahmoud',
      username: 'youssef',
      role: 'CHILD',
    });

    expect(profile.childrenCount).toBeNull();
    expect(profile.parentFirstName).toBeNull();
  });
});
