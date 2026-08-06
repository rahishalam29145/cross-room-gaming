import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { Gamepad2, Radio, ShieldCheck, Wifi } from "lucide-react";

const LobbyList = lazy(() => import("@/components/LobbyList"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CoOpCast — Retro ROM Multiplayer Over the Internet" },
      {
        name: "description",
        content:
          "Upload a retro ROM in your browser, share a room code, and let a friend thousands of km away see the screen and play as Player 2.",
      },
      { property: "og:title", content: "CoOpCast — Retro ROM Multiplayer Over the Internet" },
      {
        property: "og:description",
        content:
          "Upload a retro ROM in your browser, share a room code, and let a friend thousands of km away see the screen and play as Player 2.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-20">
      <section className="scanlines relative mt-10 overflow-hidden rounded-2xl border border-border bg-card p-8 sm:p-12">
        <img
          src={heroArcade}
          alt="Arcade fighting game key art"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
        <div className="relative">
        <p className="font-mono text-xs tracking-[0.35em] text-primary">2-PLAYER · ONE CARTRIDGE</p>
        <h1 className="mt-4 max-w-2xl text-4xl font-black leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          Ek ROM. Do players. Hazaaron kilometre door.
        </h1>

        <p className="mt-5 max-w-xl text-base text-muted-foreground">
          Player 1 apni retro game file browser me load karta hai. Player 2 sirf room code daalta
          hai — usko poori game screen live dikhti hai aur uske controls seedhe game me jaate hain.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/host"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Radio className="h-4 w-4" aria-hidden />
            Create room (Player 1)
          </Link>
          <Link
            to="/join"
            search={{ code: "" }}
            className="inline-flex items-center gap-2 rounded-md border border-chart-2 px-6 py-3 text-sm font-semibold text-chart-2 transition-colors hover:bg-chart-2/10"
          >
            <Gamepad2 className="h-4 w-4" aria-hidden />
            Join room (Player 2)
          </Link>
        </div>
      </section>

      <ClientOnly fallback={null}>
        <Suspense fallback={null}>
          <LobbyList />
        </Suspense>
      </ClientOnly>


      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        <Feature
          icon={<ShieldCheck className="h-5 w-5 text-primary" aria-hidden />}
          title="ROM kahin upload nahi hoti"
          body="Game file sirf Player 1 ke browser me load hoti hai. Koi server copy nahi rakhta."
        />
        <Feature
          icon={<Wifi className="h-5 w-5 text-chart-2" aria-hidden />}
          title="Direct peer-to-peer"
          body="Video aur controls dono players ke beech seedhe jaate hain — sabse kam latency."
        />
        <Feature
          icon={<Gamepad2 className="h-5 w-5 text-chart-3" aria-hidden />}
          title="Asli Player 2 port"
          body="Guest ke buttons emulator ke second controller port par jaate hain, mirror nahi."
        />
      </section>

      <section className="mt-10 rounded-xl border border-border bg-card p-6">
        <h2 className="font-mono text-sm tracking-[0.25em] text-muted-foreground">HOW IT WORKS</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-4">
          {[
            "Player 1 ROM load karta hai",
            "Room code milta hai",
            "Player 2 code daal ke judta hai",
            "Dono saath khelte hain",
          ].map((step, i) => (
            <li key={step} className="rounded-lg border border-border bg-muted/30 p-4">
              <span className="font-mono text-2xl font-bold text-primary">{`0${i + 1}`}</span>
              <p className="mt-2 text-sm text-foreground">{step}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs text-muted-foreground">
          Sirf woh ROMs use karein jinke aap maalik hain. Player 1 ka tab open rehna zaroori hai —
          game wahin chalti hai.
        </p>
      </section>
    </main>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      {icon}
      <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
