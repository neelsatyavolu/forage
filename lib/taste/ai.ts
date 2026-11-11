import type { z } from "zod";

/**
 * A connected AI, as feature code sees it: system + prompt in, JSON parsed by
 * `schema` out. In the app it wraps lib/ai complete() for the signed-in user;
 * tests pass a fake. Null means no AI is connected.
 */
export type AskAi = <T>(req: { system: string; prompt: string; schema: z.ZodType<T> }) => Promise<T>;
