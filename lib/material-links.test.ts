import { describe, expect, it } from "vitest";
import { materialActions, materialTypeLabel } from "./material-links";

// M4-S4: the pure inline-action mapping (view/download hrefs + labels).

const base = {
  id: "item1",
  sourceType: null as string | null,
  mimeType: null as string | null,
  driveFileId: null as string | null,
  externalUrl: null as string | null,
  downloadEnabled: false,
};

describe("materialActions", () => {
  it("upload: view via the content proxy; download only when enabled", () => {
    const noDl = materialActions({ ...base, sourceType: "upload", downloadEnabled: false });
    expect(noDl.viewHref).toBe("/api/materials/item1/content");
    expect(noDl.downloadHref).toBeNull();

    const withDl = materialActions({ ...base, sourceType: "upload", downloadEnabled: true });
    expect(withDl.downloadHref).toBe("/api/materials/item1/content?download=1");
  });

  it("download-hidden-when-disabled across sources", () => {
    expect(materialActions({ ...base, sourceType: "upload" }).downloadHref).toBeNull();
    expect(
      materialActions({ ...base, sourceType: "drive", driveFileId: "d1" }).downloadHref,
    ).toBeNull();
  });

  it("drive: view + download link out to Google Drive", () => {
    const a = materialActions({
      ...base,
      sourceType: "drive",
      driveFileId: "d1",
      downloadEnabled: true,
    });
    expect(a.viewHref).toContain("drive.google.com/file/d/d1");
    expect(a.downloadHref).toContain("export=download");
  });

  it("url: opens the external link, never a download", () => {
    const a = materialActions({
      ...base,
      sourceType: "url",
      externalUrl: "https://example.com/x",
      downloadEnabled: true,
    });
    expect(a.viewHref).toBe("https://example.com/x");
    expect(a.downloadHref).toBeNull();
  });
});

describe("materialTypeLabel", () => {
  it("maps source + mime to a friendly label", () => {
    expect(materialTypeLabel({ sourceType: "drive", mimeType: null })).toBe("Google Drive");
    expect(materialTypeLabel({ sourceType: "url", mimeType: null })).toBe("Link");
    expect(materialTypeLabel({ sourceType: "upload", mimeType: "application/pdf" })).toBe("PDF");
    expect(materialTypeLabel({ sourceType: "upload", mimeType: "image/png" })).toBe("Image");
  });
});
