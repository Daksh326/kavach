import "server-only";
import { cache } from "react";
import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string | null };

/**
 * Data Access Layer: the ONLY place that decides who the current user is.
 * getClaims() verifies the JWT (locally with asymmetric signing keys, or via
 * the Auth server otherwise). Deduplicated per request with React cache().
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
});

/** Redirects to /login (preserving the destination) when signed out. */
export async function requireUser(nextPath: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const locale = await getLocale();
    return redirect({ href: { pathname: "/login", query: { next: nextPath } }, locale });
  }
  return user;
}

export const getCurrentProfile = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, name, role, language, created_at")
    .eq("id", user.id)
    .single();
  return data;
});

/**
 * Admin pages and actions. Non-admins get a 404 (the admin area's existence
 * isn't advertised). RLS enforces the same rule in the database.
 */
export async function requireAdmin(nextPath: string) {
  const user = await requireUser(nextPath);
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") notFound();
  return user;
}

/** For Server Actions: returns the admin user or null (no redirects). */
export async function getAdminUser(): Promise<SessionUser | null> {
  const [user, profile] = await Promise.all([getCurrentUser(), getCurrentProfile()]);
  return user && profile?.role === "admin" ? user : null;
}
