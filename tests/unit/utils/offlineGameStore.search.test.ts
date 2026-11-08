import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore as FakeObjectStore } from "fake-indexeddb";
import { computePlayerPerspectiveFlip } from "@/app/utils/board/matchBoardOrientation";
import { deleteOfflineGamePair, getAllOfflineGamePairs, getOfflineGamePair, saveOfflineGamePair, saveOfflineGamePairs, type OfflineGamePair } from "@/app/utils/offlineGameStore";

const name = "relay-offline-games";
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error); transaction.onerror = () => reject(transaction.error); });
}
async function seedLegacy(pairs: OfflineGamePair[]): Promise<void> {
  const request = indexedDB.open(name, 1);
  request.onupgradeneeded = () => request.result.createObjectStore("game-pairs");
  const database = await result(request);
  const transaction = database.transaction("game-pairs", "readwrite");
  for (const pair of pairs) transaction.objectStore("game-pairs").put(pair, String(pair.original.game.id));
  await done(transaction); database.close();
}
async function inspect() {
  const database = await result(indexedDB.open(name));
  const names = [...database.objectStoreNames];
  const transaction = database.transaction(names, "readonly");
  const data = await Promise.all(names.map(async (store) => [store, await result(transaction.objectStore(store).getAll())] as const));
  await done(transaction);
  const version = database.version; database.close();
  return { version, stores: Object.fromEntries(data) };
}
function pair(id: number): OfflineGamePair {
  return { original: { game: { id, pgnHeaders: { White: "Opponent", Black: "Alice" } } },
    partner: { game: { id: id + 1, pgnHeaders: { White: "Partner", Black: "Other" } } },
    partnerId: String(id + 1), perspectiveUsername: "alice" } as unknown as OfflineGamePair;
}
function reverse(pair: OfflineGamePair): OfflineGamePair {
  return { ...pair, original: pair.partner!, partner: pair.original, partnerId: String(pair.original.game.id) };
}
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("one-record offline matches", () => {
  it("stores eight match payloads and sixteen small ID lookups; repeat saves do not grow storage", async () => {
    const pairs = Array.from({ length: 8 }, (_, index) => pair(1001 + index * 10));
    await saveOfflineGamePairs(pairs);
    await saveOfflineGamePairs(pairs.map(reverse));
    expect(await getAllOfflineGamePairs()).toHaveLength(8);
    const database = await inspect();
    expect(database.version).toBe(2);
    expect(database.stores.matches).toHaveLength(8);
    expect(database.stores["board-index"]).toHaveLength(16);
    expect(database.stores["board-index"].every((value: unknown) => typeof value === "string")).toBe(true);
    expect(database.stores).not.toHaveProperty("game-pairs");
  });
  it("loads either ID from one record, returning the requested board as original", async () => {
    await saveOfflineGamePair(pair(101));
    expect((await getOfflineGamePair("101"))?.original.game.id).toBe(101);
    const other = await getOfflineGamePair("102");
    expect(other?.original.game.id).toBe(102);
    expect(other?.partner?.game.id).toBe(101);
    expect(other?.perspectiveUsername).toBe("alice");
    expect(await getOfflineGamePair("unknown")).toBeNull();
    expect((await inspect()).stores.matches).toHaveLength(1);
  });
  it("preserves perspective when re-saving through the partner ID without a username", async () => {
    await saveOfflineGamePair(pair(101));
    const incoming = reverse(pair(101)); delete incoming.perspectiveUsername;
    await saveOfflineGamePair(incoming);
    const [saved] = await getAllOfflineGamePairs();
    expect(saved.original.game.id).toBe(101);
    expect(saved.perspectiveUsername).toBe("alice");
    expect(computePlayerPerspectiveFlip(saved, saved.perspectiveUsername)).toBe(true);
  });
  it("keeps the complete partner snapshot when only one board is refreshed", async () => {
    await saveOfflineGamePair(pair(101));
    await saveOfflineGamePair({ original: pair(101).partner!, partner: null, partnerId: null });
    const [saved] = await getAllOfflineGamePairs();
    expect(saved.original.game.id).toBe(101);
    expect(saved.partner?.game.id).toBe(102);
    expect((await inspect()).stores.matches).toHaveLength(1);
  });
  it("replaces standalone records when the full two-board match becomes available", async () => {
    const entry = pair(101);
    await saveOfflineGamePairs([
      { original: entry.original, partner: null, partnerId: null },
      { original: entry.partner!, partner: null, partnerId: null },
    ]);
    expect((await inspect()).stores.matches).toHaveLength(2);
    await saveOfflineGamePair(entry);
    expect((await inspect()).stores.matches).toHaveLength(1);
    expect((await inspect()).stores["board-index"]).toHaveLength(2);
  });
  it("deletes a match and both lookups using either board ID, preserving unrelated matches", async () => {
    await saveOfflineGamePairs([pair(101), pair(201)]);
    await deleteOfflineGamePair("102");
    expect(await getOfflineGamePair("101")).toBeNull();
    expect(await getOfflineGamePair("102")).toBeNull();
    expect((await getOfflineGamePair("201"))?.partner?.game.id).toBe(202);
    expect((await inspect()).stores.matches).toHaveLength(1);
    expect((await inspect()).stores["board-index"]).toHaveLength(2);
  });
  it("uses embedded board IDs instead of stale partner metadata", async () => {
    await saveOfflineGamePair({ ...pair(101), partnerId: "999" });
    expect((await getOfflineGamePair("102"))?.partnerId).toBe("101");
    expect(await getOfflineGamePair("999")).toBeNull();
  });
  it("rolls back the entire batch if a later write fails", async () => {
    await saveOfflineGamePair(pair(301));
    const put = FakeObjectStore.prototype.put;
    vi.spyOn(FakeObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === "matches" && key === "201:202") throw new Error("Quota exceeded");
      return put.call(this, value, key);
    });
    await expect(saveOfflineGamePairs([pair(101), pair(201)])).rejects.toThrow("Quota exceeded");
    expect((await getAllOfflineGamePairs()).map((entry) => entry.original.game.id)).toEqual([301]);
    expect((await inspect()).stores["board-index"]).toHaveLength(2);
  });
  it("notifies the library only after a successful save", async () => {
    const updated = vi.fn(); window.addEventListener("relay:saved-games-updated", updated);
    try {
      await saveOfflineGamePairs([pair(101)]);
      expect(updated).toHaveBeenCalledOnce();
      expect(await getOfflineGamePair("101")).not.toBeNull();
    } finally { window.removeEventListener("relay:saved-games-updated", updated); }
  });
  it("reports unavailable storage instead of claiming results were saved", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(saveOfflineGamePairs([pair(101)])).rejects.toThrow("unavailable");
  });
});

