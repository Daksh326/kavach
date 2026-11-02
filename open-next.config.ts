import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Kavach's public pages are fully prerendered at build time and never
// revalidated (dynamic data is fetched per request), so a read-only cache
// served from Workers Static Assets is enough: no KV/R2 operations, $0.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
