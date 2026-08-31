import { describe, expect, it } from "vitest";
import { buildLinkOptions, normalizeLinkUrl, savedLinkName } from "./saved-links";

describe("normalizeLinkUrl", () => {
  it("keeps a plain http(s) url", () => {
    expect(normalizeLinkUrl(" https://youtu.be/abc ")).toBe("https://youtu.be/abc");
    expect(normalizeLinkUrl("http://example.com/x")).toBe("http://example.com/x");
  });

  it("assumes https when the scheme is missing", () => {
    expect(normalizeLinkUrl("youtube.com/watch?v=1")).toBe("https://youtube.com/watch?v=1");
  });

  it("rejects empty input and non-http schemes", () => {
    expect(normalizeLinkUrl("   ")).toBeNull();
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("data:text/html,<b>x</b>")).toBeNull();
    expect(normalizeLinkUrl("ftp://example.com/f")).toBeNull();
  });

  it("rejects an over-long url instead of truncating it into something else", () => {
    expect(normalizeLinkUrl(`https://example.com/${"a".repeat(600)}`)).toBeNull();
  });
});

describe("savedLinkName", () => {
  it("prefers what the user typed", () => {
    expect(savedLinkName("  Shoulder warm-up ", "https://youtu.be/abc")).toBe("Shoulder warm-up");
  });

  it("falls back to a friendly host name", () => {
    expect(savedLinkName("", "https://www.youtube.com/watch?v=1")).toBe("YouTube");
    expect(savedLinkName(null, "https://mobilitywod.example/x")).toBe("mobilitywod.example");
  });

  it("clamps to the stored length", () => {
    expect(savedLinkName("n".repeat(200), "https://example.com")).toHaveLength(60);
  });
});

describe("buildLinkOptions", () => {
  const own = [
    { id: "b", label: "Banded warm-up", url: "https://a.example/b" },
    { id: "a", label: "ankle drills", url: "https://a.example/a" },
  ];
  const shared = [
    { id: "t1", label: "Team mobility", url: "https://t.example/1", ownerName: "Nando" },
    { id: "t2", label: "Cool-down", url: "https://t.example/2", ownerName: "Mia" },
  ];

  it("lists own links first, each group sorted case-insensitively", () => {
    const options = buildLinkOptions(own, shared, true);
    expect(options.map((o) => o.id)).toEqual(["a", "b", "t2", "t1"]);
    expect(options[2]?.sharedBy).toBe("Mia");
    expect(options[0]?.sharedBy).toBeUndefined();
  });

  it("hides team links when the member turned them off", () => {
    expect(buildLinkOptions(own, shared, false).map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("never shows a url twice", () => {
    const dupes = [
      { id: "t3", label: "Same link", url: "https://a.example/a", ownerName: "Nando" },
      { id: "t4", label: "Also same", url: "https://t.example/1", ownerName: "Mia" },
      { id: "t5", label: "Team mobility", url: "https://t.example/1", ownerName: "Linus" },
    ];
    expect(buildLinkOptions(own, dupes, true).map((o) => o.id)).toEqual(["a", "b", "t4"]);
  });
});
