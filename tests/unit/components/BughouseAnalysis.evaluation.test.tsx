import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chess, type Square } from "chess.js";
import BughouseAnalysis from "@/app/components/viewer/BughouseAnalysis";
import { analyzeWithFairyStockfish, type FairyAnalysisLine } from "@/app/utils/engine/fairyStockfish";
import * as partnerCaptures from "@/app/utils/engine/partnerCaptures";
import type { ChessGame } from "@/app/actions";
import originalFixture from "../../fixtures/chesscom/160064848971.json";
import partnerFixture from "../../fixtures/chesscom/160064848973.json";

vi.mock("@/app/utils/platform/useFirebaseAnalytics", () => ({ useFirebaseAnalytics: () => null, logAnalyticsEvent: vi.fn() }));
vi.mock("@/app/utils/platform/useCompactLandscape", () => ({ useCompactLandscape: () => false }));
vi.mock("@/app/stores/viewerOrientationStore", () => ({ useViewerOrientationStore: () => ({ isBoardOrderSwapped: false, toggleBoardOrder: vi.fn() }) }));
vi.mock("@/app/utils/engine/fairyStockfish", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/app/utils/engine/fairyStockfish")>(),
  analyzeWithFairyStockfish: vi.fn(), stopFairyStockfishAnalysis: vi.fn(),
}));
vi.mock("@/app/components/board/ChessBoard", () => ({
  default: ({ boardName, fen, onAttemptMove }: { boardName: "A" | "B"; fen: string; onAttemptMove: (move: { board: "A" | "B"; from: Square; to: Square }) => void }) => (
    <div data-testid={`board-${boardName}`} data-fen={fen}>
      {([['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4']] as const).map(([from, to]) =>
        <button key={from} onClick={() => onAttemptMove({ board: boardName, from, to })}>{boardName}: {from}{to}</button>)}
    </div>
  ),
}));
vi.mock("@/app/components/board/PieceReserveVertical", () => ({ default: () => null }));
vi.mock("@/app/components/moves/MoveListWithVariations", () => ({ default: () => null }));
const gameData = { original: originalFixture as unknown as ChessGame, partner: partnerFixture as unknown as ChessGame };
function evaluationTexts(board: "A" | "B"): string[] {
  return [...document.querySelectorAll(`[data-board-id="${board}"] .bh-player-eval`)].map((element) => element.textContent!);
}
const line = (score: string): FairyAnalysisLine[] => [{ rank: 1, move: "d8h4", score, depth: 11 }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.mocked(analyzeWithFairyStockfish).mockResolvedValue(line("+0.50"));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("player evaluations follow the current analysis node", () => {
  it("replaces the game score with the sideline mate score and ignores late results from an older node", async () => {
    render(<BughouseAnalysis gameData={gameData} initialGlobalPly={0} isLoading={false} />);
    fireEvent.click(screen.getByRole("switch", { name: /fairy stockfish/i }));
    await waitFor(() => expect(evaluationTexts("A")).toEqual(["-0.50", "+0.50"]));
    await waitFor(() => expect(evaluationTexts("B")).toHaveLength(2));
    const pending: { fen: string; resolve: (lines: FairyAnalysisLine[]) => void }[] = [];
    vi.mocked(analyzeWithFairyStockfish).mockImplementation((fen) => new Promise((resolve) => pending.push({ fen, resolve })));
    fireEvent.click(screen.getByText("A: f2f3"));
    expect(evaluationTexts("A")).toEqual([]);
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.click(screen.getByText("A: e7e5"));
    fireEvent.click(screen.getByText("A: g2g4"));
    const sideline = new Chess(); sideline.move("f3"); sideline.move("e5"); sideline.move("g4");
    expect(screen.getByTestId("board-A")).toHaveAttribute("data-fen", sideline.fen());
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[1].fen).toBe(sideline.fen());
    await act(async () => pending[0].resolve(line("+99.00")));
    expect(evaluationTexts("A")).toEqual([]);
    await act(async () => pending[1].resolve(line("M-1")));
    expect(evaluationTexts("A")).toEqual(["M1", "M-1"]);
    expect(screen.getByRole("img", { name: "Board A evaluation M-1" })).toBeInTheDocument();
    // Moving back invalidates the mating-line result immediately.
    fireEvent.click(screen.getByRole("button", { name: "Previous move" }));
    expect(evaluationTexts("A")).toEqual([]);
    fireEvent.click(screen.getByRole("switch", { name: /fairy stockfish/i }));
    expect(evaluationTexts("A")).toEqual([]);
  });
  it("keeps scores attached to player colors when boards are flipped", async () => {
    vi.mocked(analyzeWithFairyStockfish).mockResolvedValue(line("M1"));
    render(<BughouseAnalysis gameData={gameData} initialGlobalPly={0} isLoading={false} boardsFlipped />);
    fireEvent.click(screen.getByRole("switch", { name: /fairy stockfish/i }));
    await waitFor(() => expect(evaluationTexts("A")).toEqual(["M1", "M-1"]));
    await waitFor(() => expect(evaluationTexts("B")).toEqual(["M-1", "M1"]));
  });
});

describe("partner-capture notices", () => {
  it("only searches for and shows supplies in a sideline, hiding them again on the recorded game", async () => {
    const supplies = vi.spyOn(partnerCaptures, "getPartnerCaptureOptions").mockImplementation((position, board) =>
      board === "A" ? [{ piece: "n", captures: [{
        move: { kind: "normal", board: "B", from: "e2", to: "e4" }, san: "exd4", position,
      }] }] : []);
    vi.mocked(analyzeWithFairyStockfish).mockImplementation(async (fen) => {
      const move = new Chess(fen).moves({ verbose: true })[0];
      return [{ rank: 1, move: `${move.from}${move.to}${move.promotion ?? ""}`, score: "+0.50", depth: 11 }];
    });
    render(<BughouseAnalysis gameData={gameData} initialGlobalPly={0} isLoading={false} />);
    fireEvent.click(screen.getByRole("switch", { name: /fairy stockfish/i }));
    await waitFor(() => expect(evaluationTexts("B")).toHaveLength(2));
    expect(supplies).not.toHaveBeenCalled();
    for (let move = 0; move < 3; move += 1) fireEvent.click(screen.getByRole("button", { name: "Next move" }));
    await waitFor(() => expect(evaluationTexts("B")).toHaveLength(2));
    expect(screen.queryByText(/After a partner capture/)).not.toBeInTheDocument();
    expect(supplies).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Jump to start" }));
    fireEvent.click(screen.getByText("A: f2f3"));
    expect(await screen.findByText(/After a partner capture/)).toBeInTheDocument();
    // Continuing the variation should keep the notices available.
    fireEvent.click(screen.getByText("A: e7e5"));
    expect(await screen.findByText(/After a partner capture/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Jump to start" }));
    expect(screen.queryByText(/After a partner capture/)).not.toBeInTheDocument();
    await waitFor(() => expect(evaluationTexts("B")).toHaveLength(2));
    expect(screen.queryByText(/After a partner capture/)).not.toBeInTheDocument();
  });
});
