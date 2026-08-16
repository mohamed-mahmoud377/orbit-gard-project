import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  action?: ToastAction;
  /** ms; 0 keeps it until dismissed. */
  duration: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  readonly toasts = signal<Toast[]>([]);

  success(title: string, message?: string, action?: ToastAction): number {
    return this.push({ kind: 'success', title, message, action, duration: 4000 });
  }

  error(title: string, message?: string, action?: ToastAction): number {
    return this.push({ kind: 'error', title, message, action, duration: 7000 });
  }

  warning(title: string, message?: string, action?: ToastAction): number {
    return this.push({ kind: 'warning', title, message, action, duration: 9000 });
  }

  info(title: string, message?: string, action?: ToastAction): number {
    return this.push({ kind: 'info', title, message, action, duration: 4500 });
  }

  push(toast: Omit<Toast, 'id'>): number {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { ...toast, id }].slice(-4));
    if (toast.duration > 0) {
      this.timers.set(
        id,
        setTimeout(() => this.dismiss(id), toast.duration),
      );
    }
    return id;
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
