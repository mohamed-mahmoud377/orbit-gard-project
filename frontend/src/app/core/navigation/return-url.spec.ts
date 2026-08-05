import { sanitizeReturnUrl, loginUrlWithReturn } from './return-url';

describe('return-url', () => {
  it('accepts same-origin in-app paths', () => {
    expect(sanitizeReturnUrl('/payment/callback?merchant_order_id=abc')).toBe(
      '/payment/callback?merchant_order_id=abc',
    );
  });

  it('rejects external and protocol-relative URLs', () => {
    expect(sanitizeReturnUrl('https://evil.example/phish')).toBeNull();
    expect(sanitizeReturnUrl('//evil.example/phish')).toBeNull();
    expect(sanitizeReturnUrl('')).toBeNull();
  });

  it('builds a login URL with an encoded return path', () => {
    expect(loginUrlWithReturn('/payment/callback?merchant_order_id=abc')).toBe(
      '/auth/login?returnUrl=%2Fpayment%2Fcallback%3Fmerchant_order_id%3Dabc',
    );
  });
});
