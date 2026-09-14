import { Injectable, effect, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AppDatabaseService } from '../database/app-database.service';
import { ConnectivityService } from '../network/connectivity.service';

/**
 * How a single feature (`PostsService`, `CommentsService`, ...) teaches
 * `SyncService` to replay one of its own queued writes. `SyncService` itself
 * has no idea what a `post` or a `comment` is, or which `PostsApiService`
 * method a queued `create` maps back onto; a reconciler is that missing
 * piece, registered once per `entityType` (see README's "Reconciling writes
 * made offline").
 *
 * `replay` re-issues the original request against the real API, from the
 * same `operation`/`payload` that were handed to `enqueue()` (`payload`
 * round-tripped through `JSON.stringify`/`JSON.parse`, so it arrives here
 * as `unknown`, not the original typed object). A single `entityType`
 * covers all three operations, per README's "Reconciling writes made
 * offline" ("register a reconciler with SyncService for entityType:
 * 'post'", not one reconciler per operation), so `replay` itself is what
 * dispatches to the right `PostsApiService`/`CommentsApiService` method
 * for whichever `operation` this particular row was queued with.
 * `onSynced` only matters for a `create` that produced a client-generated
 * `temp-<uuid>` id: it is the reconciler's chance to replace that
 * temporary id everywhere it was cached or displayed, now that the
 * server's real id (`synced`) is known.
 */
export interface PendingWriteReconciler<T> {
  entityType: string;
  replay: (operation: PendingWriteOperation, payload: unknown) => Observable<T>;
  onSynced: (tempId: string, synced: T) => Promise<void>;
}

export type PendingWriteOperation = 'create' | 'update' | 'delete';

/**
 * The literal shape of a `pending_writes` row, as `AppDatabaseService`'s
 * migration created it (snake_case column names, not run through
 * `SqliteTable`'s JSON-encode-every-column convention: this table is read
 * and written with plain SQL directly against `SqlExecutor`, per this
 * branch's task list, since `SqliteTable<T>` only manages one row per
 * primary key `id` and has no notion of "process rows in order, then
 * delete the one that succeeded").
 */
interface PendingWriteRow {
  id: string;
  entity_type: string;
  operation: PendingWriteOperation;
  payload_json: string;
  temp_id: string | null;
  created_at: string;
}

