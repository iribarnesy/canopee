/**
 * LOT L0 — mesure la pointe technique dans un vrai navigateur, et exporte les
 * captures qui tranchent Q6. Voir docs/lot0-pointe-technique.md.
 *
 *   npm run dev &
 *   node scripts/l0-mesure.mjs
 *
 * À rejouer sur une machine AVEC carte graphique : c'est la seule façon de
 * trancher D1 (Pixi contre Canvas 2D), le conteneur de développement rendant
 * WebGL en logiciel.
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const DIR = process.env.L0_SORTIE ?? "./l0-mesures";
await import("node:fs").then((fs) => fs.mkdirSync(DIR, { recursive: true }));
const navigateur = await chromium.launch({
  // Sur une machine ordinaire, laisser Playwright choisir son Chromium.
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await navigateur.newPage({ viewport: { width: 1700, height: 1200 } });
page.on("console", (m) => console.log(`[page ${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
await page.goto("http://localhost:5173/spike/index.html", { waitUntil: "load" });
await page.waitForFunction(() => document.title.startsWith("L0 "), null, { timeout: 900000 });
const texte = await page.locator("#resultat").innerText();
console.log("\n================ RÉSULTAT ================\n" + texte);
writeFileSync(`${DIR}/resultat.txt`, texte);
// Une capture par vignette : c'est ce qui tranche Q6.
// On exporte les canvas DEPUIS la page : la capture d'écran de Playwright
// n'y arrive pas (rendu logiciel, canvas énormes), `toDataURL` si.
const images = await page.evaluate(() =>
  [...document.querySelectorAll("figure.vignette")].map((f) => ({
    legende: f.querySelector("figcaption")?.textContent ?? "",
    data: f.querySelector("canvas")?.toDataURL("image/png") ?? "",
  })),
);
images.forEach((im, i) => {
  if (!im.data) return;
  writeFileSync(`${DIR}/capture-${i}.png`, Buffer.from(im.data.split(",")[1], "base64"));
  console.log(`capture-${i}.png — ${im.legende}`);
});
await navigateur.close();
