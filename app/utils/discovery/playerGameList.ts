export interface PlayerGameEntry {
  id: string;
  partnerId: string;
  username: string;
  date: string;
  white: string;
  black: string;
  partnerWhite: string;
  partnerBlack: string;
  result: string;
  timeControl: string;
}

/** Validate portable lists before allowing their IDs into the viewer. */
export function parsePlayerGameList(text: string): PlayerGameEntry[] {
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== "object" || !("version" in data) || data.version !== 1 ||
      !("games" in data) || !Array.isArray(data.games) || data.games.length > 500) {
    throw new Error("Choose a Bug Bully game list (version 1, up to 500 games).");
  }
  const seen = new Set<string>();
  return data.games.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid game list entry.");
    const game = entry as Record<string, unknown>;
    for (const key of ["id", "partnerId", "username", "date", "white", "black", "partnerWhite", "partnerBlack", "result", "timeControl"]) {
      if (typeof game[key] !== "string" || (game[key] as string).length > 100) throw new Error("Invalid game list entry.");
    }
    if (!/^\d{10,12}$/.test(game.id as string) || !/^\d{10,12}$/.test(game.partnerId as string) ||
        game.id === game.partnerId || !Number.isFinite(Date.parse(game.date as string)) ||
        seen.has(game.id as string) || seen.has(game.partnerId as string)) throw new Error("Invalid or duplicate game IDs in list.");
    seen.add(game.id as string);
    seen.add(game.partnerId as string);
    return game as unknown as PlayerGameEntry;
  });
}

export function serializePlayerGameList(games: PlayerGameEntry[]): string {
  return JSON.stringify({ version: 1, games }, null, 2);
}
