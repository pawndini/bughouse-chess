import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PlayerGameBrowser from "@/app/components/viewer/PlayerGameBrowser";
import { saveOfflineGamePairs } from "@/app/utils/offlineGameStore";
import type { OfflineGamePair } from "@/app/utils/offlineGameStore";
import { findPlayerBughouseGames } from "@/app/actions";
vi.mock("@/app/actions", () => ({ findPlayerBughouseGames: vi.fn() }));
vi.mock("@/app/utils/offlineGameStore", () => ({ saveOfflineGamePairs: vi.fn() }));
const offlinePair = { original: { game: { id: 12345678901 } }, partner: { game: { id: 12345678902 } }, partnerId: "12345678902", perspectiveUsername: "bob" } as unknown as OfflineGamePair;
beforeEach(() => { window.localStorage.clear(); vi.clearAllMocks(); vi.mocked(saveOfflineGamePairs).mockResolvedValue(undefined); });
const dialogMethods = ["showModal", "close"] as const;
const originalMethods = dialogMethods.map((name) => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));
afterEach(() => {
  cleanup();
  dialogMethods.forEach((name, index) => {
    const original = originalMethods[index];
    if (original) Object.defineProperty(HTMLDialogElement.prototype, name, original);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  });
});
describe("player-search load perspective", () => {
  it("passes the searched username with the selected ID to the viewer", async () => {
    const close = vi.fn();
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: close });
    vi.mocked(findPlayerBughouseGames).mockResolvedValue({ games: [{
      id: "12345678901", partnerId: "12345678902", username: "bob", date: "2026-11-06T12:00:00Z",
      white: "Alice", black: "Bob", partnerWhite: "Carol", partnerBlack: "Dave", result: "1-0", timeControl: "180",
    }], offlineGames: [offlinePair] });
    const onLoad = vi.fn();
    render(<PlayerGameBrowser onLoad={onLoad} />);
    fireEvent.click(screen.getByRole("button", { name: "Find player games" }));
    fireEvent.change(screen.getByLabelText("Chess.com username"), { target: { value: "Bob" } });
    expect(screen.getByRole("checkbox", { name: "Exclude one-move games" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Found and saved 1 games. Open them here or from Saved Games.");
    expect(saveOfflineGamePairs).toHaveBeenCalledWith([offlinePair]);
    expect(onLoad).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Load game 12345678901" }));
    expect(findPlayerBughouseGames).toHaveBeenCalledWith("Bob", 1, true);
    expect(onLoad).toHaveBeenCalledWith("12345678901", "bob");
    expect(close).toHaveBeenCalled();
  });
});

it("keeps search results usable and reports a local-save failure", async () => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  vi.mocked(findPlayerBughouseGames).mockResolvedValue({ games: [{
    id: "12345678901", partnerId: "12345678902", username: "bob", date: "2026-11-06T12:00:00Z",
    white: "Alice", black: "Bob", partnerWhite: "Carol", partnerBlack: "Dave", result: "1-0", timeControl: "180",
  }], offlineGames: [offlinePair] });
  vi.mocked(saveOfflineGamePairs).mockRejectedValue(new Error("Storage full"));
  render(<PlayerGameBrowser onLoad={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Find player games" }));
  fireEvent.change(screen.getByLabelText("Chess.com username"), { target: { value: "Bob" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await screen.findByText(/could not save them on this computer/);
  expect(screen.getByRole("button", { name: "Load game 12345678901" })).toBeEnabled();
});

it("defaults to excluding one-move games and remembers explicit changes after reopening and remounting", () => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  const first = render(<PlayerGameBrowser onLoad={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Find player games" }));
  const checkbox = screen.getByRole("checkbox", { name: "Exclude one-move games" });
  expect(checkbox).toBeChecked();
  fireEvent.click(checkbox);
  expect(checkbox).not.toBeChecked();
  expect(window.localStorage.getItem("relay:exclude-one-move-games")).toBe("false");
  first.unmount();
  const second = render(<PlayerGameBrowser onLoad={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Find player games" }));
  const remembered = screen.getByRole("checkbox", { name: "Exclude one-move games" });
  expect(remembered).not.toBeChecked();
  fireEvent.click(remembered);
  expect(window.localStorage.getItem("relay:exclude-one-move-games")).toBe("true");
  second.unmount();
  render(<PlayerGameBrowser onLoad={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Find player games" }));
  expect(screen.getByRole("checkbox", { name: "Exclude one-move games" })).toBeChecked();
});

it("uses an unchecked choice for subsequent searches until the user checks it again", async () => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  vi.mocked(findPlayerBughouseGames).mockResolvedValue({ games: [], offlineGames: [] });
  render(<PlayerGameBrowser onLoad={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Find player games" }));
  fireEvent.change(screen.getByLabelText("Chess.com username"), { target: { value: "Bob" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Exclude one-move games" }));
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Search" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Search" })).toBeEnabled());
  fireEvent.click(screen.getByRole("checkbox", { name: "Exclude one-move games" }));
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Search" })).toBeEnabled());
  expect(vi.mocked(findPlayerBughouseGames).mock.calls.map((args) => args[2])).toEqual([false, false, true]);
});
