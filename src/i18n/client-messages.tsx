import type { ReactNode } from "react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { getMessages } from "next-intl/server";

type Tree = { [k: string]: string | Tree };

/** Copy only the given (dotted) namespaces out of the full catalog. */
export function pickMessages(
  messages: AbstractIntlMessages,
  namespaces: string[],
): AbstractIntlMessages {
  const out: Tree = {};
  for (const ns of namespaces) {
    const parts = ns.split(".");
    let src: unknown = messages;
    for (const p of parts) src = (src as Tree | undefined)?.[p];
    if (src === undefined) continue;
    let dst = out;
    parts.slice(0, -1).forEach((p) => (dst = (dst[p] ??= {}) as Tree));
    dst[parts.at(-1)!] = src as Tree;
  }
  return out;
}

/**
 * Sends ONLY the listed namespaces to the browser for the client components
 * below it. Without this, every page would ship the whole catalog (~80 KB per
 * language) inside its HTML, which hurts on slow connections.
 * Server Components don't need this: they translate on the server.
 */
export async function ClientMessages({
  namespaces,
  children,
}: {
  namespaces: string[];
  children: ReactNode;
}) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pickMessages(messages, namespaces)}>
      {children}
    </NextIntlClientProvider>
  );
}
