import { assertSegment } from './util.js';

const AVATAR_BASE_URL = 'https://sleepercdn.com/avatars';

/**
 * Full-size image URL for a Sleeper avatar ID (`User.avatar`, `League.avatar`).
 * A custom team avatar in `LeagueUser.metadata.avatar` is already a full URL.
 *
 * @throws {RangeError} If `avatarId` is empty, `.` or `..`.
 *
 * @example
 * ```ts
 * const user = await client.users.get('johndoe');
 * if (user.avatar) img.src = avatarUrl(user.avatar);
 * ```
 */
export function avatarUrl(avatarId: string): string {
  assertSegment(avatarId);
  return `${AVATAR_BASE_URL}/${encodeURIComponent(avatarId)}`;
}

/**
 * Thumbnail image URL for a Sleeper avatar ID.
 *
 * @throws {RangeError} If `avatarId` is empty, `.` or `..`.
 */
export function avatarThumbnailUrl(avatarId: string): string {
  assertSegment(avatarId);
  return `${AVATAR_BASE_URL}/thumbs/${encodeURIComponent(avatarId)}`;
}
