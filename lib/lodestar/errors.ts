// Errors from talking to Lodestar. The message is safe to show the user.
// not_linked: no link on this account. revoked: Lodestar ended the grant (the
// link has been removed). unauthorized: a fresh token was still refused.
// tool: Lodestar refused the operation (its reason is the message).

export type LodestarErrorCode = "not_linked" | "revoked" | "unauthorized" | "tool" | "upstream";

const STATUS: Record<LodestarErrorCode, number> = { not_linked: 409, revoked: 409, unauthorized: 409, tool: 400, upstream: 502 };

export class LodestarError extends Error {
  readonly status: number;
  constructor(readonly code: LodestarErrorCode, message: string) {
    super(message);
    this.name = "LodestarError";
    this.status = STATUS[code];
  }
}
