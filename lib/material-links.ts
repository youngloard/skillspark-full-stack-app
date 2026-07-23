import { buildDriveDownloadUrl, buildDriveViewUrl } from "@/lib/drive-urls";

// Pure, client-safe helpers for presenting a material as inline actions
// (M4-S4). View opens in a new tab; Download appears only when downloadEnabled.
// Upload files go through the same-origin content proxy (signed URL hidden);
// Drive/URL materials link out.

export type MaterialLike = {
  id: string;
  sourceType: string | null;
  mimeType: string | null;
  driveFileId: string | null;
  externalUrl: string | null;
  downloadEnabled: boolean;
};

export type MaterialActions = {
  viewHref: string;
  viewLabel: string;
  downloadHref: string | null;
};

export function materialActions(m: MaterialLike): MaterialActions {
  const content = `/api/materials/${m.id}/content`;
  if (m.sourceType === "drive" && m.driveFileId) {
    return {
      viewHref: buildDriveViewUrl(m.driveFileId),
      viewLabel: "View",
      downloadHref: m.downloadEnabled ? buildDriveDownloadUrl(m.driveFileId) : null,
    };
  }
  if (m.sourceType === "url" && m.externalUrl) {
    return { viewHref: m.externalUrl, viewLabel: "Open", downloadHref: null };
  }
  return {
    viewHref: content,
    viewLabel: "View",
    downloadHref: m.downloadEnabled ? `${content}?download=1` : null,
  };
}

export function materialTypeLabel(m: {
  sourceType: string | null;
  mimeType: string | null;
}): string {
  if (m.sourceType === "drive") return "Google Drive";
  if (m.sourceType === "url") return "Link";
  const mt = m.mimeType ?? "";
  if (mt === "application/pdf") return "PDF";
  if (mt.includes("word")) return "Word";
  if (mt.includes("sheet") || mt.includes("excel")) return "Spreadsheet";
  if (mt.includes("presentation") || mt.includes("powerpoint")) return "Slides";
  if (mt.startsWith("image/")) return "Image";
  if (mt === "text/plain") return "Text";
  if (mt.includes("zip")) return "Archive";
  return "File";
}
