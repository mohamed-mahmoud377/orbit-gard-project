import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon.component';
import { LogoComponent } from '../../layout/logo.component';

/** Shared two-column frame for sign-in and registration. */
@Component({
  selector: 'ob-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, LogoComponent],
  host: { class: 'block' },
  template: `
    <div class="ob-container py-8">
      <div class="mx-auto grid max-w-5xl overflow-hidden rounded-2xl border border-line lg:grid-cols-2">
        <!-- form side -->
        <div class="bg-surface p-6 sm:p-10">
          <a routerLink="/" class="inline-flex text-ink lg:hidden">
            <ob-logo />
          </a>
          <h1 class="mt-6 text-2xl font-extrabold tracking-tight lg:mt-0">{{ heading() }}</h1>
          <p class="mt-1.5 text-sm text-muted">{{ subheading() }}</p>
          <div class="mt-6">
            <ng-content />
          </div>
        </div>

        <!-- brand side -->
        <div class="relative hidden overflow-hidden bg-ink p-10 text-white lg:block">
          <span
            class="absolute -top-24 -right-24 size-72 rounded-full bg-brand opacity-30 blur-3xl"
          ></span>
          <span
            class="absolute -bottom-28 -left-16 size-72 rounded-full bg-accent opacity-20 blur-3xl"
          ></span>

          <div class="relative flex h-full flex-col">
            <a routerLink="/" class="inline-flex w-fit text-white">
              <ob-logo />
            </a>

            <div class="mt-auto">
              <p class="text-lg leading-relaxed font-semibold text-balance">
                500 products across 30 departments, one cart, and a wallet that pays for it.
              </p>
              <ul class="mt-6 space-y-3">
                @for (point of points; track point.label) {
                  <li class="flex items-start gap-3">
                    <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10">
                      <ob-icon [name]="point.icon" [size]="16" />
                    </span>
                    <span class="text-sm text-white/75">{{ point.label }}</span>
                  </li>
                }
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AuthShellComponent {
  readonly heading = input.required<string>();
  readonly subheading = input.required<string>();

  protected readonly points = [
    { icon: 'shopping-cart', label: 'Your guest cart merges into your account automatically.' },
    { icon: 'wallet', label: 'Pay with a card or straight from your Orbit E-Wallet.' },
    { icon: 'package', label: 'Track every order from placed to delivered.' },
    { icon: 'heart', label: 'Keep a wishlist that follows you between devices.' },
  ];
}
