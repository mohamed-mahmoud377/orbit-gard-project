import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CardBrand } from './card';

/** Small brand marks that appear in the card field as the IIN is typed. */
@Component({
  selector: 'ob-card-brand',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <svg viewBox="0 0 40 26" [attr.width]="width()" [attr.height]="width() * 0.65" aria-hidden="true">
      <svg:rect x="0.5" y="0.5" width="39" height="25" rx="4" class="fill-surface stroke-line" />
      @switch (brand()) {
        @case ('Visa') {
          <svg:text
            x="20"
            y="17.5"
            text-anchor="middle"
            font-family="ui-sans-serif, sans-serif"
            font-size="11"
            font-weight="800"
            font-style="italic"
            fill="#1a1f71"
            >VISA</svg:text
          >
        }
        @case ('Mastercard') {
          <svg:circle cx="16" cy="13" r="7.5" fill="#eb001b" />
          <svg:circle cx="24" cy="13" r="7.5" fill="#f79e1b" opacity="0.85" />
        }
        @case ('Amex') {
          <svg:rect x="2" y="2" width="36" height="22" rx="3" fill="#2e77bc" />
          <svg:text
            x="20"
            y="16.5"
            text-anchor="middle"
            font-family="ui-sans-serif, sans-serif"
            font-size="8"
            font-weight="800"
            fill="#ffffff"
            >AMEX</svg:text
          >
        }
        @case ('UnionPay') {
          <svg:rect x="2" y="2" width="12" height="22" rx="2" fill="#e21836" />
          <svg:rect x="14" y="2" width="12" height="22" fill="#00447c" />
          <svg:rect x="26" y="2" width="12" height="22" rx="2" fill="#007b84" />
        }
        @default {
          <svg:rect x="5" y="9" width="30" height="3" rx="1.5" class="fill-line" />
          <svg:rect x="5" y="15" width="14" height="3" rx="1.5" class="fill-line" />
        }
      }
    </svg>
  `,
})
export class CardBrandComponent {
  readonly brand = input.required<CardBrand>();
  readonly width = input(40);
}
