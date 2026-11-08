"use client";

export interface FairyAnalysisLine {
  rank: number;
  move: string;
  score: string;
  depth: number;
}

interface FairyEngineInstance {
  FS: { writeFile: (path: string, data: Uint8Array) => void };
  addMessageListener: (listener: (line: string) => void) => void;
  removeMessageListener: (listener: (line: string) => void) => void;
  postMessage: (command: string) => void;
}

declare global {
  interface Window {
    Stockfish?: (options: { wasmBinary: ArrayBuffer }) => Promise<FairyEngineInstance>;
  }
}

let enginePromise: Promise<FairyEngineInstance> | null = null;
let analysisQueue: Promise<unknown> = Promise.resolve();
let analysisEpoch = 0;

export function stopFairyStockfishAnalysis(): void {
  analysisEpoch += 1;
  void enginePromise?.then((engine) => engine.postMessage("stop")).catch(() => undefined);
}

function ensureEngineScript(): Promise<void> {
  if (window.Stockfish) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>("script[data-fairy-stockfish]");
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Fairy-Stockfish could not load.")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/engine/fairy/stockfish.js";
    script.dataset.fairyStockfish = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Fairy-Stockfish could not load."));
    document.head.appendChild(script);
  });
}

async function getEngine(): Promise<FairyEngineInstance> {
  if (!enginePromise) {
    enginePromise = (async () => {
      await ensureEngineScript();
      if (!window.Stockfish) throw new Error("Fairy-Stockfish did not initialize.");
      const wasmResponse = await fetch("/engine/fairy/stockfish.wasm");
      if (!wasmResponse.ok) throw new Error("Fairy-Stockfish engine files are missing.");
      const wasmBinary = await wasmResponse.arrayBuffer();
      const engine = await window.Stockfish({ wasmBinary });
      const networkResponse = await fetch("/engine/fairy/crazyhouse-8ebf84784ad2.nnue");
      if (!networkResponse.ok) throw new Error("The Fairy-Stockfish evaluation network is missing.");
      engine.FS.writeFile("/crazyhouse-8ebf84784ad2.nnue", new Uint8Array(await networkResponse.arrayBuffer()));
      await new Promise<void>((resolve, reject) => {
        const listener = (line: string) => {
          if (line === "uciok") {
            window.clearTimeout(timer);
            engine.removeMessageListener(listener);
            resolve();
          }
        };
        engine.addMessageListener(listener);
        const timer = window.setTimeout(() => {
          engine.removeMessageListener(listener);
          reject(new Error("Fairy-Stockfish did not answer its startup check."));
        }, 30000);
        engine.postMessage("uci");
      });
      engine.postMessage("setoption name EvalFile value /crazyhouse-8ebf84784ad2.nnue");
      engine.postMessage("setoption name UCI_Variant value crazyhouse");
      return engine;
    })().catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

function formatScore(tokens: string[], turn: "w" | "b"): string {
  const kind = tokens[0];
  const value = Number(tokens[1]);
  const sideSign = turn === "w" ? 1 : -1;
  if (!Number.isFinite(value)) return "—";
  if (kind === "mate") return `M${value * sideSign}`;
  return `${value * sideSign >= 0 ? "+" : ""}${(value * sideSign / 100).toFixed(2)}`;
}

/** Fairy-Stockfish analysis is queued because the WASM engine is a shared singleton. */
export function analyzeWithFairyStockfish(
  fen: string,
  pocketPieces: string,
  multipv: number,
  movetimeMs?: number,
): Promise<FairyAnalysisLine[]> {
  const requestEpoch = analysisEpoch;
  const job = analysisQueue.then(async () => {
    if (requestEpoch !== analysisEpoch) return [];
    const engine = await getEngine();
    if (requestEpoch !== analysisEpoch) return [];
    const fields = fen.split(" ");
    if (fields.length < 6) throw new Error("The board position is incomplete.");
    const turn = fields[1] as "w" | "b";
    const crazyhouseFen = `${fields[0]}[${pocketPieces}] ${fields.slice(1).join(" ")}`;
    const lines = new Map<number, FairyAnalysisLine>();
    return await new Promise<FairyAnalysisLine[]>((resolve) => {
      const listener = (text: string) => {
        if (text.startsWith("info ")) {
          const rank = Number(text.match(/\bmultipv (\d+)/)?.[1] ?? 1);
          const depth = Number(text.match(/\bdepth (\d+)/)?.[1] ?? 0);
          const scoreMatch = text.match(/\bscore (cp|mate) (-?\d+)/);
          const pv = text.match(/\bpv (.+)$/)?.[1]?.trim().split(/\s+/)[0];
          if (rank <= multipv && scoreMatch && pv && (!lines.has(rank) || depth >= (lines.get(rank)?.depth ?? 0))) {
            lines.set(rank, { rank, move: pv, score: formatScore([scoreMatch[1], scoreMatch[2]], turn), depth });
          }
        }
        if (text.startsWith("bestmove ")) {
          engine.removeMessageListener(listener);
          resolve([...lines.values()].sort((a, b) => a.rank - b.rank));
        }
      };
      engine.addMessageListener(listener);
      engine.postMessage(`setoption name MultiPV value ${multipv}`);
      engine.postMessage(`position fen ${crazyhouseFen}`);
      engine.postMessage(movetimeMs === undefined ? "go depth 11" : `go depth 11 movetime ${Math.max(50, Math.floor(movetimeMs))}`);
    });
  });
  analysisQueue = job.catch(() => undefined);
  return job;
}

export function formatEngineMove(move: string): string {
  const drop = move.match(/^([PNBRQ])@([a-h][1-8])$/i);
  if (drop) return `${drop[1]}@${drop[2]}`;
  const normal = move.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
  if (normal) return `${normal[1]}–${normal[2]}${normal[3] ? `=${normal[3].toUpperCase()}` : ""}`;
  return move;
}

export function parseEngineMove(move: string): { from: string | null; to: string } | null {
  const drop = move.match(/^[PNBRQ]@([a-h][1-8])$/i);
  if (drop) return { from: null, to: drop[1] };
  const normal = move.match(/^([a-h][1-8])([a-h][1-8])/i);
  return normal ? { from: normal[1], to: normal[2] } : null;
}
