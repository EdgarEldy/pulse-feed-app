/**
 * The domain shape of a post, as the rest of the app works with it once a
 * `PostDto` has been through `toPost()`. Deliberately framework-agnostic:
 * no Angular, `HttpClient`, or Capacitor import belongs in this file.
 *
 * Every timestamp is the ISO 8601 string the API sends over the wire; this
 * app never converts them into `Date` objects, so formatting/relative-time
 * concerns stay in the presentation layer (a `timeAgo` pipe, for example)
 * instead of leaking `Date` handling into the model.
 */
export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string;
  title: string;
  content: string;
  /** Absent when the post has no image. */
  imageUrl?: string;
  createdAt: string;
  /** Absent when the post has never been edited. */
  updatedAt?: string;
  commentsCount: number;
  likesCount: number;
  isLikedByMe: boolean;
}

/**
 * The shape `PostsLocalService` caches in `posts_cache`: a `Post` plus
 * fields that exist only on-device and are never sent to the API. See
 * README's "Local-only fields (never sent to the API)" section.
 */
export interface PostRow extends Post {
  /** True while a create/update/delete made offline hasn't reached the API yet. */
  pendingSync: boolean;
}
