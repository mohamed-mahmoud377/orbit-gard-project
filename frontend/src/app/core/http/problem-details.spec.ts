import { normalizeRequestPath, problemFromHttpError } from './problem-details';

describe('problem-details', () => {
  it('normalizes absolute and relative request paths', () => {
    expect(normalizeRequestPath('/api/v1/wallet')).toBe('/api/v1/wallet');
    expect(normalizeRequestPath('https://api.example.com/api/v1/wallet?foo=1')).toBe(
      '/api/v1/wallet',
    );
  });

  it('extracts API problem payloads from HTTP errors', () => {
    const problem = problemFromHttpError({
      status: 400,
      statusText: 'Bad Request',
      error: {
        status: 400,
        code: 'FIELD_REQUIRED',
        title: 'Validation failed',
        detail: 'Phone is required',
      },
    } as never);

    expect(problem.code).toBe('FIELD_REQUIRED');
    expect(problem.detail).toBe('Phone is required');
  });

  it('falls back to network or unknown codes', () => {
    expect(problemFromHttpError({ status: 0, statusText: 'Unknown Error' } as never).code).toBe(
      'NETWORK_ERROR',
    );
    expect(problemFromHttpError({ status: 500, statusText: 'Server Error' } as never).code).toBe(
      'UNKNOWN',
    );
  });
});
