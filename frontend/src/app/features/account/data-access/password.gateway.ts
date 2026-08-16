import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import { ChangePasswordRequest, ChangePasswordResponse } from './password.models';

export interface PasswordGateway {
  changePassword(request: ChangePasswordRequest): Observable<ChangePasswordResponse>;
}

export const PASSWORD_GATEWAY = new InjectionToken<PasswordGateway>('PASSWORD_GATEWAY');
