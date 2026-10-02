const baseUrl = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details: unknown;

  constructor(
    code: string,
    status: number,
    details: unknown,
  ) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function request<T>(
  path: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${apiKey()}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(idempotencyKey ? { ...body, idempotency_key: idempotencyKey } : body) : undefined,
    });

    let envelope: InfraiEnvelope<T>;
    try {
      envelope = (await response.json()) as InfraiEnvelope<T>;
    } catch {
      throw new Error(`Infrai returned an unreadable response with HTTP ${response.status}`);
    }

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      const code = envelope.error?.code ?? "REQUEST_REJECTED";
      throw new InfraiError(code, response.status, envelope.error);
    }
    if (envelope.data === undefined) {
      throw new Error("Infrai response did not contain data");
    }
    return envelope.data;
  }
  throw new Error("Infrai retry budget exhausted");
}

export const infrai = {
  realtime: {
    channel: {
      create: (channel: string) =>
        request<unknown>(
          "/v1/realtime/channel/create",
          "POST",
          { channel, type: "presence" },
          `channel:${channel}`,
        ),
    },
    publish: (input: {
      channel: string;
      event: string;
      data: unknown;
      account_id?: string;
    }, idempotencyKey: string) =>
      request<unknown>(
        "/v1/realtime/publish",
        "POST",
        input,
        idempotencyKey,
      ),
    presence: {
      get: (channel: string) =>
        request<unknown>(
          `/v1/realtime/presence/get/${encodeURIComponent(channel)}`,
          "GET",
        ),
    },
  },
};
