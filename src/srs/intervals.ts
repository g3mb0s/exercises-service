const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Intervals between successful reviews. Index `stage` (0..5) gives the delay
 * applied after the next successful review; the 6th success graduates the card.
 */
export const WORD_INTERVALS_MS = [2 * HOUR_MS, 1 * DAY_MS, 2 * DAY_MS, 5 * DAY_MS, 10 * DAY_MS, 30 * DAY_MS];
