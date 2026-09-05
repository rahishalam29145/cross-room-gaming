import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";

const SoloStation = lazy(() => import("@/components/SoloStation"));

export const Route = createFileRoute("/play/$gameId")({
  head: () => ({
    meta: [
      { title: "Play Solo — CoOpCast Retro Library" },
      {
        name: "description",
        content:
          "Play any retro game from the shared CoOpCast cloud library right in your browser — no download, no setup, with full on-screen controls.",
      },
      { property: "og:title", content: "Play Solo — CoOpCast Retro Library" },
      {
        property: "og:description",
        content: "Instant single-player retro gaming from the shared cloud library.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlayPage,
});

function PlayPage() {
  const { gameId } = Route.useParams();
  return (
    <main>
      <ErrorBoundary label="SOLO PLAY CRASHED">
        <ClientOnly fallback={<Skeleton />}>
          <Suspense fallback={<Skeleton />}>
            <SoloStation gameId={gameId} />
          </Suspense>
        </ClientOnly>
      </ErrorBoundary>
    </main>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto mt-6 h-64 w-full max-w-5xl animate-pulse rounded-xl border border-border bg-card" />
  );
}