describe("version-one storage migration", () => {
  it("replaces sixteen old copies with eight records, preserving both boards and player perspective", async () => {
    const entries: OfflineGamePair[] = [];
    for (let index = 0; index < 8; index += 1) {
      const entry = pair(1001 + index * 10);
      entries.push({ ...entry, partnerId: null });
      const other = { ...reverse(entry), partnerId: "outdated" }; delete other.perspectiveUsername;
      entries.push(other);
    }
    await seedLegacy(entries);
    const games = await getAllOfflineGamePairs();
    expect(games).toHaveLength(8);
    for (const game of games) {
      expect(game.original.game.pgnHeaders.Black).toBe("Alice");
      expect(game.perspectiveUsername).toBe("alice");
      expect(await getOfflineGamePair(String(game.partner!.game.id))).not.toBeNull();
    }
    const database = await inspect();
    expect(database.stores.matches).toHaveLength(8);
    expect(database.stores["board-index"]).toHaveLength(16);
    expect(database.stores).not.toHaveProperty("game-pairs");
  });
  it("merges an incomplete old copy into its complete match", async () => {
    const entry = pair(101);
    await seedLegacy([entry, { original: entry.partner!, partner: null, partnerId: null }]);
    const games = await getAllOfflineGamePairs();
    expect(games).toHaveLength(1);
    expect(games[0].partner).not.toBeNull();
  });
  it("leaves all original saves intact if the upgrade fails", async () => {
    const entry = pair(101); await seedLegacy([entry, reverse(entry)]);
    const put = FakeObjectStore.prototype.put;
    vi.spyOn(FakeObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === "matches") throw new Error("Upgrade write failed");
      return put.call(this, value, key);
    });
    await expect(getAllOfflineGamePairs()).rejects.toBeTruthy();
    const database = await inspect();
    expect(database.version).toBe(1);
    expect(database.stores["game-pairs"]).toHaveLength(2);
    expect(database.stores).not.toHaveProperty("matches");
    vi.restoreAllMocks();
    expect(await getAllOfflineGamePairs()).toHaveLength(1);
  });
});

it("reports a blocked upgrade and succeeds once the old connection closes", async () => {
  await seedLegacy([pair(101), reverse(pair(101))]);
  const oldConnection = await result(indexedDB.open(name, 1));
  try {
    await expect(getAllOfflineGamePairs()).rejects.toThrow("Close other Bug Bully tabs or windows");
  } finally { oldConnection.close(); }
  expect(await getAllOfflineGamePairs()).toHaveLength(1);
});
