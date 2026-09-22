/**
 * LES NIVEAUX LIVRÉS avec le jeu (#188).
 *
 * Le mécanisme est dans `niveaux.ts` ; ici, le CONTENU. La séparation est la
 * même qu'entre `especes.ts` et le moteur qui les fait pousser : ajouter un
 * niveau ne doit toucher que ce fichier.
 *
 * ## Les chiffres viennent d'une mesure, et la première était fausse
 *
 * **La première mesure omettait les BORDURES**, donc la pluie de semis de
 * l'entourage. Elle annonçait deux cents kilos à l'an 14 ; le niveau joué dans
 * le navigateur en a rendu ZÉRO en vingt ans. La capture disait pourquoi d'un
 * coup d'œil : la parcelle était devenue un fourré, et les treize pommiers
 * protégés y étaient étouffés avant d'avoir fructifié.
 *
 * Treize pommiers plantés sur limon profond riche, sans autre soin que le
 * manchon, météo synthétique, graine 7 — le cumul de pommes selon l'entourage :
 *
 * | entourage | semis/an | an 8 | an 12 | an 16 | an 20 | pommiers restants |
 * |---|---|---|---|---|---|---|
 * | bocage | 62 | — | — | — | **0** (mesuré en jeu) | 13 |
 * | (sans bordures) | — | 28 kg | 145 kg | 318 kg | 585 kg | 4 |
 * | **plaine céréalière** | **2** | **87 kg** | **482 kg** | **1187 kg** | **2170 kg** | **11** |
 *
 * Trois choses en sortent, et elles font le niveau :
 *
 * 1. **Rien avant l'an 7.** La fructification tient à la taille (`tick.ts` :
 *    `sizeFactor = (h / 0,7·hauteurMaxM)²`), et un plant met six ans à
 *    l'atteindre. Un objectif de fruits est donc forcément un objectif long —
 *    ce que le jeu doit rendre supportable par la vitesse, pas par un
 *    rendement inventé.
 * 2. **C'est L'ENTOURAGE qui décide**, bien plus que la station. Soixante-deux
 *    semis par an contre deux : d'un côté un fourré de deux mille cinq cents
 *    tiges où le verger disparaît, de l'autre un verger qui tient. Un premier
 *    niveau doit échouer par ce qu'on n'a pas fait, jamais par le terrain — la
 *    lutte contre l'envahissement fera un bon niveau, plus tard.
 * 3. **Deux cents kilos tombent vers l'an 9** dans la plaine céréalière. Onze
 *    ans de marge sur les vingt impartis : de quoi s'y prendre mal.
 *
 * Et le temps réel, que `v1.md` veut entre dix et trente minutes : le moteur
 * tient environ sept semaines par seconde sur ce peuplement, donc vingt ans
 * demandent deux minutes et demie de simulation. La contrainte n'est pas là.
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
 * Limon profond riche, plat, champs tout autour, nappe hors d'atteinte des
 * racines, pas d'eau libre, climat médian. Rien de ce qui fait mourir un
 * plant sur la lande ou dans le fond de vallée — ni, désormais, la pluie de
 * semis d'un bocage. Un premier niveau doit échouer par ce qu'on n'a pas
 * fait, jamais par le terrain.
 */
const VERGER_DE_PLAINE: ProfilDepart = {
  version: 1,
  nom: "Verger de plaine",
  stationId: "limon-riche",
  // **La plaine céréalière, et c'est le réglage qui décide du niveau.** Deux
  // semis par an contre soixante-deux pour un bocage : ailleurs, le verger
  // disparaît sous la régénération avant d'avoir donné. Un verger au milieu
  // des champs est d'ailleurs le cas agroforestier canonique.
  bordures: {
    nord: "plaine-cerealiere",
    est: "plaine-cerealiere",
    sud: "plaine-cerealiere",
    ouest: "plaine-cerealiere",
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
  depart: VERGER_DE_PLAINE,
  seed: 7,
  meteo: "synthetique",
  economie: false,
  // Vingt ans. La mesure ci-dessus donne deux cents kilos vers l'an 9 : la
  // marge est de onze ans pour qui s'y prend mal.
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
    // ——— SONDE TEMPORAIRE (#188) : les pommiers portent-ils seulement des
    // fruits ? À retirer une fois la question tranchée.
    {
      // À MÉMOIRE (`acquis` par défaut) : la fenêtre de fruits ne dure que
      // trois semaines par an, donc un relevé instantané tombe presque
      // toujours à côté. Ce palier reste coché dès que les pommiers ont porté
      // UNE FOIS — c'est ça, la question.
      id: "sonde-a-deja-porte",
      quoi: "SONDE · les pommiers ont déjà porté",
      mesure: (e) => pommiers(e).reduce((s2, t) => s2 + t.fruitsKg, 0),
      cible: 1,
      unite: "kg",
    },
    {
      // Le TOTAL toutes essences : la ronce est récoltée chaque année (le
      // journal le montre), donc ce palier doit se cocher. S'il se coche et que
      // « les pommiers ont déjà porté » ne se coche pas, la chaîne du cumul
      // fonctionne et ce sont bien les pommes qui manquent.
      id: "sonde-cumul-total",
      quoi: "SONDE · fruits récoltés, toutes essences",
      mesure: (e) => e.cumuls.fruitsKg,
      cible: 1,
      unite: "kg",
    },
    {
      id: "sonde-hauteur",
      quoi: "SONDE · hauteur du plus grand pommier",
      mesure: (e) => pommiers(e).reduce((m, t) => Math.max(m, t.heightM), 0),
      cible: 99,
      unite: "m",
      acquis: false,
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
