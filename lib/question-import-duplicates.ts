import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";

export type QuestionImportIdentity = {
  level: string;
  sourceQuestionNo: string;
  prompt: string;
};

export type QuestionImportDuplicateMatches = {
  identityKeys: Set<string>;
  promptFingerprints: Set<string>;
};

export function questionImportKey(level: string, sourceQuestionNo: string): string {
  return `${level}\u0000${sourceQuestionNo}`;
}

export function normalizeQuestionPrompt(prompt: string): string {
  return prompt.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

/**
 * Exact-question fingerprint used only for import duplicate detection. It is
 * deliberately conservative: case, Unicode presentation, and whitespace do
 * not make a question new, while punctuation or wording changes still do.
 */
export function questionPromptFingerprint(prompt: string): string {
  return normalizeQuestionPrompt(prompt).toLocaleLowerCase("en-US");
}

/**
 * One bounded lookup per preview/chunk. Natural identities use the existing
 * unique index; exact prompt matches catch the same question under another
 * number or level without loading the whole bank into application memory.
 */
export async function findExistingQuestionImportDuplicates(
  examId: string,
  candidates: QuestionImportIdentity[],
  client: Pick<Prisma.TransactionClient, "question"> = db,
): Promise<QuestionImportDuplicateMatches> {
  const byLevel = new Map<string, Set<string>>();
  const prompts = new Set<string>();
  for (const candidate of candidates) {
    const numbers = byLevel.get(candidate.level) ?? new Set<string>();
    numbers.add(candidate.sourceQuestionNo);
    byLevel.set(candidate.level, numbers);
    const normalizedPrompt = normalizeQuestionPrompt(candidate.prompt);
    if (normalizedPrompt) prompts.add(normalizedPrompt);
  }

  if (byLevel.size === 0) {
    return { identityKeys: new Set(), promptFingerprints: new Set() };
  }

  const rows = await client.question.findMany({
    where: {
      examId,
      OR: [
        ...[...byLevel].map(([level, numbers]) => ({
          level,
          sourceQuestionNo: { in: [...numbers] },
        })),
        ...(prompts.size > 0
          ? [{ prompt: { in: [...prompts], mode: "insensitive" as const } }]
          : []),
      ],
    },
    select: { level: true, sourceQuestionNo: true, prompt: true },
  });

  return {
    identityKeys: new Set(rows.map((row) => questionImportKey(row.level, row.sourceQuestionNo))),
    promptFingerprints: new Set(rows.map((row) => questionPromptFingerprint(row.prompt))),
  };
}
