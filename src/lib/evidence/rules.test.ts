import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cleanFileName, hashFile, hexToBase64, isAllowedMime } from "./rules";

describe("evidence rules", () => {
  it("hashes files exactly like Node's crypto (SHA-256 + MD5)", async () => {
    const bytes = new TextEncoder().encode("screenshot bytes ".repeat(5000));
    const { sha256, md5 } = await hashFile(new Blob([bytes]));
    expect(sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(md5).toBe(createHash("md5").update(bytes).digest("hex"));
  });

  it("converts hex digests to base64 for HTTP headers", () => {
    const md5 = createHash("md5").update("x").digest();
    expect(hexToBase64(md5.toString("hex"))).toBe(md5.toString("base64"));
  });

  it("cleans file names", () => {
    expect(cleanFileName("C:\\Users\\me\\Desktop\\scam chat.png")).toBe("scam chat.png");
    expect(cleanFileName('../../etc/"passwd"\u0000')).toBe("passwd");
    expect(cleanFileName("")).toBe("file");
    expect(cleanFileName("x".repeat(300))).toHaveLength(200);
  });

  it("allows only listed MIME types", () => {
    expect(isAllowedMime("image/png")).toBe(true);
    expect(isAllowedMime("text/html")).toBe(false);
    expect(isAllowedMime("application/x-msdownload")).toBe(false);
  });
});
