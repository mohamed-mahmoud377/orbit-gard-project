import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AuthFacade } from './features/auth/data-access';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  /** Eagerly construct the auth facade so the wallet demo seam hydrates on boot. */
  private readonly auth = inject(AuthFacade);
}
