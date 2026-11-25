/**
 * Capture l'**écran de jeu** en PNG, sans navigateur visible.
 *
 * **Pourquoi celui-ci en plus du banc d'aperçu** : `apercu:capture` juge le
 * dessin d'une essence ou d'une mise en scène, sur une scène cuite d'avance.
 * Il ne dit rien de ce que la note de rôle demande de vérifier — « est-ce que
 * c'est agréable », qui ne se juge que sur l'écran où l'on joue, avec son HUD,
 * ses panneaux et sa parcelle vivante. Aucun essai ne le dit, et aucune planche
 * d'aperçu non plus.
 *
 * Le script démarre une partie comme un joueur, par l'une des deux portes de
 * l'accueil (#189) :
 *
 * - **le bac à sable** (par défaut) : « Régler une partie », la station
 *   voulue, le curseur de vieillissement poussé pour avoir un peuplement à
 *   regarder plutôt qu'un terrain nu, puis « Démarrer » ;
 * - **un niveau** (`NIVEAU`) : un clic sur sa carte, et le niveau pose ses
 *   réglages lui-même, comme pour le joueur.
 *
 * Il attend que la parcelle soit montée, avance mois par mois jusqu'au mois
 * demandé, photographie la page, puis la parcelle de près, et **rend la main** :
 * chaque attente a sa borne, et une garde arrête tout au-delà de `LIMITE_MIN`.
 *
 * Il ne rendait plus la main depuis #189 : il remplissait `#maturation` sur
 * l'accueil, et ce curseur est passé derrière « Régler une partie » avec le
 * reste du banc d'essai (#504).
 *
 * **En GL logiciel, tout est lent.** Sans carte graphique (SwiftShader, le cas
 * des conteneurs des agents), la scène tourne à une image par seconde : un clic
 * attend que l'image se fasse, une capture peut prendre une minute, un « +1
 * mois » de quinze secondes à deux minutes, et le vieillissement de quarante ans
 * d'une lande six minutes et demie (mesuré le 25 novembre 2026 : quatorze
 * minutes du lancement à la dernière capture). Les bornes ci-dessous sont larges
 * pour cette raison ; sur une vraie machine, tout va bien plus vite.
 *
 * Usage :
 *   npm run dev                                          # dans un terminal
 *   SORTIE=/tmp/jeu npm run apercu:jeu                   # bac à sable vieilli
 *   SORTIE=/tmp/jeu NIVEAU="Le verger" npm run apercu:jeu
 *
 * Variables : `SORTIE` (dossier, obligatoire), `URL_JEU` (défaut
 * `http://localhost:5173/`), `NIVEAU` (nom d'un niveau livré, tel que sa carte
 * l'écrit : on part de ce niveau au lieu du bac à sable), `STATION` (bac à
 * sable seul : nom du bouton de la station, défaut celle que l'écran propose),
 * `ANS` (bac à sable seul : vieillissement, défaut 40), `MOIS` (mois auquel
 * photographier, défaut « juillet » — vide pour rester au mois de départ, en
 * janvier, où tout est nu), `POSE_MS` (temps laissé à la scène pour cuire ses
 * vignettes, défaut 6000), `CRANS` (crans de molette de la vue de près, défaut
 * 9), `LIMITE_MIN` (durée maximale de l'exécution, défaut 30 minutes) et
 * `CHROMIUM` (chemin d'un autre Chromium que celui de Playwright).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const DIR = process.env.SORTIE;
if (!DIR) throw new Error("SORTIE manquant : où écrire les captures ?");
const URL_JEU = process.env.URL_JEU ?? "http://localhost:5173/";
/** Nom d'un niveau livré ; absent ou vide = le bac à sable. */
const NIVEAU = process.env.NIVEAU ?? "";
const STATION = process.env.STATION ?? "";
const ANS = process.env.ANS ?? "40";
const POSE_MS = Number(process.env.POSE_MS ?? 6000);
/** Mois auquel photographier ; vide = on reste au mois de départ de la partie. */
const MOIS = process.env.MOIS ?? "juillet";
/** Crans de molette pour la seconde capture, de près. */
const CRANS = Number(process.env.CRANS ?? 9);
const LIMITE_MS = Number(process.env.LIMITE_MIN ?? 30) * 60_000;

