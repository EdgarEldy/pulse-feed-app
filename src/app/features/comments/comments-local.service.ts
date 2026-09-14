import { Injectable, inject } from '@angular/core';
import { AppDatabaseService } from '../../core/database/app-database.service';
import { SqliteTable } from '../../core/database/sqlite-table';
import { CommentRow } from './comment.model';

/**
 * Every column `comments_cache` has (see `AppDatabaseService`'s migration),
 * in the same order `CommentRow` declares them. `SqliteTable<T>` needs this
 * list up front since it builds its `INSERT OR REPLACE`/`SELECT` statements
 * from it rather than inspecting `T` at runtime.
 */
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
 * Copies `PostsLocalService`'s shape almost verbatim, swapping
 * `PostRow`/`posts_cache` for `CommentRow`/`comments_cache`: everything it
 * does is delegate straight to `SqliteTable<CommentRow>`. `CommentsService`
 * (the facade built in `feature/comments`) is the only thing that ever
 * injects this class; nothing here knows about `HttpClient`, `AppError`,
 * or Signals.
 *
 * `getAll()` returns every cached comment across every post, not just one:
 * `SqliteTable<T>` has no `WHERE` filtering, so `CommentsService` filters
 * by `postId` itself after reading the full table back, the same way
 * `PostsService.loadPost` filters `PostsLocalService.getAll()` down to a
 * single `id`.
 */
@Injectable({ providedIn: 'root' })
export class CommentsLocalService {
  private readonly db = inject(AppDatabaseService);

  private readonly table = new SqliteTable<CommentRow>('comments_cache', COMMENT_ROW_COLUMNS, () => this.db.ready());

  getAll(): Promise<CommentRow[]> {
    return this.table.getAll();
  }

  upsert(row: CommentRow): Promise<void> {
    return this.table.upsert(row);
  }

  upsertAll(rows: CommentRow[]): Promise<void> {
    return this.table.upsertAll(rows);
  }

  delete(id: string): Promise<void> {
    return this.table.delete(id);
  }

  /**
   * Replaces a comment's temporary client-generated id with its real,
   * server-assigned one, once a queued `create` has synced. Called from
   * `CommentsService`'s registered `SyncService` reconciler's `onSynced`,
   * see README's "Reconciling writes made offline".
   */
  replaceId(oldId: string, newRow: CommentRow): Promise<void> {
    return this.table.replaceId(oldId, newRow);
  }
}
