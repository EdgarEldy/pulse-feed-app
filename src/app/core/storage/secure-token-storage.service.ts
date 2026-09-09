import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';

const ACCESS_TOKEN_KEY = 'pulsefeed_access_token';
const REFRESH_TOKEN_KEY = 'pulsefeed_refresh_token';

/**
 * The narrow read/write/clear surface `SecureTokenStorageService` needs from
 * whatever is actually holding the tokens on a given platform. Two
 * implementations exist below it: one backed by the real
 * `capacitor-secure-storage-plugin` (native platforms), one hand-written on
 * top of `IndexedDB` (the web build). Keeping this as a small interface
 * rather than branching on platform inline in every method is what lets the
 * service's public methods stay a single `if` in the constructor instead of
 * a `Capacitor.getPlatform()` check repeated in `getAccessToken`,
 * `getRefreshToken`, `setTokens`, and `clear` alike.
 */
interface TokenStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * `capacitor-secure-storage-plugin`'s own web implementation (see
 * `node_modules/capacitor-secure-storage-plugin/dist/esm/web.js`) simply
 * calls `localStorage.setItem`/`getItem` under the hood on the web platform,
 * base64-encoded but otherwise unprotected. That directly contradicts the
 * Auth Model's "never `localStorage` on any platform" rule, so this service
 * cannot just call the plugin uniformly everywhere and trust its own web
 * fallback to be acceptable. Native platforms (`'ios'`/`'android'`) still go
 * through the real plugin, which is backed by Keychain/Keystore, exactly as
 * intended. Only the web build swaps in `IndexedDbTokenStore` below instead.
 */
class NativeSecureTokenStore implements TokenStore {
  async get(key: string): Promise<string | null> {
    try {
      const result = await SecureStoragePlugin.get({ key });
      return result.value;
    } catch {
      // The plugin rejects its promise (rather than resolving `null`) when
      // the key was never set, e.g. before the first sign-in. Treated as
      // "no token" rather than an error the caller has to handle.
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    await SecureStoragePlugin.set({ key, value });
  }

  async clear(): Promise<void> {
    await SecureStoragePlugin.clear();
  }
}

/**
 * The web build's stand-in for hardware-backed secure storage. `IndexedDB`
 * is not Keychain/Keystore, and the Auth Model is explicit that the web
 * build is not held to the same security bar, but it is still meaningfully
 * better than `localStorage`: it is not synchronously readable by any
 * script that happens to run on the page (no `localStorage`-style global
 * object every inline script can read), it is not sent along with the page
 * in server-rendered contexts, and it is the platform-native place to keep
 * structured, origin-scoped data that is not meant to be casually inspected
 * from the console the way `localStorage.getItem(...)` is.
 */
class IndexedDbTokenStore implements TokenStore {
  private static readonly DB_NAME = 'pulsefeed_secure_storage';
  private static readonly STORE_NAME = 'tokens';
  private static readonly DB_VERSION = 1;

  private dbPromise: Promise<IDBDatabase> | null = null;

  async get(key: string): Promise<string | null> {
    const db = await this.openDb();
    return new Promise<string | null>((resolve, reject) => {
      const request = db.transaction(IndexedDbTokenStore.STORE_NAME, 'readonly').objectStore(IndexedDbTokenStore.STORE_NAME).get(key);
      request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async set(key: string, value: string): Promise<void> {
    const db = await this.openDb();
    return new Promise<void>((resolve, reject) => {
      const request = db.transaction(IndexedDbTokenStore.STORE_NAME, 'readwrite').objectStore(IndexedDbTokenStore.STORE_NAME).put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.openDb();
    return new Promise<void>((resolve, reject) => {
      const request = db.transaction(IndexedDbTokenStore.STORE_NAME, 'readwrite').objectStore(IndexedDbTokenStore.STORE_NAME).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private openDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(IndexedDbTokenStore.DB_NAME, IndexedDbTokenStore.DB_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(IndexedDbTokenStore.STORE_NAME)) {
            request.result.createObjectStore(IndexedDbTokenStore.STORE_NAME);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return this.dbPromise;
  }
}

/**
 * The only place in the app allowed to import
 * `capacitor-secure-storage-plugin` or touch `IndexedDB` directly. Every
 * other service that needs the current access/refresh token (the
 * `authInterceptor`, `AuthService`) goes through this service instead of
 * reading a store itself, so swapping the underlying storage mechanism
 * again later only ever touches this one file.
 */
@Injectable({ providedIn: 'root' })
export class SecureTokenStorageService {
  private readonly store: TokenStore = Capacitor.getPlatform() === 'web' ? new IndexedDbTokenStore() : new NativeSecureTokenStore();

  getAccessToken(): Promise<string | null> {
    return this.store.get(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): Promise<string | null> {
    return this.store.get(REFRESH_TOKEN_KEY);
  }

  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([this.store.set(ACCESS_TOKEN_KEY, accessToken), this.store.set(REFRESH_TOKEN_KEY, refreshToken)]);
  }

  clear(): Promise<void> {
    return this.store.clear();
  }
}
