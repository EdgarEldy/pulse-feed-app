import { Injectable, inject } from '@angular/core';
import { Observable, filter, from, map, switchMap } from 'rxjs';
import { z } from 'zod';
import { apiEndpoints } from '../../core/http/api-endpoints';
import { BaseApiService, UploadEvent } from '../../core/http/base-api.service';
import { PostDto, postDtoSchema, toPost } from './post.dto';
import { Post } from './post.model';

/** `GET /posts` is served in pages of this size; the API Contract leaves the exact number up to the client. */
const POSTS_PAGE_SIZE = 20;

/**
 * The wire shape of `GET /posts`'s envelope. Its `items` are still `PostDto`s
 * at this point, `getPosts` maps each one through `toPost` after validation.
 */
interface PostsPageDto {
  items: PostDto[];
  nextCursor: string | null;
}

const postsPageSchema: z.ZodType<PostsPageDto> = z.object({
  items: z.array(postDtoSchema),
  nextCursor: z.string().nullable(),
});

/**
 * The payload `PostsService.createPost` and `CreatePostPage` build. `imageUri`
 * is deliberately a local file URI/path (the `webPath` `@capacitor/camera`
 * returns), not a `File`/`Blob`: that keeps this whole object plain,
 * JSON-serializable data, which matters because it is exactly what
 * `SyncService.enqueue` stores as `payload_json` if the post is created
 * while offline. A `File` cannot survive a `JSON.stringify` round trip, a
 * file path can, as long as it is still readable when the write eventually
 * replays. Turning that path back into an actual file for the multipart
 * request is `createPost`/`createPostWithProgress`'s job, not the caller's.
 */
export interface CreatePostPayload {
  title: string;
  content: string;
  imageUri?: string;
}

/** `PATCH /posts/:id` only ever accepts these two fields, per the API Contract. */
export interface UpdatePostPayload {
  title?: string;
  content?: string;
}

/**
 * Talks to `/posts/*` over `BaseApiService`, exactly like every other
 * `*ApiService`: one method per endpoint, no direct `HttpClient` use, no
 * hand-written `HttpErrorResponse` handling. `PostsService` (the facade) is
 * the only thing that injects this service.
 */
@Injectable({ providedIn: 'root' })
export class PostsApiService {
  private readonly api = inject(BaseApiService);

  getPosts(cursor?: string): Observable<{ items: Post[]; nextCursor: string | null }> {
    return this.api
      .get(apiEndpoints.posts.list, { cursor, limit: POSTS_PAGE_SIZE }, postsPageSchema)
      .pipe(map((page) => ({ items: page.items.map(toPost), nextCursor: page.nextCursor })));
  }

  getPost(id: string): Observable<Post> {
    return this.api.get<PostDto>(apiEndpoints.posts.byId(id), undefined, postDtoSchema).pipe(map(toPost));
  }

  /**
   * The plain `Observable<Post>` shape `PostsService.createPost` and the
   * registered `SyncService` reconciler need (a reconciler's `replay` is
   * typed to return a single result, not a progress stream). Internally
   * this is just `createPostWithProgress` narrowed down to its final event,
   * so the multipart-building logic itself lives in exactly one place.
   */
  createPost(payload: CreatePostPayload): Observable<Post> {
    return this.createPostWithProgress(payload).pipe(
      filter((event): event is { progress: 100; result: Post } => 'result' in event),
      map((event) => event.result),
    );
  }

  /**
   * Same request as `createPost`, but exposes every intermediate upload
   * event too, for `CreatePostPage` to drive a progress bar the same way
   * `AvatarPickerComponent` does with `UsersService.uploadAvatar`.
   */
  createPostWithProgress(payload: CreatePostPayload): Observable<UploadEvent<Post>> {
    return from(this.buildCreateFormData(payload)).pipe(
      switchMap((formData) => this.api.postMultipartWithProgress<PostDto>(apiEndpoints.posts.list, formData, postDtoSchema)),
      map((event) => ('result' in event ? { progress: 100 as const, result: toPost(event.result) } : event)),
    );
  }

  updatePost(id: string, payload: UpdatePostPayload): Observable<Post> {
    return this.api.patch<PostDto>(apiEndpoints.posts.byId(id), payload, postDtoSchema).pipe(map(toPost));
  }

  deletePost(id: string): Observable<void> {
    return this.api.delete<void>(apiEndpoints.posts.byId(id));
  }

  /**
   * Builds the `title`/`content`/`image` multipart body the API Contract
   * expects. `payload.imageUri` only ever becomes a real `File` here, at
   * the last possible moment before the request goes out, mirroring the
   * `fetch(webPath) -> blob() -> File` conversion `AvatarPickerComponent`
   * already uses for the avatar upload: `webPath` (or, when this call is a
   * replay of a queued offline write, whatever local path the picked image
   * was still readable at) is a path `fetch` can turn into a `Blob` on both
   * the web build and inside the native WebView.
   */
  private async buildCreateFormData(payload: CreatePostPayload): Promise<FormData> {
    const formData = new FormData();
    formData.append('title', payload.title);
    formData.append('content', payload.content);
    if (payload.imageUri) {
      const image = await this.toFile(payload.imageUri);
      formData.append('image', image);
    }
    return formData;
  }

  private async toFile(imageUri: string): Promise<File> {
    const response = await fetch(imageUri);
    const blob = await response.blob();
    const extension = blob.type.split('/')[1] ?? 'jpeg';
    return new File([blob], `post-image.${extension}`, { type: blob.type });
  }
}
