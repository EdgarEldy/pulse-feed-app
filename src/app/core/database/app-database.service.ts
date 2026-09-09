import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

/**
 * The narrow surface `SqliteTable<T>` (and, in a follow-up branch,
 * `SyncService`'s startup replay of `pending_writes`) is allowed to see.
 * Deliberately just "run a statement" / "read some rows", nothing about
 * connections, platforms, or migrations: that is what makes `SqliteTable`
 * unit-testable with a plain in-memory fake instead of a real SQLite
 * connection or the web platform's `jeep-sqlite` custom element, neither of
 * which exist in the Karma/ChromeHeadless test environment. Every real
 * `@capacitor-community/sqlite` detail stays behind `AppDatabaseService`;
 * nothing outside this file is allowed to import from that package.
 */
export interface SqlExecutor {
  query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  run(sql: string, params?: unknown[]): Promise<void>;
}

/**
 * One migration step: the SQL that takes the database from `toVersion - 1`
 * to `toVersion`. Applied in order, tracked via SQLite's own `PRAGMA
 * user_version`, so re-opening an already-migrated database is a no-op and
 * a device that skipped a version (an app update installed while the app
 * was closed) still replays every migration it missed, not just the latest
 * one.
 */
interface Migration {
  readonly toVersion: number;
  readonly statements: readonly string[];
}

const DATABASE_NAME = 'pulsefeed';

/**
 * Version 1 creates every table this branch's scope covers. `posts_cache`
 * and `comments_cache` mirror `PostRow`/`CommentRow` (see
 * `features/posts/post.model.ts` / `features/comments/comment.model.ts`)
 * one SQL column per field, plus a `synced_at` column that is not part of
 * either TypeScript type: it is local bookkeeping only, tracking when a row
 * was last confirmed in sync with the server, read/written directly by
 * whatever later needs it rather than round-tripped through `SqliteTable<T>`
 * (which only ever sees the columns that make up `T`).
 *
 * Every column other than `id` is declared `TEXT NOT NULL`, including the
 * numeric/boolean-looking ones (`commentsCount`, `pendingSync`...). That is
 * not a typo: `SqliteTable<T>` (see `sqlite-table.ts`) stores every
 * non-`id` value JSON-encoded, so a real SQLite `INTEGER`/`REAL` column
 * would fight that encoding rather than help it. SQLite's column affinity
 * is advisory, not enforced, so a `TEXT` column happily stores a JSON
 * string like `"5"` or `"false"` and hands it back unchanged.
 *
 * `pending_writes` is created here too, per this branch's schema task, even
 * though the service that reads/writes it (`SyncService`) lands in a
 * follow-up task on this same branch; its column names are the literal
 * ones from that task list (snake_case), not run through `SqliteTable`'s
 * JSON encoding, since `SqliteTable` is not the thing that will own that
 * table.
 */
