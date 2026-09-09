import { z } from 'zod';

/**
 * The `Like` domain type describes the composite entity (`userId`,
 * `postId`, `createdAt`), but neither likes endpoint in the API Contract
 * actually returns that shape: `POST /posts/:postId/likes` toggles a like
 * and reports the resulting count, `GET /posts/:postId/likes/me` just
 * reports whether the current user has liked the post. There is no DTO
 * that maps to `Like` here, these two types are the real wire shapes of
 * the two responses, named after what they represent rather than forced
 * into a `Like`-shaped mold that doesn't match what the backend sends.
 */
export interface LikeToggleResult {
  liked: boolean;
  likesCount: number;
}

/** Passed into `BaseApiService.post` by `LikesApiService.toggle()`. */
export const likeToggleResultSchema: z.ZodType<LikeToggleResult> = z.object({
  liked: z.boolean(),
  likesCount: z.number(),
});

export interface LikeStatus {
  liked: boolean;
}

/** Passed into `BaseApiService.get` by `LikesApiService.getMyLikeStatus()`. */
export const likeStatusSchema: z.ZodType<LikeStatus> = z.object({
  liked: z.boolean(),
});
