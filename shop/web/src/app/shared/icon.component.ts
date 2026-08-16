import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { iconPaths } from './icons';

/**
 * Renders an icon from the inline set. Decorative by default (`aria-hidden`);
 * pass a `label` when the icon is the only content of a control.
 */
@Component({
  selector: 'ob-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.aria-hidden]="label() ? null : 'true'"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label()"
      class="block"
    >
      @for (d of paths(); track $index) {
        <svg:path [attr.d]="d" />
      }
    </svg>
  `,
})
export class IconComponent {
  readonly name = input.required<string | null | undefined>();
  readonly size = input<number>(20);
  readonly strokeWidth = input<number>(1.75);
  readonly label = input<string | null>(null);

  protected readonly paths = computed(() => iconPaths(this.name()));
}
