import { Injectable, inject } from '@angular/core';
import { AppDatabaseService } from '../../core/database/app-database.service';
import { SqliteTable } from '../../core/database/sqlite-table';
import { PostRow } from './post.model';

/**
 * Every column `posts_cache` has (see `AppDatabaseService`'s migration),
 * in the same order `PostRow` declares them. `SqliteTable<T>` needs this
 * list up front since it builds its `INSERT OR REPLACE`/`SELECT` statements
 * from it rather than inspecting `T` at runtime (plain TypeScript types do
 * not exist any more once compiled, so there is nothing to inspect).
 */
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
 * The reference `*LocalService`: everything it does is delegate straight to
 * `SqliteTable<PostRow>`, targeting `posts_cache`. `PostsService` (the
 * facade built in `feature/posts`) is the only thing that ever injects this
 * class; nothing here knows about `HttpClient`, `AppError`, or Signals.
 *
 * `CommentsLocalService` (`feature/comments`) copies this file's shape
 * almost verbatim, swapping `PostRow`/`posts_cache` for
 * `CommentRow`/`comments_cache`: that repetition is intentional, per
 * README's Architecture section, rather than factoring out a common base
 * class `*LocalService` files would extend. `SqliteTable<T>` is already the
 * shared piece; a base class on top of it would just be composition
 * disguised as inheritance.
 */
@Injectable({ providedIn: 'root' })
export class PostsLocalService {
  private readonly db = inject(AppDatabaseService);

  private readonly table = new SqliteTable<PostRow>('posts_cache', POST_ROW_COLUMNS, () => this.db.ready());

  getAll(): Promise<PostRow[]> {
    return this.table.getAll();
  }

  upsert(row: PostRow): Promise<void> {
    return this.table.upsert(row);
  }

  upsertAll(rows: PostRow[]): Promise<void> {
    return this.table.upsertAll(rows);
  }

  delete(id: string): Promise<void> {
    return this.table.delete(id);
  }

  /**
   * Replaces a post's temporary client-generated id with its real,
   * server-assigned one, once a queued `create` has synced. Called from
   * `PostsService`'s registered `SyncService` reconciler's `onSynced`, see
   * README's "Reconciling writes made offline".
   */
  replaceId(oldId: string, newRow: PostRow): Promise<void> {
    return this.table.replaceId(oldId, newRow);
  }
}
