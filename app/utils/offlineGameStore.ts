import type { ChessGame } from "../actions";

export interface OfflineGamePair {
  original: ChessGame;
  partner: ChessGame | null;
  partnerId: string | null;
  perspectiveUsername?: string;
}

const DATABASE_NAME = "relay-offline-games";
const DATABASE_VERSION = 2;
const MATCH_STORE = "matches";
const BOARD_INDEX = "board-index";
const LEGACY_STORE = "game-pairs";

/** Prefer actual board records over older partner-ID metadata. */
function getPartnerBoardId(pair: OfflineGamePair): string | null {
  const value = pair.partner?.game.id ?? pair.original.game.partnerGameId ?? pair.partnerId;
  if (value == null) return null;
  const id = String(value).trim();
  return id && id !== String(pair.original.game.id) ? id : null;
}

function boardIds(pair: OfflineGamePair): string[] {
  return [...new Set([String(pair.original.game.id), getPartnerBoardId(pair)].filter((id): id is string => Boolean(id)))];
}

function matchKey(pair: OfflineGamePair): string {
  return boardIds(pair).sort().join(":");
}

function withPlayerBoardFirst(pair: OfflineGamePair): OfflineGamePair {
  const normalized = { ...pair, partnerId: getPartnerBoardId(pair) };
  const player = pair.perspectiveUsername?.trim().toLowerCase();
  if (!player || !pair.partner) return normalized;
  const includesPlayer = (game: ChessGame) => [
    game.game.pgnHeaders?.White, game.game.pgnHeaders?.Black,
    game.players?.top?.username, game.players?.bottom?.username,
  ].some((name) => name?.trim().toLowerCase() === player);
  if (includesPlayer(pair.original) || !includesPlayer(pair.partner)) return normalized;
  return { ...normalized, original: pair.partner, partner: pair.original, partnerId: String(pair.original.game.id) };
}

/** Collapse legacy reverse/standalone records before the atomic version upgrade. */
function mergeLegacyMatches(pairs: OfflineGamePair[]): OfflineGamePair[] {
  const records = pairs.map(withPlayerBoardFirst)
    .sort((a, b) => Number(Boolean(b.partner)) - Number(Boolean(a.partner)));
  const keyByBoard = new Map<string, string>();
  for (const pair of records) {
    if (!pair.partnerId) continue;
    for (const id of boardIds(pair)) {
      if (!keyByBoard.has(id)) keyByBoard.set(id, matchKey(pair));
    }
  }
  const unique = new Map<string, OfflineGamePair>();
  for (const pair of records) {
    const key = keyByBoard.get(String(pair.original.game.id)) ?? matchKey(pair);
    const existing = unique.get(key);
    const snapshot = existing && (existing.partner || !pair.partner) ? existing : pair;
    const perspectiveUsername = existing?.perspectiveUsername?.trim() || pair.perspectiveUsername?.trim();
    unique.set(key, withPlayerBoardFirst({ ...snapshot, perspectiveUsername }));
  }
  return [...unique.values()];
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not access saved games."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  const done = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not update saved games."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Saved-game transaction was cancelled."));
  });
  // A request may reject before its transaction's rejection is awaited.
  void done.catch(() => undefined);
  return done;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    let upgrading = false;
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      upgrading = true;
      const database = request.result;
      const transaction = request.transaction!;
      const matches = database.createObjectStore(MATCH_STORE);
      const lookup = database.createObjectStore(BOARD_INDEX);
      if (!database.objectStoreNames.contains(LEGACY_STORE)) return;
      const legacy = transaction.objectStore(LEGACY_STORE).getAll();
      legacy.onsuccess = () => {
        try {
          for (const pair of mergeLegacyMatches(legacy.result as OfflineGamePair[])) {
            const key = matchKey(pair);
            matches.put(pair, key);
            for (const id of boardIds(pair)) lookup.put(key, id);
          }
          // The upgrade transaction commits the new stores and removal together.
          // Any failure restores the original store and all existing saves.
          database.deleteObjectStore(LEGACY_STORE);
        } catch {
          transaction.abort();
        }
      };
      legacy.onerror = () => transaction.abort();
    };
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Close other Bug Bully tabs or windows, then reopen Saved Games to finish the storage upgrade."));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) { database.close(); return; }
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(upgrading
      ? new Error("Could not upgrade saved games. Your existing saves have been kept. Restart Bug Bully and try again.")
      : request.error ?? new Error("Offline game storage is unavailable."));
  });
}