// **Les bornes**, toutes à l'échelle du GL logiciel (voir l'en-tête).
/** Un clic, un champ : l'image d'après doit s'être faite. */
const GESTE_MS = 120_000;
/** Une capture : une minute est courante en GL logiciel. */
const CAPTURE_MS = 300_000;
/** Le montage de la parcelle, vieillissement compris (vingt ans ≈ une minute). */
const MONTAGE_MS = 900_000;
/** Un « +1 mois » : quelques secondes d'ordinaire, une minute dans une friche dense. */
const SAUT_MS = 120_000;
/** Tous les sauts jusqu'au mois voulu : au plus un an de partie. */
const MOIS_MS = 900_000;

mkdirSync(DIR, { recursive: true });

// **La garde.** Une page qui ne répond plus peut laisser une promesse pendre
// sans que rien ne lève d'erreur ; au-delà de la limite, on arrête tout plutôt
// que de laisser l'agent attendre une main qui ne revient pas.
const garde = setTimeout(() => {
  console.error(`apercu:jeu : arrêté après ${LIMITE_MS / 60_000} min sans avoir fini.`);
  process.exit(2);
}, LIMITE_MS);

const nav = await chromium.launch({
  // Le Chromium de Playwright, et un GL logiciel : la capture tourne sans carte
  // graphique.
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const bavures = [];
// **Dire où l'on en est.** En GL logiciel, une exécution dure plusieurs
// minutes : sans un mot, on ne distingue pas une attente d'un blocage.
const t0 = Date.now();
const dire = (quoi) => console.log(`[${Math.round((Date.now() - t0) / 1000)} s] ${quoi}`);
try {
  const page = await nav.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(GESTE_MS);
  page.on("pageerror", (e) => bavures.push(`[pageerror] ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") bavures.push(`[console] ${m.text()}`);
  });
  // Une confirmation (quitter une partie, écraser un profil) ne doit pas
  // suspendre le script.
  page.on("dialog", (d) => d.accept());

  await page.goto(URL_JEU, { waitUntil: "load" });

  // Une partie sauvegardée ajouterait sa carte à l'accueil : on part toujours
  // d'une page propre, sinon la capture dépend de ce qu'une exécution
  // précédente a laissé.
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  if (NIVEAU) {
    // La carte d'un niveau est un bouton qui porte son nom (« ▶ Le verger ») et
    // son énoncé : le nom suffit à la trouver.
    await page.getByRole("button", { name: NIVEAU }).first().click();
  } else {
    // **Les réglages sont derrière une porte** depuis #189 : l'accueil ne
    // montre que les niveaux et la carte du bac à sable.
    await page.getByRole("button", { name: "Régler une partie" }).click();
    if (STATION) await page.getByRole("button", { name: STATION, exact: true }).click();
    // Un peuplement plutôt qu'un terrain nu : sans vieillissement il n'y a rien
    // à regarder, et c'est le dessin des arbres qu'on vient juger.
    await page.fill("#maturation", ANS);
    await page.dispatchEvent("#maturation", "input");
    await page.getByRole("button", { name: "Démarrer" }).click();
  }

  // La parcelle est montée quand la vue isométrique existe **et** que le moteur a
  // fini de vieillir le terrain — ce qui prend d'autant plus longtemps qu'on lui
  // a demandé d'années.
  await page.waitForSelector(".vue-parcelle canvas", { timeout: MONTAGE_MS });
  dire(`parcelle montée (${NIVEAU || `bac à sable, ${ANS} ans de vieillissement`})`);

  // **On avance jusqu'à un mois où le feuillage est là.** La partie commence en
  // janvier : juger un peuplement sur des tiges nues dirait surtout que l'hiver
  // est nu. On ne triche pas sur la saison pour autant — c'est le moteur qui
  // fait passer les semaines, on attend seulement celle qu'on veut voir.
  if (MOIS) {
    // **Mois par mois, avec « +1 mois »**, qui s'arrête de lui-même à
    // l'arrivée. Laisser filer à ×13 et mettre en pause quand le bandeau dit
    // le bon mois ne marche pas en GL logiciel : le moteur avance dans son
    // fil, l'écran ne se redessine qu'une fois par seconde, et un mois entier
    // peut passer entre deux images sans que le bandeau l'ait jamais écrit.
    // Les essais de cette boucle se sont arrêtés en août de la quatrième
    // année, puis en juillet de la sixième.
    // Le bandeau écrit « juillet 2026 » depuis la barre de temps (#146).
    const date = page.locator(".bandeau strong").first();
    const lireLaDate = async () => (await date.innerText()).trim();
    const fin = Date.now() + MOIS_MS;
    // Douze sauts suffisent à faire le tour de l'année ; la marge couvre les
    // traversées qu'un avis aurait coupées en chemin.
    for (let saut = 0; saut < 24; saut++) {
      const avant = await lireLaDate();
      if (avant.split(/\s/)[0] === MOIS) break;
      if (Date.now() > fin) break;
      // Un niveau peut finir pendant l'attente : on photographie sa fin.
      if (await page.locator('[aria-label="Fin du niveau"]').count()) break;
      // Un avis a pu couper la traversée (la mort d'un arbre suivi) :
      // « Continuer » la mène où elle allait.
      const continuer = page.getByRole("button", { name: /Continuer/ });
      if (await continuer.count()) await continuer.first().click();
      else await page.getByRole("button", { name: /\+1 mois/ }).click();
      // L'arrivée : le bandeau a changé de mois, et la bascule dit « Reprendre »
      // parce que le temps s'est arrêté.
      await page
        .waitForFunction(
          (moisAvant) =>
            document.querySelector(".bandeau strong")?.textContent?.trim().split(/\s/)[0] !==
              moisAvant && document.querySelector('button[aria-label="Reprendre"]') !== null,
          avant.split(/\s/)[0],
          { polling: 500, timeout: SAUT_MS },
        )
        .catch(() => {});
      // « juillet 2026 », sans l'« an 1 » collé derrière par le bandeau.
      dire(`+1 mois → ${(await lireLaDate()).match(/^\S+\s+\d+/)?.[0] ?? "?"}`);
    }
    const arrivee = await lireLaDate();
    if (arrivee.split(/\s/)[0] !== MOIS) {
      console.log(
        `--- le bandeau dit « ${arrivee} », pas « ${MOIS} » : on photographie quand même.`,
      );
    }
    // « +1 mois » allume « Ce qui a changé », qui estompe tout ce qui n'a pas
    // bougé dans le mois : on l'éteint pour photographier la parcelle telle
    // qu'elle est.
    const changement = page.getByRole("button", { name: /Ce qui a changé/ });
    if ((await changement.getAttribute("aria-pressed")) === "true") await changement.click();
  }

  await page.waitForTimeout(POSE_MS);

  await page.screenshot({ path: `${DIR}/jeu.png`, fullPage: true, timeout: CAPTURE_MS });
  await page
    .locator(".vue-parcelle")
    .screenshot({ path: `${DIR}/parcelle.png`, timeout: CAPTURE_MS });
  dire("jeu.png et parcelle.png écrits");

  // **Et la même parcelle de près.** Au zoom d'ensemble, un arbre fait quelques
  // pixels : c'est le bon cadrage pour juger un peuplement, et le mauvais pour
  // juger un arbre. Les deux comptent, donc on prend les deux.
  const vue = page.locator(".vue-parcelle");
  const boite = await vue.boundingBox();
  if (boite) {
    await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
    for (let i = 0; i < CRANS; i++) await page.mouse.wheel(0, -120);
    await page.waitForTimeout(POSE_MS);
    await vue.screenshot({ path: `${DIR}/parcelle-zoom.png`, timeout: CAPTURE_MS });
  }
  console.log(`écrit dans ${DIR} : jeu.png, parcelle.png, parcelle-zoom.png`);
} finally {
  if (bavures.length > 0) {
    console.log("--- la page a rouspété :");
    for (const b of bavures.slice(0, 20)) console.log(b);
  }
  await nav.close();
  clearTimeout(garde);
}
