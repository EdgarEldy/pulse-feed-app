import { z } from 'zod';
import { Comment, CommentRow } from './comment.model';

/**
 * The wire shape of a comment exactly as `GET/POST /posts/:postId/comments`
 * sends and accepts it, per the API Contract. Kept as its own named type
 * rather than reusing `Comment` directly, so the mapping boundary stays
 * real even while the two shapes happen to match today.
 */
export interface CommentDto {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string;
  content: string;
  createdAt: string;
}

/**
 * Passed into `BaseApiService.get`/`post` by `CommentsApiService`, so every
 * comment response is validated once, at the HTTP boundary.
 */
export const commentDtoSchema: z.ZodType<CommentDto> = z.object({
  id: z.string(),
  postId: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  authorPhotoUrl: z.string(),
  content: z.string(),
  createdAt: z.string(),
});

/** Maps a validated `CommentDto` to the domain `Comment` the rest of the app uses. */
export function toComment(dto: CommentDto): Comment {
  return {
    id: dto.id,
    postId: dto.postId,
    authorId: dto.authorId,
    authorName: dto.authorName,
    authorPhotoUrl: dto.authorPhotoUrl,
    content: dto.content,
    createdAt: dto.createdAt,
  };
}

/**
 * The reverse direction: a cached `CommentRow` back to the plain `Comment`
 * shape that is safe to send to the API. `CommentRow`'s only local-only
 * field is `pendingSync`, so this is a literal strip of that field, listed
 * out explicitly rather than cast, so `pendingSync` can never accidentally
 * leak into a request body `CommentsApiService` sends.
 */
export function toCommentPayload(row: CommentRow): Comment {
  return {
    id: row.id,
    postId: row.postId,
    authorId: row.authorId,
    authorName: row.authorName,
    authorPhotoUrl: row.authorPhotoUrl,
    content: row.content,
    createdAt: row.createdAt,
  };
}
