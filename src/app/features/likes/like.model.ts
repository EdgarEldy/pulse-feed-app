/**
 * The domain shape of a like: the composite key (`userId`, `postId`) plus
 * when it was created. Framework-agnostic: no Angular, `HttpClient`, or
 * Capacitor import belongs in this file.
 *
 * Unlike `Post`/`Comment`, a `Like` has no cached row type: per README's
 * Offline Scope table, a like rides along with the cached
 * `Post.likesCount`/`isLikedByMe` fields instead of its own table, so there
 * is no `likes_cache` and no `LikeRow` to define.
 */
export interface Like {
  userId: string;
  postId: string;
  createdAt: string;
}
