import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeWithFairyStockfish, stopFairyStockfishAnalysis } from "@/app/utils/engine/fairyStockfish";

afterEach(() => { vi.unstubAllGlobals(); delete window.Stockfish; });

describe("partner supply engine requests", () => {
  it("uses each snapshot's actual pocket, bounds lookahead, and cancels queued stale positions", async () => {
    const listeners = new Set<(line: string) => void>();
    const engine = {
      FS: { writeFile: vi.fn() },
      addMessageListener: (listener: (line: string) => void) => listeners.add(listener),
      removeMessageListener: (listener: (line: string) => void) => listeners.delete(listener),
      postMessage: vi.fn((command: string) => {
        if (command === "uci") queueMicrotask(() => listeners.forEach((listener) => listener("uciok")));
        if (command.startsWith("go ")) queueMicrotask(() => {
          for (const line of ["info depth 5 multipv 1 score cp 120 pv N@f7", "bestmove N@f7"]) {
            listeners.forEach((listener) => listener(line));
          }
        });
      }),
    };
    window.Stockfish = vi.fn(async () => engine);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([0]))));
    const fen = "7k/8/8/8/8/8/8/K7 w - - 0 1";
    const lines = await analyzeWithFairyStockfish(fen, "N", 1, 750);
    expect(lines).toEqual([{ rank: 1, move: "N@f7", score: "+1.20", depth: 5 }]);
    expect(engine.postMessage).toHaveBeenCalledWith("position fen 7k/8/8/8/8/8/8/K7[N] w - - 0 1");
    expect(engine.postMessage).toHaveBeenCalledWith("go depth 11 movetime 750");
    await analyzeWithFairyStockfish(fen, "", 3);
    expect(engine.postMessage).toHaveBeenCalledWith("position fen 7k/8/8/8/8/8/8/K7[] w - - 0 1");
    expect(engine.postMessage).toHaveBeenCalledWith("go depth 11");
    const pending = analyzeWithFairyStockfish(fen, "Q", 1, 750);
    stopFairyStockfishAnalysis();
    expect(await pending).toEqual([]);
    expect(engine.postMessage).not.toHaveBeenCalledWith("position fen 7k/8/8/8/8/8/8/K7[Q] w - - 0 1");
    expect(listeners.size).toBe(0);
  });
});
