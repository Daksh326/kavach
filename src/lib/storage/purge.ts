import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteObject, isStorageConfigured } from "./r2";

/**
 * Deletes R2 objects whose evidence rows are already gone, and clears them
 * from r2_deletion_queue. Anything that fails stays queued for the daily
 * cron, so deletion is eventually guaranteed even if R2 is briefly down.
 */
export async function purgeR2Keys(keys: string[]): Promise<{ purged: number; pending: number }> {
  if (keys.length === 0 || !isStorageConfigured()) return { purged: 0, pending: keys.length };
  const admin = createAdminClient();
  const done: string[] = [];
  for (const key of keys) {
    try {
      if (await deleteObject(key)) done.push(key);
    } catch {
      // stays queued
    }
  }
  if (done.length > 0) {
    await admin.from("r2_deletion_queue").delete().in("r2_key", done);
  }
  return { purged: done.length, pending: keys.length - done.length };
}
