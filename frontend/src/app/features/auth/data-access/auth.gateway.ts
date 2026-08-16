import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import {
  LoginRequest,
  LoginResponse,
  PromoCodeValidationResponse,
  RefreshTokenRequest,
  RegisterRequest,
  RegisterResponse,
  ResendVerifyRequest,
  ResendVerifyResponse,
  UsernameAvailabilityResponse,
  VerifyRequest,
  VerifyResponse,
} from './auth.models';

export interface AuthGateway {
  checkUsername(username: string): Observable<UsernameAvailabilityResponse>;
  validatePromoCode(code: string): Observable<PromoCodeValidationResponse>;
  register(request: RegisterRequest): Observable<RegisterResponse>;
  verify(request: VerifyRequest): Observable<VerifyResponse>;
  resendVerification(request: ResendVerifyRequest): Observable<ResendVerifyResponse>;
  login(request: LoginRequest): Observable<LoginResponse>;
  refresh(request: RefreshTokenRequest): Observable<LoginResponse>;
}

export const AUTH_GATEWAY = new InjectionToken<AuthGateway>('AUTH_GATEWAY');
