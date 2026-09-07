/**
 * Banc du VOILE des gestes de zone (docs/interface-visuelle.md §5.11, §6.2).
 *
 * Trois choses à juger, dont deux ne se voient pas sur une capture :
 *  - que le voile COUVRE la zone nommée par le moteur puis retombe ;
 *  - qu'aucune classe n'est recuite pendant qu'il joue ;
 *  - ce qu'il coûte au pire cas atteignable, une fauche d'un hectare.
 *
 * Le coût est échantillonné sur dix relevés et non lu une fois : un relevé
 * unique a déjà fait conclure à un surcoût qui n'existait pas.
 *
 * Usage :
 *   npm run dev
 *   SORTIE=/tmp/voile GESTE=faucher RAYON=90 LECTURES=0.3,0.6 npm run apercu:voile
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const DIR = process.env.SORTIE ?? "/tmp/v";
mkdirSync(DIR, { recursive: true });
const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await nav.newPage({ viewport: { width: 1100, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
const GESTE = process.env.GESTE ?? "chauler";
for (const t of (process.env.LECTURES ?? "0.1,0.35,0.6,0.9").split(",")) {
  await page.goto(
    `http://localhost:5173/apercu/jeu.html?scene=pelouse-s28&geste=${GESTE}&geste-rayon=${process.env.RAYON ?? 22}&ellipse=${t}`,
    { waitUntil: "load" },
  );
  await page
    .waitForFunction(
      () =>
        /arbres a\. 0/.test(document.getElementById("compte")?.textContent ?? "") &&
        /sol att\. 0/.test(document.getElementById("compte")?.textContent ?? ""),
      null,
      { timeout: 180000 },
    )
    .catch(() => console.log(t, "pas tarie"));
  const poses = [];
  let recuites = 0;
  let sprites = 0;
  for (let k = 0; k < 10; k++) {
    await page.waitForTimeout(260);
    const s = await page.evaluate(() => document.getElementById("compte")?.textContent ?? "");
    const n = (q) => Number(new RegExp(`${q}\\s+([\\d.]+)`).exec(s)?.[1] ?? NaN);
    poses.push(n("pose"));
    sprites = n("sprites");
    recuites += n("classes") || 0;
  }
  poses.sort((a, b) => a - b);
  console.log(
    `${GESTE} t=${t} | sprites ${sprites} | pose méd ${poses[5]?.toFixed(1)} ms (min ${poses[0]?.toFixed(1)}, max ${poses.at(-1)?.toFixed(1)}) | classes recuites ${recuites}`,
  );
  writeFileSync(`${DIR}/${GESTE}-${t}.png`, await page.screenshot());
}
await nav.close();
