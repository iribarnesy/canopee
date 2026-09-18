/**
 * Le PORTRAIT d'une essence : la même silhouette que sur la parcelle, cuite
 * une fois pour qu'on puisse la regarder de près.
 *
 * Les vingt-cinq silhouettes existent déjà et ne servaient qu'au peuplement.
 * On choisissait pourtant son essence sur un nom et un prix — « Arbousier
 * (9 €) » — sans jamais voir l'arbre qu'on plante.
 *
 * **Rien n'est redessiné ici.** Le portrait passe par `classeDe` puis
 * `cuireVignette`, exactement comme un arbre de la parcelle : une classe
 * écrite à la main dériverait de la vraie au premier champ ajouté, et ce
 * fichier a déjà coûté trois passes à quelqu'un (voir `poserArbres`).
 */

import { getEspece } from "../../engine/especes";
import type { Vue } from "../../render/camera";
import { type ArbreAPoser, classeDe, cuireVignette } from "../../render/couches/arbres";

/** Hauteur du sujet portraituré, en part de la hauteur maximale de l'espèce. */
const PART_ADULTE = 0.75;

/**
 * Le zoom du portrait.
 *
 * Il ne cadre rien : `classeDe` s'en sert pour décider la FINESSE de cuisson,
 * et c'est le seul rôle qu'il joue ici. Assez haut pour que l'arbre soit
 * dessiné avec ses branches plutôt qu'en tache.
 */
const ZOOM_DU_PORTRAIT = 14;

const dejaCuits = new Map<string, string>();

/**
 * Le portrait d'une essence, en `data:` URL, cuit à la première demande.
 *
 * Rendu en URL et non en canvas : le portrait sert dans du JSX, où une image
 * se pose et se redimensionne, alors qu'un canvas demanderait un `ref` et un
 * effet par vignette.
 */
export function portraitDEspece(especeId: string): string | undefined {
  const deja = dejaCuits.get(especeId);
  if (deja) return deja;
  const espece = getEspece(especeId);
  if (!espece) return undefined;

  const hauteurM = Math.max(0.6, espece.hauteurMaxM * PART_ADULTE);
  const vue: Vue = {
    cam: { coteM: 100, zoom: ZOOM_DU_PORTRAIT, orientation: 0 },
    centre: { x: 50, y: 50 },
    largeurPx: 400,
    hauteurPx: 400,
  };
  const arbre: ArbreAPoser = {
    id: -1,
    especeId,
    x: 0,
    y: 0,
    z: 0,
    heightM: hauteurM,
    houppierRatio: espece.lumiere.houppierRatio,
    // Un arbre de plein vent, branchu bas : c'est le port de l'espèce qu'on
    // montre, pas le fût nu que la compétition fabrique en futaie.
    baseHouppierM: hauteurM * 0.25,
    partFoliaire: 1,
    senescence: 0,
    vigueur: 1,
  };
  const classe = classeDe(arbre, espece.hauteurMaxM, vue);
  const vignette = cuireVignette(
    classe,
    arbre.heightM,
    arbre.houppierRatio,
    (largeur, hauteur) => {
      const c = document.createElement("canvas");
      c.width = largeur;
      c.height = hauteur;
      return c;
    },
    arbre.baseHouppierM,
  );
  const url = vignette.image.toDataURL();
  dejaCuits.set(especeId, url);
  return url;
}
