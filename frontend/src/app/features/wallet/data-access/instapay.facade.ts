import { DOCUMENT, Injectable, inject } from '@angular/core';
import {
  EMPTY,
  Observable,
  catchError,
  exhaustMap,
  filter,
  shareReplay,
  takeWhile,
  timer,
} from 'rxjs';

import { INSTAPAY_GATEWAY } from './instapay.gateway';
import {
  InstapayAccount,
  InstapayRequest,
  InstapayRequestList,
  InstapayUploadResult,
} from './instapay.models';

/**
 * How often the requests list is refreshed while anything on it is unresolved.
 *
 * One second is what the screen asks for, and the cost of that is worth being
 * explicit about: the backend job runs on a thirty-second fixed delay, so a
 * freshly uploaded receipt is not even *claimed* for up to thirty seconds.
 * Most of these polls will therefore return an unchanged list. That is
 * acceptable — the request is a single indexed read scoped to one user — but
 * it is why the three guards below are not optional decoration:
 *
 *   · exhaustMap, so a slow response can never let two polls overlap and
 *     stack up a backlog of in-flight requests at one per second;
 *   · the hidden-document filter, so a tab left open in the background stops
 *     polling entirely rather than burning a request a second forever;
 *   · takeWhile on anyUnresolved, so the stream completes by itself the
 *     moment nothing is PENDING or PROCESSING.
 */
const POLL_INTERVAL_MS = 1_000;

@Injectable({ providedIn: 'root' })
export class InstapayFacade {
  private readonly gateway = inject(INSTAPAY_GATEWAY);
  private readonly document = inject(DOCUMENT);

  /** Configuration, not content — cached for the lifetime of the app. */
  private account$?: Observable<InstapayAccount>;

  uploadReceipt(file: File): Observable<InstapayUploadResult> {
    return this.gateway.uploadReceipt(file);
  }

  listRequests(): Observable<InstapayRequestList> {
    return this.gateway.listRequests();
  }

  getRequest(requestId: string): Observable<InstapayRequest> {
    return this.gateway.getRequest(requestId);
  }

  /**
   * The InstaPay account and limits.
   *
   * shareReplay because both screens want it and it cannot change while the
   * page is open — it is read from server configuration, not from the user.
   * refCount is deliberately absent: dropping to zero subscribers between the
   * top-up tab and the requests page should not throw the answer away.
   */
  getAccount(): Observable<InstapayAccount> {
    this.account$ ??= this.gateway.getAccount().pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.account$;
  }

  /**
   * The live list.
   *
   * Emits immediately, then once a second until nothing is unresolved — at
   * which point it emits that final settled list and completes. Re-subscribe
   * after an upload to start it again.
   *
   * `anyUnresolved` is read from the response rather than recomputed from the
   * rows. The backend derives it from the same statuses the job writes, so
   * trusting it is what stops the polling rule and the queue drifting apart
   * if a status is ever added.
   *
   * A failed poll is swallowed rather than terminating the stream: a single
   * blip on a one-second timer should not permanently stop live updates on a
   * page the user is watching. The initial load is fetched through
   * listRequests() instead, where the error is visible and can be shown.
   */
  watchRequests(): Observable<InstapayRequestList> {
    return timer(0, POLL_INTERVAL_MS).pipe(
      filter(() => !this.document.hidden),
      exhaustMap(() => this.listRequests().pipe(catchError(() => EMPTY))),
      takeWhile((list) => list.anyUnresolved, true),
    );
  }
}
