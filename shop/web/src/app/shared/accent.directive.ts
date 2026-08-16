import { Directive, ElementRef, effect, inject, input } from '@angular/core';
import { accentFor } from '../core/accents';

/**
 * Themes a subtree with a category's accent colour from the catalog
 * (CONTRACT §3 `accent`), by setting `--cat-accent`, `--cat-accent-dark` and
 * `--cat-accent-soft` on the host.
 *
 * Written as a directive rather than a `[style]` object binding so the custom
 * properties are applied with `style.setProperty`, which is unambiguous.
 */
@Directive({
  selector: '[obAccent]',
})
export class AccentDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly obAccent = input<string | null | undefined>(null);

  constructor() {
    effect(() => {
      const accent = accentFor(this.obAccent());
      const style = this.el.nativeElement.style;
      style.setProperty('--cat-accent', accent.base);
      style.setProperty('--cat-accent-dark', accent.dark);
      style.setProperty('--cat-accent-soft', accent.soft);
    });
  }
}
