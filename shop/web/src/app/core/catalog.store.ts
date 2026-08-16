import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, shareReplay, tap } from 'rxjs';
import { ApiService } from './api.service';
import { CategoriesResponse, Category } from './models';

/**
 * The category tree is needed by the header mega-menu, the browse sidebar and
 * the home grid, and it never changes during a session — so it is fetched
 * once and shared.
 */
@Injectable({ providedIn: 'root' })
export class CatalogStore {
  private readonly api = inject(ApiService);
  private request?: Observable<CategoriesResponse>;

  readonly categories = signal<Category[]>([]);
  readonly loaded = signal(false);

  readonly bySlug = computed(() => {
    const map = new Map<string, Category>();
    for (const category of this.categories()) map.set(category.slug, category);
    return map;
  });

  load(): Observable<CategoriesResponse> {
    this.request ??= this.api.categories().pipe(
      tap((res) => {
        this.categories.set(res.items);
        this.loaded.set(true);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.request;
  }

  find(slug: string): Category | undefined {
    return this.bySlug().get(slug);
  }
}
