/**
 * L'enveloppe du houppier, IMPOSÉE au squelette
 * (docs/interface-visuelle.md §4, résultat du lot L0).
 *
 * **C'est le résultat le plus coûteux du lot L0, et le plus contre-intuitif.**
 * On croit — je l'ai cru — qu'en réglant l'angle de branchement, la dominance
 * apicale et la divergence, l'enveloppe du houppier émerge : cône pour un pin,
 * boule pour un chêne de plein vent, gobelet pour un pommier. Trois mesures
 * l'ont démenti :
 *
 * - à 0,85 de dominance apicale, le bouleau fait **une touffe au sommet d'un
 *   bâton** — il a fallu descendre à 0,62 et ajouter un ordre ;
 * - **aucun réglage d'angle sur un port fourchu ne produit le cône d'un pin** :
 *   il faut un port étagé distinct, axe droit et verticilles presque
 *   horizontaux ;
 * - **sans écourtement explicite des étages, ce pin fait une boule.**
 *
 * D'où ce module. Le branchement engendre une ramure ; l'enveloppe la
 * **rabat** dans une forme déclarée. Ce n'est pas de la triche : un arbre réel
 * est contraint par sa flèche, par la lumière et par le vent, et ces
 * contraintes-là ne sont pas dans un ratio de longueur.
 *
 * **La contrainte est une mise à l'échelle, pas un écrêtage.** Rabattre en
 * coupant donnerait des branches tranchées net à la surface de l'enveloppe.
 * On ramène donc chaque point vers l'axe proportionnellement à son
 * dépassement : la ramure garde sa structure et prend la forme voulue.
 *
 * Module **pur** : il transforme des segments en segments.
 */

import type { Port } from "./fiche";
import type { Point3, Segment } from "./squelette";

/**
 * Rayon relatif de l'enveloppe ∈ [0,1] à la hauteur relative `t` ∈ [0,1] du
 * houppier (0 = à sa base, 1 = à sa cime).
 *
 * Une fonction et non une table : ce sont six courbes simples, et une table
 * demanderait d'interpoler entre des points qu'il faudrait justifier un à un.
 */
export function rayonRelatif(port: Port, t: number): number {
  const u = Math.min(1, Math.max(0, t));
  switch (port) {
    case "conique":
      // Large en bas, pointe en haut. La flèche d'un jeune conifère.
      //
      // La pointe garde 8 % et ne descend pas à zéro : un rayon nul ferait un
      // sommet où plus aucune branche ne tient, donc une cime chauve. Un
      // conifère a une flèche, pas un point.
      return 1 - 0.92 * u;
    case "boule":
      // Un demi-cercle : maximum à mi-hauteur, refermé aux deux bouts.
      return Math.sin(Math.PI * (0.15 + 0.7 * u));
    case "gobelet":
      // Creux au centre : l'enveloppe s'ouvre en montant, et le sommet reste
      // ouvert. C'est le port du fruitier taillé, et l'ouverture du haut est
      // ce qui le distingue d'une boule.
      return 0.45 + 0.55 * u;
    case "etage":
      // Le plateau du vieux pin : quasi constant, à peine écourté au sommet.
      // **L'écourtement est ICI et il est explicite** — sans lui, une boule.
      return u < 0.75 ? 0.92 + 0.08 * u : 1 - (u - 0.75) * 2.6;
    case "fastigie":
      // Étroit partout : l'aulne, le peuplier. Le rayon ne dépasse jamais la
      // moitié de ce que les autres ports s'autorisent — c'est le facteur
      // d'élancement qui, lui, vient de `contraindre`.
      return Math.sin(Math.PI * (0.25 + 0.6 * u)) * 0.55;
    default:
      // Retombant : large et bas, la masse est sous la mi-hauteur.
      return Math.sin(Math.PI * (0.35 + 0.55 * u));
  }
}

/**
 * De combien les rameaux terminaux plongent, par port.
 *
 * Le bouleau et le saule se reconnaissent à ça avant toute autre chose : leurs
 * rameaux terminaux **descendent**. Aucun réglage de branchement ne le donne,
 * puisque le branchement ne connaît que des angles d'insertion.
 */
export function plongeeTerminale(port: Port): number {
  if (port === "retombant") return 0.55;
  if (port === "etage") return 0.12;
  return 0;
}

