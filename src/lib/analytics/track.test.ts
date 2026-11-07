import { describe, expect, it } from "vitest";
import { cleanPath } from "./track";

describe("cleanPath", () => {
  it("drops query strings and replaces ids", () => {
    expect(cleanPath("/en/check?q=9876543210")).toBe("/en/check");
    expect(cleanPath("/hi/report/3f2a9c10-1234-4abc-8def-0123456789ab")).toBe("/hi/report/:id");
  });
});
