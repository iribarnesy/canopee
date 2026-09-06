/**
 * Capture les planches du banc d'aperçu en PNG, sans navigateur visible.
 *
 * **Pourquoi un script et pas un essai** : ces planches ne se jugent pas par
 * une assertion. Une couleur d'écorce, un renflement de trogne, la largeur
 * d'un manchon — on les regarde, et c'est en les regardant qu'on voit qu'une
 * planche en rend une autre à l'identique parce qu'une grandeur n'arrive pas.
 * C'est arrivé, et aucun essai ne pouvait le dire.
 *
 * Le banc lui-même est `src/apercu` ; il pose `document.title` à
 * « L1 aperçu prêt » quand toutes les vignettes sont cuites, et c'est ce
 * signal qu'on attend — pas un délai, qui serait faux sur une machine lente.
 *
 * Usage :
 *   npm run dev                     # dans un terminal
 *   SORTIE=/tmp/planches npm run apercu:capture
 *
 * Variables : `SORTIE` (dossier de sortie, obligatoire) et `URL_BANC`
 * (défaut `http://localhost:5173/apercu/`).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const DIR = process.env.SORTIE;
if (!DIR) throw new Error("SORTIE manquant : où écrire les planches ?");
const URL_BANC = process.env.URL_BANC ?? "http://localhost:5173/apercu/";
mkdirSync(DIR, { recursive: true });

const nav = await chromium.launch({
  // Le Chromium préinstallé de l'environnement, et un GL logiciel : la
  // capture tourne sans carte graphique.
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await nav.newPage({ viewport: { width: 1700, height: 1400 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console]", m.text());
});
await page.goto(URL_BANC, { waitUntil: "load" });
await page.waitForFunction(() => document.title.startsWith("L1 aperçu prêt"), null, {
  timeout: 900000,
});

const planches = await page.evaluate(() =>
  [...document.querySelectorAll("figure.vignette")].map((f) => ({
    titre: f.querySelector("figcaption")?.textContent ?? "",
    png: f.querySelector("canvas")?.toDataURL("image/png") ?? "",
  })),
);
planches.forEach((p, i) => {
  if (!p.png) return;
  const nom = p.titre.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const rang = String(i).padStart(2, "0");
  writeFileSync(`${DIR}/${rang}-${nom}.png`, Buffer.from(p.png.split(",")[1], "base64"));
  console.log(`${rang} — ${p.titre}`);
});
await nav.close();
