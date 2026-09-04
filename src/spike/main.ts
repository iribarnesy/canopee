/** LOT L0 — prototype jetable : la page qui exécute le banc. */

import type { Camera } from "../render/projection";
import { mesurerCanvas2D, mesurerPixi, type Scene, type Style } from "./banc";
import { cuireSilhouette, FICHES } from "./silhouettes";

const etat = document.getElementById("etat");
const sortie = document.getElementById("resultat");
const captures = document.getElementById("captures");

function dire(s: string) {
  if (etat) etat.textContent = s;
}
function ecrire(s: string) {
  if (sortie) sortie.textContent += `${s}\n`;
}
function vignette(canvas: HTMLCanvasElement, legende: string, largeurMax = 480) {
  const fig = document.createElement("figure");
  fig.className = "vignette";
  const echelle = Math.min(1, largeurMax / canvas.width);
  canvas.style.width = `${Math.round(canvas.width * echelle)}px`;
  canvas.style.height = `${Math.round(canvas.height * echelle)}px`;
  fig.appendChild(canvas);
  const cap = document.createElement("figcaption");
  cap.textContent = legende;
  fig.appendChild(cap);
  captures?.appendChild(fig);
}

/**
 * Sur quoi tourne-t-on ? La question décide de ce que les chiffres valent : un
 * WebGL rendu en LOGICIEL (SwiftShader) mesure tout sauf ce que Pixi apporte.
 */
function materiel(): string {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2") ?? c.getContext("webgl");
  if (!gl) return "aucun WebGL";
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  if (!info) return "WebGL sans WEBGL_debug_renderer_info";
  return `${gl.getParameter(info.UNMASKED_VENDOR_WEBGL)} — ${gl.getParameter(info.UNMASKED_RENDERER_WEBGL)}`;
}

