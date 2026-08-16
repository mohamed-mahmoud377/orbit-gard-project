import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import { ProfileDetails, UpdateProfileRequest } from './profile.models';

export interface ProfileGateway {
  getProfile(): Observable<ProfileDetails>;
  updateProfile(request: UpdateProfileRequest): Observable<ProfileDetails>;
}

export const PROFILE_GATEWAY = new InjectionToken<ProfileGateway>('PROFILE_GATEWAY');
