import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';
import { PluginListenerHandle } from '@capacitor/core';
import { Network } from '@capacitor/network';

/**
 * Wraps `@capacitor/network` so the rest of the app never talks to the
 * Capacitor plugin directly. Everything that cares about connectivity
 * (`OfflineBannerComponent`, `loadOfflineFirst()`'s network-vs-cache
 * decision, `SyncService`'s "replay once back online" trigger) depends on
 * this service instead, and only ever reads one thing from it: `isOnline`.
 *
 * `Network.getStatus()` and `Network.addListener()` are both asynchronous,
 * which is awkward for something meant to be read synchronously from a
 * template via a signal. This service absorbs that awkwardness once: it
 * reads the current status on construction (a device can already be
 * offline, or already back online, before anything subscribes to changes)
 * and keeps a plain `signal<boolean>` in sync afterward, so every consumer
 * gets a synchronous, always-current `Signal<boolean>` regardless of how
 * the underlying plugin reports it.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly online = signal(true);

  /** Readable signal, `true` while the device currently has a connection. */
  readonly isOnline: Signal<boolean> = this.online.asReadonly();

  constructor() {
    // `DestroyRef.onDestroy` must be registered synchronously, during
    // construction: registering it only once the async listener setup
    // below resolves would race against teardown (a short-lived injector,
    // like one created per unit test) and throw `NG0205` if the injector
    // is already gone by then. Registering it now, closing over a handle
    // that is filled in once the plugin resolves, sidesteps that race
    // entirely: if teardown happens before setup finishes, `destroyed`
    // just tells the setup step to remove the listener the moment it
    // exists instead of leaving it registered.
    let destroyed = false;
    let listenerHandle: PluginListenerHandle | undefined;

    this.destroyRef.onDestroy(() => {
      destroyed = true;
      void listenerHandle?.remove();
    });

    void this.trackConnectivity((handle) => {
      listenerHandle = handle;
      if (destroyed) {
        void handle.remove();
      }
    });
  }

  private async trackConnectivity(onListenerReady: (handle: PluginListenerHandle) => void): Promise<void> {
    const initialStatus = await Network.getStatus();
    this.online.set(initialStatus.connected);

    // Native listeners are not garbage-collected like RxJS subscriptions;
    // without removing this later, every ConnectivityService recreated in
    // a test (or, in theory, a future non-root usage) would leak one.
    const listener = await Network.addListener('networkStatusChange', (updatedStatus) => {
      this.online.set(updatedStatus.connected);
    });
    onListenerReady(listener);
  }
}
