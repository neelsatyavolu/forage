import { describe, expect, it, vi } from "vitest";
import { resetEmail, resetLink, sendResetLink } from "./reset-mail";

describe("reset email", () => {
  it("links to the configured site with the token", () => {
    expect(resetLink("https://forage.xanom.co", "abc_123")).toBe("https://forage.xanom.co/reset?token=abc_123");
  });

  it("escapes the link in HTML and includes it in text", () => {
    const mail = resetEmail('https://x.test/reset?token=a"b');
    expect(mail.html).toContain("token=a&quot;b");
    expect(mail.html).not.toContain('a"b');
    expect(mail.text).toContain('https://x.test/reset?token=a"b');
    expect(mail.subject).toBe("Reset your Forage password");
  });

  it("sends through Resend from the verified domain", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    await sendResetLink("ada@example.com", "https://forage.xanom.co/reset?token=t", "re_key", fetchImpl);
    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)).toMatchObject({ from: "Forage <no-reply@n3el.dev>", to: ["ada@example.com"] });
  });

  it("prints instead of sending without a key", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await sendResetLink("ada@example.com", "https://x/reset?token=t", undefined, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });
});
