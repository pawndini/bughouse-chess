/** Clock values are deciseconds. Only the last 20 seconds need a warning color. */
export function getClockTextClass(remainingDeciseconds?: number): string {
  return typeof remainingDeciseconds === "number" && Number.isFinite(remainingDeciseconds) && remainingDeciseconds <= 200
    ? "text-red-400"
    : "text-white";
}
