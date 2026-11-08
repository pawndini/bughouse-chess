"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  deleteOfflineGamePair,
  getAllOfflineGamePairs,
  type OfflineGamePair,
} from "../../utils/offlineGameStore";

interface SavedGamesModalProps {
  open: boolean;
  onClose: () => void;
}

function getPairKey(pair: OfflineGamePair): string {
  return [pair.original.game.id.toString(), pair.partnerId ?? ""].filter(Boolean).sort().join(":");
}

function getPlayers(pair: OfflineGamePair): string {
  const { top, bottom } = pair.original.players;
  const original = `${top.username} vs ${bottom.username}`;
  const partner = pair.partner?.players;
  return partner ? `${original} · ${partner.top.username} vs ${partner.bottom.username}` : original;
}

function getGameDate(pair: OfflineGamePair): string {
  const date = pair.original.game.pgnHeaders.Date;
  return date && date !== "????.??.??" ? date : "Date unavailable";
}

export default function SavedGamesModal({ open, onClose }: SavedGamesModalProps) {
  const router = useRouter();
  const [playerSearch, setPlayerSearch] = useState("");
  const [games, setGames] = useState<OfflineGamePair[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [pendingDelete, setPendingDelete] = useState<OfflineGamePair[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deletingRef = useRef(false);

  const loadGames = useCallback(async () => {
    setIsLoading(true);
    try {
      setGames(await getAllOfflineGamePairs());
    } catch (error) {
      console.error("Could not load saved games:", error);
      toast.error(error instanceof Error ? error.message : "Could not load saved games from this computer.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadGames();
    else {
      setPendingDelete(null);
      setPlayerSearch("");
      setSelectedKeys(new Set());
    }
  }, [open, loadGames]);

  useEffect(() => {
    if (!open) return;
    const refresh = () => { void loadGames(); };
    window.addEventListener("relay:saved-games-updated", refresh);
    return () => window.removeEventListener("relay:saved-games-updated", refresh);
  }, [open, loadGames]);

  const confirmDelete = async () => {
    if (!pendingDelete?.length || deletingRef.current) return;
    deletingRef.current = true;
    setIsDeleting(true);
    const failed: OfflineGamePair[] = [];
    let removed = 0;
    try {
      for (const pair of pendingDelete) {
        const key = getPairKey(pair);
        const id = pair.original.game.id.toString();
        try {
          await deleteOfflineGamePair(id);
          setGames((current) => current.filter((game) => getPairKey(game) !== key));
          setSelectedKeys((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
          window.dispatchEvent(new CustomEvent("relay:saved-game-deleted", {
            detail: { id, partnerId: pair.partnerId },
          }));
          removed += 1;
        } catch (error) {
          console.error("Could not delete saved game:", error);
          failed.push(pair);
        }
      }
      setPendingDelete(failed.length ? failed : null);
      if (removed) toast.success(`${removed} saved ${removed === 1 ? "game" : "games"} removed from this computer.`);
      if (failed.length) toast.error(`Could not delete ${failed.length} saved ${failed.length === 1 ? "game" : "games"}. Please try again.`);
    } finally {
      deletingRef.current = false;
      setIsDeleting(false);
    }
  };

  if (!open) return null;

  const query = playerSearch.trim().toLowerCase();
  const matchingGames = query ? games.filter(({ original, partner }) =>
    [original.players.top, original.players.bottom, partner?.players.top, partner?.players.bottom]
      .some((player) => player?.username.toLowerCase().includes(query)),
  ) : games;

  const selectedGames = games.filter((pair) => selectedKeys.has(getPairKey(pair)));
  const allMatchingSelected = matchingGames.length > 0 && matchingGames.every((pair) => selectedKeys.has(getPairKey(pair)));

  const toggleAllMatching = () => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      for (const pair of matchingGames) {
        if (allMatchingSelected) next.delete(getPairKey(pair));
        else next.add(getPairKey(pair));
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !pendingDelete) onClose();
    }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-games-title"
        className="relative flex max-h-[min(80vh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-600 bg-gray-900 text-gray-100 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <Archive className="h-5 w-5 text-gray-300" aria-hidden="true" />
            <div>
              <h2 id="saved-games-title" className="text-lg font-semibold">Saved games</h2>
              <p className="text-xs text-gray-400">Stored on this computer for offline access</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Close saved games"
            className="rounded-md p-2 text-gray-300 hover:bg-gray-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <label className="flex shrink-0 flex-col gap-1 border-b border-gray-700 px-5 py-3 text-sm">
          Search by player
          <input
            type="search"
            disabled={isDeleting}
            value={playerSearch}
            onChange={(event) => setPlayerSearch(event.target.value)}
            placeholder="Enter a username"
            className="rounded-md border border-gray-600 bg-gray-800 px-3 py-2"
          />
        </label>

        {games.length > 0 && !isLoading ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-700 px-5 py-3 text-sm">
            <button type="button" aria-pressed={allMatchingSelected} disabled={isDeleting || matchingGames.length === 0}
              onClick={toggleAllMatching}
              className="rounded font-bold text-gray-100 hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300">
              Select All
            </button>
            <span role="status" className="text-xs text-gray-400">{selectedGames.length} selected{query ? ` · ${matchingGames.length} matching games` : ""}</span>
            <button type="button" disabled={isDeleting || selectedGames.length === 0}
              onClick={() => setPendingDelete(selectedGames)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-600 px-3 py-2 text-xs font-medium text-gray-100 hover:bg-gray-700 disabled:opacity-50">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete selected
            </button>
          </div>
        ) : null}

        <div className="min-h-24 overflow-y-auto p-4">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-gray-400">Loading saved games…</p>
          ) : games.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-medium text-gray-200">No saved games yet</p>
              <p className="mt-1 text-sm text-gray-400">Games you load are saved here automatically.</p>
            </div>
          ) : matchingGames.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No saved games match that player.</p>
          ) : (
            <ul className="space-y-2">
              {matchingGames.map((pair) => {
                const key = getPairKey(pair);
                const id = pair.original.game.id.toString();
                return (
                  <li key={key} className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/70 p-3">
                    <input type="checkbox" checked={selectedKeys.has(key)} disabled={isDeleting}
                      aria-label={`Select saved game ${id}`}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-gray-300"
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSelectedKeys((current) => {
                          const next = new Set(current);
                          if (checked) next.add(key);
                          else next.delete(key);
                          return next;
                        });
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium text-gray-100">{getPlayers(pair)}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {pair.partnerId ? "Bughouse match" : "Game"} · {getGameDate(pair)} · ID {id}
                      </p>
                      {pair.partnerId ? <p className="mt-0.5 text-xs text-gray-500">Partner game {pair.partnerId}</p> : null}
                    </div>
                    <button
                      type="button"
                      aria-label={`Open saved game ${id}`}
                      disabled={isDeleting}
                      className="shrink-0 rounded-md border border-gray-600 px-2.5 py-2 text-xs font-medium text-gray-100 hover:bg-gray-700"
                      onClick={() => {
                        onClose();
                        const request = new CustomEvent("relay:open-saved-game", { detail: { id, perspectiveUsername: pair.perspectiveUsername }, cancelable: true });
                        if (window.dispatchEvent(request)) router.push(`/?gameId=${encodeURIComponent(id)}`);
                      }}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete([pair])}
                      disabled={isDeleting}
                      aria-label={`Delete saved game ${id}`}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-600 px-2.5 py-2 text-xs font-medium text-gray-300 hover:border-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Delete
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {pendingDelete ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={(event) => {
          if (event.target === event.currentTarget && !isDeleting) {
            event.stopPropagation();
            setPendingDelete(null);
          }
        }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-saved-game-title" className="w-full max-w-sm rounded-xl border border-gray-600 bg-gray-900 p-5 text-gray-100 shadow-2xl">
            <h3 id="delete-saved-game-title" className="font-semibold">Delete {pendingDelete.length === 1 ? "saved game" : `${pendingDelete.length} saved games`}?</h3>
            <p className="mt-2 text-sm text-gray-300">This removes {pendingDelete.length === 1 ? "the selected game" : "the selected games"} from this computer, including both boards of each bughouse match.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingDelete(null)} disabled={isDeleting} className="rounded-md border border-gray-600 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">Cancel</button>
              <button type="button" onClick={() => void confirmDelete()} disabled={isDeleting} className="rounded-md bg-gray-600 px-3 py-2 text-sm font-medium text-white hover:bg-gray-500 disabled:opacity-50">{isDeleting ? "Deleting…" : pendingDelete.length === 1 ? "Delete game" : "Delete games"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
