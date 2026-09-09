import { Signal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { AppDatabaseService, SqlExecutor } from '../database/app-database.service';
import { ConnectivityService } from '../network/connectivity.service';
import { SyncService } from './sync.service';

interface FakePendingWriteRow {
  id: string;
  entity_type: string;
  operation: string;
  payload_json: string;
  temp_id: string | null;
  created_at: string;
}

/**
 * `SyncService` reads and writes `pending_writes` with plain SQL, not
 * through `SqliteTable`, so this fake matches that shape directly (see
 * `sync.service.ts`'s `enqueue`/`replayAll`): an `INSERT INTO pending_writes`
 * with six positional params, a `SELECT ... FROM pending_writes ORDER BY
 * created_at ASC`, and a `DELETE FROM pending_writes WHERE id = ?`.
 */
function createFakePendingWritesExecutor(): { executor: SqlExecutor; rows: FakePendingWriteRow[] } {
  const rows: FakePendingWriteRow[] = [];

  const executor: SqlExecutor = {
    query: async (sql: string) => {
      if (sql.includes('pending_writes')) {
        return [...rows]
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((row) => ({ ...row })) as unknown as Record<string, unknown>[];
      }
      throw new Error(`Unexpected query in test fake: ${sql}`);
    },
    run: async (sql: string, params: unknown[] = []) => {
      if (sql.includes('INSERT INTO pending_writes')) {
        const [id, entityType, operation, payloadJson, tempId, createdAt] = params as [
          string,
          string,
          string,
          string,
          string | null,
          string,
        ];
        rows.push({
          id,
          entity_type: entityType,
          operation,
          payload_json: payloadJson,
          temp_id: tempId,
          created_at: createdAt,
        });
        return;
      }
      if (sql.includes('DELETE FROM pending_writes')) {
        const [id] = params as [string];
        const index = rows.findIndex((row) => row.id === id);
        if (index !== -1) {
          rows.splice(index, 1);
        }
        return;
      }
      throw new Error(`Unexpected run in test fake: ${sql}`);
    },
  };

  return { executor, rows };
}

class FakeAppDatabaseService {
  constructor(private readonly executor: SqlExecutor) {}

  ready(): Promise<SqlExecutor> {
    return Promise.resolve(this.executor);
  }
}

class FakeConnectivityService {
  private readonly online = signal(false);
  readonly isOnline: Signal<boolean> = this.online.asReadonly();

  setOnline(value: boolean): void {
    this.online.set(value);
  }
}

/** Lets every pending microtask (promise chains inside SyncService) settle. */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SyncService', () => {
  let rows: FakePendingWriteRow[];
  let fakeConnectivity: FakeConnectivityService;

  function configure(initialOnline: boolean): void {
    const { executor, rows: executorRows } = createFakePendingWritesExecutor();
    rows = executorRows;
    fakeConnectivity = new FakeConnectivityService();
    fakeConnectivity.setOnline(initialOnline);

    TestBed.configureTestingModule({
      providers: [
        { provide: AppDatabaseService, useValue: new FakeAppDatabaseService(executor) },
        { provide: ConnectivityService, useValue: fakeConnectivity },
      ],
    });
  }

  it('replays a queued create write once isOnline flips to true and calls the reconciler onSynced', async () => {
    configure(false);
    const service = TestBed.inject(SyncService);
    // The effect's first run is deliberately skipped by SyncService itself
    // (it is a subscription setup, not a real transition); flush it now so
    // the flip below is the first genuine transition the effect reacts to.
    TestBed.tick();

    const syncedPost = { id: 'real-1', title: 'Hello' };
    const replaySpy = jasmine.createSpy('replay').and.returnValue(of(syncedPost));
    const onSyncedSpy = jasmine.createSpy('onSynced').and.returnValue(Promise.resolve());
    service.register<typeof syncedPost>({
      entityType: 'post',
      replay: (payload: unknown) => replaySpy(payload) as Observable<typeof syncedPost>,
      onSynced: (tempId: string, synced: typeof syncedPost) => onSyncedSpy(tempId, synced) as Promise<void>,
    });

    await service.enqueue('post', 'create', { title: 'Hello' }, 'temp-1');
    expect(rows.length).toBe(1);

    fakeConnectivity.setOnline(true);
    TestBed.tick();
    await flushPromises();

    expect(replaySpy).toHaveBeenCalledWith({ title: 'Hello' });
    expect(onSyncedSpy).toHaveBeenCalledWith('temp-1', syncedPost);
    expect(rows.length).toBe(0);
  });

  it('leaves the write queued, without retrying out of order, when replay keeps failing', async () => {
    configure(false);
    const service = TestBed.inject(SyncService);
    TestBed.tick();

    const replaySpy = jasmine.createSpy('replay').and.returnValue(throwError(() => new Error('still offline')));
    const onSyncedSpy = jasmine.createSpy('onSynced');
    service.register<{ id: string }>({
      entityType: 'post',
      replay: (payload: unknown) => replaySpy(payload) as Observable<{ id: string }>,
      onSynced: (tempId: string, synced: { id: string }) => onSyncedSpy(tempId, synced) as Promise<void>,
    });

    await service.enqueue('post', 'create', { title: 'Hello' }, 'temp-1');

    fakeConnectivity.setOnline(true);
    TestBed.tick();
    await flushPromises();

    expect(replaySpy).toHaveBeenCalledTimes(1);
    expect(onSyncedSpy).not.toHaveBeenCalled();
    expect(rows.length).toBe(1);
    expect(rows[0].temp_id).toBe('temp-1');
  });

  it('replays a write already queued from a previous session during startup when already online', async () => {
    configure(true);
    rows.push({
      id: 'pending-1',
      entity_type: 'post',
      operation: 'create',
      payload_json: JSON.stringify({ title: 'Hello' }),
      temp_id: 'temp-1',
      created_at: new Date().toISOString(),
    });

    const service = TestBed.inject(SyncService);

    const syncedPost = { id: 'real-1', title: 'Hello' };
    const replaySpy = jasmine.createSpy('replay').and.returnValue(of(syncedPost));
    const onSyncedSpy = jasmine.createSpy('onSynced').and.returnValue(Promise.resolve());
    // Registered synchronously, right after injection and before any
    // microtask from the startup replay path has had a chance to run, the
    // same way a feature facade service registers its reconciler in its own
    // constructor during app start.
    service.register<typeof syncedPost>({
      entityType: 'post',
      replay: (payload: unknown) => replaySpy(payload) as Observable<typeof syncedPost>,
      onSynced: (tempId: string, synced: typeof syncedPost) => onSyncedSpy(tempId, synced) as Promise<void>,
    });

    await flushPromises();

    expect(replaySpy).toHaveBeenCalledWith({ title: 'Hello' });
    expect(onSyncedSpy).toHaveBeenCalledWith('temp-1', syncedPost);
    expect(rows.length).toBe(0);
  });

  it('drops a queued write silently and continues when no reconciler is registered for its entity type', async () => {
    configure(false);
    const service = TestBed.inject(SyncService);
    TestBed.tick();

    await service.enqueue('like', 'update', { postId: 'post-1' });
    expect(rows.length).toBe(1);

    fakeConnectivity.setOnline(true);
    TestBed.tick();
    await flushPromises();

    expect(rows.length).toBe(0);
  });
});
