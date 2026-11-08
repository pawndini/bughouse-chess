/**
 * @module shared-games/page
 *
 * Server entry for `/shared-games`; prefetches summaries and hydrates the client grid.
 */
import SharedGamesPageClient from "./SharedGamesPageClient";
import { getAllSharedGames } from "../utils/shared-games/sharedGamesService.server";
import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { isAdminFirestoreConfigured } from "../utils/platform/firebaseAdmin";

/**
 * Shared games browsing page.
 * Fetches all shared games on the server with caching and passes them to the client component.
 */
async function SharedGamesContent() {
  // Firestore Admin data must be read at request time, not while prerendering.
  await connection();

  // Local installs can browse games without enabling community sharing.
  if (!isAdminFirestoreConfigured()) {
    return (
      <main className="flex min-h-full flex-col items-center justify-center gap-4 bg-gray-900 px-6 py-16 text-center text-gray-100">
        <h1 className="text-2xl font-semibold">Shared games are unavailable</h1>
        <p className="max-w-lg text-gray-400">
          Community sharing requires Firebase setup. You can still load and
          analyze games in the viewer without an account.
        </p>
        <Link href="/" className="rounded-md bg-mariner-600 px-4 py-2 text-white hover:bg-mariner-500">
          Go to Viewer
        </Link>
      </main>
    );
  }

  // Configured installations still report unexpected database failures.
  const games = await getAllSharedGames().catch((error) => {
    console.warn("Shared games are unavailable without Firebase configuration.", error);
    return [];
  });

  return <SharedGamesPageClient games={games} />;
}

export default function SharedGamesPage() {
  return (
    <Suspense fallback={<div className="h-full bg-gray-900" aria-label="Loading shared games" />}>
      <SharedGamesContent />
    </Suspense>
  );
}
