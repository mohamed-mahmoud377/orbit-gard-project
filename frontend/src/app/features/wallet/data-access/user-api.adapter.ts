import { AccountType } from '../../auth/data-access/auth.models';

export interface BackendUserProfileResponse {
  readonly firstname: string;
  readonly lastname: string;
  readonly username: string;
  readonly role: string;
}

export interface UserAccountSummary {
  readonly firstName: string;
  readonly lastName: string;
  readonly username: string;
  readonly accountType: AccountType;
}

export function normalizeUserProfile(body: BackendUserProfileResponse): UserAccountSummary {
  return {
    firstName: body.firstname,
    lastName: body.lastname,
    username: body.username,
    accountType: body.role === 'CHILD' ? 'CHILD' : 'USER',
  };
}
