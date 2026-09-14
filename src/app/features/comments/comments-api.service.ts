import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { z } from 'zod';
import { apiEndpoints } from '../../core/http/api-endpoints';
import { BaseApiService } from '../../core/http/base-api.service';
import { CommentDto, commentDtoSchema, toComment } from './comment.dto';
import { Comment } from './comment.model';

/** `GET /posts/:postId/comments` is served in pages of this size; the API Contract leaves the exact number up to the client. */
const COMMENTS_PAGE_SIZE = 20;

/**
 * The wire shape of `GET /posts/:postId/comments`'s envelope. Its `items`
 * are still `CommentDto`s at this point, `getComments` maps each one
 * through `toComment` after validation.
 */
interface CommentsPageDto {
  items: CommentDto[];
  nextCursor: string | null;
}

const commentsPageSchema: z.ZodType<CommentsPageDto> = z.object({
  items: z.array(commentDtoSchema),
  nextCursor: z.string().nullable(),
});

/**
 * The payload `CommentsService.addComment` builds and hands to `enqueue()`
 * when a create fails with a `network`-kind `AppError`: plain,
 * JSON-serializable data, exactly what `SyncService` stores as
 * `payload_json` and later hands back to the registered reconciler's
 * `replay`. `postId` travels alongside `content` since `POST
 * /posts/:postId/comments` addresses the post through the URL itself, not
 * the body, so the reconciler needs it to reconstruct the same request.
 */
export interface CreateCommentPayload {
  postId: string;
  content: string;
}

/**
 * Talks to `/posts/:postId/comments` and `/comments/:id` over
 * `BaseApiService`, exactly like every other `*ApiService`: one method per
 * endpoint, no direct `HttpClient` use, no hand-written `HttpErrorResponse`
 * handling. `CommentsService` (the facade) is the only thing that injects
 * this service.
 */
@Injectable({ providedIn: 'root' })
export class CommentsApiService {
  private readonly api = inject(BaseApiService);

  getComments(postId: string, cursor?: string): Observable<{ items: Comment[]; nextCursor: string | null }> {
    return this.api
      .get(apiEndpoints.comments.forPost(postId), { cursor, limit: COMMENTS_PAGE_SIZE }, commentsPageSchema)
      .pipe(map((page) => ({ items: page.items.map(toComment), nextCursor: page.nextCursor })));
  }

  addComment(payload: CreateCommentPayload): Observable<Comment> {
    return this.api
      .post<CommentDto>(apiEndpoints.comments.forPost(payload.postId), { content: payload.content }, commentDtoSchema)
      .pipe(map(toComment));
  }

  deleteComment(id: string): Observable<void> {
    return this.api.delete<void>(apiEndpoints.comments.byId(id));
  }
}
