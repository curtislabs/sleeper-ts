import { describe, it, expect } from 'vitest';
import { avatarUrl, avatarThumbnailUrl } from '../avatars.js';

describe('avatars', () => {
  it('builds full-size and thumbnail URLs', () => {
    expect(avatarUrl('abc123')).toBe('https://sleepercdn.com/avatars/abc123');
    expect(avatarThumbnailUrl('abc123')).toBe('https://sleepercdn.com/avatars/thumbs/abc123');
  });

  it('encodes the avatar ID', () => {
    expect(avatarUrl('a/b')).toBe('https://sleepercdn.com/avatars/a%2Fb');
    expect(avatarThumbnailUrl('a?b')).toBe('https://sleepercdn.com/avatars/thumbs/a%3Fb');
  });

  it.each(['', '.', '..'])('rejects %j', (id) => {
    expect(() => avatarUrl(id)).toThrow(RangeError);
    expect(() => avatarThumbnailUrl(id)).toThrow(RangeError);
  });
});
