/**
 * Minimal Sentry client (browser + Worker). Sends events through Sentry's
 * public envelope HTTP API instead of the official SDK, which would cost a
 * large share of the Worker's 3 MiB free-plan budget.
 *
 * Privacy: no user, no IP, no request bodies, no query strings, and
 * messages/stack text are scrubbed of emails and numbers before sending.
 * (Also enable "Prevent storing IP addresses" in the Sentry project.)
 */
export type Dsn = { publicKey: string; envelopeUrl: string; raw: string };

export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!u.username || !projectId) return null;
    return {
      publicKey: u.username,
      envelopeUrl: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
      raw: dsn,
    };
  } catch {
    return null;
  }
}

/** Remove things that could identify a person from free text. */
export function scrubText(s: string): string {
  return s
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/[a-z0-9._-]{2,64}@[a-z]{2,32}\b/gi, "[upi]")
    .replace(/\+?\d[\d\s-]{7,}\d/g, "[number]")
    .replace(/\?[^\s)]*/g, "?[query]")
    .slice(0, 2000);
}

type Frame = {
  filename?: string;
  function?: string;
  lineno?: number;
  colno?: number;
  in_app?: boolean;
};

/** Parse V8/SpiderMonkey/JSC stack strings into Sentry frames (oldest first). */
export function parseStack(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const line of stack.split("\n").slice(0, 50)) {
    const v8 = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    const ff = /^(.*?)@(.+?):(\d+):(\d+)$/.exec(line);
    const m = v8 ?? ff;
    if (!m) continue;
    const filename = scrubText(m[2]);
    frames.push({
      function: m[1] || "?",
      filename,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !filename.includes("node_modules"),
    });
  }
  return frames.reverse();
}

export type EventInput = {
  error: unknown;
  platform: "javascript" | "node";
  environment: string;
  /** Path only, no query string. */
  path?: string;
  tags?: Record<string, string>;
};

const uuid32 = () => crypto.randomUUID().replace(/-/g, "");

export function buildEvent(input: EventInput) {
  const err = input.error instanceof Error ? input.error : new Error(String(input.error));
  return {
    event_id: uuid32(),
    timestamp: Date.now() / 1000,
    platform: input.platform,
    level: "error",
    environment: input.environment,
    tags: input.tags,
    transaction: input.path ? scrubText(input.path) : undefined,
    exception: {
      values: [
        {
          type: err.name || "Error",
          value: scrubText(err.message || ""),
          stacktrace: { frames: parseStack(err.stack) },
        },
      ],
    },
  };
}

export function buildEnvelope(dsn: Dsn, event: ReturnType<typeof buildEvent>): string {
  return [
    JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString(), dsn: dsn.raw }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
}

export function sendEnvelope(dsn: Dsn, body: string): Promise<unknown> {
  return fetch(dsn.envelopeUrl, {
    method: "POST",
    keepalive: true,
    headers: {
      "content-type": "application/x-sentry-envelope",
      "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=kavach-lite/1.0`,
    },
    body,
  }).catch(() => undefined);
}
