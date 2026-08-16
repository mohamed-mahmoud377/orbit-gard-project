import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { AuthTokenStore } from '../../auth/data-access/auth-token.store';
import { PROFILE_GATEWAY } from './profile.gateway';
import { ProfileDetails, UpdateProfileRequest } from './profile.models';

@Injectable({ providedIn: 'root' })
export class ProfileFacade {
  private readonly gateway = inject(PROFILE_GATEWAY);
  private readonly tokens = inject(AuthTokenStore);

  getProfile(): Observable<ProfileDetails> {
    return this.gateway.getProfile();
  }

  updateProfile(request: UpdateProfileRequest): Observable<ProfileDetails> {
    return this.gateway.updateProfile(request).pipe(
      tap((profile) => {
        const current = this.tokens.currentUser();
        if (!current) return;
        this.tokens.updateUser({
          ...current,
          firstName: profile.firstName,
          lastName: profile.lastName,
        });
      }),
    );
  }
}
