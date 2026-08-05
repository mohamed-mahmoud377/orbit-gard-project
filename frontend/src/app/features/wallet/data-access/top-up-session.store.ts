import { Injectable } from '@angular/core';

import { TopUpSessionContext } from './payment.models';

const STORAGE_KEY = 'orbit.top-up-session.v1';

@Injectable({ providedIn: 'root' })
export class TopUpSessionStore {
  save(context: TopUpSessionContext): void {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
  }

  read(): TopUpSessionContext | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as TopUpSessionContext;
      if (!parsed.paymentId || typeof parsed.amountMinor !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  clear(): void {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
