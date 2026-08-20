import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { networkProblem, problemFromHttpError } from '../../../core/http/problem-details';
import { InstapayGateway } from './instapay.gateway';
import {
  InstapayAccount,
  InstapayApiError,
  InstapayRequest,
  InstapayRequestList,
  InstapayUploadResult,
} from './instapay.models';

@Injectable({ providedIn: 'root' })
export class HttpInstapayGateway implements InstapayGateway {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  private get endpoint(): string {
    return `${this.baseUrl}/wallet/topup/instapay`;
  }

  /**
   * The part name is `file`, and Content-Type is deliberately never set: the
   * browser has to write the multipart boundary itself, and an explicit
   * header overwrites it with one that has no boundary at all — which the
   * server rejects as a malformed multipart request.
   */
  uploadReceipt(file: File): Observable<InstapayUploadResult> {
    const form = new FormData();
    form.append('file', file, file.name);

    return this.http
      .post<InstapayUploadResult>(this.endpoint, form)
      .pipe(catchError((error) => this.mapError(error)));
  }

  listRequests(): Observable<InstapayRequestList> {
    return this.http
      .get<InstapayRequestList>(this.endpoint)
      .pipe(catchError((error) => this.mapError(error)));
  }

  getRequest(requestId: string): Observable<InstapayRequest> {
    return this.http
      .get<InstapayRequest>(`${this.endpoint}/${requestId}`)
      .pipe(catchError((error) => this.mapError(error)));
  }

  getAccount(): Observable<InstapayAccount> {
    return this.http
      .get<InstapayAccount>(`${this.endpoint}/account`)
      .pipe(catchError((error) => this.mapError(error)));
  }

  /**
   * No response body is reshaped anywhere above.
   *
   * The API already returns exactly the fields the models declare, and the
   * omitted-key behaviour of a PENDING row (no `amount`, no `referenceNumber`)
   * is the contract rather than something to normalise away — filling those in
   * with nulls or zeroes here would erase the difference between "not read
   * yet" and "read, and it was zero".
   */
  private mapError(error: unknown): Observable<never> {
    if (error instanceof InstapayApiError) {
      return throwError(() => error);
    }

    if (error instanceof HttpErrorResponse) {
      return throwError(() => new InstapayApiError(problemFromHttpError(error)));
    }

    return throwError(() => new InstapayApiError(networkProblem()));
  }
}
