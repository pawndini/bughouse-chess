import { describe, it, expect, vi, afterEach } from "vitest";
import { parsePlayerGameList, serializePlayerGameList } from "../app/utils/discovery/playerGameList";
import { findPlayerBughouseGames } from "../app/actions";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const entry = { id: "12345678901", partnerId: "12345678902", username: "alice", date: "2026-11-01T12:00:00.000Z", white: "alice", black: "bob", partnerWhite: "carol", partnerBlack: "dan", result: "1-0", timeControl: "180" };
afterEach(() => vi.unstubAllGlobals());
describe("portable player game lists", () => {
  it("round trips metadata and both board IDs without PGN", () => {
    const saved = serializePlayerGameList([entry]);
    expect(parsePlayerGameList(saved)).toEqual([entry]);
    expect(saved).not.toContain("pgn");
  });
  it("rejects invalid versions, entries, dates, IDs and duplicate board pairs", () => {
    for (const value of [{ version: 2, games: [] }, { version: 1, games: [null] }, { version: 1, games: [{ ...entry, id: "https://evil.test" }] }, { version: 1, games: [{ ...entry, date: "bad" }] }, { version: 1, games: [entry, { ...entry, id: entry.partnerId, partnerId: entry.id }] }]) {
      expect(() => parsePlayerGameList(JSON.stringify(value))).toThrow();
    }
  });
});
describe("player archive search", () => {
  it("validates inputs before requesting archives", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    await expect(findPlayerBughouseGames("bad/user", 1)).rejects.toThrow();
    await expect(findPlayerBughouseGames("alice", 501)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("finds both boards, removes duplicate pairs and respects the limit", async () => {
    const game = (id: string) => ({ url: `https://www.chess.com/game/live/${id}`, rules: "bughouse", end_time: 1793534400, time_control: "180" });
    const request = vi.fn(async (url: string) => {
      let body: unknown;
      if (url.endsWith("archives")) body = { archives: ["https://api.chess.com/pub/player/alice/games/2026/10", "https://api.chess.com/pub/player/alice/games/2026/11"] };
      else if (url.endsWith("2026/11")) body = { games: [game(entry.id), game(entry.partnerId)] };
      else if (url.endsWith("2026/10")) body = { games: [] };
      else { const partner = url.endsWith(entry.partnerId); body = { game: { type: "bughouse", partnerGameId: Number(partner ? entry.id : entry.partnerId), pgnHeaders: { White: partner ? "carol" : "alice", Black: partner ? "dan" : "bob", Result: "1-0" } } }; }
      return new Response(JSON.stringify(body));
    });
    vi.stubGlobal("fetch", request);
    const { games, offlineGames } = await findPlayerBughouseGames("Alice", 25);
    expect(games).toHaveLength(1);
    expect(offlineGames).toHaveLength(1);
    expect(offlineGames[0]).toMatchObject({ partnerId: entry.partnerId, perspectiveUsername: "alice" });
    expect(games[0]).toMatchObject({ id: entry.id, partnerId: entry.partnerId, partnerWhite: "carol" });
    expect(parsePlayerGameList(serializePlayerGameList(games))).toEqual(games);
    request.mockClear();
    expect((await findPlayerBughouseGames("alice", 1)).games).toHaveLength(1);
    expect(request.mock.calls.some(([url]) => url.endsWith("2026/10"))).toBe(false);
  });
});

describe("one-move game filter", () => {
  it.each([
    [0, 0, true, 0], [1, 2, true, 0], [2, 2, true, 0],
    [3, 2, true, 1], [2, 3, true, 1], [2, 2, false, 1],
    [undefined, 2, true, 1],
  ])("filters ply counts %s/%s when enabled=%s", async (firstPlies, secondPlies, enabled, expected) => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      let body: unknown;
      if (url.endsWith("archives")) body = { archives: ["https://api.chess.com/pub/player/alice/games/2026/11"] };
      else if (url.endsWith("2026/11")) body = { games: [{ url: `https://www.chess.com/game/live/${entry.id}`, rules: "bughouse", end_time: 1793534400, time_control: "180" }] };
      else body = { game: { type: "bughouse", partnerGameId: Number(entry.partnerId), plyCount: url.endsWith(entry.id) ? firstPlies : secondPlies, pgnHeaders: { White: "alice", Black: "bob", Result: "1-0" } } };
      return new Response(JSON.stringify(body));
    }));
    const result = await findPlayerBughouseGames("alice", 1, enabled as boolean);
    expect(result.games).toHaveLength(expected);
    expect(result.offlineGames).toHaveLength(expected);
  });
  it("continues searching after a skipped short match to fill the requested limit", async () => {
    const ids = [entry.id, entry.partnerId, "12345678903"];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      let body: unknown;
      if (url.endsWith("archives")) body = { archives: ["https://api.chess.com/pub/player/alice/games/2026/11"] };
      else if (url.endsWith("2026/11")) body = { games: ids.map((id, index) => ({ url: `https://www.chess.com/game/live/${id}`, rules: "bughouse", end_time: 1793534400 - index, time_control: "180" })) };
      else { const short = url.endsWith(entry.id) || url.endsWith(entry.partnerId); body = { game: { type: "bughouse", partnerGameId: Number(short ? entry.partnerId : "12345678904"), plyCount: short ? 2 : 10, pgnHeaders: { White: "alice", Black: "bob", Result: "1-0" } } }; }
      return new Response(JSON.stringify(body));
    }));
    const { games, offlineGames } = await findPlayerBughouseGames("alice", 1, true);
    expect(games.map((game) => game.id)).toEqual(["12345678903"]);
    expect(offlineGames).toHaveLength(1);
  });
});
