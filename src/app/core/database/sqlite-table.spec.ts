import { SqlExecutor } from './app-database.service';
import { SqliteTable } from './sqlite-table';

interface TestRow {
  id: string;
  name: string;
  count: number;
  active: boolean;
}

const TEST_COLUMNS: readonly (keyof TestRow & string)[] = ['id', 'name', 'count', 'active'];

/**
 * A minimal in-memory stand-in for a real SQLite connection, built to match
 * the exact statement shapes `SqliteTable` issues (see `sqlite-table.ts`):
 * `SELECT <columns> FROM <table>;`, `INSERT OR REPLACE INTO <table> (...)
 * VALUES (...);`, and `DELETE FROM <table> WHERE id = ?;`. Rows are keyed by
 * their primary key so `INSERT OR REPLACE` behaves like the real thing.
 */
function createFakeExecutor(): { executor: SqlExecutor; store: Map<string, unknown[]> } {
  const store = new Map<string, unknown[]>();

  const executor: SqlExecutor = {
    query: async (sql: string) => {
      if (sql.trim().startsWith('SELECT')) {
        return Array.from(store.values()).map((values) => {
          const record: Record<string, unknown> = {};
          TEST_COLUMNS.forEach((column, index) => {
            record[column] = values[index];
          });
          return record;
        });
      }
      throw new Error(`Unsupported query in test fake: ${sql}`);
    },
    run: async (sql: string, params: unknown[] = []) => {
      if (sql.trim().startsWith('INSERT OR REPLACE')) {
        store.set(params[0] as string, params);
        return;
      }
      if (sql.trim().startsWith('DELETE')) {
        store.delete(params[0] as string);
        return;
      }
      throw new Error(`Unsupported run in test fake: ${sql}`);
    },
  };

  return { executor, store };
}

describe('SqliteTable', () => {
  let table: SqliteTable<TestRow>;

  beforeEach(() => {
    const { executor } = createFakeExecutor();
    table = new SqliteTable<TestRow>('test_rows', TEST_COLUMNS, () => Promise.resolve(executor));
  });

  it('upserts a row and reads it back via getAll', async () => {
    const row: TestRow = { id: '1', name: 'Alice', count: 3, active: true };

    await table.upsert(row);
    const rows = await table.getAll();

    expect(rows).toEqual([row]);
  });

  it('overwrites an existing row when upserted again under the same id', async () => {
    await table.upsert({ id: '1', name: 'Alice', count: 3, active: true });
    await table.upsert({ id: '1', name: 'Alice Updated', count: 4, active: false });

    const rows = await table.getAll();

    expect(rows).toEqual([{ id: '1', name: 'Alice Updated', count: 4, active: false }]);
  });

  it('upserts multiple rows in one call via upsertAll, preserving falsy values', async () => {
    const rows: TestRow[] = [
      { id: '1', name: 'Alice', count: 3, active: true },
      { id: '2', name: 'Bob', count: 0, active: false },
    ];

    await table.upsertAll(rows);
    const result = await table.getAll();

    expect(result).toEqual(jasmine.arrayWithExactContents(rows));
  });

  it('removes a row from getAll after delete, leaving the others untouched', async () => {
    await table.upsertAll([
      { id: '1', name: 'Alice', count: 3, active: true },
      { id: '2', name: 'Bob', count: 0, active: false },
    ]);

    await table.delete('1');
    const rows = await table.getAll();

    expect(rows).toEqual([{ id: '2', name: 'Bob', count: 0, active: false }]);
  });

  it('replaceId removes the old id, inserts the row under the new id, and preserves other fields', async () => {
    await table.upsert({ id: 'temp-1', name: 'Alice', count: 3, active: true });

    await table.replaceId('temp-1', { id: 'real-1', name: 'Alice', count: 3, active: true });
    const rows = await table.getAll();

    expect(rows).toEqual([{ id: 'real-1', name: 'Alice', count: 3, active: true }]);
    expect(rows.find((row) => row.id === 'temp-1')).toBeUndefined();
  });
});
