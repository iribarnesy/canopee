/**
 * Banc du HORS-PARCELLE (docs/interface-visuelle.md §5.8).
 *
 * Une capture large et un coin agrandi : le décor ne se juge que comme ça. Un
 * essai ne peut pas dire qu'un bois se lit comme une tache, un galet, une
 * quille ou un nénuphar — et les quatre sont arrivés.
 *
 * Usage :
 *   npm run dev
 *   SORTIE=/tmp/decor SCENE=pelouse-s28 npm run apercu:decor
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const DIR = process.env.SORTIE ?? "/tmp/d";
mkdirSync(DIR, { recursive: true });
const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await nav.newPage({ viewport: { width: 1100, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(
  `http://localhost:5173/apercu/jeu.html?scene=${process.env.SCENE ?? "pelouse-s28"}`,
  { waitUntil: "load" },
);
await page
  .waitForFunction(
    () => {
      const b = document.getElementById("compte")?.textContent ?? "";
      return /sol att\. 0/.test(b) && /décor a\. 0/.test(b) && /arbres a\. 0/.test(b);
    },
    null,
    { timeout: 180000 },
  )
  .catch(() => console.log("pas tarie"));
await page.waitForTimeout(1200);
console.log(
  (await page.evaluate(() => document.getElementById("compte")?.textContent ?? "")).replace(
    /\n/g,
    " | ",
  ),
);
writeFileSync(`${DIR}/decor.png`, await page.screenshot());
writeFileSync(
  `${DIR}/decor-coin.png`,
  await page.screenshot({ clip: { x: 0, y: 0, width: 400, height: 300 } }),
);
await nav.close();
