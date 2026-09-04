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
  // 1 ha, graine 42, 50 ans de météo réelle, puis écrite en JSON. Elle est
  // versionnée pour que la comparaison Pixi / Canvas 2D mesure la MÊME scène
  // d'une machine à l'autre — c'est tout l'intérêt quand on rejoue le banc
  // ailleurs (docs/lot0-pointe-technique.md).
  const scene: Scene = await (await fetch("/spike/scene-an50.json")).json();
  const vivants = scene.trees.filter((t) => !t.chandelle).length;
  dire(
    `scène : ${scene.trees.length} arbres (${vivants} vivants) sur ${scene.coteM} × ${scene.coteM} m`,
  );
  ecrire(`SCÈNE — friche en succession, an 50, sortie du moteur`);
  ecrire(
    `  ${scene.trees.length} arbres dont ${scene.trees.length - vivants} chandelles · ${scene.coteM * scene.coteM} cellules de sol`,
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
  const styles: Style[] = ["aplat", "liseré", "ombre-longue"];
  for (const style of styles) {
    dire(`Canvas 2D — style « ${style} »…`);
    const c2d = await mesurerCanvas2D(scene, cam, style, IMAGES);
    ecrire(
      `  ${c2d.mesure.nom.padEnd(20)} style ${style.padEnd(13)} médiane ${String(c2d.mesure.medianeMs).padStart(7)} ms · p95 ${String(c2d.mesure.p95Ms).padStart(7)} ms · ${c2d.mesure.arbresDessines} arbres`,
    );
    ecrire(
      `  ${"".padEnd(20)} cuisson : terrain ${c2d.terrainMs} ms · atlas ${c2d.atlasMs} ms pour ${c2d.atlasCuissons} silhouettes`,
    );
    if (style === "aplat") vignette(c2d.canvas, `Canvas 2D — aplats sans contour (Q6)`);
    if (style === "liseré")
      vignette(c2d.canvas, `Canvas 2D — liseré d'un pixel sur les tuiles (Q6)`);
    if (style === "ombre-longue") vignette(c2d.canvas, `Canvas 2D — ombre portée au pied (Q6)`);

    dire(`Pixi — style « ${style} »…`);
    const px = await mesurerPixi(scene, cam, style, IMAGES);
    ecrire(
      `  ${px.mesure.nom.padEnd(20)} style ${style.padEnd(13)} médiane ${String(px.mesure.medianeMs).padStart(7)} ms · p95 ${String(px.mesure.p95Ms).padStart(7)} ms · ${px.mesure.arbresDessines} sprites`,
    );
    ecrire("");
  }

  // ── Le zoom rapproché : là où le détail de D4 doit se voir ───────────────
  dire("zoom 4 — le détail au plus près…");
  const proche: Camera = { ...cam, zoom: 4 };
  const c2dProche = await mesurerCanvas2D(scene, proche, "aplat", 30);
  ecrire("ZOOM 4 — le détail d'illustration, et ce qu'il coûte");
  ecrire(
    `  Canvas 2D            médiane ${c2dProche.mesure.medianeMs} ms · atlas ${c2dProche.atlasMs} ms pour ${c2dProche.atlasCuissons} silhouettes`,
  );
  const pxProche = await mesurerPixi(scene, proche, "aplat", 30);
  ecrire(`  PixiJS v8            médiane ${pxProche.mesure.medianeMs} ms`);

  dire("terminé");
  document.title = "L0 terminé";
}

main().catch((e) => {
  dire(`ERREUR : ${e instanceof Error ? e.message : String(e)}`);
  ecrire(String(e instanceof Error ? e.stack : e));
  document.title = "L0 erreur";
});
