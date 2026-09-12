import { Injectable } from '@angular/core';
import { InterpolationParameters, TranslateDefaultParser } from '@ngx-translate/core';

/**
 * Matches an entire translation value shaped like an ICU MessageFormat
 * plural block, e.g. `{count, plural, =0 {no comments} =1 {1 comment}
 * other {# comments}}`. Only the whole-string case is supported (no mixed
 * plain text plus an embedded plural block): every key that uses this
 * shape in `en.json`/`fr.json` is nothing but the plural expression itself.
 */
const PLURAL_BLOCK = /^\{\s*(\w+)\s*,\s*plural\s*,\s*([\s\S]*)\}$/;

/** Matches one `key {text}` branch inside a plural block's body. */
const PLURAL_BRANCH = /(=\d+|[a-zA-Z]+)\s*\{([^{}]*)\}/g;

/**
 * `@ngx-translate/core`'s own `TranslateDefaultParser` only understands
 * `{{ paramName }}` interpolation; it has no concept of ICU MessageFormat
 * (`plural`/`select`/`#`). Full ICU support normally comes from a separate
 * compiler package built around the `messageformat` library, but that pair
 * is not in README's Tech Stack table, and this app only needs the narrow
 * plural subset the comments/likes counters use, so this extends the
 * built-in parser (`TranslateParser` is `@ngx-translate/core`'s own
 * extension point for exactly this) with just enough ICU plural handling
 * instead of pulling in a whole MessageFormat runtime for two counters.
 *
 * Every `en.json`/`fr.json` value that is not shaped like a plural block is
 * left to `TranslateDefaultParser`'s normal `{{ }}` interpolation.
 */
@Injectable()
export class IcuPluralTranslateParser extends TranslateDefaultParser {
  override interpolateString(expr: string, params?: InterpolationParameters): string {
    const resolved = params ? this.resolvePlural(expr, params) : expr;
    return super.interpolateString(resolved, params) ?? resolved;
  }

  private resolvePlural(expr: string, params: InterpolationParameters): string {
    const match = expr.match(PLURAL_BLOCK);
    if (!match) {
      return expr;
    }

    const [, argName, branchesSource] = match;
    const count = Number(params[argName]);
    if (Number.isNaN(count)) {
      return expr;
    }

    const branches = new Map<string, string>();
    for (const branchMatch of branchesSource.matchAll(PLURAL_BRANCH)) {
      branches.set(branchMatch[1], branchMatch[2]);
    }

    const selected = branches.get(`=${count}`) ?? branches.get('other') ?? '';
    return selected.replace(/#/g, String(count));
  }
}
