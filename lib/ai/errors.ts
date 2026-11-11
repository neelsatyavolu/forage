/** Why an AI call could not give an answer. The message is safe to show the user. */
export type AiErrorCode = "not_connected" | "rate_limited" | "bad_output" | "upstream";

const STATUS: Record<AiErrorCode, number> = { not_connected: 401, rate_limited: 429, bad_output: 502, upstream: 502 };

export class AiError extends Error {
  readonly status: number;
  constructor(readonly code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiError";
    this.status = STATUS[code];
  }
}
