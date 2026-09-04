/**
 * LOT L0 — mesure la pointe technique dans un vrai navigateur, et exporte les
 * captures qui tranchent Q6. Voir docs/lot0-pointe-technique.md.
 *
 *   npm run dev &
 *   node scripts/l0-mesure.mjs
 *
 * Par défaut, Chromium prend le GPU de la machine : c'est la seule façon de
 * trancher D1 (Pixi contre Canvas 2D). Le premier chiffre de `resultat.txt`
 * est la chaîne `WEBGL_debug_renderer_info` — si on y lit « SwiftShader »,
 * c'est du rendu logiciel et le bras Pixi ne mesure pas ce qu'il apporte.
 *
 * Quatre variables d'environnement :
 *   L0_LOGICIEL=1  force le rendu logiciel (SwiftShader), pour reproduire la
 *                  mesure d'origine ou tourner dans un conteneur sans GPU ;
 *   CHROMIUM=…     pointe un binaire précis, sinon Playwright prend le sien ;
 *   L0_URL=…       l'adresse du banc, si `npm run dev` n'est pas sur :5173 ;
 *   L0_SORTIE=…    le dossier où atterrissent `resultat.txt` et les captures.
 */

import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const DIR = process.env.L0_SORTIE ?? "./l0-mesures";
await import("node:fs").then((fs) => fs.mkdirSync(DIR, { recursive: true }));
const logiciel = process.env.L0_LOGICIEL === "1";
// Le rendu LOGICIEL est désormais un CHOIX, pas le défaut : c'est ce forçage,
// laissé en dur, qui a invalidé la première mesure de D1.
//
// **Mais ne rien passer ne suffit pas**, et c'est le piège : le Chromium
// « headless » de Playwright retombe sur SwiftShader tout seul, sans le dire.
// Vérifié sur un Apple M4 Pro — sans argument, `WEBGL_debug_renderer_info`
// annonce « SwiftShader driver » ; avec `--enable-gpu`, « ANGLE Metal
// Renderer: Apple M4 Pro ». Le GPU se demande, donc, explicitement.
// `--ignore-gpu-blocklist` sert aux machines dont le pilote est sur la liste
// noire de Chromium, fréquent sous Linux.
const args = logiciel
  ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  : ["--enable-gpu", "--use-gl=angle", "--use-angle=default", "--ignore-gpu-blocklist"];
const navigateur = await chromium.launch({
  // Sur une machine ordinaire, laisser Playwright choisir son Chromium.
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  args,
});
console.log(`rendu demandé : ${logiciel ? "LOGICIEL (L0_LOGICIEL=1)" : "GPU (défaut)"}`);
console.log("→ vérifier la ligne MATÉRIEL du résultat : « SwiftShader » = logiciel.");
const page = await navigateur.newPage({ viewport: { width: 1700, height: 1200 } });
page.on("console", (m) => console.log(`[page ${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
const URL_BANC = process.env.L0_URL ?? "http://localhost:5173/spike/index.html";
console.log(`banc : ${URL_BANC}`);
await page.goto(URL_BANC, { waitUntil: "load" });
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
