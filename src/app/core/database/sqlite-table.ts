import { SqlExecutor } from './app-database.service';

/**
 * The generic `SELECT`/`INSERT OR REPLACE`/`DELETE` boilerplate every
 * `*LocalService` needs, written once instead of once per cached table.
 * Every value other than the primary key `id` is stored JSON-encoded as
 * `TEXT`. That is what makes this class generic over any `T` (a string, a
 * number, a boolean, an absent optional field: all round-trip correctly
 * through `JSON.stringify`/`JSON.parse`) without `SqliteTable` needing to
 * know which columns are numbers versus booleans versus optional strings.
 * SQLite has no native boolean type and no concept of "this key is
 * absent"; `JSON.stringify` already has clean, standard answers for both
 * (`"false"`, and `null` for an absent/`undefined` field), so leaning on it
 * avoids inventing a parallel type-mapping scheme.
 *
 * The trade-off: a column's real value is not visible to plain SQL, so
 * this class cannot offer a `WHERE column = value` query. That is fine for
 * the methods this branch's task list actually asks for
 * (`getAll`/`upsert`/`upsertAll`/`delete`/`replaceId`): none of them filter
 * by a field's value, they either return the whole table or address a row
 * by its plain-text `id`.
 *
 * Not `@Injectable`: per README's Architecture section, a `SqliteTable<T>`
 * is instantiated directly, once per table, inside the `*LocalService`
 * constructor that owns it (`new SqliteTable<PostRow>('posts_cache', [...],
 * () => this.db.ready())`), since it needs per-table configuration
 * (table name, column list) a DI token is not a natural fit for.
 */
export class SqliteTable<T extends { id: string }> {
  /**
   * @param tableName The SQL table this instance reads and writes.
   * @param columns The full set of columns making up `T`, `id` included, in
   *   the order used to build `INSERT OR REPLACE`/`SELECT` statements. Must
   *   match `T`'s own keys: every key of `T` becomes one SQL column.
   * @param resolveExecutor Resolves to the `SqlExecutor` to run statements
   *   against. A function rather than a bare `Promise<SqlExecutor>` so a
   *   `*LocalService` can pass `() => this.db.ready()`: `AppDatabaseService`
   *   caches that `Promise` internally, so every call here still only
   *   awaits the one open-and-migrate sequence, but this class never has to
   *   assume `AppDatabaseService` has already finished constructing (or
   *   even been injected yet) at the moment `SqliteTable` itself is built.
   *   A unit test hands this a trivial fake instead, e.g.
   *   `() => Promise.resolve(fakeExecutor)` backed by a plain in-memory
   *   array, with no real SQLite connection involved.
   */
  constructor(
    private readonly tableName: string,
    private readonly columns: readonly (keyof T & string)[],
    private readonly resolveExecutor: () => Promise<SqlExecutor>,
  ) {}

  async getAll(): Promise<T[]> {
    const executor = await this.resolveExecutor();
    const rows = await executor.query(`SELECT ${this.columnList()} FROM ${this.tableName};`);
    return rows.map((row) => this.fromRow(row));
  }

  async upsert(row: T): Promise<void> {
    const executor = await this.resolveExecutor();
    await this.runUpsert(executor, row);
  }

  async upsertAll(rows: T[]): Promise<void> {
    const executor = await this.resolveExecutor();
    for (const row of rows) {
      await this.runUpsert(executor, row);
    }
  }

  async delete(id: string): Promise<void> {
    const executor = await this.resolveExecutor();
    await executor.run(`DELETE FROM ${this.tableName} WHERE id = ?;`, [id]);
  }

  /**
   * Renames a row's primary key from a client-generated temporary id to
   * the server-assigned real one, and stores the reconciled row under that
   * new id in the same statement pair. Used by a `SyncService` reconciler's
   * `onSynced` once a queued `create` write for a post/comment has synced
   * (see README's "Reconciling writes made offline"): `newRow` is expected
   * to already carry the server's real `id`.
   */
  async replaceId(oldId: string, newRow: T): Promise<void> {
    const executor = await this.resolveExecutor();
    await executor.run(`DELETE FROM ${this.tableName} WHERE id = ?;`, [oldId]);
    await this.runUpsert(executor, newRow);
  }

  private async runUpsert(executor: SqlExecutor, row: T): Promise<void> {
    const placeholders = this.columns.map(() => '?').join(', ');
    const values = this.columns.map((column) => this.toParam(column, row));
    await executor.run(
      `INSERT OR REPLACE INTO ${this.tableName} (${this.columnList()}) VALUES (${placeholders});`,
      values,
    );
  }

  private columnList(): string {
    return this.columns.join(', ');
  }

  private toParam(column: keyof T & string, row: T): unknown {
    const value = row[column];
    return column === 'id' ? value : JSON.stringify(value ?? null);
  }

  private fromRow(row: Record<string, unknown>): T {
    const result = {} as Record<string, unknown>;
    for (const column of this.columns) {
      result[column] = column === 'id' ? row[column] : this.parseColumn(row[column]);
    }
    return result as T;
  }

  private parseColumn(raw: unknown): unknown {
    if (typeof raw !== 'string') {
      return raw ?? undefined;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed === null ? undefined : parsed;
    } catch {
      return raw;
    }
  }
}
