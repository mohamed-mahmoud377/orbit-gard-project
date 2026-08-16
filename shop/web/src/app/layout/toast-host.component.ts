import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Toast, ToastService } from '../core/toast.service';
import { IconComponent } from '../shared/icon.component';

const STYLES: Record<Toast['kind'], { icon: string; accent: string; ring: string }> = {
  success: { icon: 'check-circle', accent: 'text-teal', ring: 'border-teal/35' },
  error: { icon: 'alert-circle', accent: 'text-pop', ring: 'border-pop/35' },
  warning: { icon: 'alert-triangle', accent: 'text-warn', ring: 'border-warn/40' },
  info: { icon: 'info', accent: 'text-brand', ring: 'border-brand/30' },
};

/** Live region for transient notifications, bottom-right on desktop. */
@Component({
  selector: 'ob-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      role="region"
      aria-label="Notifications"
    >
      @for (toast of toasts.toasts(); track toast.id) {
        <div
          class="ob-anim-slide-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-surface p-3.5 shadow-[var(--shadow-pop)]"
          [class]="style(toast).ring"
          role="status"
          [attr.aria-live]="toast.kind === 'error' ? 'assertive' : 'polite'"
        >
          <span class="mt-0.5 shrink-0" [class]="style(toast).accent">
            <ob-icon [name]="style(toast).icon" [size]="19" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-bold text-body">{{ toast.title }}</p>
            @if (toast.message) {
              <p class="mt-0.5 text-xs leading-relaxed break-words text-muted">{{ toast.message }}</p>
            }
            @if (toast.action; as action) {
              <button
                type="button"
                class="mt-2 text-xs font-bold text-brand underline underline-offset-2 hover:text-brand-dark"
                (click)="runAction(toast)"
              >
                {{ action.label }}
              </button>
            }
          </div>
          <button
            type="button"
            class="shrink-0 rounded-md p-1 text-muted transition hover:bg-line-soft hover:text-body"
            aria-label="Dismiss notification"
            (click)="toasts.dismiss(toast.id)"
          >
            <ob-icon name="x" [size]="15" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);

  protected style(toast: Toast) {
    return STYLES[toast.kind];
  }

  protected runAction(toast: Toast): void {
    toast.action?.run();
    this.toasts.dismiss(toast.id);
  }
}
