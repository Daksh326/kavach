import "server-only";
import { deleteObject, isStorageConfigured, listObjects } from "@/lib/storage/r2";
import { createAdminClient } from "@/lib/supabase/admin";

const QUEUE_BATCH = 500;
const ORPHAN_MIN_AGE_MS = 24 * 3600 * 1000; // never touch uploads still in progress
const AI_CACHE_DAYS = 30;

export type DailyJobResult = {
  heartbeat: unknown;
  r2Queue: { purged: number; failed: number } | "skipped";
  orphans: { scanned: number; deleted: number } | "skipped";
  aiCacheDeleted: number;
  errors: string[];
};

/**
 * Daily maintenance (Cron Trigger -> custom-worker.ts -> /api/cron/daily).
 * Every step is independent: one failing doesn't stop the others.
 */
export async function runDailyJob(): Promise<DailyJobResult> {
  const admin = createAdminClient();
  const errors: string[] = [];
  const result: DailyJobResult = {
    heartbeat: null,
    r2Queue: "skipped",
    orphans: "skipped",
    aiCacheDeleted: 0,
    errors,
  };

  // 1) Keep the Supabase free project active (it pauses after 7 idle days).
  const hb = await admin.rpc("cron_heartbeat");
  if (hb.error) errors.push(`heartbeat: ${hb.error.code}`);
  result.heartbeat = hb.data;

  if (isStorageConfigured()) {
    // 2) Purge R2 objects whose evidence rows were deleted (retry queue).
    try {
      const { data: queued } = await admin
        .from("r2_deletion_queue")
        .select("r2_key, attempts")
        .order("queued_at")
        .limit(QUEUE_BATCH);
      let purged = 0;
      let failed = 0;
      for (const q of queued ?? []) {
        let okDelete = false;
        let msg = "";
        try {
          okDelete = await deleteObject(q.r2_key);
        } catch (e) {
          msg = e instanceof Error ? e.message.slice(0, 200) : "error";
        }
        if (okDelete) {
          await admin.from("r2_deletion_queue").delete().eq("r2_key", q.r2_key);
          purged++;
        } else {
          await admin
            .from("r2_deletion_queue")
            .update({ attempts: q.attempts + 1, last_error: msg || "delete failed" })
            .eq("r2_key", q.r2_key);
          failed++;
        }
      }
      result.r2Queue = { purged, failed };
    } catch (e) {
      errors.push(`r2Queue: ${e instanceof Error ? e.message : e}`);
    }

    // 3) Orphans: uploaded to R2 but never confirmed (no evidence row), older than a day.
    try {
      const objects = await listObjects("evidence/", 1000);
      const cutoff = Date.now() - ORPHAN_MIN_AGE_MS;
      const old = objects.filter((o) => o.lastModified.getTime() < cutoff).map((o) => o.key);
      let deleted = 0;
      for (let i = 0; i < old.length; i += 100) {
        const batch = old.slice(i, i + 100);
        const { data: known } = await admin.from("evidence").select("r2_key").in("r2_key", batch);
        const knownSet = new Set((known ?? []).map((k) => k.r2_key));
        for (const key of batch.filter((k) => !knownSet.has(k))) {
          if (await deleteObject(key).catch(() => false)) deleted++;
        }
      }
      result.orphans = { scanned: objects.length, deleted };
    } catch (e) {
      errors.push(`orphans: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 4) Data minimisation: anonymous AI cache rows expire after 30 days.
  const cutoff = new Date(Date.now() - AI_CACHE_DAYS * 86_400_000).toISOString();
  const del = await admin
    .from("ai_analyses")
    .delete({ count: "exact" })
    .is("user_id", null)
    .lt("created_at", cutoff);
  if (del.error) errors.push(`aiCache: ${del.error.code}`);
  result.aiCacheDeleted = del.count ?? 0;

  return result;
}
