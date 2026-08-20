import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import {
  InstapayAccount,
  InstapayRequest,
  InstapayRequestList,
  InstapayUploadResult,
} from './instapay.models';

export interface InstapayGateway {
  uploadReceipt(file: File): Observable<InstapayUploadResult>;
  listRequests(): Observable<InstapayRequestList>;
  getRequest(requestId: string): Observable<InstapayRequest>;
  getAccount(): Observable<InstapayAccount>;
}

export const INSTAPAY_GATEWAY = new InjectionToken<InstapayGateway>('INSTAPAY_GATEWAY');
