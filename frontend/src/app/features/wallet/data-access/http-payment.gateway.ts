import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { networkProblem, problemFromHttpError } from '../../../core/http/problem-details';
import { environment } from '../../../../environments/environment';
import { PaymentGateway } from './payment.gateway';
import {
  PaymentApiError,
  PaymentStatus,
  PaymentStatusResponse,
  TopUpInitiateRequest,
  TopUpInitiateResponse,
} from './payment.models';

interface BackendTopUpResponse {
  readonly paymentId: string;
  readonly redirectUrl: string;
}

interface BackendPaymentStatusResponse {
  readonly paymentId: string;
  readonly status: string;
}

@Injectable({ providedIn: 'root' })
export class HttpPaymentGateway implements PaymentGateway {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  initiateTopUp(request: TopUpInitiateRequest): Observable<TopUpInitiateResponse> {
    return this.http
      .post<BackendTopUpResponse>(`${this.baseUrl}/payments/topup`, {
        amount: request.amount,
      })
      .pipe(
        map((body) => ({
          paymentId: body.paymentId,
          redirectUrl: body.redirectUrl,
        })),
        catchError((error) => this.mapError(error)),
      );
  }

  getStatus(paymentId: string): Observable<PaymentStatusResponse> {
    return this.http
      .get<BackendPaymentStatusResponse>(`${this.baseUrl}/payments/${paymentId}/status`)
      .pipe(
        map((body) => ({
          paymentId: body.paymentId,
          status: body.status as PaymentStatus,
        })),
        catchError((error) => this.mapError(error)),
      );
  }

  private mapError(error: unknown): Observable<never> {
    if (error instanceof PaymentApiError) {
      return throwError(() => error);
    }

    if (error instanceof HttpErrorResponse) {
      if (error.status === 404) {
        return throwError(
          () =>
            new PaymentApiError({
              status: 404,
              code: 'PAYMENT_NOT_FOUND',
              title: 'Payment not found',
            }),
        );
      }

      return throwError(() => new PaymentApiError(problemFromHttpError(error)));
    }

    return throwError(() => new PaymentApiError(networkProblem()));
  }
}