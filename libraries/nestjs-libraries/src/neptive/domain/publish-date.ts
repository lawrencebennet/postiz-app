// Publish date of an approved post. Pure, no I/O.
//
// When the client approves after the planned date, the post must not go out
// "now" at a random hour: it moves to the next occurrence of the same wall-clock
// time in Europe/Rome (DST aware), then it is scheduled.

export const NEPTIVE_TIME_ZONE = 'Europe/Rome';

type Wall = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallFormatter(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function wallAt(instant: number, timeZone: string): Wall {
  const parts: Record<string, number> = {};
  for (const part of wallFormatter(timeZone).formatToParts(new Date(instant))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Offset of the zone at an instant, in ms (Rome: +1h winter, +2h summer). */
function offsetAt(instant: number, timeZone: string) {
  const wall = wallAt(instant, timeZone);
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second
  );
  // the formatter has no milliseconds: compare on whole seconds
  return asUtc - Math.floor(instant / 1000) * 1000;
}

const HOUR = 3600 * 1000;

/**
 * Instants on calendar day (year, month, day) of `timeZone` whose wall clock is
 * hh:mm:ss.ms. 2 on a fall-back day for the repeated hour, sorted. For a time
 * skipped by the spring-forward gap, the time shifted forward by the gap
 * (02:30 -> 03:30), like Temporal's 'compatible' disambiguation.
 */
function instantsForWallTime(
  date: { year: number; month: number; day: number },
  time: { hour: number; minute: number; second: number; ms: number },
  timeZone: string
): number[] {
  const naive = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    time.hour,
    time.minute,
    time.second,
    time.ms
  );
  const before = offsetAt(naive - 24 * HOUR, timeZone);
  const after = offsetAt(naive + 24 * HOUR, timeZone);
  const found = new Set<number>();
  for (const offset of [before, after]) {
    const candidate = naive - offset;
    const wall = wallAt(candidate, timeZone);
    if (
      wall.year === date.year &&
      wall.month === date.month &&
      wall.day === date.day &&
      wall.hour === time.hour &&
      wall.minute === time.minute &&
      wall.second === time.second
    ) {
      found.add(candidate);
    }
  }
  if (!found.size) {
    // inside the gap: read the wall time with the offset in force before it
    found.add(naive - before);
  }
  return Array.from(found).sort((a, b) => a - b);
}

/**
 * `publishDate` if it is still strictly in the future, otherwise the first
 * instant after `now` with the same wall-clock time (h:m:s.ms) in `timeZone`.
 */
export function nextPublishDate(
  publishDate: Date,
  now: Date,
  timeZone: string = NEPTIVE_TIME_ZONE
): { date: Date; moved: boolean } {
  const planned = publishDate?.getTime?.();
  const current = now?.getTime?.();
  if (!Number.isFinite(planned) || !Number.isFinite(current)) {
    throw new Error('Invalid publish date');
  }
  if (planned > current) {
    return { date: new Date(planned), moved: false };
  }
  const plannedWall = wallAt(planned, timeZone);
  const time = {
    hour: plannedWall.hour,
    minute: plannedWall.minute,
    second: plannedWall.second,
    ms: ((planned % 1000) + 1000) % 1000,
  };
  const today = wallAt(current, timeZone);
  for (let offset = 0; offset <= 2; offset++) {
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const next = instantsForWallTime(
      {
        year: day.getUTCFullYear(),
        month: day.getUTCMonth() + 1,
        day: day.getUTCDate(),
      },
      time,
      timeZone
    ).find((instant) => instant > current);
    if (next !== undefined) {
      return { date: new Date(next), moved: true };
    }
  }
  // unreachable for real zones: a wall time occurs at least once every day
  throw new Error('Could not compute the next publish date');
}

const labelFormatter = new Intl.DateTimeFormat('it-IT', {
  timeZone: NEPTIVE_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('it-IT', {
  timeZone: NEPTIVE_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "24 novembre 2026 alle 10:00" on the Rome clock. */
export function romeDateTimeLabel(date: Date) {
  return `${labelFormatter.format(date)} alle ${timeFormatter.format(date)}`;
}
