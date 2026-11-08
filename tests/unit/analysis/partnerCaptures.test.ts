import { describe, expect, it } from "vitest";
import { createInitialPositionSnapshot, validateAndApplyBughouseHalfMove } from "@/app/utils/analysis/applyMove";
import { getEngineBoardInput, getPartnerCaptureOptions, previewEngineMove } from "@/app/utils/engine/partnerCaptures";
import type { BughousePositionSnapshot } from "@/app/types/analysis";

function position(fenB = "7k/8/8/4p3/3N4/8/8/K7 b - - 0 1"): BughousePositionSnapshot {
  return { ...createInitialPositionSnapshot(), fenA: "7k/8/8/8/8/8/8/K7 w - - 0 1", fenB };
}

describe("partner capture lookahead in sidelines", () => {
  it("finds a legal partner capture and transfers a knight without mutating the sideline", () => {
    const current = position(); const original = structuredClone(current);
    const options = getPartnerCaptureOptions(current, "A");
    expect(options).toHaveLength(1);
    expect(options[0].piece).toBe("n");
    const capture = options[0].captures[0];
    expect(capture.move).toMatchObject({ board: "B", from: "e5", to: "d4" });
    expect(capture.position.reserves.A.white.n).toBe(1);
    expect(capture.position.reserves.A.black.n).toBeUndefined();
    expect(current).toEqual(original);
    expect(previewEngineMove(current, "A", "N@f7")).toBeNull();
    expect(previewEngineMove(capture.position, "A", "N@f7")?.san).toBe("N@f7+");
    expect(previewEngineMove(capture.position, "A", "invalid")).toBeNull();
    const drop = { kind: "drop", board: "A", side: "white", piece: "n", to: "f7" } as const;
    expect(validateAndApplyBughouseHalfMove(current, drop).type).toBe("error");
    expect(validateAndApplyBughouseHalfMove(capture.position, drop).type).toBe("ok");
  });
  it("does not assume the partner can move when it is the opponent's turn", () => {
    expect(getPartnerCaptureOptions(position(position().fenB.replace(" b ", " w ")), "A")).toEqual([]);
  });
  it("updates from the new sideline after a capture or turn change", () => {
    const current = position();
    const capture = getPartnerCaptureOptions(current, "A")[0].captures[0];
    expect(getPartnerCaptureOptions(capture.position, "A")).toEqual([]);
    expect(getEngineBoardInput(capture.position, "A").pockets).toBe("N");
    expect(getEngineBoardInput(current, "A").pockets).toBe("");
  });
  it("supports Black receiving from a White partner on the other board", () => {
    const current = position();
    current.fenA = "7k/8/8/3n4/4P3/8/8/K7 w - - 0 1";
    current.fenB = "7k/8/8/8/8/8/8/K7 b - - 0 1";
    const capture = getPartnerCaptureOptions(current, "B")[0].captures[0];
    expect(capture.move.board).toBe("A");
    expect(capture.position.reserves.B.black.n).toBe(1);
    expect(getEngineBoardInput(capture.position, "B").pockets).toBe("n");
  });
  it("uses a pawn when the captured piece was promoted", () => {
    const current = position("7k/8/8/4p3/3Q4/8/8/K7 b - - 0 1");
    current.promotedSquares.B = ["d4"];
    expect(getPartnerCaptureOptions(current, "A").map((option) => option.piece)).toEqual(["p"]);
  });
  it("handles en passant supply through the existing rules", () => {
    const [option] = getPartnerCaptureOptions(position("7k/8/8/8/3pP3/8/8/K7 b - e3 0 1"), "A");
    expect(option.piece).toBe("p");
    expect(option.captures[0].move).toMatchObject({ from: "d4", to: "e3" });
  });
  it("excludes captures by pinned pieces that expose their king", () => {
    const options = getPartnerCaptureOptions(position("4k3/3Nr3/8/8/8/8/8/K3R3 b - - 0 1"), "A");
    expect(options.flatMap((option) => option.captures).some(({ move }) => move.from === "e7" && move.to === "d7")).toBe(false);
  });
  it("groups identical supplies while retaining every legal capture choice", () => {
    const [option] = getPartnerCaptureOptions(position("7k/8/8/4p3/3N1N2/8/8/K7 b - - 0 1"), "A");
    expect(option.piece).toBe("n");
    expect(option.captures).toHaveLength(2);
    expect(option.captures.map(({ position: next }) => getEngineBoardInput(next, "A"))).toEqual([{ fen: position().fenA, pockets: "N" }, { fen: position().fenA, pockets: "N" }]);
  });
  it("retains promotion choices when a capture promotes the supplying pawn", () => {
    const [option] = getPartnerCaptureOptions(position("k7/8/8/8/8/8/6p1/K6R b - - 0 1"), "A");
    expect(option.piece).toBe("r");
    expect(option.captures).toHaveLength(4);
  });
  it("does not offer supplies after an unblockable mate on either board", () => {
    const current = position(); current.fenA = "7k/6Q1/5K2/8/8/8/8/8 b - - 0 1";
    current.fenB = current.fenB.replace(" b ", " w ");
    expect(getPartnerCaptureOptions(current, "A")).toEqual([]);
  });
  it("serializes current reserves for both colors, not a loaded-game snapshot", () => {
    const current = position(); current.reserves.A.white = { n: 2, p: 1 }; current.reserves.A.black = { q: 1 };
    expect(getEngineBoardInput(current, "A")).toEqual({ fen: current.fenA, pockets: "PNNq" });
  });
});
