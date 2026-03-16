import { Injectable } from '@angular/core';

/** One entry in the local-file log saved to localStorage */
export interface LocalFileLogEntry {
  timestamp  : string;
  contractId : string;
  fileName   : string;
  sizeBytes  : number;
  action     : 'stored' | 'retrieved';
  source     : 'indexedDB';
}

const LOG_KEY    = 'ai_local_file_log';
const DB_NAME    = 'ai-dashboard-files';
const STORE_NAME = 'files';
const DB_VERSION = 1;

/**
 * Persists uploaded File blobs in IndexedDB so the preview page can render
 * documents even when the backend path is not yet accessible.
 *
 * Key format: `contractId/fileName`  (e.g. "107380 ABC1/C/0/2026/report.docx")
 */
@Injectable({ providedIn: 'root' })
export class FileStorageService {

  private dbPromise: Promise<IDBDatabase> | null = null;

  // ── DB init ────────────────────────────────────────────────────────────────

  private getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => { this.dbPromise = null; reject(req.error); };
    });
    return this.dbPromise;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Saves a File blob and writes a 'stored' log entry. */
  async saveFile(contractId: string, file: File): Promise<void> {
    const db  = await this.getDb();
    const key = this.makeKey(contractId, file.name);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(file, key);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
    this.log({ contractId, fileName: file.name, sizeBytes: file.size, action: 'stored' });
  }

  /**
   * Retrieves a previously saved File.  Returns null if not found.
   * Writes a 'retrieved' log entry on success.
   */
  async getFile(contractId: string, fileName: string): Promise<File | null> {
    try {
      const db  = await this.getDb();
      const key = this.makeKey(contractId, fileName);
      const file = await new Promise<File | null>((resolve, reject) => {
        const tx  = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve((req.result as File) ?? null);
        req.onerror   = () => reject(req.error);
      });
      if (file) {
        this.log({ contractId, fileName, sizeBytes: file.size, action: 'retrieved' });
      }
      return file;
    } catch {
      return null;
    }
  }

  /** Deletes a stored file (e.g. after a successful server upload). */
  async deleteFile(contractId: string, fileName: string): Promise<void> {
    try {
      const db  = await this.getDb();
      const key = this.makeKey(contractId, fileName);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror    = () => reject(tx.error);
      });
    } catch {}
  }

  /** Returns all log entries from localStorage. */
  getLog(): LocalFileLogEntry[] {
    try {
      const raw = localStorage.getItem(LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private makeKey(contractId: string, fileName: string): string {
    return `${contractId}/${fileName}`;
  }

  private log(entry: Omit<LocalFileLogEntry, 'timestamp' | 'source'>): void {
    try {
      const existing = this.getLog();
      existing.unshift({ ...entry, timestamp: new Date().toISOString(), source: 'indexedDB' });
      // Keep at most 500 entries to avoid bloating localStorage
      localStorage.setItem(LOG_KEY, JSON.stringify(existing.slice(0, 500)));
    } catch {}
  }
}
