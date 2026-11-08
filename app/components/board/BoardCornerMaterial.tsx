"use client";

/**
 * @module app/components/board/BoardCornerMaterial
 *
 * Tiny signed capture-material counter rendered in a board/player-bar corner.
 */
import React from "react";
import { Info } from "lucide-react";
import { APP_TOOLTIP_ID } from "../../utils/platform/tooltips";
import { formatSignedCaptureMaterial } from "../../utils/analysis/captureMaterial";

/** Which corner of the board overlay should host the material badge. */
export type BoardCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface BoardCornerMaterialProps {
  /**
   * Signed capture-material total for the player associated with this corner.
   */
  value: number;
  /**
   * Which corner of the board/player-bar this counter should occupy.
   */
  corner: BoardCorner;
  /**
   * Optional density hint for very small viewports (e.g. phone landscape).
   */
  density?: "default" | "compact";
}

/** Tailwind absolute-position classes that pin the badge to a board corner. */
function getCornerPositionClasses(corner: BoardCorner): string {
  switch (corner) {
    case "top-left":
      return "left-0 top-0";
    case "top-right":
      return "right-0 top-0";
    case "bottom-left":
      return "left-0 bottom-0";
    case "bottom-right":
      return "right-0 bottom-0";
  }
}

/**
 * Tiny, always-on capture-material indicator rendered in a board corner.
 *
 * This is intentionally small and low-contrast (relative to player names/clocks),
 * but still readable at a glance when you look for it.
 */
export function BoardCornerMaterial({ value, corner, density = "default" }: BoardCornerMaterialProps) {
  const text =
    typeof value === "number" && Number.isFinite(value) ? formatSignedCaptureMaterial(value) : "0";

  const tint =
    value > 0 ? "text-emerald-300" : value < 0 ? "text-rose-300" : "text-white/40";

  const description = "Net material gained or lost through captures on this board, using your selected piece values. Positive means material gained; negative means material lost. Drops do not change this total.";

  return (
    <span
      className={[
        "absolute inline-flex items-center gap-1.5 pointer-events-none select-none font-mono tabular-nums leading-none",
        density === "compact" ? "text-[8px]" : "text-[9px]",
        tint,
        // Tiny padding so we don't visually touch the bar edges.
        "px-0.5",
        getCornerPositionClasses(corner),
      ].join(" ")}
    >
      <span aria-label={`Capture material ${text}`}>{text}</span>
      <button
        type="button"
        aria-label="About capture material"
        data-tooltip-id={APP_TOOLTIP_ID}
        data-tooltip-content={description}
        className="pointer-events-auto inline-flex shrink-0 cursor-help rounded-full text-gray-400 hover:text-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-300"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}