const MIGRATIONS: readonly Migration[] = [
  {
    toVersion: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS posts_cache (
        id TEXT PRIMARY KEY NOT NULL,
        authorId TEXT NOT NULL,
        authorName TEXT NOT NULL,
        authorPhotoUrl TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        imageUrl TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        commentsCount TEXT NOT NULL,
        likesCount TEXT NOT NULL,
        isLikedByMe TEXT NOT NULL,
        pendingSync TEXT NOT NULL,
        synced_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS comments_cache (
        id TEXT PRIMARY KEY NOT NULL,
        postId TEXT NOT NULL,
        authorId TEXT NOT NULL,
        authorName TEXT NOT NULL,
        authorPhotoUrl TEXT NOT NULL,
        content TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        pendingSync TEXT NOT NULL,
        synced_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS pending_writes (
        id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        temp_id TEXT,
        created_at TEXT NOT NULL
      );`,
    ],
  },
];

/**
 * Opens and migrates the app's single local SQLite database, and is the
 * only place in the app allowed to import `@capacitor-community/sqlite`.
 * Everything else (every `*LocalService`, `SyncService`'s startup replay)
 * depends only on the narrow `SqlExecutor` interface above, obtained by
 * awaiting `ready()`.
 *
 * Opening a connection, and running migrations against it, is genuinely
 * asynchronous, and there is no way to make it otherwise: nothing may
 * query the database until both have finished. Rather than have every
 * caller coordinate that by hand, this service does the work exactly once,
 * eagerly, starting the moment the service itself is constructed (Angular
 * only constructs `providedIn: 'root'` services once, on first injection,
 * so "constructed" already means "needed"), and caches the resulting
 * `Promise` so every caller of `ready()` — no matter how many, no matter
 * when — awaits that same open-and-migrate sequence instead of triggering
 * it more than once. This is also the answer to the startup-ordering
 * concern the task list calls out for `SyncService`: `SyncService`'s
 * startup replay does not need to guess whether `AppDatabaseService` has
 * finished opening by the time it runs, it just awaits `ready()` itself.
 */
@Injectable({ providedIn: 'root' })
export class AppDatabaseService {
  private readonly connection = new SQLiteConnection(CapacitorSQLite);
  private readonly readyPromise: Promise<SqlExecutor>;

  constructor() {
    this.readyPromise = this.open();
  }

  /**
   * Resolves once the database connection is open and every pending
   * migration has run, with a `SqlExecutor` backed by that connection.
   * Safe to call any number of times, from any number of services: the
   * underlying open-and-migrate sequence runs once, the very first time
   * this service is injected, and every subsequent call just awaits the
   * same cached `Promise`.
   */
  ready(): Promise<SqlExecutor> {
    return this.readyPromise;
  }

  private async open(): Promise<SqlExecutor> {
    if (Capacitor.getPlatform() === 'web') {
      await this.initWebStore();
    }

    const db = await this.connection.createConnection(DATABASE_NAME, false, 'no-encryption', 1, false);
    await db.open();
    await this.migrate(db);
    return this.toExecutor(db);
  }

  /**
   * The web build has no native SQLite engine to bind to, so
   * `@capacitor-community/sqlite` ships a web implementation on top of
   * `jeep-sqlite`, a custom element that must exist in the DOM and be
   * defined before `initWebStore()`/`createConnection()` are called.
   * `jeep-sqlite` is not a separate entry in the Tech Stack table; it
   * already ships as a transitive dependency of `@capacitor-community/sqlite`
   * (see its `package.json`), so wiring it up here needs no new package,
   * only registering the element the plugin already expects.
   */
  private async initWebStore(): Promise<void> {
    if (!customElements.get('jeep-sqlite')) {
      const { defineCustomElements } = await import('jeep-sqlite/loader');
      defineCustomElements(window);
    }
    if (!document.querySelector('jeep-sqlite')) {
      document.body.appendChild(document.createElement('jeep-sqlite'));
    }
    await customElements.whenDefined('jeep-sqlite');
    await this.connection.initWebStore();
  }

  private async migrate(db: SQLiteDBConnection): Promise<void> {
    const versionResult = await db.query('PRAGMA user_version;');
    const currentVersion = Number(versionResult.values?.[0]?.['user_version'] ?? 0);

    const pending = MIGRATIONS.filter((migration) => migration.toVersion > currentVersion).sort(
      (a, b) => a.toVersion - b.toVersion,
    );

    for (const migration of pending) {
      for (const statement of migration.statements) {
        await db.execute(statement);
      }
      await db.execute(`PRAGMA user_version = ${migration.toVersion};`);
    }
  }

  private toExecutor(db: SQLiteDBConnection): SqlExecutor {
    return {
      query: async (sql: string, params: unknown[] = []) => {
        const result = await db.query(sql, params);
        return (result.values ?? []) as Record<string, unknown>[];
      },
      run: async (sql: string, params: unknown[] = []) => {
        await db.run(sql, params);
      },
    };
  }
}
