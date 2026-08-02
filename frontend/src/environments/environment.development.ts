export const environment = {
  production: false,
  apiBaseUrl: '/api/v1',
  /** Use the contract-faithful mock until the auth APIs are deployed. */
  useMockAuth: true,
} as const;
