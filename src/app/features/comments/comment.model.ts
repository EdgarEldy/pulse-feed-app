/**
 * The domain shape of a comment, as the rest of the app works with it once
 * a `CommentDto` has been through `toComment()`. Framework-agnostic: no
 * Angular, `HttpClient`, or Capacitor import belongs in this file.
 *
 * `createdAt` is the ISO 8601 string the API sends over the wire; this app
 * never converts it into a `Date` object.
 */
export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string;
  content: string;
  createdAt: string;
}

/**
 * The shape `CommentsLocalService` caches in `comments_cache`: a `Comment`
 * plus a field that exists only on-device and is never sent to the API.
 * See README's "Local-only fields (never sent to the API)" section.
 */
export interface CommentRow extends Comment {
  /** True while a create/delete made offline hasn't reached the API yet. */
  pendingSync: boolean;
}
