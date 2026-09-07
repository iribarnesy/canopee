/**
 * Banc de MÉCANISME de l'ellipse : la chaîne journal → plan → lecteur → pose.
 *
 * Deux choses à établir, et une seule ne se voit pas sur une capture :
 *  - que les arbres BOUGENT au fil de la lecture (les captures) ;
 *  - que la pose seule les fait bouger, sans QU'AUCUNE classe soit recuite —
 *    c'est l'exigence du §5.11, « une animation continue ne doit pas invalider
 *    un cache de cuisson ».
 *
 * Le coût est échantillonné et non lu une fois : un relevé par condition ne
 * distingue pas un surcoût d'une image malchanceuse, et cette confusion a déjà
 * fait conclure trop vite ici.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const DIR = process.env.SORTIE;
if (!DIR) throw new Error("SORTIE manquant : où écrire les captures ?");
const SCENE = process.env.SCENE ?? "friche-s4";
const TOUT = process.env.TOUT !== "0";
const LECTURES = (process.env.LECTURES ?? "0,0.35,0.7,1").split(",");
mkdirSync(DIR, { recursive: true });

const nav = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await nav.newPage({ viewport: { width: 1100, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

const lire = () => page.evaluate(() => document.getElementById("compte")?.textContent ?? "");
const nombre = (s, quoi) => Number(new RegExp(`${quoi}\\s+([\\d.]+)`).exec(s)?.[1] ?? Number.NaN);

for (const t of LECTURES) {
  const url = `http://localhost:5173/apercu/jeu.html?scene=${SCENE}${TOUT ? "&ellipse-tout=1" : ""}&ellipse=${t}`;
  await page.goto(url, { waitUntil: "load" });
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

  // Une fois la cuisson tarie, on échantillonne : le compte est annoncé toutes
  // les 250 ms, donc une douzaine de relevés fait trois secondes d'animation.
  const poses = [];
  let recuites = 0;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(260);
    const s = await lire();
    poses.push(nombre(s, "pose"));
    recuites += nombre(s, "classes") || 0;
  }
  poses.sort((a, b) => a - b);
  const med = poses[Math.floor(poses.length / 2)];
  console.log(
    `t=${t} pose méd ${med?.toFixed(1)} ms (min ${poses[0]?.toFixed(1)}, max ${poses.at(-1)?.toFixed(1)}) — classes recuites sur 3 s : ${recuites}`,
  );
  writeFileSync(`${DIR}/ellipse-${TOUT ? "tout" : "peu"}-${t}.png`, await page.screenshot());
}
await nav.close();
