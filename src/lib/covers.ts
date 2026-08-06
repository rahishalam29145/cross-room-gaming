/**
 * Picks artwork for a loaded game. Known romset names get hand-picked art;
 * everything else falls back to console-agnostic key art.
 */
import heroArcade from "@/assets/hero-arcade.jpg";
import coverFighting from "@/assets/cover-fighting.jpg";
import coverGeneric from "@/assets/cover-generic.jpg";

const FIGHTERS = /(tekken|tektag|tektagt|soulclbr|kof|sf2|ssf2|sfa|mvsc|xmvsf|garou|fatfury|vf|mk)/i;
const ARCADE_EXT = /\.(zip|7z)$/i;

export function coverForGame(fileName: string): string {
  if (FIGHTERS.test(fileName)) return heroArcade;
  if (ARCADE_EXT.test(fileName)) return coverFighting;
  return coverGeneric;
}

/** Pretty display title from a romset / ISO file name. */
export function prettyGameName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}
