import { IcuPluralTranslateParser } from './icu-plural-translate-parser';

describe('IcuPluralTranslateParser', () => {
  let parser: IcuPluralTranslateParser;

  beforeEach(() => {
    parser = new IcuPluralTranslateParser();
  });

  it('selects the =0 branch for a zero count', () => {
    const expr = '{count, plural, =0 {No comments} =1 {1 comment} other {# comments}}';

    expect(parser.interpolateString(expr, { count: 0 })).toBe('No comments');
  });

  it('selects the =1 branch for a count of one', () => {
    const expr = '{count, plural, =0 {No comments} =1 {1 comment} other {# comments}}';

    expect(parser.interpolateString(expr, { count: 1 })).toBe('1 comment');
  });

  it('falls back to the other branch and substitutes # with the count', () => {
    const expr = '{count, plural, =0 {No comments} =1 {1 comment} other {# comments}}';

    expect(parser.interpolateString(expr, { count: 5 })).toBe('5 comments');
  });

  it('substitutes every # occurrence within the selected branch', () => {
    const expr = '{count, plural, other {# items (# total)}}';

    expect(parser.interpolateString(expr, { count: 3 })).toBe('3 items (3 total)');
  });

  it('returns the raw expression unchanged when the count param is missing', () => {
    const expr = '{count, plural, =0 {No comments} other {# comments}}';

    expect(parser.interpolateString(expr, {})).toBe(expr);
  });

  it('returns the raw expression unchanged when the count param is not numeric', () => {
    const expr = '{count, plural, =0 {No comments} other {# comments}}';

    expect(parser.interpolateString(expr, { count: 'not-a-number' })).toBe(expr);
  });

  it('leaves a plain interpolation string to the default {{ }} handling', () => {
    const expr = 'Hello {{ name }}';

    expect(parser.interpolateString(expr, { name: 'Ada' })).toBe('Hello Ada');
  });

  it('returns a plain string unchanged when no params are given', () => {
    const expr = 'Hello world';

    expect(parser.interpolateString(expr)).toBe('Hello world');
  });

  it('treats a string that only partially resembles a plural block as plain interpolation', () => {
    const expr = 'some {count, plural, =0 {No comments}} text';

    expect(parser.interpolateString(expr, { count: 0 })).toBe(expr);
  });
});
