/**
 * LES NIVEAUX LIVRÉS avec le jeu (#188).
 *
 * Le mécanisme est dans `niveaux.ts` ; ici, le CONTENU. La séparation est la
 * même qu'entre `especes.ts` et le moteur qui les fait pousser : ajouter un
 * niveau ne doit toucher que ce fichier.
 *
 * ## Les chiffres viennent d'une mesure, pas d'une intuition
 *
 * Douze pommiers plantés sur limon profond riche, laissés sans aucun soin,
 * météo synthétique, graine 7 — quarante ans de moteur :
 *
 * | an | vivants | hauteur | récolte | cumul |
 * |---|---|---|---|---|
 * | 6 | 10 | 1,3 m | 0 kg | 0 kg |
 * | 7 | 10 | 1,5 m | 12 kg | **12 kg** |
 * | 10 | 10 | 2,9 m | 27 kg | 76 kg |
 * | 14 | 6 | 4,3 m | 32 kg | **199 kg** |
 * | 20 | 4 | 5,4 m | 24 kg | 322 kg |
 *
 * Trois choses en sortent, et elles font le niveau :
 *
 * 1. **Rien avant l'an 7.** La fructification tient à la taille (`tick.ts` :
 *    `sizeFactor = (h / 0,7·hauteurMaxM)²`), et un plant met six ans à
 *    l'atteindre. Un objectif de fruits est donc forcément un objectif long —
 *    ce que le jeu doit rendre supportable par la vitesse, pas par un
 *    rendement inventé.
 * 2. **Le verger FOND** : douze plants, dix l'année suivante, six à l'an 14,
 *    quatre à l'an 20. Sans soin, la moitié du verger est perdue avant la
 *    pleine production — et c'est exactement la leçon que `v1.md` met dans son
 *    exemple : *« découvrir que le gibier les mange, y répondre »*.
 * 3. **Deux cents kilos se cueillent vers l'an 14 SANS RIEN FAIRE.** C'est donc
 *    un objectif atteignable, et la conduite doit le rendre plus rapide, pas
 *    le rendre possible. Vingt ans impartis laissent six ans de marge à qui
 *    s'y prend mal.
 */

import type { EtatDuNiveau, Niveau } from "./niveaux";
import type { ProfilDepart } from "./profils";

/** L'espèce du premier niveau : le pommier de `especes.ts`. */
const POMMIER = "malus_domestica";

/**
 * Les pommiers VIVANTS sur la parcelle.
 *
 * **Un stock, et pas le cumul des plantations** — la première version comptait
 * `cumuls.plantes`, et l'essai dans le navigateur l'a prise en faute : planter
 * quatorze bouleaux validait « Planter des pommiers ». Le cumul ne porte pas
 * l'essence (`GesteSurArbres` n'a que des identifiants), l'instantané si.
 *
 * Compter le stock dit d'ailleurs quelque chose de plus juste : ce qu'on
 * demande, c'est d'AVOIR un verger, pas d'avoir acheté des plants. Un palier
 * reste acquis une fois franchi, donc perdre un arbre ensuite ne le retire pas
 * — mais il faut les avoir eus vivants ensemble au moins une fois.
 */
function pommiers(e: EtatDuNiveau) {
  return e.snapshot.trees.filter((t) => t.especeId === POMMIER && !t.chandelle);
}

/**
 * Le terrain du premier niveau : le plus indulgent des six.
 *
 * Limon profond riche, plat, bocage tout autour, nappe hors d'atteinte des
 * racines, pas d'eau libre, climat médian. Rien de ce qui fait mourir un
 * plant sur la lande ou dans le fond de vallée. Un premier niveau doit
 * échouer par ce qu'on n'a pas fait, jamais par le terrain.
 */
const VERGER_DE_BOCAGE: ProfilDepart = {
  version: 1,
  nom: "Verger de bocage",
  stationId: "limon-riche",
  bordures: {
    nord: "bocage",
    est: "bocage",
    sud: "bocage",
    ouest: "bocage",
  },
  relief: { altitudeM: 120, pentePct: 1, expositionDeg: 180, forme: "plan", bassinAmontHa: 0 },
  eau: { type: "aucune", bergeM: 0 },
  nappeCm: 250,
  partBassinSemblable: 0,
  scenario: "ssp245",
  anneeDepart: 2026,
  // Une parcelle nue : le premier niveau commence par planter, pas par
  // démêler ce que trente ans de friche ont laissé.
  maturationAns: 0,
};

/**
 * PREMIER NIVEAU — planter, protéger, récolter.
 *
 * Les trois paliers sont les trois gestes dans l'ordre où l'on en a besoin,
 * ce que `v1.md` demande des objectifs intermédiaires : *« faire de la place
 * dans la forêt, planter les fruitiers, découvrir que le gibier les mange, y
 * répondre »*. Ici la place est déjà là — c'est un premier niveau — et il
 * reste planter, protéger, récolter.
 *
 * **L'argent ne compte pas.** Le plafond horaire, lui, continue de compter :
 * c'est une contrainte physique et non économique (`EconomyState.active`).
 * Un premier niveau se perd faute d'avoir protégé ses arbres, pas faute
 * d'avoir su lire une trésorerie.
 */
const VERGER: Niveau = {
  id: "verger",
  nom: "Le verger",
  enonce: "Planter un verger, le protéger du gibier, et en récolter deux cents kilos de pommes.",
  depart: VERGER_DE_BOCAGE,
  seed: 7,
  meteo: "synthetique",
  economie: false,
  // Vingt ans. La mesure ci-dessus donne deux cents kilos vers l'an 14 sans
  // aucun soin : la marge est de six ans pour qui s'y prend mal.
  semainesImparties: 20 * 52,
  paliers: [
    {
      id: "planter",
      quoi: "Avoir douze pommiers en terre",
      mesure: (e) => pommiers(e).length,
      cible: 12,
      unite: "pommiers",
      aide: "Gestes → Planter, puis « changer… » pour choisir le pommier. Une autre essence ne compte pas.",
    },
    {
      id: "proteger",
      quoi: "Mettre les pommiers à l'abri du gibier",
      mesure: (e) => pommiers(e).filter((t) => t.protege).length,
      cible: 12,
      unite: "protégés",
      aide: "Un plant brouté repart de zéro. Le manchon se pose à la plantation, ou après.",
    },
    {
      id: "recolter",
      quoi: "Récolter des pommes",
      // DES POMMES, et pas des fruits. La première version lisait le total
      // toutes essences, et l'essai dans le navigateur l'a prise en faute de la
      // pire façon : une partie où l'on ne plante RIEN affichait
      // « 1549 / 200 kg ». Le bocage sème, la parcelle se couvre de noisetiers
      // et de prunelliers, et la récolte automatique les cueille.
      mesure: (e) => e.cumuls.fruitsParEspece[POMMIER] ?? 0,
      cible: 200,
      unite: "kg",
      aide: "Un pommier ne donne rien avant sept ans, et les fruits se perdent trois semaines après leur maturité.",
    },
  ],
};

export const NIVEAUX_LIVRES: readonly Niveau[] = [VERGER];

export function niveauParId(id: string): Niveau | undefined {
  return NIVEAUX_LIVRES.find((n) => n.id === id);
}
