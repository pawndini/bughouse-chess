"use client";

/**
 * @module app/components/badges/ChessTitleBadge
 *
 * Chess.com-style title pills (NM, FM, IM, GM, …).
 */
import React from "react";

/**
 * Chess.com-style chess titles.
 *
 * Note: Chess.com omits the field entirely for untitled players, so callers should pass
 * the raw `chessTitle` string (or undefined) and this component will no-op when absent.
 */
export type ChessTitle =
  | "NM"
  | "CM"
  | "WCM"
  | "FM"
  | "WFM"
  | "IM"
  | "WIM"
  | "GM"
  | "WGM";

/** Normalizes raw API title strings to uppercase trimmed form. */
function normalizeChessTitle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toUpperCase();
}

export interface ChessTitleBadgeProps {
  /**
   * Raw chess title string from chess.com (e.g. "GM").
   * When undefined/empty, the badge is not rendered.
   */
  chessTitle?: string;
  /**
   * Optional extra classes for layout tweaks at call sites.
   */
  className?: string;
}

/**
 * Small badge shown to the left of a player's username when they have a chess title.
 * Styled as a compact white-on-red title badge.
 */
export function ChessTitleBadge({ chessTitle, className }: ChessTitleBadgeProps): React.ReactNode {
  const normalized = normalizeChessTitle(chessTitle);
  if (!normalized) return null;

  return (
    <span
      aria-label={`Chess title: ${normalized}`}
      title={`Chess title: ${normalized}`}
      className={[
        "inline-flex items-center justify-center rounded-[3px] px-1 py-px",
        "text-[9px] leading-none font-extrabold tracking-tight",
        "shrink-0 bg-[#8b292a] text-white",
        className ?? "",
      ].join(" ")}
    >
      {normalized}
    </span>
  );
}
