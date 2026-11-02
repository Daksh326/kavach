/**
 * Uniform Server Action return type. `error` is a message KEY (translated on
 * the client), never a raw upstream error, so internals don't leak to users.
 */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (error: string): ActionResult<never> => ({ ok: false, error });
