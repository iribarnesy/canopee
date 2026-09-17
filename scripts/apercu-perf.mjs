/**
 * Mesure le coût par image de la vue de parcelle, hors cuisson et hors GPU.
 *
 * **Le chiffre qui compte ici est `pose`**, et pas le temps total. Une image
 * coûte trois choses : la CUISSON (budgétée, elle s'arrête d'elle-même et
 * disparaît une fois la parcelle chaude), la POSE (du JavaScript pur : c'est
 * nous, et c'est le seul poste comparable d'une version à l'autre), et le RENDU
 * GPU (qui, dans ce conteneur, passe par SwiftShader — un rastériseur logiciel
 * cinquante fois plus lent qu'une vraie carte, donc un chiffre qui ne dit rien
 * de la machine d'un joueur).
 *
 * Un temps total mesuré ici serait donc trompeur dans les deux sens : dominé
 * par un rendu logiciel qui n'existe pas chez le joueur, et diluant justement
 * le poste qu'on cherche à surveiller.
 *
 * On attend que la cuisson soit retombée à zéro avant de mesurer : les
 * premières images d'une parcelle froide cuisent des centaines de morceaux, et
 * les compter donnerait le coût du démarrage, pas celui du régime.
 *
 * Usage :
 *   npm run dev
 *   npm run apercu:perf                 # scène par défaut, 1500×1000
 *   SCENE=friche IMAGES=120 npm run apercu:perf
 */
import { chromium } from "playwright";

const URL_BANC = process.env.URL_BANC ?? "http://localhost:5173/apercu/jeu.html";
const IMAGES = Number(process.env.IMAGES ?? 90);
const LARGEUR = Number(process.env.LARGEUR ?? 1500);
const HAUTEUR = Number(process.env.HAUTEUR ?? 1000);

const nav = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await nav.newPage({ viewport: { width: LARGEUR, height: HAUTEUR } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(URL_BANC, { waitUntil: "load" });

/** Le compte affiché par le bandeau, lu tel quel. */
const lireCompte = () =>
  page.evaluate(() => {
    const texte = document.getElementById("compte")?.textContent ?? "";
    // Le bandeau écrit « clé   valeur [unité] » : on prend le premier nombre
    // APRÈS la clé, et pas les chiffres de la ligne entière — « sol att. 0 »
    // contient un point qui n'est pas une virgule décimale.
    const nombre = (cle) => {
      const ligne = texte.split("\n").find((l) => l.startsWith(cle));
      const trouve = ligne?.slice(cle.length).match(/-?\d+(?:\.\d+)?/);
      return trouve ? Number.parseFloat(trouve[0]) : Number.NaN;
    };
    return {
      sprites: nombre("sprites"),
      pose: nombre("pose"),
      cuisson: nombre("cuisson"),
      attente: nombre("sol att.") + nombre("arbres a."),
    };
  });

// Attendre le RÉGIME : plus rien en attente de cuisson.
const limite = Date.now() + 180000;
let chaud = await lireCompte();
while ((Number.isNaN(chaud.sprites) || chaud.attente > 0) && Date.now() < limite) {
  await page.waitForTimeout(500);
  chaud = await lireCompte();
}
if (chaud.attente > 0) console.log(`⚠ encore ${chaud.attente} morceaux en attente après 180 s`);

const poses = [];
const cuissons = [];
for (let i = 0; i < IMAGES; i++) {
  await page.waitForTimeout(30);
  const c = await lireCompte();
  if (!Number.isNaN(c.pose)) poses.push(c.pose);
  if (!Number.isNaN(c.cuisson)) cuissons.push(c.cuisson);
}
const mediane = (xs) => {
  const t = [...xs].sort((a, b) => a - b);
  return t.length === 0
    ? Number.NaN
    : (t[Math.floor((t.length - 1) / 2)] + t[Math.ceil((t.length - 1) / 2)]) / 2;
};
console.log(`sprites posés   ${chaud.sprites}`);
console.log(`pose médiane    ${mediane(poses).toFixed(2)} ms  (${poses.length} relevés)`);
console.log(`cuisson médiane ${mediane(cuissons).toFixed(2)} ms`);
await nav.close();
