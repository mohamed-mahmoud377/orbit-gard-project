import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogStore } from '../../core/catalog.store';
import { AccentDirective } from '../../shared/accent.directive';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'ob-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AccentDirective, EmptyStateComponent, IconComponent],
  host: { class: 'block' },
  template: `
    <div class="ob-container py-10">
      <ob-empty-state
        art="search"
        title="This page has gone down a mouse hole"
        message="The link may be old, or the page may have moved. Here are some better places to sniff around."
      >
        <a routerLink="/" class="ob-btn ob-btn-primary">Back to home</a>
        <a routerLink="/search" class="ob-btn ob-btn-ghost">Browse all products</a>
      </ob-empty-state>

      @if (catalog.categories().length) {
        <div class="mx-auto max-w-3xl">
          <h2 class="mb-3 text-center text-xs font-extrabold tracking-wider text-muted uppercase">
            Popular departments
          </h2>
          <div class="flex flex-wrap justify-center gap-2">
            @for (category of catalog.categories().slice(0, 12); track category.slug) {
              <a
                [routerLink]="['/c', category.slug]"
                [obAccent]="category.accent"
                class="ob-chip transition hover:border-[color:var(--cat-accent)] hover:bg-[color:var(--cat-accent-soft)]"
              >
                <span class="text-[color:var(--cat-accent)]">
                  <ob-icon [name]="category.icon" [size]="14" />
                </span>
                {{ category.name }}
              </a>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class NotFoundComponent {
  protected readonly catalog = inject(CatalogStore);
}
