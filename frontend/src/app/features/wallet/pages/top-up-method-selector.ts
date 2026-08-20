import { Component, input, output } from '@angular/core';

import { AssetUrlPipe } from '../../../core/asset-url';

export type TopUpMethod = 'paymob' | 'instapay';

/**
 * The segmented control at the top of the transfer card (Figma node 448:335).
 *
 * A component rather than markup repeated in both branches, because the
 * selector sits *inside* each method's card — the Paymob tab keeps its own
 * layout untouched, and both render the same control at the top of it.
 */
@Component({
  selector: 'app-top-up-method-selector',
  imports: [AssetUrlPipe],
  template: `
    <div class="method-selector" role="tablist" aria-label="Top-up method" data-node-id="448:335">
      <button
        class="method-segment"
        [class.method-segment-active]="method() === 'paymob'"
        type="button"
        role="tab"
        [attr.aria-selected]="method() === 'paymob'"
        (click)="select('paymob')"
        data-node-id="448:336"
      >
        Card · Paymob
      </button>
      <button
        class="method-segment"
        [class.method-segment-active]="method() === 'instapay'"
        type="button"
        role="tab"
        [attr.aria-selected]="method() === 'instapay'"
        (click)="select('instapay')"
        data-node-id="448:338"
      >
        <img
          class="method-mark"
          [src]="'assets/instapay-logo.png' | assetUrl"
          alt=""
          aria-hidden="true"
          width="16"
          height="16"
        />
        InstaPay transfer
      </button>
    </div>
  `,
  styleUrl: './top-up-method-selector.scss',
})
export class TopUpMethodSelector {
  readonly method = input.required<TopUpMethod>();
  readonly methodChange = output<TopUpMethod>();

  protected select(next: TopUpMethod): void {
    if (next !== this.method()) {
      this.methodChange.emit(next);
    }
  }
}
