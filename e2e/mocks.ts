import type { Page } from '@playwright/test';

/**
 * Fakes just enough of the API Contract (README.md's "API Contract"
 * section) for the golden-path test to drive real navigation and real
 * component behavior against a real served build, without a live backend.
 * Everything here is `page.route()` network interception, no separate
 * server process and no dependency beyond `playwright` itself.
 *
 * Every endpoint is handled by one predicate-matched route rather than
 * several glob-string routes: `GET /posts` always carries a `?cursor=&limit=`
 * query string (see `PostsApiService.getPosts`), which a plain
 * `'http://localhost:3000/posts'` glob would not match, so branching on
 * `url.pathname`/`request.method()` inside a single handler sidesteps glob
 * matching entirely instead of getting it subtly wrong.
 *
 * State is kept in closures over plain arrays/objects, seeded fresh per
 * test via `mockApi(page)`, so one test's created post/comment never
 * leaks into another.
 */

const API_BASE = 'http://localhost:3000';

export interface MockUser {
  id: string;
  displayName: string;
  email: string;
  photoUrl: string;
  createdAt: string;
}

interface MockPost {
  id: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string;
  title: string;
  content: string;
  createdAt: string;
  commentsCount: number;
  likesCount: number;
  isLikedByMe: boolean;
}

interface MockComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string;
  content: string;
  createdAt: string;
}

export async function mockApi(page: Page): Promise<void> {
  const user: MockUser = {
    id: 'user-1',
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
    photoUrl: '',
    createdAt: new Date().toISOString(),
  };

  const posts: MockPost[] = [];
  const comments: MockComment[] = [];
  let nextPostId = 1;
  let nextCommentId = 1;

  await page.route(
    (url) => url.origin === API_BASE,
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const segments = url.pathname.split('/').filter(Boolean);

      if (url.pathname === '/auth/register' && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token', user }),
        });
        return;
      }

      if (url.pathname === '/posts' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: posts, nextCursor: null }),
        });
        return;
      }

      if (url.pathname === '/posts' && method === 'POST') {
        // CreatePostPage never picks an image in this test, so
        // PostsApiService's multipart body only ever carries title/content.
        const multipart = request.postData() ?? '';
        const titleMatch = multipart.match(/name="title"\r\n\r\n([^\r]*)/);
        const contentMatch = multipart.match(/name="content"\r\n\r\n([^\r]*)/);
        const created: MockPost = {
          id: `post-${nextPostId++}`,
          authorId: user.id,
          authorName: user.displayName,
          authorPhotoUrl: user.photoUrl,
          title: titleMatch?.[1] ?? '',
          content: contentMatch?.[1] ?? '',
          createdAt: new Date().toISOString(),
          commentsCount: 0,
          likesCount: 0,
          isLikedByMe: false,
        };
        posts.unshift(created);
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
        return;
      }

      // /posts/:postId/likes (POST, toggles)
      if (segments.length === 3 && segments[0] === 'posts' && segments[2] === 'likes' && method === 'POST') {
        const post = posts.find((p) => p.id === segments[1]);
        if (post) {
          post.isLikedByMe = !post.isLikedByMe;
          post.likesCount += post.isLikedByMe ? 1 : -1;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ liked: post?.isLikedByMe ?? true, likesCount: post?.likesCount ?? 1 }),
        });
        return;
      }

      // /posts/:postId/comments (GET list, POST create)
      if (segments.length === 3 && segments[0] === 'posts' && segments[2] === 'comments') {
        const postId = segments[1];
        if (method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ items: comments.filter((c) => c.postId === postId), nextCursor: null }),
          });
          return;
        }
        if (method === 'POST') {
          const body = request.postDataJSON() as { content: string };
          const created: MockComment = {
            id: `comment-${nextCommentId++}`,
            postId,
            authorId: user.id,
            authorName: user.displayName,
            authorPhotoUrl: user.photoUrl,
            content: body.content,
            createdAt: new Date().toISOString(),
          };
          comments.push(created);
          const post = posts.find((p) => p.id === postId);
          if (post) {
            post.commentsCount += 1;
          }
          await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
          return;
        }
      }

      // /posts/:postId (GET single post, PostDetailPage's loadPost)
      if (segments.length === 2 && segments[0] === 'posts' && method === 'GET') {
        const post = posts.find((p) => p.id === segments[1]);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(post) });
        return;
      }

      await route.abort();
    },
  );
}
