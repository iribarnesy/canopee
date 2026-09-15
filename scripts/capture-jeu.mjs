/**
 * Capture l'ÉCRAN DE JEU en PNG, sans navigateur visible.
 *
 * **Pourquoi celui-ci en plus du banc d'aperçu** : `apercu:capture` juge le
 * dessin d'une essence ou d'une mise en scène, sur une scène cuite d'avance.
 * Il ne dit rien de ce que la note de rôle demande de vérifier — « est-ce que
 * c'est agréable », qui ne se juge que sur l'écran où l'on joue, avec son HUD,
 * ses panneaux et sa parcelle vivante. Aucun essai ne le dit, et aucune planche
 * d'aperçu non plus.
 *
 * Le script démarre une partie comme un joueur : il pousse le curseur de
 * vieillissement pour avoir un peuplement à regarder plutôt qu'un terrain nu,
 * clique sur « Démarrer », attend que la parcelle soit montée, puis
 * photographie la page.
 *
 * Usage :
 *   npm run dev                                   # dans un terminal
 *   SORTIE=/tmp/jeu npm run apercu:jeu
 *
 * Variables : `SORTIE` (dossier, obligatoire), `URL_JEU` (défaut
 * `http://localhost:5173/`), `ANS` (vieillissement, défaut 40), `POSE_MS`
 * (temps laissé à la scène pour cuire ses vignettes, défaut 6000) et `MOIS`
 * (mois auquel photographier, défaut « juillet » — vide pour rester en
 * janvier, où la partie commence et où tout est nu).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const DIR = process.env.SORTIE;
if (!DIR) throw new Error("SORTIE manquant : où écrire les captures ?");
const URL_JEU = process.env.URL_JEU ?? "http://localhost:5173/";
const ANS = process.env.ANS ?? "40";
const POSE_MS = Number(process.env.POSE_MS ?? 6000);
/** Mois auquel photographier ; vide = on reste en janvier, au départ de la partie. */
const MOIS = process.env.MOIS ?? "juillet";
/** Crans de molette pour la seconde capture, de près. */
const CRANS = Number(process.env.CRANS ?? 9);
mkdirSync(DIR, { recursive: true });

const nav = await chromium.launch({
  // Le Chromium préinstallé de l'environnement, et un GL logiciel : la capture
  // tourne sans carte graphique.
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await nav.newPage({ viewport: { width: 1280, height: 1000 } });
const bavures = [];
page.on("pageerror", (e) => bavures.push(`[pageerror] ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") bavures.push(`[console] ${m.text()}`);
});

await page.goto(URL_JEU, { waitUntil: "load" });

// Une partie sauvegardée ferait démarrer sur « Reprendre » : on part toujours
// d'une page propre, sinon la capture dépend de ce qu'une exécution
// précédente a laissé.
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "load" });

// Un peuplement plutôt qu'un terrain nu : sans vieillissement il n'y a rien à
// regarder, et c'est le dessin des arbres qu'on vient juger.
await page.fill("#maturation", ANS);
await page.dispatchEvent("#maturation", "input");
await page.getByRole("button", { name: "Démarrer" }).click();

// La parcelle est montée quand la vue isométrique existe ET que le moteur a
// fini de vieillir le terrain — ce qui prend d'autant plus longtemps qu'on lui
// a demandé d'années.
await page.waitForSelector(".vue-parcelle canvas", { timeout: 600000 });

// **On avance jusqu'à un mois où le feuillage est là.** La partie commence en
// janvier : juger un peuplement sur des tiges nues dirait surtout que l'hiver
// est nu. On ne triche pas sur la saison pour autant — c'est le moteur qui
// fait passer les semaines, on attend seulement celle qu'on veut voir.
if (MOIS) {
  await page.getByRole("button", { name: "×13" }).click();
  await page
    .locator(".bandeau strong", { hasText: new RegExp(`· ${MOIS}$`) })
    .first()
    .waitFor({ timeout: 300000 });
  await page.getByRole("button", { name: "⏸" }).click();
}

await page.waitForTimeout(POSE_MS);

await page.screenshot({ path: `${DIR}/jeu.png`, fullPage: true });
await page.locator(".vue-parcelle").screenshot({ path: `${DIR}/parcelle.png` });

// **Et la même parcelle de près.** Au zoom d'ensemble, un arbre fait quelques
// pixels : c'est le bon cadrage pour juger un peuplement, et le mauvais pour
// juger un arbre. Les deux comptent, donc on prend les deux.
const vue = page.locator(".vue-parcelle");
const boite = await vue.boundingBox();
if (boite) {
  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  for (let i = 0; i < CRANS; i++) await page.mouse.wheel(0, -120);
  await page.waitForTimeout(POSE_MS);
  await vue.screenshot({ path: `${DIR}/parcelle-zoom.png` });
}
console.log(`écrit dans ${DIR} : jeu.png, parcelle.png, parcelle-zoom.png`);
if (bavures.length > 0) {
  console.log("--- la page a rouspété :");
  for (const b of bavures.slice(0, 20)) console.log(b);
}
await nav.close();
