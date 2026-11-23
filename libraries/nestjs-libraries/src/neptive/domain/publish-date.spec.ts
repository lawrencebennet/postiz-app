import { nextPublishDate, romeDateTimeLabel } from './publish-date';

const at = (iso: string) => new Date(iso);

describe('nextPublishDate (Europe/Rome)', () => {
  it('keeps a date that is still in the future', () => {
    const result = nextPublishDate(at('2026-11-25T09:00:00.000Z'), at('2026-11-23T10:00:00.000Z'));
    expect(result).toEqual({ date: at('2026-11-25T09:00:00.000Z'), moved: false });
  });

  it('past date, the same Rome hour is still ahead today -> today at that hour', () => {
    // 10:00 Rome on the 20th, approved at 09:00 Rome on the 23rd
    const result = nextPublishDate(at('2026-11-20T09:00:00.000Z'), at('2026-11-23T08:00:00.000Z'));
    expect(result).toEqual({ date: at('2026-11-23T09:00:00.000Z'), moved: true });
  });

  it('past date, the hour already passed today -> tomorrow at that hour', () => {
    const result = nextPublishDate(at('2026-11-20T09:00:00.000Z'), at('2026-11-23T11:00:00.000Z'));
    expect(result).toEqual({ date: at('2026-11-24T09:00:00.000Z'), moved: true });
  });

  it('a date equal to now counts as passed (never publishes "now")', () => {
    const now = at('2026-11-23T09:00:00.000Z');
    const result = nextPublishDate(at('2026-11-23T09:00:00.000Z'), now);
    expect(result).toEqual({ date: at('2026-11-24T09:00:00.000Z'), moved: true });
  });

  it('keeps seconds and milliseconds of the original time', () => {
    const result = nextPublishDate(at('2026-11-20T09:15:30.250Z'), at('2026-11-23T11:00:00.000Z'));
    expect(result.date.toISOString()).toBe('2026-11-24T09:15:30.250Z');
  });

  it('uses the Rome wall clock, not the UTC offset, across the spring change (CET -> CEST)', () => {
    // 10:00 CET on 20 March = 09:00Z; next 10:00 after 09:00 CEST on 30 March is 10:00 CEST = 08:00Z
    const result = nextPublishDate(at('2026-03-20T09:00:00.000Z'), at('2026-03-30T07:00:00.000Z'));
    expect(result.date.toISOString()).toBe('2026-03-30T08:00:00.000Z');
  });

  it('uses the Rome wall clock across the autumn change (CEST -> CET)', () => {
    // 10:00 CEST on 20 October = 08:00Z; on 26 October 10:00 CET = 09:00Z
    const result = nextPublishDate(at('2026-10-20T08:00:00.000Z'), at('2026-10-26T08:00:00.000Z'));
    expect(result.date.toISOString()).toBe('2026-10-26T09:00:00.000Z');
  });

  it('an hour that does not exist on the spring-forward day moves forward by the gap', () => {
    // 02:30 Rome does not exist on 29 March 2026 (02:00 -> 03:00): 03:30 CEST = 01:30Z
    const result = nextPublishDate(at('2026-03-20T01:30:00.000Z'), at('2026-03-29T00:00:00.000Z'));
    expect(result.date.toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  it('an hour that happens twice on the fall-back day: the first one still ahead', () => {
    // 02:30 Rome happens at 00:30Z (CEST) and 01:30Z (CET) on 25 October 2026
    const publish = at('2026-10-20T00:30:00.000Z'); // 02:30 CEST
    expect(nextPublishDate(publish, at('2026-10-25T00:00:00.000Z')).date.toISOString()).toBe(
      '2026-10-25T00:30:00.000Z'
    );
    expect(nextPublishDate(publish, at('2026-10-25T00:45:00.000Z')).date.toISOString()).toBe(
      '2026-10-25T01:30:00.000Z'
    );
  });

  it('the result is always strictly after now', () => {
    const now = at('2026-11-23T23:59:59.000Z');
    for (const iso of ['2026-01-01T00:00:00.000Z', '2026-06-15T22:59:59.000Z', '2025-12-31T23:00:00.000Z']) {
      const { date } = nextPublishDate(at(iso), now);
      expect(date.getTime()).toBeGreaterThan(now.getTime());
      expect(date.getTime() - now.getTime()).toBeLessThanOrEqual(25 * 3600 * 1000);
    }
  });

  it('refuses an invalid date instead of guessing one', () => {
    expect(() => nextPublishDate(new Date('nope'), at('2026-11-23T10:00:00.000Z'))).toThrow();
  });
});

describe('romeDateTimeLabel', () => {
  it('formats in Italian on the Rome clock', () => {
    expect(romeDateTimeLabel(at('2026-11-24T09:00:00.000Z'))).toBe('24 novembre 2026 alle 10:00');
    expect(romeDateTimeLabel(at('2026-07-01T16:05:00.000Z'))).toBe('1 luglio 2026 alle 18:05');
  });
});
