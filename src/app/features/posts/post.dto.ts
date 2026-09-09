import { z } from 'zod';
import { Post, PostRow } from './post.model';

/**
 * The wire shape of a post exactly as `GET/POST/PATCH /posts...` sends and
 * accepts it, per the API Contract. Kept as its own named type rather than
 * reusing `Post` directly: today the two shapes are structurally identical,
 * but going through `toPost()` instead of casting means a future rename on
 * either side of the boundary is a one-line change in this file, not a
 * silent mismatch discovered at runtime.
 */
export interface PostDto {
  id: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string;
  title: string;
  content: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt?: string;
  commentsCount: number;
  likesCount: number;
  isLikedByMe: boolean;
}

/**
 * Passed into `BaseApiService.get`/`post`/`patch` by `PostsApiService`, so
 * every post response is validated once, at the HTTP boundary, before a
 * `PostDto` is even constructed.
 */
export const postDtoSchema: z.ZodType<PostDto> = z.object({
  id: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  authorPhotoUrl: z.string(),
  title: z.string(),
  content: z.string(),
  imageUrl: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  commentsCount: z.number(),
  likesCount: z.number(),
  isLikedByMe: z.boolean(),
});

/** Maps a validated `PostDto` to the domain `Post` the rest of the app uses. */
export function toPost(dto: PostDto): Post {
  return {
    id: dto.id,
    authorId: dto.authorId,
    authorName: dto.authorName,
    authorPhotoUrl: dto.authorPhotoUrl,
    title: dto.title,
    content: dto.content,
    imageUrl: dto.imageUrl,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    commentsCount: dto.commentsCount,
    likesCount: dto.likesCount,
    isLikedByMe: dto.isLikedByMe,
  };
}

/**
 * The reverse direction: a cached `PostRow` back to the plain `Post` shape
 * that is safe to send to the API. `PostRow`'s only local-only field is
 * `pendingSync`, so this is a literal strip of that field, listed out
 * explicitly rather than cast, so `pendingSync` can never accidentally
 * leak into a request body `PostsApiService` sends.
 */
export function toPostPayload(row: PostRow): Post {
  return {
    id: row.id,
    authorId: row.authorId,
    authorName: row.authorName,
    authorPhotoUrl: row.authorPhotoUrl,
    title: row.title,
    content: row.content,
    imageUrl: row.imageUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    commentsCount: row.commentsCount,
    likesCount: row.likesCount,
    isLikedByMe: row.isLikedByMe,
  };
}
