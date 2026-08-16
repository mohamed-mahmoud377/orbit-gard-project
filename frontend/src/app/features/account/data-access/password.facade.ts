import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AuthFacade } from '../../auth/data-access/auth.facade';
import { PASSWORD_GATEWAY } from './password.gateway';
import { ChangePasswordRequest, ChangePasswordResponse } from './password.models';

@Injectable({ providedIn: 'root' })
export class PasswordFacade {
  private readonly gateway = inject(PASSWORD_GATEWAY);
  private readonly auth = inject(AuthFacade);

  getActiveSessionCount(): Observable<number> {
    return this.gateway.getActiveSessionCount();
  }

  changePassword(request: ChangePasswordRequest): Observable<ChangePasswordResponse> {
    return this.gateway.changePassword(request);
  }

  logoutAfterPasswordChange(): void {
    this.auth.logoutLocal();
  }
}
