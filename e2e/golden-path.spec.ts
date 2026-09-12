import { expect, test } from '@playwright/test';
import { mockApi } from './mocks';

/**
 * README's "one end-to-end Playwright test: sign up, create a post, like
 * it, comment on it" (feature/quality-and-release). Drives the real served
 * web build in a real browser, with the network calls this flow makes
 * faked via `mockApi` (see `e2e/mocks.ts` for why: this app has no bundled
 * backend).
 *
 * Ionic renders every form control (`ion-input`, `ion-textarea`,
 * `ion-select`) as a custom element wrapping a native input inside a
 * shadow root; Playwright's CSS engine pierces open shadow roots
 * automatically, so a selector like `ion-input[formcontrolname="email"]
 * input` reaches straight through to the real `<input>` without any
 * Ionic-specific test helper.
 *
 * `ion-router-outlet` keeps every previously-visited page in the DOM
 * (hidden via a `display: none`-equivalent class, not removed) for its own
 * back-navigation/transition handling, rather than destroying it the way a
 * plain `RouterOutlet` would. Every locator below is therefore scoped with
 * `:visible` to match only the currently-shown page; without it, a
 * selector that also matches a field/button on an earlier page (e.g. every
 * page's submit button shares the same `ion-button[type="submit"]` shape)
 * resolves to more than one element and Playwright's strict mode fails
 * the action outright rather than silently guessing which one was meant.
 */
test('sign up, create a post, like it, and comment on it', async ({ page }) => {
  await mockApi(page);

  // --- Sign up ---
  // `ionic:animated=false` is Ionic's own documented config-via-query-param
  // escape hatch: page transitions (including the custom hero transition)
  // otherwise leave the outgoing page overlapping the incoming one for the
  // animation's duration, which is exactly what real users see but is
  // needless flakiness for a test clicking through screens as fast as
  // possible.
  await page.goto('/login/register?ionic:animated=false');
  await page.locator('ion-input[formcontrolname="displayName"] input:visible').fill('Ada Lovelace');
  await page.locator('ion-input[formcontrolname="email"] input:visible').fill('ada@example.com');
  await page.locator('ion-input[formcontrolname="password"] input:visible').fill('correct-horse-battery');
  await page.locator('form ion-button[type="submit"]:visible').click();

  await expect(page).toHaveURL(/\/feed$/);

  // --- Create a post ---
  await page.locator('ion-fab-button:visible').click();
  await expect(page).toHaveURL(/\/posts\/create$/);

  const postTitle = `My first post ${Date.now()}`;
  await page.locator('ion-input[formcontrolname="title"] input:visible').fill(postTitle);
  await page.locator('ion-textarea[formcontrolname="content"] textarea:visible').fill('Hello from the e2e suite.');
  await page.locator('form ion-button[type="submit"]:visible').click();

  await expect(page).toHaveURL(/\/feed$/);
  await expect(page.getByText(postTitle)).toBeVisible();

  // --- Open the post and like it ---
  // Clicking the anchor itself (rather than the title text it wraps)
  // ensures the click lands where Angular's RouterLink directive actually
  // listens, so the navigation is a client-side route change intercepted
  // via preventDefault, not a real anchor navigation reloading the page.
  await page.locator('a.feed__card-link:visible', { hasText: postTitle }).click();
  await expect(page).toHaveURL(/\/posts\/post-\d+$/);

  // A generous timeout here, not Playwright's 5s default: PostDetailPage's
  // loadPost() write-through cache write can itself take up to
  // CACHE_WRITE_TIMEOUT_MS (offline-first.util.ts) to give up before the
  // fetched post still renders, on a browser where the SQLite web store
  // never finishes initializing (see that file's doc comment for why).
  const likeButton = page.locator('.like-button:visible');
  await expect(likeButton).toContainText('no likes', { timeout: 10_000 });
  await likeButton.click();
  await expect(likeButton).toContainText('1 like');

  // --- Comment on it ---
  await page.getByRole('button', { name: 'Add comment' }).click();

  const commentTextarea = page.locator('ion-textarea textarea:visible');
  await expect(commentTextarea).toBeVisible();
  await commentTextarea.fill('Nice post!');
  await page.getByRole('button', { name: 'Post' }).click();

  await expect(commentTextarea).toBeHidden();
  await expect(page.getByText('Nice post!')).toBeVisible();
});