/** Either board ID loads a view of the same saved match; no second payload is stored. */
export async function getOfflineGamePair(gameId: string): Promise<OfflineGamePair | null> {
  if (typeof indexedDB === "undefined") return null;
  const database = await openDatabase();
  try {
    const transaction = database.transaction([MATCH_STORE, BOARD_INDEX], "readonly");
    const done = transactionDone(transaction);
    const key = await requestResult(transaction.objectStore(BOARD_INDEX).get(gameId)) as string | undefined;
    const pair = key ? await requestResult(transaction.objectStore(MATCH_STORE).get(key)) as OfflineGamePair | undefined : undefined;
    await done;
    if (!pair) return null;
    if (String(pair.original.game.id) === gameId) return pair;
    if (pair.partner && String(pair.partner.game.id) === gameId) {
      return { ...pair, original: pair.partner, partner: pair.original, partnerId: String(pair.original.game.id) };
    }
    return null;
  } finally { database.close(); }
}

export async function getAllOfflineGamePairs(): Promise<OfflineGamePair[]> {
  if (typeof indexedDB === "undefined") return [];
  const database = await openDatabase();
  try {
    const transaction = database.transaction(MATCH_STORE, "readonly");
    const done = transactionDone(transaction);
    const pairs = await requestResult(transaction.objectStore(MATCH_STORE).getAll()) as OfflineGamePair[];
    await done;
    return pairs.map(withPlayerBoardFirst);
  } finally { database.close(); }
}

/** Remove one match and its small board-ID lookup entries. */
export async function deleteOfflineGamePair(gameId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction([MATCH_STORE, BOARD_INDEX], "readwrite");
    const done = transactionDone(transaction);
    const lookup = transaction.objectStore(BOARD_INDEX);
    const matches = transaction.objectStore(MATCH_STORE);
    const key = await requestResult(lookup.get(gameId)) as string | undefined;
    if (key) {
      const pair = await requestResult(matches.get(key)) as OfflineGamePair | undefined;
      matches.delete(key);
      if (pair) for (const id of boardIds(pair)) lookup.delete(id);
    }
    await done;
  } finally { database.close(); }
}

/** Keep a complete saved partner board when refreshing only one board by ID. */
function mergeSavedPair(previous: OfflineGamePair[], incoming: OfflineGamePair): OfflineGamePair {
  const complete = previous.find((pair) => pair.partner);
  let snapshot = incoming;
  if (!incoming.partner && complete) {
    snapshot = String(complete.original.game.id) === String(incoming.original.game.id)
      ? { ...complete, original: incoming.original }
      : { ...complete, partner: incoming.original };
  }
  const perspectiveUsername = incoming.perspectiveUsername?.trim()
    || previous.find((pair) => pair.perspectiveUsername)?.perspectiveUsername;
  return withPlayerBoardFirst({ ...snapshot, perspectiveUsername });
}

/** Store each match once; both board IDs point to its canonical record. */
export async function saveOfflineGamePairs(pairs: OfflineGamePair[]): Promise<void> {
  if (pairs.length === 0) return;
  if (typeof indexedDB === "undefined") throw new Error("Offline game storage is unavailable.");
  const database = await openDatabase();
  const transaction = database.transaction([MATCH_STORE, BOARD_INDEX], "readwrite");
  const done = transactionDone(transaction);
  try {
    const matches = transaction.objectStore(MATCH_STORE);
    const lookup = transaction.objectStore(BOARD_INDEX);
    for (const incoming of pairs) {
      const oldKeys = await Promise.all(boardIds(incoming).map((id) => requestResult(lookup.get(id)) as Promise<string | undefined>));
      const keys = [...new Set([matchKey(incoming), ...oldKeys.filter((key): key is string => Boolean(key))])];
      const previous = (await Promise.all(keys.map((key) => requestResult(matches.get(key)) as Promise<OfflineGamePair | undefined>)))
        .filter((pair): pair is OfflineGamePair => Boolean(pair));
      const pair = mergeSavedPair(previous, incoming);
      const key = matchKey(pair);
      const ids = boardIds(pair);
      for (const old of previous) {
        const oldKey = matchKey(old);
        if (oldKey !== key) matches.delete(oldKey);
        for (const id of boardIds(old)) if (!ids.includes(id)) lookup.delete(id);
      }
      matches.put(pair, key);
      for (const id of ids) lookup.put(key, id);
    }
    await done;
  } catch (error) {
    try { transaction.abort(); } catch { /* Already aborted or completed. */ }
    await done.catch(() => undefined);
    throw error;
  } finally { database.close(); }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("relay:saved-games-updated"));
}

export async function saveOfflineGamePair(pair: OfflineGamePair): Promise<void> {
  await saveOfflineGamePairs([pair]);
}
