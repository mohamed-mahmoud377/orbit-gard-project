import { AccountType } from '../../auth/data-access/auth.models';

export interface BackendUserProfileResponse {
  readonly firstname: string;
  readonly lastname: string;
  readonly username: string;
  readonly role: string;
  /** Set for a USER only. */
  readonly childrenCount?: number | null;
  /** Set for a CHILD only. */
  readonly parentFirstName?: string | null;
}

export interface UserAccountSummary {
  readonly firstName: string;
  readonly lastName: string;
  readonly username: string;
  readonly accountType: AccountType;
  readonly childrenCount: number | null;
  readonly parentFirstName: string | null;
}

export function normalizeUserProfile(body: BackendUserProfileResponse): UserAccountSummary {
  return {
    firstName: body.firstname,
    lastName: body.lastname,
    username: body.username,
    accountType: body.role === 'CHILD' ? 'CHILD' : 'USER',
    childrenCount: body.childrenCount ?? null,
    parentFirstName: body.parentFirstName ?? null,
  };
}
