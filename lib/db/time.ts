/** Epoch milliseconds to a timestamptz parameter. */
export const toTs = (ms: number): string => new Date(ms).toISOString();

/** A timestamptz from either driver (Date or string) to epoch milliseconds. */
export const fromTs = (value: unknown): number => new Date(value as string | Date).getTime();
