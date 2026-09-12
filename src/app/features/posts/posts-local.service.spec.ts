import { TestBed } from '@angular/core/testing';
import { AppDatabaseService, SqlExecutor } from '../../core/database/app-database.service';
import { PostRow } from './post.model';
import { PostsLocalService } from './posts-local.service';

const POST_ROW_COLUMNS: readonly (keyof PostRow & string)[] = [
  'id',
  'authorId',
  'authorName',
  'authorPhotoUrl',
  'title',
  'content',
  'imageUrl',
  'createdAt',
  'updatedAt',
  'commentsCount',
  'likesCount',
  'isLikedByMe',
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

const samplePost: PostRow = {
  id: 'post-1',
  authorId: 'user-1',
  authorName: 'Ada Lovelace',
  authorPhotoUrl: 'https://example.com/ada.jpg',
  title: 'Hello world',
  content: 'My first post',
  imageUrl: 'https://example.com/post.jpg',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: undefined,
  commentsCount: 0,
  likesCount: 0,
  isLikedByMe: false,
  pendingSync: false,
};

describe('PostsLocalService', () => {
  let service: PostsLocalService;

  beforeEach(() => {
    const { executor } = createFakeExecutor(POST_ROW_COLUMNS);

    TestBed.configureTestingModule({
      providers: [{ provide: AppDatabaseService, useValue: new FakeAppDatabaseService(executor) }],
    });

    service = TestBed.inject(PostsLocalService);
  });

  it('upserts a post and reads it back via getAll', async () => {
    await service.upsert(samplePost);

    const rows = await service.getAll();

    expect(rows).toEqual([samplePost]);
  });

  it('upsertAll stores multiple posts in one call', async () => {
    const otherPost: PostRow = { ...samplePost, id: 'post-2', title: 'Second post', pendingSync: true };

    await service.upsertAll([samplePost, otherPost]);
    const rows = await service.getAll();

    expect(rows).toEqual(jasmine.arrayWithExactContents([samplePost, otherPost]));
  });

  it('delete removes a post, leaving the others cached', async () => {
    const otherPost: PostRow = { ...samplePost, id: 'post-2' };
    await service.upsertAll([samplePost, otherPost]);

    await service.delete(samplePost.id);
    const rows = await service.getAll();

    expect(rows).toEqual([otherPost]);
  });

  it('replaceId swaps a temporary id for the server-assigned real one', async () => {
    const optimisticPost: PostRow = { ...samplePost, id: 'temp-1', pendingSync: true };
    await service.upsert(optimisticPost);

    const syncedPost: PostRow = { ...samplePost, id: 'real-1', pendingSync: false };
    await service.replaceId('temp-1', syncedPost);
    const rows = await service.getAll();

    expect(rows).toEqual([syncedPost]);
    expect(rows.find((row) => row.id === 'temp-1')).toBeUndefined();
  });
});
