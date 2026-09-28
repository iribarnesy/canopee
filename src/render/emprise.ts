/**
 * **Le contour d'une zone de chantier**, en points de parcelle (#205).
 *
 * Le moteur sait travailler en **bande** depuis #186 — dix actions l'acceptent —
 * et rien ne permettait d'en dessiner une : l'emprise du geste ne portait qu'un
 * rayon. Une allée agroforestière *est* une bande, et tant qu'on ne pouvait
 * demander qu'un disque, on labourait jusqu'au pied des rangs — ce qu'aucun
 * agroforestier ne fait, et ce qui coûte 77 % de son volume au noyer d'allée
 * (#184).
 *
 * **Des points de parcelle et non des points d'écran**, et c'est ce qui permet
 * de poser l'emprise sur le relief : la scène relève l'altitude de chacun avant
 * de projeter. Un rectangle dessiné à plat mentirait dès qu'il traverse une
 * butte, et c'est le terrain que le moteur traitera qu'il faut montrer.
 *
 * Module **pur** : pas de Pixi, pas de DOM. Il ne connaît que la forme du
 * moteur (`Zone`) et rend une polyligne fermée.
 */

import type { Zone, ZoneBande } from "../engine/zone";

/**
 * L'emprise que la vue montre sous le curseur, avant le clic.
 *
 * **Le disque n'y porte pas son centre, la bande si**, et ce n'est pas une
 * asymétrie gratuite : un disque se vise, donc son centre est là où pointe la
 * souris et la vue le sait mieux que personne ; une bande se **trace**, donc son
 * centre est le milieu d'un tracé commencé plus tôt, que seul l'appelant
 * connaît.
 */
export type EmpriseDuGeste = { zone?: "disque"; rayonM: number } | ZoneBande;

/**
 * En combien de points on échantillonne le contour d'un disque.
 *
 * Quarante-huit : assez pour qu'un disque de huit mètres n'ait pas l'air d'un
 * polygone au zoom rapproché, et assez peu pour que le tracé ne coûte rien —
 * il est refait à chaque image, comme tout ce qui suit le curseur.
 *
 * *(Valeur et justification reprises telles quelles de `pixi/scene.ts`, d'où
 * l'échantillonnage vient : #205 l'a déplacé pour que la bande passe par le
 * même chemin, il ne l'a pas re-réglé.)*
 */
export const POINTS_DU_DISQUE = 48;

/**
 * Pas d'échantillonnage du contour d'une bande, en mètres.
 *
 * **Un côté de bande n'est pas droit à l'écran** : il suit le relief, donc il
 * faut le jalonner comme on jalonne le cercle. Un mètre est la maille du
 * moteur — échantillonner plus fin ne dirait rien de plus, puisque l'altitude
 * est constante dans une cellule.
 */
export const PAS_DU_CONTOUR_M = 1;

/** Un point de parcelle, en mètres. */
export interface PointDeParcelle {
  x: number;
  y: number;
}

/** Jalonne un segment, extrémités comprises, au pas demandé. */
function jalonner(
  de: PointDeParcelle,
  vers: PointDeParcelle,
  points: PointDeParcelle[],
  premier: boolean,
): void {
  const dx = vers.x - de.x;
  const dy = vers.y - de.y;
  const pas = Math.max(1, Math.ceil(Math.hypot(dx, dy) / PAS_DU_CONTOUR_M));
  for (let i = premier ? 0 : 1; i <= pas; i++) {
    points.push({ x: de.x + (dx * i) / pas, y: de.y + (dy * i) / pas });
  }
}

/**
 * Le contour fermé d'une zone, en points de parcelle.
 *
 * Fermé : le dernier point rejoint le premier, pour que l'appelant n'ait qu'à
 * relier. Vide pour une zone qui ne couvre rien — un disque de rayon nul est le
 * cas de la plantation, qui vise un point et non une surface.
 */
export function contourDeLaZone(zone: Zone): PointDeParcelle[] {
  if (zone.zone !== "bande") {
    if (zone.rayonM <= 0) return [];
    const points: PointDeParcelle[] = [];
    for (let i = 0; i <= POINTS_DU_DISQUE; i++) {
      const a = (i / POINTS_DU_DISQUE) * Math.PI * 2;
      points.push({ x: zone.x + zone.rayonM * Math.cos(a), y: zone.y + zone.rayonM * Math.sin(a) });
    }
    return points;
  }
  if (zone.longueurM <= 0 || zone.largeurM <= 0) return [];
  // Mesurée depuis son **centre**, comme le disque, et l'orientation est celle
  // du grand axe, zéro vers l'est (`zone.ts`). On ne redit pas ces conventions,
  // on les lit.
  const cos = Math.cos(zone.orientationRad);
  const sin = Math.sin(zone.orientationRad);
  const demiL = zone.longueurM / 2;
  const demil = zone.largeurM / 2;
  const coin = (le: number, la: number): PointDeParcelle => ({
    x: zone.x + le * demiL * cos - la * demil * sin,
    y: zone.y + le * demiL * sin + la * demil * cos,
  });
  const coins = [coin(-1, -1), coin(1, -1), coin(1, 1), coin(-1, 1)];
  const points: PointDeParcelle[] = [];
  for (let i = 0; i < coins.length; i++) {
    const de = coins[i];
    const vers = coins[(i + 1) % coins.length];
    if (de && vers) jalonner(de, vers, points, i === 0);
  }
  return points;
}

/**
 * La bande qu'un tracé de deux points désigne.
 *
 * **Le joueur ne saisit jamais des radians** : il montre un départ et une
 * arrivée, et l'orientation en tombe. C'est aussi ce qui rend une allée facile
 * à viser — on la trace le long des rangs, comme on la parcourrait.
 *
 * La longueur est la distance des deux points, et non cette distance plus une
 * largeur : le tracé désigne l'**axe** de la bande, comme un passage d'engin.
 * Rend `undefined` quand les deux points sont confondus — il n'y a alors pas
 * d'orientation à en tirer, et une bande de longueur nulle ne couvre rien.
 */
export function bandeDuTrace(
  depart: PointDeParcelle,
  arrivee: PointDeParcelle,
  largeurM: number,
): Zone | undefined {
  const dx = arrivee.x - depart.x;
  const dy = arrivee.y - depart.y;
  const longueurM = Math.hypot(dx, dy);
  if (longueurM <= 0 || largeurM <= 0) return undefined;
  return {
    zone: "bande",
    x: (depart.x + arrivee.x) / 2,
    y: (depart.y + arrivee.y) / 2,
    longueurM,
    largeurM,
    orientationRad: Math.atan2(dy, dx),
  };
}
