/**
 * Le paysage autour de la parcelle (docs/regles.md §2.2).
 *
 * Une parcelle d'un hectare ne vit pas seule. Ce qui l'entoure décide de
 * beaucoup de choses, et jusqu'ici ces choses étaient éparpillées dans quatre
 * champs sans lien entre eux : la densité de gibier, les dépôts atmosphériques
 * d'azote, la pluie de semis et l'exposition au vent. On pouvait donc décrire
 * une parcelle « au cœur d'une hêtraie » qui ne recevait aucun semis de hêtre,
 * ou une parcelle « en pleine ville » pleine de chevreuils.
 *
 * Le paysage est désormais UN objet, décrit en une phrase et en trois parts —
 * boisé, cultivé, urbanisé — dont tout le reste se déduit :
 *
 *  - **le gibier** a besoin de couvert : beaucoup dans un massif, peu en
 *    plaine ouverte, presque rien en tissu urbain dense (mais pas zéro : le
 *    chevreuil péri-urbain existe) ;
 *  - **les dépôts d'azote** viennent de l'ammoniac des élevages et des cultures
 *    et des oxydes d'azote de la circulation : c'est en pleine campagne
 *    intensive et en ville qu'on en reçoit le plus, en forêt le moins ;
 *  - **la pluie de semis** ne peut apporter que ce qui pousse alentour, au
 *    prorata de ce qui est boisé ;
 *  - **le vent** est freiné par les boisements voisins ;
 *  - **les départs de feu** sont d'origine humaine dans leur immense majorité :
 *    un massif isolé s'enflamme moins souvent qu'un bois de banlieue, à
 *    sécheresse et combustible égaux.
 *
 * Rien n'y est spécifique à une station : un nouveau paysage se décrit en
 * quatre nombres et une liste d'essences.
 */

/** Ce qu'un paysage apporte à la parcelle, dérivé de sa composition. */
export interface Paysage {
  id: string;
  nom: string;
  /** ce que ça change pour le joueur, en une phrase */
  description: string;
  /** part boisée de l'entourage ∈ [0,1] */
  partBoisee: number;
  /** part en cultures ou prairies intensives ∈ [0,1] */
  partCultivee: number;
  /** part urbanisée ∈ [0,1] */
  partUrbaine: number;
  /**
   * Ce qui sème depuis l'entourage, espèce par espèce. Explicite plutôt que
   * déduit du taux boisé : la lande a peu de gibier et beaucoup de pins, une
   * banlieue a du passage et presque pas de semenciers. Lier les deux aurait
   * fabriqué des paysages faux.
   */
  semenciers: readonly { especeId: string; semisParAn: number }[];
}

/**
 * Densité de cervidés, individus/ha. Il leur faut du couvert pour se remiser :
 * un massif en porte beaucoup, une plaine ouverte peu, une ville presque rien.
 */
export function gibierParHa(p: Paysage): number {
  const couvert = p.partBoisee;
  const derangement = 1 - 0.85 * p.partUrbaine;
  return Math.max(0, (0.03 + 0.32 * couvert) * derangement);
}

/**
 * Dépôts atmosphériques d'azote, kg/ha/an. L'ammoniac vient de l'élevage et
 * des cultures, les oxydes d'azote de la circulation : une forêt de montagne
 * en reçoit trois fois moins qu'une parcelle coincée entre une nationale et un
 * plateau céréalier.
 */
export function depositionNKgHaAn(p: Paysage): number {
  return 6 + 16 * p.partCultivee + 12 * p.partUrbaine;
}

/** Pluie de semis annuelle : ce qui pousse alentour, et en quelle abondance. */
export function voisinageSemencier(p: Paysage): { especeId: string; semisParAn: number }[] {
  return p.semenciers.map((s) => ({ ...s }));
}

/** Exposition au vent : les boisements voisins freinent, le découvert expose. */
export function ventExposition(p: Paysage): number {
  return Math.min(1, Math.max(0.1, 0.95 - 0.75 * p.partBoisee));
}

