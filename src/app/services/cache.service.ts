import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface StoredEntry<T> {
  data: T;
  ts:   number;
}

export interface CacheInfo {
  hit:      boolean;
  ageLabel: string; // e.g. "just now", "3 min ago"
}

@Injectable({ providedIn: 'root' })
export class CacheService {

  constructor(private http: HttpClient) {}

  private key(url: string): string {
    return `apicache_${url}`;
  }

  /**
   * Peek at cache metadata WITHOUT fetching.
   * Use this to display a "Cached · X min ago" badge before calling get().
   */
  peek(url: string, ttlMs = DEFAULT_TTL_MS): CacheInfo {
    try {
      const raw = localStorage.getItem(this.key(url));
      if (!raw) return { hit: false, ageLabel: '' };
      const entry: StoredEntry<unknown> = JSON.parse(raw);
      const age = Date.now() - entry.ts;
      if (age > ttlMs) {
        localStorage.removeItem(this.key(url));
        return { hit: false, ageLabel: '' };
      }
      const ageMin = Math.round(age / 60_000);
      return { hit: true, ageLabel: ageMin === 0 ? 'just now' : `${ageMin} min ago` };
    } catch {
      return { hit: false, ageLabel: '' };
    }
  }

  /**
   * Fetch with transparent caching.
   * - Returns cached data immediately (as synchronous Observable) if still fresh.
   * - Falls back to a real HTTP GET and stores the result on success.
   */
  get<T>(url: string, ttlMs = DEFAULT_TTL_MS): Observable<T> {
    const k = this.key(url);
    try {
      const raw = localStorage.getItem(k);
      if (raw) {
        const entry: StoredEntry<T> = JSON.parse(raw);
        if (Date.now() - entry.ts < ttlMs) {
          return of(entry.data);
        }
        localStorage.removeItem(k);
      }
    } catch { /* parse error — treat as cache miss */ }

    return this.http.get<T>(url).pipe(
      tap(data => {
        try {
          localStorage.setItem(k, JSON.stringify({ data, ts: Date.now() } as StoredEntry<T>));
        } catch { /* storage quota exceeded — skip caching */ }
      })
    );
  }

  /**
   * Remove a specific cache entry so the next get() hits the network.
   */
  invalidate(url: string): void {
    localStorage.removeItem(this.key(url));
  }

  /**
   * Wipe all cached entries written by this service.
   */
  invalidateAll(): void {
    Object.keys(localStorage)
      .filter(k => k.startsWith('apicache_'))
      .forEach(k => localStorage.removeItem(k));
  }
}
