import { postHeroId, postHeroTransition, POST_HERO_ATTR } from './post-hero-transition.util';

/**
 * Matches the private `HERO_DURATION` constant in `post-hero-transition.util.ts`.
 * The hero animation always runs at this duration; both `iosTransitionAnimation`
 * (540ms) and `mdTransitionAnimation` (280ms/200ms) use different durations, so
 * this alone is enough to tell "the real hero animation was built" apart from
 * "this fell back to the platform default transition".
 */
const HERO_DURATION = 320;

function heroElement(id: string, rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute(POST_HERO_ATTR, id);
  spyOn(el, 'getBoundingClientRect').and.returnValue(rect as DOMRect);
  return el;
}

describe('postHeroTransition', () => {
  it('builds the hero animation keyed off the tapped card, not the first card in DOM order', () => {
    const baseEl = document.createElement('div');

    const card1Rect: Partial<DOMRect> = { left: 0, top: 0, width: 100, height: 100 };
    const card2Rect: Partial<DOMRect> = { left: 200, top: 300, width: 120, height: 80 };
    const card3Rect: Partial<DOMRect> = { left: 400, top: 500, width: 60, height: 60 };
    const detailRect: Partial<DOMRect> = { left: 10, top: 20, width: 300, height: 200 };

    const leavingEl = document.createElement('div');
    leavingEl.appendChild(heroElement(postHeroId('1'), card1Rect));
    const card2 = heroElement(postHeroId('2'), card2Rect);
    leavingEl.appendChild(card2);
    leavingEl.appendChild(heroElement(postHeroId('3'), card3Rect));

    const enteringEl = document.createElement('div');
    const detailHero = heroElement(postHeroId('2'), detailRect);
    enteringEl.appendChild(detailHero);

    const animation = postHeroTransition(baseEl, { baseEl, enteringEl, leavingEl });

    expect(animation.getDuration()).toBe(HERO_DURATION);

    const heroChild = animation.childAnimations.find((child) => child.elements.includes(detailHero));
    expect(heroChild).withContext('expected a child animation targeting the entering hero element').toBeDefined();

    // scaleX = card2.width / detail.width, scaleY = card2.height / detail.height
    // translateX/Y = the offset between the two rects' centers.
    const expectedScaleX = card2Rect.width! / detailRect.width!;
    const expectedScaleY = card2Rect.height! / detailRect.height!;
    const expectedTranslateX =
      card2Rect.left! + card2Rect.width! / 2 - (detailRect.left! + detailRect.width! / 2);
    const expectedTranslateY =
      card2Rect.top! + card2Rect.height! / 2 - (detailRect.top! + detailRect.height! / 2);

    const keyframes = heroChild!.getKeyframes() as { offset: number; transform: string }[];
    const startFrame = keyframes.find((frame) => frame.offset === 0)!;
    expect(startFrame.transform).toBe(
      `translate3d(${expectedTranslateX}px, ${expectedTranslateY}px, 0) scale(${expectedScaleX}, ${expectedScaleY})`,
    );

    // Card 1's rect would have produced a completely different transform;
    // asserting against it directly guards against the old
    // first-match-in-DOM-order bug resurfacing.
    const wrongScaleX = card1Rect.width! / detailRect.width!;
    const wrongTranslateX = card1Rect.left! + card1Rect.width! / 2 - (detailRect.left! + detailRect.width! / 2);
    expect(startFrame.transform).not.toContain(`translate3d(${wrongTranslateX}px`);
    expect(startFrame.transform).not.toContain(`scale(${wrongScaleX}`);
  });

  it('still builds the hero animation when the matching id is not the first hero element on the leaving page', () => {
    const baseEl = document.createElement('div');
    const rect: Partial<DOMRect> = { left: 0, top: 0, width: 100, height: 100 };

    const leavingEl = document.createElement('div');
    leavingEl.appendChild(heroElement('post-image-a', rect));
    leavingEl.appendChild(heroElement('post-image-b', { left: 50, top: 50, width: 40, height: 40 }));

    const enteringEl = document.createElement('div');
    enteringEl.appendChild(heroElement('post-image-a', { left: 5, top: 5, width: 200, height: 200 }));

    const animation = postHeroTransition(baseEl, { baseEl, enteringEl, leavingEl });

    expect(animation.getDuration()).toBe(HERO_DURATION);
  });

  it('falls back to the platform default transition when no hero id matches on both sides', () => {
    const baseEl = document.createElement('div');

    const leavingEl = document.createElement('div');
    leavingEl.appendChild(heroElement('post-image-1', { left: 0, top: 0, width: 100, height: 100 }));

    const enteringEl = document.createElement('div');
    enteringEl.appendChild(heroElement('post-image-99', { left: 0, top: 0, width: 100, height: 100 }));

    const animation = postHeroTransition(baseEl, { baseEl, enteringEl, leavingEl });

    expect(animation.getDuration()).not.toBe(HERO_DURATION);
  });

  it('falls back to the platform default transition when the matched pair has not been laid out yet', () => {
    const baseEl = document.createElement('div');

    const leavingEl = document.createElement('div');
    leavingEl.appendChild(heroElement(postHeroId('1'), { left: 0, top: 0, width: 0, height: 0 }));

    const enteringEl = document.createElement('div');
    enteringEl.appendChild(heroElement(postHeroId('1'), { left: 0, top: 0, width: 100, height: 100 }));

    const animation = postHeroTransition(baseEl, { baseEl, enteringEl, leavingEl });

    expect(animation.getDuration()).not.toBe(HERO_DURATION);
  });

  it('falls back to the platform default transition when there is no leaving page at all', () => {
    const baseEl = document.createElement('div');
    const enteringEl = document.createElement('div');
    enteringEl.appendChild(heroElement(postHeroId('1'), { left: 0, top: 0, width: 100, height: 100 }));

    const animation = postHeroTransition(baseEl, { baseEl, enteringEl, leavingEl: undefined });

    expect(animation.getDuration()).not.toBe(HERO_DURATION);
  });
});