/**
 * Impose au squelette l'enveloppe de son port.
 *
 * **Ce n'est pas un rognage, et le premier jet s'est trompé là-dessus.**
 * J'avais écrit une contrainte qui ne fait que RESSERRER : un point plus proche
 * de l'axe que l'enveloppe ne l'autorise était laissé tel quel. Mesuré sur un
 * feuillu de dix-huit mètres, le houppier fait naturellement 1,94 m de rayon
 * là où l'enveloppe en autorise 4 : elle ne mordait nulle part, et **les six
 * ports rendaient exactement le même arbre**. Autrement dit le module ne
 * servait à rien dans le seul cas qui compte, celui où la ramure tient déjà
 * dans son gabarit.
 *
 * L'enveloppe MET DONC À L'ÉCHELLE. Chaque point est ramené du rayon naturel du
 * houppier au rayon admis à sa hauteur : une branche à mi-distance de l'axe
 * reste à mi-distance, et le profil — cône, boule, gobelet, plateau — s'impose
 * pour de bon. C'est bien la leçon de L0 dans son sens fort : l'enveloppe n'est
 * pas une limite que le branchement approche, c'est une forme qu'on lui donne.
 *
 * `baseM` est la hauteur à laquelle commence le houppier, `sommetM` celle de la
 * cime, `rayonMaxM` le demi-diamètre visé — que l'appelant tire du
 * `houppierRatio` du moteur. Les segments du fût (ordre 0) sont laissés
 * intacts : un tronc n'est pas dans le houppier.
 */
export function contraindre(
  segments: readonly Segment[],
  port: Port,
  baseM: number,
  sommetM: number,
  rayonMaxM: number,
): Segment[] {
  const hauteur = Math.max(1e-6, sommetM - baseM);
  const plongee = plongeeTerminale(port);

  // Le rayon que la ramure atteint d'elle-même : c'est l'unité de mesure de la
  // mise à l'échelle. Sans lui on ne saurait pas de combien réduire.
  let naturel = 0;
  for (const s of segments) {
    if (s.ordre === 0) continue;
    naturel = Math.max(
      naturel,
      Math.hypot(s.arrivee.x, s.arrivee.z),
      Math.hypot(s.depart.x, s.depart.z),
    );
  }
  if (naturel <= 1e-9) return segments.map((s) => ({ ...s }));

  const rabattre = (p: Point3, terminal: boolean): Point3 => {
    const t = (p.y - baseM) / hauteur;
    const admis = Math.max(0.01, rayonRelatif(port, t) * rayonMaxM);
    const k = admis / naturel;
    const x = p.x * k;
    const z = p.z * k;
    let y = Math.min(p.y, sommetM);
    if (terminal && plongee > 0) {
      // La plongée est proportionnelle à l'éloignement de l'axe : un rameau
      // près du tronc ne retombe pas, un rameau de bout de branche, oui.
      const eloignement = Math.min(1, Math.hypot(x, z) / Math.max(1e-6, rayonMaxM));
      y -= plongee * eloignement * hauteur * 0.18;
    }
    return { x, y, z };
  };

  const rabattus = segments.map((s) =>
    s.ordre === 0
      ? { ...s }
      : {
          ...s,
          depart: rabattre(s.depart, false),
          arrivee: rabattre(s.arrivee, s.terminal),
        },
  );

  // **Le houppier doit atteindre le rayon demandé, pas s'en approcher.** Le
  // profil ne vaut 1 qu'à une hauteur précise, et rien ne garantit que le point
  // le plus écarté de la ramure s'y trouve : mesuré, un hêtre de seize mètres
  // n'atteignait que la moitié du rayon que le moteur lui donne, et sortait en
  // sucette — un gros fût sous un petit chapeau. Une dernière mise à l'échelle
  // uniforme cale le maximum sur `rayonMaxM` sans toucher au profil, puisqu'elle
  // multiplie tout par le même nombre.
  //
  // Ça compte au-delà du dessin : `houppierRatio` est la grandeur avec laquelle
  // le moteur calcule l'ombre portée. Un houppier dessiné deux fois trop étroit
  // porterait une ombre deux fois trop large, et personne ne saurait laquelle
  // croire.
  let atteint = 0;
  for (const s of rabattus) {
    if (s.ordre === 0) continue;
    atteint = Math.max(
      atteint,
      Math.hypot(s.arrivee.x, s.arrivee.z),
      Math.hypot(s.depart.x, s.depart.z),
    );
  }
  if (atteint <= 1e-9) return rabattus;
  const cale = rayonMaxM / atteint;
  if (Math.abs(cale - 1) < 1e-6) return rabattus;
  return rabattus.map((s) =>
    s.ordre === 0
      ? s
      : {
          ...s,
          depart: { x: s.depart.x * cale, y: s.depart.y, z: s.depart.z * cale },
          arrivee: { x: s.arrivee.x * cale, y: s.arrivee.y, z: s.arrivee.z * cale },
        },
  );
}
