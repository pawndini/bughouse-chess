import { Chess, type Square } from "chess.js";
import type { AttemptedBughouseHalfMove, AttemptedNormalMove, BughouseBoardId, BughousePieceType, BughousePositionSnapshot, BughousePromotionPiece } from "../../types/analysis";
import { isBughouseOverByCheckmate, validateAndApplyBughouseHalfMove } from "../analysis/applyMove";

export interface PartnerCapture {
  move: AttemptedNormalMove;
  san: string;
  position: BughousePositionSnapshot;
}

export interface PartnerCaptureOption {
  piece: BughousePieceType;
  captures: PartnerCapture[];
}

/** Engine input always comes from the current tree node, including its reserves. */
export function getEngineBoardInput(position: BughousePositionSnapshot, board: BughouseBoardId): { fen: string; pockets: string } {
  const fen = board === "A" ? position.fenA : position.fenB;
  let pockets = "";
  for (const side of ["white", "black"] as const) {
    for (const piece of ["p", "n", "b", "r", "q"] as const) {
      const count = position.reserves[board][side][piece] ?? 0;
      pockets += (side === "white" ? piece.toUpperCase() : piece).repeat(Math.min(30, Math.max(0, count)));
    }
  }
  return { fen, pockets };
}

/**
 * One-capture lookahead for the receiving board's side to move. Both partners
 * must be on move. Use Bug Bully's rules to handle check, pins, en passant and
 * promoted pieces; never add speculative material to the actual tree node.
 * Captures of the same piece share the receiving-board search, but remain
 * separate choices because they can have different costs on the partner board.
 */
export function getPartnerCaptureOptions(position: BughousePositionSnapshot, receivingBoard: BughouseBoardId): PartnerCaptureOption[] {
  const partnerBoard = receivingBoard === "A" ? "B" : "A";
  const receiver = new Chess(receivingBoard === "A" ? position.fenA : position.fenB);
  const partner = new Chess(partnerBoard === "A" ? position.fenA : position.fenB);
  if (receiver.turn() === partner.turn() || isBughouseOverByCheckmate(position)) return [];
  const side = receiver.turn() === "w" ? "white" : "black";
  const groups = new Map<BughousePieceType, PartnerCaptureOption>();
  for (const capture of partner.moves({ verbose: true })) {
    if (!capture.captured) continue;
    const move: AttemptedNormalMove = {
      kind: "normal", board: partnerBoard, from: capture.from, to: capture.to,
      ...(capture.promotion ? { promotion: capture.promotion as BughousePromotionPiece } : {}),
    };
    const result = validateAndApplyBughouseHalfMove(position, move);
    if (result.type !== "ok" || isBughouseOverByCheckmate(result.next)) continue;
    const piece = (["p", "n", "b", "r", "q"] as const).find((piece) =>
      (result.next.reserves[receivingBoard][side][piece] ?? 0) > (position.reserves[receivingBoard][side][piece] ?? 0));
    if (!piece) continue;
    const group = groups.get(piece) ?? { piece, captures: [] };
    group.captures.push({ move, san: result.move.san, position: result.next });
    groups.set(piece, group);
  }
  return [...groups.values()];
}

/** Use the same rules for ordinary and conditional engine move previews. */
export function previewEngineMove(position: BughousePositionSnapshot, board: BughouseBoardId, uci: string): { move: AttemptedBughouseHalfMove; san: string } | null {
  const normal = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
  const drop = /^([pnbrq])@([a-h][1-8])$/i.exec(uci);
  const side = (board === "A" ? position.fenA : position.fenB).split(" ")[1] === "w" ? "white" : "black";
  const move: AttemptedBughouseHalfMove | null = normal
    ? { kind: "normal", board, from: normal[1] as Square, to: normal[2] as Square, promotion: normal[3] as BughousePromotionPiece | undefined }
    : drop
      ? { kind: "drop", board, side, piece: drop[1].toLowerCase() as BughousePieceType, to: drop[2] as Square }
      : null;
  if (!move) return null;
  const result = validateAndApplyBughouseHalfMove(position, move);
  return result.type === "ok" ? { move, san: result.move.san } : null;
}
