import {
  Animation,
  AnimationBuilder,
  createAnimation,
  iosTransitionAnimation,
  isPlatform,
  mdTransitionAnimation,
} from '@ionic/angular/standalone';

/**
 * README's "Add a shared-element page transition between the feed thumbnail
 * and the detail image" task, implemented as a custom `navAnimation`
 * (`IonicConfig.navAnimation`, registered app-wide in `app.config.ts` via
 * `provideIonicAngular({ navAnimation: postHeroTransition })`) rather than
 * anything per-route: `ion-router-outlet` only exposes one transition hook
 * for the whole app, so "customize the transition for this one route pair"
 * necessarily means "write one `AnimationBuilder` that recognizes this route
 * pair and falls back to the default transition for every other one".
 *
 * What this actually achieves, and its real limitation:
 * `PostCardComponent`'s post image and `PostDetailPage`'s post image are two
 * separate DOM nodes belonging to two separate page component instances;
 * Ionic's router outlet (like Angular's own `RouterOutlet`) does not move a
 * single element across a route boundary the way, say, the View Transitions
 * API's `view-transition-name` can on a browser that supports it. What is
 * achievable, and what this does, is a close visual approximation: measure
 * the leaving thumbnail's on-screen position/size, start the entering
 * detail image transformed to exactly match it, and animate that transform
 * back to identity while cross-fading both pages. The effect reads as the
 * thumbnail "growing" into the detail image, but it is a choreographed
 * illusion built from two elements, not a literal shared element.
 *
 * Both ends opt in by carrying a `data-post-hero` attribute with a matching
 * value (`postHeroId(post.id)`): `PostCardComponent`'s `.post-card__image`
 * and `PostDetailPage`'s `.post-detail__image`. Neither element is required
 * to render (a post with no image renders neither, and `FeedPage` itself
 * does not exist on this branch yet); this builder simply falls back to the
 * platform's own default transition whenever it can't find a matching pair
 * on both the entering and leaving page, so nothing else in the app looks
 * or behaves any differently.
 */
export const POST_HERO_ATTR = 'data-post-hero';

export function postHeroId(id: string): string {
  return `post-image-${id}`;
}

const HERO_DURATION = 320;
const HERO_EASING = 'cubic-bezier(0.36, 0.66, 0.04, 1)';

/**
 * Ionic's own `TransitionOptions` (what `opts` below actually is at
 * runtime, carrying `enteringEl`/`leavingEl` among other fields this
 * builder never needs) is an internal `@ionic/core` type not re-exported
 * from `@ionic/angular/standalone`; only the loosely-typed `AnimationBuilder
 * = (baseEl: any, opts?: any) => Animation` is. Pulling the parameter type
 * straight off `iosTransitionAnimation`'s own signature gets the real shape
 * back without importing a package this app does not depend on directly.
 */
type TransitionOpts = Parameters<typeof iosTransitionAnimation>[1];

export const postHeroTransition: AnimationBuilder = (baseEl: HTMLElement, opts: TransitionOpts): Animation => {
  const { enteringEl, leavingEl } = opts;
  const defaultTransition = isPlatform('ios') ? iosTransitionAnimation : mdTransitionAnimation;

  if (!leavingEl) {
    // Nothing to transition from (the very first page the app renders):
    // there is no thumbnail/detail pair to speak of.
    return defaultTransition(baseEl, opts);
  }

  const matched = findMatchingHeroPair(enteringEl, leavingEl);
  if (!matched) {
    return defaultTransition(baseEl, opts);
  }
  const { enteringHero, leavingHero } = matched;

  const fromRect = leavingHero.getBoundingClientRect();
  const toRect = enteringHero.getBoundingClientRect();
  if (fromRect.width === 0 || fromRect.height === 0 || toRect.width === 0 || toRect.height === 0) {
    // One of the two images has not actually been laid out yet (e.g. its
    // `CachedImageDirective` placeholder hasn't resolved a size). Measuring
    // against a zero-size rect would produce a nonsensical transform, so
    // fall back rather than animate garbage.
    return defaultTransition(baseEl, opts);
  }

  return buildHeroAnimation(baseEl, enteringEl, leavingEl, enteringHero, fromRect, toRect);
};

/**
 * `FeedPage` renders one `[data-post-hero]` element per visible card, not
 * just one: a plain `querySelector` on the feed side would always return
 * the first card in DOM order, regardless of which card was actually
 * tapped, so the hero animation would only ever look right for that first
 * card. This instead pairs up every hero element on both sides by their
 * `data-post-hero` value and returns the one match (`PostDetailPage` only
 * ever renders a single hero, so at most one pairing can exist), which
 * works correctly in both navigation directions: forward from a specific
 * feed card into the detail page, and back again.
 */
function findMatchingHeroPair(enteringEl: HTMLElement, leavingEl: HTMLElement): { enteringHero: HTMLElement; leavingHero: HTMLElement } | null {
  const enteringHeroes = Array.from(enteringEl.querySelectorAll<HTMLElement>(`[${POST_HERO_ATTR}]`));
  const leavingHeroesById = new Map(
    Array.from(leavingEl.querySelectorAll<HTMLElement>(`[${POST_HERO_ATTR}]`)).map((el) => [el.getAttribute(POST_HERO_ATTR), el] as const),
  );

  for (const enteringHero of enteringHeroes) {
    const id = enteringHero.getAttribute(POST_HERO_ATTR);
    const leavingHero = id !== null ? leavingHeroesById.get(id) : undefined;
    if (leavingHero) {
      return { enteringHero, leavingHero };
    }
  }
  return null;
}

function buildHeroAnimation(
  baseEl: HTMLElement,
  enteringEl: HTMLElement,
  leavingEl: HTMLElement,
  enteringHero: HTMLElement,
  fromRect: DOMRect,
  toRect: DOMRect,
): Animation {
  const scaleX = fromRect.width / toRect.width;
  const scaleY = fromRect.height / toRect.height;
  const translateX = fromRect.left + fromRect.width / 2 - (toRect.left + toRect.width / 2);
  const translateY = fromRect.top + fromRect.height / 2 - (toRect.top + toRect.height / 2);

  // The detail image itself: starts overlapping the thumbnail's exact
  // position/size, ends at its own natural place in the detail layout.
  const heroAnimation = createAnimation()
    .addElement(enteringHero)
    .beforeStyles({ 'transform-origin': 'center center' })
    .keyframes([
      { offset: 0, transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})` },
      { offset: 1, transform: 'translate3d(0, 0, 0) scale(1, 1)' },
    ]);

  // The rest of the leaving page fades out and the rest of the entering
  // page fades in, in place of the platform's default slide, so nothing
  // else competes visually with the hero image growing into position.
  const leavingFade = createAnimation().addElement(leavingEl).fromTo('opacity', 1, 0);
  const enteringFade = createAnimation().addElement(enteringEl).fromTo('opacity', 0, 1);

  return createAnimation()
    .addElement(baseEl)
    .easing(HERO_EASING)
    .duration(HERO_DURATION)
    .addAnimation([leavingFade, enteringFade, heroAnimation]);
}
