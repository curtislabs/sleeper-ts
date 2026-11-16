/** Pure helpers shared by the transport, the namespaces and the avatar helpers. */

/** Largest delay `setTimeout` honours; anything above it fires after 1 ms. */
export const MAX_TIMER_MS = 2_147_483_647;

/** Throw unless `value` can be one URL path segment (not empty, `.` or `..`). */
export function assertSegment(value: string): void {
  if (value === '' || value === '.' || value === '..') {
    throw new RangeError(`Invalid path segment ${JSON.stringify(value)}`);
  }
}

/**
 * Build a URL path, percent-encoding every interpolated value so an ID or
 * username always stays one path segment: it can never add segments, a query
 * string or a fragment.
 *
 * @throws {RangeError} If a value is empty, `.` or `..`, which no encoding can
 *   keep inside one segment (URL parsing resolves `.` and `..`).
 *
 * @example
 * ```ts
 * path`/user/${'a/b'}`; // "/user/a%2Fb"
 * ```
 */
export function path(strings: TemplateStringsArray, ...values: (string | number)[]): string {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const value = String(values[i]);
    assertSegment(value);
    out += encodeURIComponent(value) + strings[i + 1];
  }
  return out;
}

/**
 * Check a millisecond option. Non-numbers, `NaN` and negative numbers are
 * rejected; `Infinity` is allowed only when `allowInfinity` is set.
 */
export function assertMs(name: string, value: unknown, allowInfinity: boolean): void {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative number, got ${String(value)}`);
  }
  if (!allowInfinity && !Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite, got ${String(value)}`);
  }
}

/** Check that a value is an integer of at least 1. */
export function assertPositiveInt(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer, got ${String(value)}`);
  }
}

/** Check that a value is an integer of at least 0. */
export function assertNonNegativeInt(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${String(value)}`);
  }
}

/**
 * Check that an options argument is an object (or omitted). Catches plain
 * JavaScript calls with the wrong argument shape, such as `state.get('nba')`,
 * which TypeScript would reject at compile time.
 */
export function assertOptions(name: string, value: unknown, required = false): void {
  if (value === undefined && !required) return;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an options object, got ${JSON.stringify(value)}`);
  }
}

/**
 * A JSON number of 16+ digits in value position: at the start of the text or
 * after `[`, `:` or `,`, and followed by `,`, `}`, `]` or the end. Digits
 * inside strings (such as `"channel_id":"1116853254748110848"`) don't match.
 */
const LONG_INTEGER = /(?:^|[[:,])\s*-?\d{16,}\s*(?:[,}\]]|$)/;

/** A JSON number literal that is a plain integer (no fraction or exponent). */
const INTEGER_LITERAL = /^-?\d+$/;

/**
 * Parse JSON, keeping every integer literal beyond `Number.MAX_SAFE_INTEGER`
 * as its exact source text. Sleeper sends some 64-bit IDs as JSON numbers,
 * which `JSON.parse` would round (`1312110541900103680` becomes `…103700`).
 * Floats such as `1e21` stay numbers. The reviver only runs when a 16+ digit
 * run appears in the text, so ordinary responses (including the 15 MB player
 * list) parse at full speed.
 */
export function parseJson(text: string): unknown {
  if (!LONG_INTEGER.test(text)) return JSON.parse(text);
  return JSON.parse(text, (_key, value: unknown, context?: { source?: string }) => {
    if (typeof value !== 'number' || Number.isSafeInteger(value)) return value;
    const source = context?.source;
    return source !== undefined && INTEGER_LITERAL.test(source) ? source : value;
  });
}
