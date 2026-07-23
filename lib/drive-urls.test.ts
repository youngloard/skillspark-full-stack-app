import { describe, expect, it } from "vitest";
import {
  buildDriveDownloadUrl,
  buildDriveEmbedUrl,
  buildDriveViewUrl,
  parseDriveFileId,
} from "./drive-urls";

// Pure unit tests — behavior-parity contract with the reference app's parser.

const ID = "1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuV";

describe("parseDriveFileId", () => {
  it("parse-all-drive-url-shapes", () => {
    const cases: Array<[string, string]> = [
      // bare ID
      [ID, ID],
      [`  ${ID}  `, ID],
      // /file/d/{id} with every common suffix
      [`https://drive.google.com/file/d/${ID}/view?usp=sharing`, ID],
      [`https://drive.google.com/file/d/${ID}/preview`, ID],
      [`https://drive.google.com/file/d/${ID}`, ID],
      [`https://drive.google.com/file/d/${ID}?usp=drive_link`, ID],
      [`https://drive.google.com/file/d/${ID}#heading`, ID],
      // /document/d/{id} (Docs links pasted for materials)
      [`https://docs.google.com/document/d/${ID}/edit`, ID],
      // open?id= and uc?id= query forms
      [`https://drive.google.com/open?id=${ID}`, ID],
      [`https://drive.google.com/uc?export=download&id=${ID}`, ID],
      [`https://drive.google.com/open?id=${ID}&authuser=0`, ID],
      [`https://drive.google.com/open?id=${ID}#frag`, ID],
      // /uc/{id} rare path form
      [`https://drive.google.com/uc/${ID}/`, ID],
    ];
    for (const [input, expected] of cases) {
      expect(parseDriveFileId(input), input).toBe(expected);
    }
  });

  it("bad inputs return null", () => {
    const bad: unknown[] = [
      "",
      "   ",
      null,
      undefined,
      42,
      "https://example.com/video.mp4",
      "https://youtube.com/watch?v=abc123defg",
      "short-id", // under 10 chars
      "has spaces in it which drive ids never do",
      "https://drive.google.com/drive/folders/", // no id
    ];
    for (const input of bad) {
      expect(parseDriveFileId(input), String(input)).toBeNull();
    }
  });
});

describe("URL builders derive from the canonical ID", () => {
  it("embed/view/download shapes", () => {
    expect(buildDriveEmbedUrl(ID)).toBe(`https://drive.google.com/file/d/${ID}/preview`);
    expect(buildDriveViewUrl(ID)).toBe(`https://drive.google.com/file/d/${ID}/view`);
    expect(buildDriveDownloadUrl(ID)).toBe(`https://drive.google.com/uc?export=download&id=${ID}`);
  });
});
