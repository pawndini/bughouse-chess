import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SavedGamesModal from "@/app/components/modals/SavedGamesModal";
import { deleteOfflineGamePair, getAllOfflineGamePairs, type OfflineGamePair } from "@/app/utils/offlineGameStore";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/utils/offlineGameStore", () => ({ deleteOfflineGamePair: vi.fn(), getAllOfflineGamePairs: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

function pair(id: number, player: string): OfflineGamePair {
  return { original: { game: { id, pgnHeaders: { Date: "2026.11.06" } }, players: { top: { username: player }, bottom: { username: "opponent" } } }, partner: null, partnerId: String(id + 100) } as unknown as OfflineGamePair;
}
const fixtures = [pair(101, "alice"), pair(102, "alice"), pair(103, "bob")];
async function open() {
  render(<SavedGamesModal open onClose={vi.fn()} />);
  await screen.findByRole("checkbox", { name: "Select saved game 101" });
}
beforeEach(() => {
  cleanup(); vi.clearAllMocks();
  vi.mocked(getAllOfflineGamePairs).mockResolvedValue(fixtures);
  vi.mocked(deleteOfflineGamePair).mockResolvedValue(undefined);
});

describe("saved game selection and deletion", () => {
  it("toggles individual games and Select All without deleting anything", async () => {
    await open();
    expect(screen.getByRole("button", { name: "Delete selected" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select saved game 101" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    expect(screen.getAllByRole("checkbox").every((box) => (box as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole("button", { name: "Select All" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    expect(screen.getAllByRole("checkbox").some((box) => (box as HTMLInputElement).checked)).toBe(false);
    expect(deleteOfflineGamePair).not.toHaveBeenCalled();
  });
  it("selects filtered results and preserves selections outside the filter", async () => {
    await open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select saved game 103" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "alice" } });
    fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    expect(screen.getByText("3 selected · 2 matching games")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    expect(screen.getByText("1 selected · 2 matching games")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(screen.getByRole("checkbox", { name: "Select saved game 103" })).toBeChecked();
  });
  it("requires confirmation and lets outside clicks cancel the pending batch", async () => {
    await open(); fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Delete 3 saved games?")).toBeInTheDocument();
    fireEvent.click(dialog.parentElement!);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(deleteOfflineGamePair).not.toHaveBeenCalled();
    expect(screen.getByText("3 selected")).toBeInTheDocument();
  });
  it("deletes only the confirmed filtered selection and preserves other saved games", async () => {
    await open();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "alice" } });
    fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete games" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(vi.mocked(deleteOfflineGamePair).mock.calls).toEqual([["101"], ["102"]]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "Select saved game 103" })).not.toBeChecked();
  });
  it("keeps failed deletions selected and retries only those failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(deleteOfflineGamePair).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Storage unavailable")).mockResolvedValue(undefined);
    await open();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "alice" } });
    fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete games" }));
    await screen.findByRole("heading", { name: "Delete saved game?" });
    expect(screen.getByRole("checkbox", { name: "Select saved game 102" })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Select saved game 101" })).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete game" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(vi.mocked(deleteOfflineGamePair).mock.calls).toEqual([["101"], ["102"], ["102"]]);
    error.mockRestore();
  });
  it("keeps the existing single-game delete action working", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Delete saved game 103" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete game" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(vi.mocked(deleteOfflineGamePair).mock.calls).toEqual([["103"]]);
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });
});

it("refreshes the visible library when a search saves new games", async () => {
  await open();
  vi.mocked(getAllOfflineGamePairs).mockResolvedValue([...fixtures, pair(104, "carol")]);
  await act(async () => { window.dispatchEvent(new Event("relay:saved-games-updated")); });
  expect(await screen.findByRole("checkbox", { name: "Select saved game 104" })).toBeInTheDocument();
});
