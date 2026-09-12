import { TestBed } from '@angular/core/testing';
import { AppDatabaseService, SqlExecutor } from '../../core/database/app-database.service';
import { CommentRow } from './comment.model';
import { CommentsLocalService } from './comments-local.service';

const COMMENT_ROW_COLUMNS: readonly (keyof CommentRow & string)[] = [
  'id',
  'postId',
  'authorId',
  'authorName',
  'authorPhotoUrl',
  'content',
  'createdAt',
  'pendingSync',
];

/**
 * A minimal in-memory stand-in for a real SQLite connection, matching the
 * exact statement shapes `SqliteTable` issues (see `sqlite-table.spec.ts`
 * for the same pattern): `SELECT <columns> FROM <table>;`, `INSERT OR
 * REPLACE INTO <table> (...) VALUES (...);`, and `DELETE FROM <table> WHERE
 * id = ?;`.
 */
function createFakeExecutor(columns: readonly string[]): { executor: SqlExecutor; store: Map<string, unknown[]> } {
  const store = new Map<string, unknown[]>();

  const executor: SqlExecutor = {
    query: async (sql: string) => {
      if (sql.trim().startsWith('SELECT')) {
        return Array.from(store.values()).map((values) => {
          const record: Record<string, unknown> = {};
          columns.forEach((column, index) => {
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

class FakeAppDatabaseService {
  constructor(private readonly executor: SqlExecutor) {}

  ready(): Promise<SqlExecutor> {
    return Promise.resolve(this.executor);
  }
}

const sampleComment: CommentRow = {
  id: 'comment-1',
  postId: 'post-1',
  authorId: 'user-1',
  authorName: 'Ada Lovelace',
  authorPhotoUrl: 'https://example.com/ada.jpg',
  content: 'Nice post!',
  createdAt: '2024-01-01T00:00:00.000Z',
  pendingSync: false,
};

describe('CommentsLocalService', () => {
  let service: CommentsLocalService;

  beforeEach(() => {
    const { executor } = createFakeExecutor(COMMENT_ROW_COLUMNS);

    TestBed.configureTestingModule({
      providers: [{ provide: AppDatabaseService, useValue: new FakeAppDatabaseService(executor) }],
    });

    service = TestBed.inject(CommentsLocalService);
  });

  it('upserts a comment and reads it back via getAll', async () => {
    await service.upsert(sampleComment);

    const rows = await service.getAll();

    expect(rows).toEqual([sampleComment]);
  });

  it('upsertAll stores comments for multiple posts in one call', async () => {
    const otherComment: CommentRow = { ...sampleComment, id: 'comment-2', postId: 'post-2', pendingSync: true };

    await service.upsertAll([sampleComment, otherComment]);
    const rows = await service.getAll();

    expect(rows).toEqual(jasmine.arrayWithExactContents([sampleComment, otherComment]));
  });

  it('delete removes a comment, leaving the others cached', async () => {
    const otherComment: CommentRow = { ...sampleComment, id: 'comment-2' };
    await service.upsertAll([sampleComment, otherComment]);

    await service.delete(sampleComment.id);
    const rows = await service.getAll();

    expect(rows).toEqual([otherComment]);
  });

  it('replaceId swaps a temporary id for the server-assigned real one', async () => {
    const optimisticComment: CommentRow = { ...sampleComment, id: 'temp-1', pendingSync: true };
    await service.upsert(optimisticComment);

    const syncedComment: CommentRow = { ...sampleComment, id: 'real-1', pendingSync: false };
    await service.replaceId('temp-1', syncedComment);
    const rows = await service.getAll();

    expect(rows).toEqual([syncedComment]);
    expect(rows.find((row) => row.id === 'temp-1')).toBeUndefined();
  });
});