async function main() {
  ecrire(`MATÉRIEL — ${materiel()}`);
  ecrire("");
  // Scène **figée exprès** : sortie du moteur sur la station `friche-limon`,
  // 1 ha, graine 42, météo réelle, puis écrite en JSON par
  // `scripts/l0-scene.ts`. Elle est versionnée pour que la comparaison Pixi /
  // Canvas 2D mesure la MÊME scène d'une machine à l'autre — c'est tout
  // l'intérêt quand on rejoue le banc ailleurs
  // (docs/lot0-pointe-technique.md). `?scene=…` permet d'en mesurer un autre
  // instantané sans toucher au code : le pire cas de la friche s'est déplacé
  // de l'an 50 à l'an 30 quand les arbres ont pris leur vraie taille.
  const fichier = new URLSearchParams(location.search).get("scene") ?? "/spike/scene-an50.json";
  const scene: Scene = await (await fetch(fichier)).json();
  const vivants = scene.trees.filter((t) => !t.chandelle).length;
  const hMax = scene.trees.reduce((m, t) => Math.max(m, t.heightM), 0);
  dire(
    `scène : ${scene.trees.length} arbres (${vivants} vivants) sur ${scene.coteM} × ${scene.coteM} m`,
  );
  ecrire(`SCÈNE — friche en succession, sortie du moteur : ${fichier}`);
  ecrire(
    `  semaine ${scene.week} · ${scene.trees.length} arbres dont ${scene.trees.length - vivants} chandelles · h max ${hMax.toFixed(2)} m · ${scene.coteM * scene.coteM} cellules de sol`,
  );
  ecrire("");

  const cam: Camera = { coteM: scene.coteM, zoom: 1, orientation: 0 };
  const IMAGES = 90;

  // ── Les trois essences, côte à côte : la décision D4 à l'épreuve ─────────
  ecrire("D4 — LES SILHOUETTES GÉNÉRÉES PAR BRANCHEMENT");
  const planche = document.createElement("canvas");
  planche.width = 760;
  planche.height = 420;
  const pctx = planche.getContext("2d");
  if (pctx) {
    pctx.fillStyle = "#9aa892";
    pctx.fillRect(0, 0, planche.width, planche.height);
    let x = 60;
    for (const [id, fiche] of Object.entries(FICHES)) {
      for (const [feuillaison, senescence, note] of [
        [1, 0, "été"],
        [1, 0.9, "automne"],
        [0, 0, "hiver"],
      ] as const) {
        const { bitmap, msCuisson } = cuireSilhouette(fiche, {
          hauteurPx: 180,
          graine: 7,
          feuillaison,
          senescence,
        });
        pctx.drawImage(bitmap, x - bitmap.width / 2, 370 - bitmap.height);
        pctx.fillStyle = "#e8ece4";
        pctx.font = "10px system-ui";
        pctx.fillText(note, x - 12, 386);
        if (note === "été") {
          pctx.fillStyle = "#ffffff";
          pctx.font = "11px system-ui";
          pctx.fillText(fiche.nom, x - 20, 404);
          ecrire(
            `  ${fiche.nom.padEnd(22)} cuisson d'une silhouette de 180 px : ${msCuisson.toFixed(2)} ms`,
          );
        }
        x += 85;
      }
      x += 20;
      void id;
    }
    vignette(
      planche,
      "D4 — trois essences × trois saisons, squelette généré, feuilles tracées à la main",
      760,
    );
  }
  ecrire("");

  // ── Q6 — le style, sur captures ──────────────────────────────────────────
  ecrire("PERF — 90 images, scène complète, zoom 1 (parcelle entière)");
  ecrire("  « image »    = image TERMINÉE (barrière gl.finish / relecture d'un pixel) ;");
  ecrire("  « soum. »    = l'appel de dessin sans attendre le rendu — trompeur seul ;");
  ecrire("  « cadence »  = l'écart réel entre deux rAF : la réponse littérale aux 16,7 ms ;");
  ecrire("  « barrière » = ce que coûte la barrière à vide, à retirer d'« image ».");
  const styles: Style[] = ["aplat", "liseré", "ombre-longue"];
  for (const style of styles) {
    dire(`Canvas 2D — style « ${style} »…`);
    const c2d = await mesurerCanvas2D(scene, cam, style, IMAGES);
    ecrire(
      `  Canvas 2D  ${style.padEnd(13)} image ${String(c2d.mesure.medianeMs).padStart(6)} ms (p95 ${String(c2d.mesure.p95Ms).padStart(6)}) · soum. ${String(c2d.mesureSoumission.medianeMs).padStart(5)} ms · barrière ${String(c2d.barriereMs).padStart(5)} ms`,
    );
    ecrire(
      `  ${"".padEnd(24)} cadence ${c2d.cadence.medianeMs} ms → ${c2d.cadence.imagesParSeconde} img/s · ${c2d.mesure.arbresDessines} arbres`,
    );
    ecrire(
      `  ${"".padEnd(24)} cuisson : terrain ${c2d.terrainMs} ms · atlas ${c2d.atlasMs} ms pour ${c2d.atlasCuissons} silhouettes`,
    );
    if (style === "aplat") vignette(c2d.canvas, `Canvas 2D — aplats sans contour (Q6)`);
    if (style === "liseré")
      vignette(c2d.canvas, `Canvas 2D — liseré d'un pixel sur les tuiles (Q6)`);
    if (style === "ombre-longue") vignette(c2d.canvas, `Canvas 2D — ombre portée au pied (Q6)`);

    dire(`Pixi — style « ${style} »…`);
    const px = await mesurerPixi(scene, cam, style, IMAGES, 1, style === "aplat");
    ecrire(
      `  PixiJS v8  ${style.padEnd(13)} image ${String(px.mesure.medianeMs).padStart(6)} ms (p95 ${String(px.mesure.p95Ms).padStart(6)}) · soum. ${String(px.mesureSoumission.medianeMs).padStart(5)} ms · barrière ${String(px.barriereMs).padStart(5)} ms`,
    );
    ecrire(
      `  ${"".padEnd(24)} cadence ${px.cadence.medianeMs} ms → ${px.cadence.imagesParSeconde} img/s · ${px.mesure.arbresDessines} sprites · ${px.pixelsPeints}/${px.largeurLue} px peints`,
    );
    if (style === "aplat") vignette(px.canvas, "PixiJS v8 — la MÊME scène, en sprites (contrôle)");
    ecrire("");
  }

  // ── Le zoom rapproché : là où le détail de D4 doit se voir ───────────────
  dire("zoom 4 — le détail au plus près…");
  const proche: Camera = { ...cam, zoom: 4 };
  const c2dProche = await mesurerCanvas2D(scene, proche, "aplat", 30);
  ecrire("ZOOM 4 — le détail d'illustration, et ce qu'il coûte");
  ecrire(
    `  Canvas 2D  image ${c2dProche.mesure.medianeMs} ms · cadence ${c2dProche.cadence.medianeMs} ms → ${c2dProche.cadence.imagesParSeconde} img/s · atlas ${c2dProche.atlasMs} ms pour ${c2dProche.atlasCuissons} silhouettes`,
  );
  const pxProche = await mesurerPixi(scene, proche, "aplat", 30);
  ecrire(
    `  PixiJS v8  image ${pxProche.mesure.medianeMs} ms · cadence ${pxProche.cadence.medianeMs} ms → ${pxProche.cadence.imagesParSeconde} img/s · ${pxProche.pixelsPeints}/${pxProche.largeurLue} px peints`,
  );

  // ── Combien de tiges avant de perdre les 60 images par seconde ? ────────
  // C'est la SEULE façon de chiffrer l'écart quand les deux bras restent
  // collés au plafond du vsync : on empile la parcelle sur elle-même jusqu'à
  // ce que la cadence décroche.
  ecrire("");
  ecrire("CAPACITÉ — on empile la parcelle sur elle-même jusqu'à perdre les 60 img/s");
  const CHARGES = [1, 2, 4, 8, 16, 32, 64];
  for (const bras of ["Canvas 2D", "PixiJS v8"] as const) {
    let tenue = 0;
    let tiges = 0;
    for (const charge of CHARGES) {
      dire(`capacité ${bras} — charge ×${charge}…`);
      const m =
        bras === "Canvas 2D"
          ? await mesurerCanvas2D(scene, cam, "aplat", 40, charge)
          : await mesurerPixi(scene, cam, "aplat", 40, charge);
      ecrire(
        `  ${bras.padEnd(10)} ×${String(charge).padStart(2)} → ${String(m.mesure.arbresDessines).padStart(7)} tiges · cadence ${String(m.cadence.medianeMs).padStart(6)} ms → ${String(m.cadence.imagesParSeconde).padStart(3)} img/s${m.cadence.imagesParSeconde >= 58 ? "" : "   ← décroché"}`,
      );
      if (m.cadence.imagesParSeconde < 58) break;
      tenue = charge;
      tiges = m.mesure.arbresDessines;
    }
    ecrire(`  → ${bras} tient 60 img/s jusqu'à ×${tenue}, soit ${tiges} tiges dessinées.`);
  }

  dire("terminé");
  document.title = "L0 terminé";
}

main().catch((e) => {
  dire(`ERREUR : ${e instanceof Error ? e.message : String(e)}`);
  ecrire(String(e instanceof Error ? e.stack : e));
  document.title = "L0 erreur";
});
