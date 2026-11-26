import { describe, it, expect } from "vitest";

// Mirror the redaction logic from src/app/api/usage/request-details/route.js
// so we can test it in isolation. Full payloads are the default; redaction is
// opt-in via REDACT_REQUEST_PAYLOADS === "true".
const REDACT_KEYS = ["request", "providerRequest", "providerResponse", "response"];

function redactDetails(details, redactEnabled) {
  if (!redactEnabled) return details || [];
  return (details || []).map((d) => {
    const redacted = { ...d };
    for (const key of REDACT_KEYS) {
      if (redacted[key] !== undefined) {
        redacted[key] = { redacted: true };
      }
    }
    return redacted;
  });
}

function sampleDetails() {
  return [{
    id: "abc",
    provider: "opencode",
    model: "deepseek-v4-flash-free",
    timestamp: "2026-08-05T00:00:00Z",
    status: "success",
    tokens: { prompt_tokens: 10, completion_tokens: 5 },
    request: { messages: [{ role: "user", content: "secret prompt" }] },
    providerRequest: { messages: [{ role: "user", content: "secret prompt" }] },
    providerResponse: { choices: [{ message: { content: "secret answer" } }] },
    response: { content: "secret answer" },
  }];
}

describe("request-details payload visibility", () => {
  it("keeps full payloads by default (no redaction)", () => {
    const details = sampleDetails();
    const out = redactDetails(details, false)[0];
    expect(out.request).toEqual(details[0].request);
    expect(out.providerRequest).toEqual(details[0].providerRequest);
    expect(out.providerResponse).toEqual(details[0].providerResponse);
    expect(out.response).toEqual(details[0].response);
    expect(out.tokens).toEqual({ prompt_tokens: 10, completion_tokens: 5 });
  });

  it("handles empty / null details", () => {
    expect(redactDetails([], false)).toEqual([]);
    expect(redactDetails(null, false)).toEqual([]);
    expect(redactDetails([], true)).toEqual([]);
  });

  it("redacts conversation payloads when explicitly enabled", () => {
    const out = redactDetails(sampleDetails(), true)[0];
    expect(out.id).toBe("abc");
    expect(out.tokens).toEqual({ prompt_tokens: 10, completion_tokens: 5 });
    expect(out.request).toEqual({ redacted: true });
    expect(out.providerRequest).toEqual({ redacted: true });
    expect(out.providerResponse).toEqual({ redacted: true });
    expect(out.response).toEqual({ redacted: true });
  });
});
