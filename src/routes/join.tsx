import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

const GuestStation = lazy(() => import("@/components/GuestStation"));

export const Route = createFileRoute("/join")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search["code"] === "string" ? search["code"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Join a Room — CoOpCast Retro Co-op" },
      {
        name: "description",
        content:
          "Enter a room code to watch your friend's retro game live and play as Player 2 — no game file needed on your device.",
      },
      { property: "og:title", content: "Join a Room — CoOpCast Retro Co-op" },
      {
        property: "og:description",
        content: "Enter a room code and play as Player 2 from anywhere. No download required.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { code } = Route.useSearch();
  return (
    <main>
      <header className="mx-auto w-full max-w-3xl px-4 pt-8">
        <p className="font-mono text-xs tracking-[0.35em] text-chart-2">PLAYER 2 — GUEST</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground">Room join karein</h1>
      </header>
      <ClientOnly fallback={<Skeleton />}>
        <Suspense fallback={<Skeleton />}>
          <GuestStation initialCode={code} />
        </Suspense>
      </ClientOnly>
    </main>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto mt-6 h-64 w-full max-w-3xl animate-pulse rounded-xl border border-border bg-card" />
  );
}
