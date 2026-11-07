import type { Instrumentation } from "next";

/** Server errors (render, route handlers, Server Actions, proxy) -> Sentry. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { captureServerError } = await import("@/lib/monitoring/server");
  captureServerError(err, { path: request.path, kind: context.routeType });
};
