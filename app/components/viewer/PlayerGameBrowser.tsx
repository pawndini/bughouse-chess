"use client";

import { useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { saveOfflineGamePairs } from "../../utils/offlineGameStore";
import { findPlayerBughouseGames } from "../../actions";
import { parsePlayerGameList, serializePlayerGameList, type PlayerGameEntry } from "../../utils/discovery/playerGameList";

export default function PlayerGameBrowser({ onLoad }: { onLoad: (id: string, username: string) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [games, setGames] = useState<PlayerGameEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [excludeOneMoveGames, setExcludeOneMoveGames] = useState(true);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyRef.current) return;
    const form = new FormData(event.currentTarget);
    busyRef.current = true;
    setBusy(true);
    setMessage("Searching archives, newest first. Checking both boards may take a little time...");
    try {
      const { games: entries, offlineGames } = await findPlayerBughouseGames(String(form.get("username")).trim(), Number(form.get("limit")), form.get("excludeOneMoveGames") === "on");
      setGames(entries);
      setFilter("");
      if (!entries.length) {
        setMessage("No complete two-board bughouse games found in this player's public archive.");
        return;
      }
      setMessage(`Saving ${entries.length} games to Saved Games…`);
      try {
        await saveOfflineGamePairs(offlineGames);
        setMessage(`Found and saved ${entries.length} games. Open them here or from Saved Games.`);
      } catch {
        setMessage(`Found ${entries.length} games, but could not save them on this computer. You can still load a game here; search again to retry saving.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not search games.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const openList = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busyRef.current) return;
    try {
      if (file.size > 2_000_000) throw new Error("Game lists must be smaller than 2 MB.");
      const entries = parsePlayerGameList(await file.text());
      setGames(entries);
      setFilter("");
      setMessage(`Opened ${entries.length} saved games.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open list.");
    }
  };

  const saveList = () => {
    const url = URL.createObjectURL(new Blob([serializePlayerGameList(games)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${games[0]?.username || "bug-bully"}-bughouse-games.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const visibleGames = games.filter((game) => Object.values(game).join(" ").toLowerCase().includes(filter.toLowerCase()));
  const buttonClass = "rounded border border-gray-600 px-3 py-2 hover:bg-gray-700 disabled:opacity-50";

  return <>
    <button type="button" className={buttonClass} onClick={() => {
      try {
        const saved = window.localStorage.getItem("relay:exclude-one-move-games");
        if (saved !== null) setExcludeOneMoveGames(saved !== "false");
      } catch { /* Keep the current choice if local storage is unavailable. */ }
      dialogRef.current?.showModal();
    }}>Find player games</button>
    <dialog ref={dialogRef}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX >= bounds.right ||
            event.clientY < bounds.top || event.clientY >= bounds.bottom) {
          event.currentTarget.close();
        }
      }}
      aria-labelledby="player-games-title" className="m-auto max-h-[90vh] w-[min(56rem,95vw)] overflow-y-auto rounded-lg border border-gray-600 bg-gray-900 p-4 text-gray-100 backdrop:bg-black/60">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="player-games-title" className="font-semibold">Find player games</h2>
        <button type="button" className={buttonClass} onClick={() => dialogRef.current?.close()}>Close</button>
      </div>
      <form onSubmit={search} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">Chess.com username
          <input name="username" required maxLength={50} disabled={busy} className="rounded border border-gray-600 bg-gray-800 p-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">Maximum games (1–500)
          <input name="limit" type="number" required min={1} max={500} defaultValue={1} disabled={busy} className="w-32 rounded border border-gray-600 bg-gray-800 p-2" />
        </label>
        <label className="flex items-center gap-2 text-sm" title="Skip games where neither board reaches move 2.">
          <input name="excludeOneMoveGames" type="checkbox" checked={excludeOneMoveGames} disabled={busy}
            onChange={(event) => {
              const checked = event.target.checked;
              setExcludeOneMoveGames(checked);
              try { window.localStorage.setItem("relay:exclude-one-move-games", String(checked)); }
              catch { /* The choice still applies for this session. */ }
            }} className="h-4 w-4 accent-green-600" />
          Exclude one-move games
        </label>
        <button type="submit" disabled={busy} className={buttonClass}>{busy ? "Searching..." : "Search"}</button>
      </form>
      <p className="my-3 text-xs text-gray-300">Search results are automatically added to Saved Games for offline access. Exported lists contain game IDs and details. Bug Bully is independent of Chess.com.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || !games.length} className={buttonClass} onClick={saveList}>Save list</button>
        <label className={buttonClass}>Open list
          <input type="file" accept=".json,application/json" disabled={busy} onChange={openList} className="mt-1 block max-w-56 text-xs" />
        </label>
      </div>
      <p role="status" className="my-3 text-sm">{message}</p>
      {games.length > 0 && <>
        <label className="flex flex-col gap-1 text-sm">Filter by player, game ID, date, or time control
          <input value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded border border-gray-600 bg-gray-800 p-2" />
        </label>
        <p className="my-2 text-xs">Showing {visibleGames.length} of {games.length} games</p>
        <ul className="flex flex-col gap-2">
          {visibleGames.map((game) => <li key={game.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-700 p-3">
            <div className="min-w-0 break-words text-sm">
              <p>{game.white} vs {game.black}</p>
              <p>{game.partnerWhite} vs {game.partnerBlack}</p>
              <p className="text-xs text-gray-300">{new Date(game.date).toLocaleString()} · Result {game.result} · Time control {game.timeControl}</p>
              <p className="text-xs text-gray-300">Board IDs: {game.id} / {game.partnerId}</p>
            </div>
            <button type="button" disabled={busy} className={buttonClass} aria-label={`Load game ${game.id}`} onClick={() => { dialogRef.current?.close(); onLoad(game.id, game.username); }}>Load</button>
          </li>)}
        </ul>
      </>}
    </dialog>
  </>;
}
