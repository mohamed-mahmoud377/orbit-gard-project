import { describe, expect, it } from 'vitest';

import {
  isValidName,
  isValidPassword,
  isValidUsername,
  normalizeEgyptianPhone,
  normalizeUsername,
  validateLoginForm,
  validateRegisterForm,
} from './auth.messages';

describe('auth validators and normalizers', () => {
  it('accepts hyphenated and apostrophe names', () => {
    expect(isValidName('Al-Sayed')).toBe(true);
    expect(isValidName("O'Brien")).toBe(true);
    expect(isValidName('Omar2')).toBe(false);
  });

  it('validates usernames of 3–30 allowed characters', () => {
    expect(isValidUsername('om')).toBe(false);
    expect(isValidUsername('omar.hassan')).toBe(true);
    expect(isValidUsername('omar_hassan-1')).toBe(true);
    expect(isValidUsername('omar!')).toBe(false);
  });

  it('normalises Egyptian mobile numbers to +20 form', () => {
    expect(normalizeEgyptianPhone('01012345678')).toBe('+201012345678');
    expect(normalizeEgyptianPhone('+201012345678')).toBe('+201012345678');
    expect(normalizeEgyptianPhone('00201012345678')).toBe('+201012345678');
    expect(normalizeEgyptianPhone('1012345678')).toBe('+201012345678');
    expect(normalizeEgyptianPhone('0991234567')).toBeNull();
    expect(normalizeEgyptianPhone('0221234567')).toBeNull();
  });

  it('enforces password letter + number rules', () => {
    expect(isValidPassword('Passw0rd')).toBe(true);
    expect(isValidPassword('password')).toBe(false);
    expect(isValidPassword('12345678')).toBe(false);
    expect(isValidPassword('short1')).toBe(false);
  });

  it('collects every local register validation error at once', () => {
    const errors = validateRegisterForm({
      firstName: '',
      lastName: 'Hassan2',
      username: 'om',
      email: 'bad',
      phoneNumber: '0221234567',
      password: 'short',
      confirmPassword: 'other',
    });
    expect(errors.firstName).toBeTruthy();
    expect(errors.lastName).toBeTruthy();
    expect(errors.username).toBeTruthy();
    expect(errors.email).toBeTruthy();
    expect(errors.phoneNumber).toBeTruthy();
    expect(errors.password).toBeTruthy();
    expect(errors.confirmPassword).toBeTruthy();
  });

  it('requires login fields locally', () => {
    expect(validateLoginForm({ username: '', password: '' })).toEqual({
      username: 'This field is required',
      password: 'This field is required',
    });
  });

  it('lowercases usernames', () => {
    expect(normalizeUsername('Omar.Hassan')).toBe('omar.hassan');
  });
});
