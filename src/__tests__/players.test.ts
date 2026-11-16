import { describe, it, expect } from 'vitest';
import { SleeperClient } from '../client.js';
import { BASE, stubFetch } from './helpers.js';

describe('players.getAll', () => {
  it('rejects an empty position without fetching', async () => {
    const fetchMock = stubFetch();
    await expect(new SleeperClient().players.getAll({ position: '' })).rejects.toThrow(RangeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends position alone', async () => {
    const fetchMock = stubFetch();
    await new SleeperClient().players.getAll({ position: 'DEF' });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/players/nfl?position=DEF`);
  });

  it('keeps no state: every call makes a request', async () => {
    const fetchMock = stubFetch();
    const client = new SleeperClient();
    await Promise.all([client.players.getAll(), client.players.getAll()]);
    await client.players.getAll();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('players.getTrending', () => {
  it.each([[{ limit: 0 }], [{ limit: 2.5 }], [{ lookbackHours: -1 }], [{ lookbackHours: 1.5 }]])(
    'rejects %o without fetching',
    async (options) => {
      const fetchMock = stubFetch();
      await expect(new SleeperClient().players.getTrending('add', options)).rejects.toThrow(
        RangeError,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
