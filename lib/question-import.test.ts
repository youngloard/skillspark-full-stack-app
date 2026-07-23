import { describe, expect, it } from "vitest";
import { parseQuestionsCsv } from "./question-import";

const SAMPLE = `NO,PARTICULARS (B),PARTICULARS (A),ANSWER DROP DOWN,DR,CR
1,Purchased goods of Rs. 14000 from soham in cash,Cash A/c,Purchase A/c,"14,000",
,,Soham A/c,Cash A/c,,"14,000"
,,Purchase A/c,,,
,,Goods A/c,,,
,,,,,
2,Goods Sold to Raj for Rs. 20000,Cash A/c,Raj A/c,"20,000",
,,Sales A/c,Sales A/c,,"20,000"
,,Raj A/c,,,
,,Goods A/c,,,
`;

describe("parseQuestionsCsv", () => {
  it("groups multi-row blocks into questions", () => {
    const qs = parseQuestionsCsv(SAMPLE);
    expect(qs).toHaveLength(2);

    expect(qs[0]).toMatchObject({
      sourceQuestionNo: "1",
      prompt: "Purchased goods of Rs. 14000 from soham in cash",
      options: ["Cash A/c", "Soham A/c", "Purchase A/c", "Goods A/c"],
      error: null,
    });
    expect(qs[0].answerRows).toEqual([
      { account: "Purchase A/c", debit: 14000, credit: null },
      { account: "Cash A/c", debit: null, credit: 14000 },
    ]);
    expect(qs[1].sourceQuestionNo).toBe("2");
    expect(qs[1].answerRows).toHaveLength(2);
  });

  it("handles a prompt with an embedded newline inside quotes", () => {
    const csv = `NO,PARTICULARS (B),PARTICULARS (A),ANSWER DROP DOWN,DR,CR
6,"Paid Transportation Expense Rs. 450,\nWages Expense Rs. 200",Transportation A/c,Transportation A/c,450,
,,Wages A/c,Wages A/c,200,
,,Cash A/c,Cash A/c,,650
`;
    const qs = parseQuestionsCsv(csv);
    expect(qs).toHaveLength(1);
    expect(qs[0].prompt).toBe("Paid Transportation Expense Rs. 450, Wages Expense Rs. 200");
    expect(qs[0].options).toEqual(["Transportation A/c", "Wages A/c", "Cash A/c"]);
    expect(qs[0].answerRows).toHaveLength(3);
  });

  it("flags a block missing answer rows", () => {
    const csv = `NO,PARTICULARS (B),PARTICULARS (A),ANSWER DROP DOWN,DR,CR
1,A question,Cash A/c,,,
,,Bank A/c,,,
`;
    expect(parseQuestionsCsv(csv)[0].error).toMatch(/answer/i);
  });
});
