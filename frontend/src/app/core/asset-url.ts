import { inject, Pipe, PipeTransform } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';

/** Resolve a public asset path against the configured base href (e.g. `/orbit/` in production). */
export function assetUrl(path: string): string {
  const baseHref = inject(APP_BASE_HREF);
  const normalized = path.replace(/^\//, '');
  return `${baseHref}${normalized}`;
}

@Pipe({ name: 'assetUrl', standalone: true })
export class AssetUrlPipe implements PipeTransform {
  private readonly baseHref = inject(APP_BASE_HREF);

  transform(path: string): string {
    const normalized = path.replace(/^\//, '');
    return `${this.baseHref}${normalized}`;
  }
}