/**
 * Durably queues mutations made while offline (`enqueue`) and replays them,
 * strictly in the order they were made, once the app is back online
 * (`replayAll`). Every feature with queueable writes (`posts`, `comments`,
 * `likes`) depends on this single service instead of each hand-rolling its
 * own "try again later" logic; what makes a given queued row replayable is
 * entirely the reconciler that feature registered for its `entityType`.
 *
 * Two things worth knowing about how a pass through the queue behaves:
 *  - A row whose `replay()` call itself fails is never skipped and
 *    retried out of order. A queued `update` for a post that was itself
 *    created by an earlier queued `create` still carrying a `temp-` id
 *    would replay against the wrong identity if it ran before that
 *    `create` synced, so a real replay failure stops the whole pass,
 *    leaving that row and every row after it still queued for the next
 *    attempt.
 *  - A row whose `entity_type` has no registered reconciler at all is
 *    different: there is no way to even attempt it, so it is dropped from
 *    the queue and the pass moves on, per README's Troubleshooting
 *    section. See `replayAll()`'s own comment for why these two cases
 *    are not treated the same way.
 *  - It does not know or care which reconciler is registered when
 *    `enqueue()` is called. Registration and enqueuing are independent:
 *    a reconciler only needs to exist by the time `replayAll()` actually
 *    walks the queue, which in practice means "before the app goes back
 *    online", not "before the write was queued".
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly db = inject(AppDatabaseService);
  private readonly connectivity = inject(ConnectivityService);

  private readonly reconcilers = new Map<string, PendingWriteReconciler<unknown>>();

  /**
   * Guards against two replay passes running at once (the startup replay
   * and a connectivity-driven replay racing each other, or a flaky
   * connection flipping `isOnline` faster than one pass finishes). Without
   * this, two overlapping passes could both read the same row before either
   * deletes it and replay it twice.
   */
  private replaying = false;

  constructor() {
    // Case (b) from this branch's task list: a device can already be online
    // when the app launches with writes still queued from a previous
    // session. This does not depend on the effect below ever firing, it
    // runs exactly once, unconditionally, and decides for itself whether
    // there is anything to replay.
    void this.replayAtStartup();

    // Case (a): replay again every time the device transitions back online
    // while the app is running. `effect()` re-runs once immediately when it
    // is created, simply because that first run is how it discovers what
    // to depend on (here, `connectivity.isOnline`) — that first run is not
    // a "the value changed" notification, it fires unconditionally even
    // when the initial value is already `true`. Reacting to it here would
    // duplicate exactly what `replayAtStartup()` above already handles
    // (and without awaiting `AppDatabaseService.ready()` first, since a
    // plain `effect()` callback cannot itself be `async`). So the first run
    // is skipped unconditionally, and only genuine transitions afterward
    // trigger a replay.
    let isFirstRun = true;
    effect(() => {
      const isOnline = this.connectivity.isOnline();
      if (isFirstRun) {
        isFirstRun = false;
        return;
      }
      if (isOnline) {
        void this.replayAll();
      }
    });
  }

  /**
   * Registers the reconciler for one `entityType`. A second call for the
   * same `entityType` replaces the first, which matters for tests
   * (`TestBed` recreating a service between specs) but should not happen
   * in the running app: each feature registers its own reconciler exactly
   * once, typically in its facade service's constructor.
   */
  register<T>(reconciler: PendingWriteReconciler<T>): void {
    this.reconcilers.set(reconciler.entityType, reconciler as PendingWriteReconciler<unknown>);
  }

  /**
   * Persists one row into `pending_writes`, durably recording the intent to
   * replay this write later. Does not attempt the write itself, does not
   * check connectivity, and does not touch a reconciler: by the time a
   * caller reaches here (a `network`-kind `AppError` from the real attempt),
   * that decision has already been made by the feature's facade service.
   *
   * `id` is this row's own primary key in `pending_writes`, unrelated to
   * `tempId` (the client-generated `temp-<uuid>` id of the post/comment
   * itself, only present for a `create`).
   */
  async enqueue(
    entityType: string,
    operation: PendingWriteOperation,
    payload: unknown,
    tempId?: string,
  ): Promise<void> {
    const executor = await this.db.ready();
    await executor.run(
      `INSERT INTO pending_writes (id, entity_type, operation, payload_json, temp_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [crypto.randomUUID(), entityType, operation, JSON.stringify(payload), tempId ?? null, new Date().toISOString()],
    );
  }

  private async replayAtStartup(): Promise<void> {
    // The database is not guaranteed to have finished opening and
    // migrating yet merely because SyncService has been constructed:
    // AppDatabaseService starts that work eagerly on its own construction,
    // but nothing forces it to have finished before SyncService's
    // constructor runs. Querying pending_writes before ready() resolves
    // would either throw or run against a connection that is not open yet,
    // so this path always awaits it first, rather than assuming a fixed
    // initialization order between the two services.
    await this.db.ready();
    if (this.connectivity.isOnline()) {
      await this.replayAll();
    }
  }

  /**
   * Walks `pending_writes` in the order the writes were made, replaying
   * each one through the reconciler registered for its `entity_type`.
   *
   * Two very different things can stop a row from replaying, and this
   * method treats them differently on purpose:
   *  - `replay()` itself rejects, most commonly because the device dropped
   *    offline again mid-replay, or the server rejected the request. This
   *    stops the whole pass and leaves that row, and every row after it,
   *    still queued: replaying out of order could apply a later write
   *    against an entity a still-queued earlier write has not created or
   *    updated yet.
   *  - No reconciler is registered for the row's `entity_type` at all
   *    (`entityType: 'like'` never registers one, per README's
   *    "Reconciling writes made offline": a like toggle has no
   *    server-generated id to reconcile, so there is nothing an `onSynced`
   *    callback would ever do). There is no way to know *how* to call the
   *    API for this row, so it is deleted without ever being replayed,
   *    and the pass moves on to the next row rather than stopping. Per
   *    README's Troubleshooting section, this is accepted, documented
   *    behavior, not a bug: treating a missing reconciler the same as a
   *    real replay failure would let one queued `like` permanently block
   *    every later queued `post`/`comment` write from ever syncing again,
   *    since a missing reconciler can never start succeeding on retry the
   *    way a network failure can.
   */
  private async replayAll(): Promise<void> {
    if (this.replaying) {
      return;
    }
    this.replaying = true;
    try {
      const executor = await this.db.ready();
      const rawRows = await executor.query(
        `SELECT id, entity_type, operation, payload_json, temp_id, created_at
         FROM pending_writes
         ORDER BY created_at ASC;`,
      );
      const rows = rawRows as unknown as PendingWriteRow[];

      for (const row of rows) {
        const reconciler = this.reconcilers.get(row.entity_type);
        if (!reconciler) {
          await executor.run(`DELETE FROM pending_writes WHERE id = ?;`, [row.id]);
          continue;
        }

        let synced: unknown;
        try {
          const payload: unknown = JSON.parse(row.payload_json);
          synced = await this.replayOnce(reconciler, row.operation, payload);
        } catch {
          // The write itself never reached the server, most commonly
          // because the device dropped offline again mid-replay. The row
          // stays queued, and so does everything after it.
          return;
        }

        // The write has now reached the server: whatever happens next,
        // the row's actual job is done, so it comes off the queue here,
        // before onSynced runs, not after. onSynced only replaces a
        // temporary id in the local cache and UI state; if that step
        // itself throws (a transient SQLite error, say), the row must
        // not stay queued, replaying it again would re-issue the same
        // create/update/delete against the API a second time and, for a
        // create, produce a duplicate resource server-side.
        await executor.run(`DELETE FROM pending_writes WHERE id = ?;`, [row.id]);

        if (row.temp_id !== null) {
          try {
            await reconciler.onSynced(row.temp_id, synced);
          } catch {
            // Local reconciliation failed after a successful server
            // write. There is nothing left to retry here (the row is
            // already gone), so this pass simply moves on to the next
            // row rather than aborting the rest of the queue over a
            // problem that is now purely local.
            continue;
          }
        }
      }
    } finally {
      this.replaying = false;
    }
  }

  private replayOnce<T>(
    reconciler: PendingWriteReconciler<T>,
    operation: PendingWriteOperation,
    payload: unknown,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      reconciler.replay(operation, payload).subscribe({ next: resolve, error: reject });
    });
  }
}
