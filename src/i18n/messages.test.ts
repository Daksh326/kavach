import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import hi from "../../messages/hi.json";
import { Constants } from "@/lib/supabase/database.types";

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === "string" ? { ...acc, [key]: v } : { ...acc, ...flatten(v, key) };
  }, {});
}

const flatEn = flatten(en as Tree);
const flatHi = flatten(hi as Tree);

/** ICU argument names, e.g. {count, plural, ...} -> count, {email} -> email */
function args(msg: string): string[] {
  return [...msg.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*[,}]/g)].map((m) => m[1]).sort();
}

describe("message catalogs", () => {
  it("en and hi have exactly the same keys", () => {
    expect(Object.keys(flatHi).sort()).toEqual(Object.keys(flatEn).sort());
  });

  it("no message is empty", () => {
    for (const [k, v] of Object.entries({ ...flatEn, ...flatHi })) expect(v.trim(), k).not.toBe("");
  });

  it("en and hi use the same ICU placeholders", () => {
    for (const key of Object.keys(flatEn)) {
      expect([...new Set(args(flatHi[key] ?? ""))], key).toEqual([...new Set(args(flatEn[key]))]);
    }
  });

  it("every scam category and channel enum has a label", () => {
    for (const c of Constants.public.Enums.scam_category)
      expect(flatEn[`categories.${c}`], c).toBeTruthy();
    for (const c of Constants.public.Enums.report_channel)
      expect(flatEn[`channels.${c}`], c).toBeTruthy();
  });
});
