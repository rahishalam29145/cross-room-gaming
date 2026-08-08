import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";

const HostStation = lazy(() => import("@/components/HostStation"));

export const Route = createFileRoute("/host")({
  head: () => ({
    meta: [
      { title: "Host a Room — CoOpCast Retro Co-op" },
      {
        name: "description",
        content:
          "Load a retro ROM in your browser, generate a room code, and stream the game to a remote Player 2 with live controls.",
      },
      { property: "og:title", content: "Host a Room — CoOpCast Retro Co-op" },
      {
        property: "og:description",
        content: "Load a ROM, share a room code, and play retro co-op with a friend anywhere.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HostPage,
});

function HostPage() {
  return (
    <main>
      <header className="mx-auto w-full max-w-5xl px-4 pt-8">
        <p className="font-mono text-xs tracking-[0.35em] text-primary">PLAYER 1 — HOST</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground">Room banaiye</h1>
      </header>
      <ClientOnly fallback={<Skeleton />}>
        <Suspense fallback={<Skeleton />}>
          <HostStation />
        </Suspense>
      </ClientOnly>
    </main>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto mt-6 h-64 w-full max-w-5xl animate-pulse rounded-xl border border-border bg-card" />
  );
}
