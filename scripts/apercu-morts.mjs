/**
 * Banc des MORTS PAR CAUSE (docs/interface-visuelle.md §6.3).
 *
 * Le cahier demande onze animations qu'on DISTINGUE. Un essai garde qu'elles
 * diffèrent deux à deux dans les nombres ; seule une capture dit si la
 * différence se voit. D'où ce banc : la même scène, à quatre avancements, pour
 * une cause donnée.
 *
 * `?mort=<cause>` fait mourir tous les arbres vivants de cette cause. Ce n'est
 * pas une scène — une semaine ordinaire en tue deux ou trois — c'est un banc de
 * mécanisme, comme `?ellipse-tout=1`.
 *
 * Usage :
 *   npm run dev
 *   SORTIE=/tmp/morts CAUSE=secheresse npm run apercu:morts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const DIR = process.env.SORTIE;
if (!DIR) throw new Error("SORTIE manquant : où écrire les captures ?");
const CAUSE = process.env.CAUSE ?? "secheresse";
const SCENE = process.env.SCENE ?? "pelouse-arbres-s28";
const LECTURES = (process.env.LECTURES ?? "0,0.3,0.6,1").split(",");
mkdirSync(DIR, { recursive: true });

const nav = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await nav.newPage({ viewport: { width: 1100, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

for (const t of LECTURES) {
  await page.goto(
    `http://localhost:5173/apercu/jeu.html?scene=${SCENE}&mort=${CAUSE}&ellipse=${t}`,
    { waitUntil: "load" },
  );
  await page
    .waitForFunction(
      () => {
        const b = document.getElementById("compte")?.textContent ?? "";
        return /sol att\. 0/.test(b) && /arbres a\. 0/.test(b) && /sprites\s+[1-9]/.test(b);
      },
      null,
      { timeout: 180000 },
    )
    .catch(() => console.log(`t=${t} : la cuisson ne s'est pas tarie`));
  await page.waitForTimeout(900);
  const s = await page.evaluate(() => document.getElementById("compte")?.textContent ?? "");
  console.log(
    `${CAUSE} t=${t} | ${s
      .split("\n")
      .filter((l) => /sprites|classes /.test(l))
      .join(" | ")}`,
  );
  writeFileSync(`${DIR}/${CAUSE}-${t}.png`, await page.screenshot());
}
await nav.close();