/**
 * Fréquence relative des départs de feu d'origine HUMAINE.
 *
 * En France, la très grande majorité des incendies part d'une activité
 * humaine — mégot, travaux, barbecue, ligne électrique — et non de la foudre.
 * À sécheresse et combustible égaux, un massif isolé s'enflamme donc bien
 * moins souvent qu'un bois de lotissement *(à calibrer)*.
 */
export function frequentationHumaine(p: Paysage): number {
  // Échelle relative : une campagne ordinaire vaut 1, un massif isolé un peu
  // moins, une lisière de banlieue une fois et demie plus. Même un paysage
  // rural a ses routes, ses chantiers et ses barbecues — c'est pourquoi le
  // plancher n'est pas bas.
  return 0.8 + 1.2 * p.partUrbaine + 0.5 * p.partCultivee;
}

export const PAYSAGES: readonly Paysage[] = [
  {
    id: "massif-forestier",
    nom: "Au cœur d'un massif forestier",
    description:
      "Semis en abondance, gibier nombreux, air propre et vent cassé par les arbres. Tout pousse — et tout est mangé.",
    partBoisee: 0.9,
    partCultivee: 0.05,
    partUrbaine: 0,
    semenciers: [
      { especeId: "fagus_sylvatica", semisParAn: 5 },
      { especeId: "quercus_pubescens", semisParAn: 4 },
      { especeId: "corylus_avellana", semisParAn: 3 },
    ],
  },
  {
    id: "bocage",
    nom: "Dans un bocage d'élevage",
    description:
      "Des haies partout : de quoi semer, du gibier à l'abri, et l'ammoniac des élevages qui fertilise gratuitement.",
    partBoisee: 0.35,
    partCultivee: 0.6,
    partUrbaine: 0.05,
    semenciers: [
      { especeId: "fraxinus_excelsior", semisParAn: 4 },
      { especeId: "quercus_pubescens", semisParAn: 2 },
      { especeId: "corylus_avellana", semisParAn: 2 },
    ],
  },
  {
    id: "plaine-cerealiere",
    nom: "En pleine plaine céréalière",
    description:
      "Pas un arbre à l'horizon : rien ne sème, le vent balaie, et les dépôts d'azote sont au maximum. Ce que vous plantez est le seul boisement du secteur.",
    partBoisee: 0.03,
    partCultivee: 0.95,
    partUrbaine: 0.02,
    // Rien, ou presque : c'est tout l'enjeu de ce paysage.
    semenciers: [],
  },
  {
    id: "peri-urbain",
    nom: "En lisière de banlieue",
    description:
      "Peu de gibier mais beaucoup de passage : c'est de là que partent les feux. L'air est chargé d'azote, et il n'y a presque rien pour semer.",
    partBoisee: 0.2,
    partCultivee: 0.15,
    partUrbaine: 0.65,
    semenciers: [{ especeId: "betula_pendula", semisParAn: 2 }],
  },
  {
    id: "lande-ouverte",
    nom: "Au milieu de la lande",
    description:
      "Un horizon rase, du vent en permanence, et pour seuls semenciers les pins et les bouleaux qui tiennent le sable.",
    partBoisee: 0.25,
    partCultivee: 0.05,
    partUrbaine: 0.05,
    semenciers: [
      { especeId: "pinus_sylvestris", semisParAn: 4 },
      { especeId: "betula_pendula", semisParAn: 3 },
      { especeId: "quercus_suber", semisParAn: 1 },
    ],
  },
  {
    id: "lisiere-forestiere",
    nom: "En lisière de forêt",
    description:
      "Une friche adossée à un massif : les pionnières arrivent en nombre, les climaciques suivent de loin. C'est le paysage de la succession.",
    partBoisee: 0.5,
    partCultivee: 0.35,
    partUrbaine: 0.05,
    semenciers: [
      { especeId: "betula_pendula", semisParAn: 6 },
      { especeId: "pinus_sylvestris", semisParAn: 3 },
      { especeId: "fagus_sylvatica", semisParAn: 2 },
    ],
  },
];

export function getPaysage(id: string): Paysage {
  const p = PAYSAGES.find((x) => x.id === id);
  if (!p) throw new Error(`paysage inconnu : ${id}`);
  return p;
}
