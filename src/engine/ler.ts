/**
 * LE LAND EQUIVALENT RATIO (issue #136, critère H21 ; docs/regles.md §7.5).
 *
 * C'EST LE CHIFFRE DE L'AGROFORESTERIE. Pas un score de plus : la réponse à la
 * question que le jeu pose depuis son premier commit — *est-ce que des arbres
 * ET une culture sur la même parcelle valent mieux que les deux séparément ?*
 * Un LER de 1,3 veut dire qu'il faudrait 1,3 hectare de monocultures, blé d'un
 * côté et bois de l'autre, pour produire ce qu'un hectare d'allées produit. En
 * dessous de 1, le mélange perd, et c'est un résultat aussi utile.
 *
 * ── CE QUE C'EST, ET POURQUOI CE N'EST PAS UN AFFICHAGE ──────────────────────
 *
 * `LER = Y_culture / Ym_culture + Y_arbre / Ym_arbre`, où les `Y` sont les
 * rendements par hectare DE LA PARCELLE MIXTE et les `Ym` ceux des deux
 * monocultures. Chaque terme est une SURFACE ÉQUIVALENTE : « il faudrait 0,54
 * hectare de blé pur pour faire le blé de cet hectare-là ».
 *
 * La conséquence est architecturale et il faut la dire : **le LER exige deux
 * témoins qui n'existent pas dans la partie du joueur.** Aucune quantité
 * mesurée sur la parcelle mixte, si fine soit-elle, ne peut les remplacer :
 *  - l'idéal sans limite (`partDuRendement`, herbacees.ts) n'est pas une
 *    monoculture — un blé pur fertilisé du moteur plafonne à 0,70 de son idéal
 *    (C18), et diviser par 1 au lieu de 0,70 ferait un LER faux de 30 % ;
 *  - les cellules les moins ombragées de l'allée ne sont pas un témoin non
 *    plus : elles reçoivent l'azote de la litière des arbres, et c'est
 *    exactement ce que #140 a dû neutraliser pour rendre le gradient lisible ;
 *  - et côté arbre il n'existe aucun analogue : la monoculture de référence est
 *    une plantation à SA densité, qui n'est pas celle des alignements.
 *
 * Ce module calcule donc l'indice à partir de rendements qu'on lui DONNE, et le
 * dispositif à trois bras vit dans l'essai (`ler.test.ts`). Brancher
 * l'indicateur permanent que `regles.md` demande suppose de faire avancer deux
 * parcelles témoins en même temps que celle du joueur, soit trois fois le coût
 * du moteur par tick : c'est un choix d'architecture, pas un lot.
 *
 * ── CE QU'ON NE DOIT PAS LUI FAIRE DIRE ──────────────────────────────────────
 *
 * Un LER compare des PRODUCTIONS, pas des revenus : les deux termes n'ont pas
 * la même unité (des tonnes de grain, des mètres cubes de bois) et c'est
 * justement pour ça qu'on les rend sans dimension avant de les additionner.
 * Additionner des euros donnerait une tout autre grandeur, qui dépendrait du
 * marché et non de la parcelle.
 *
 * Et il ne dit rien du temps : un jeune alignement a un LER arbre ridicule et
 * un LER culture proche de 1, puis les deux basculent. C'est une PHOTO d'une
 * période, et la période fait partie du résultat.
 */

import { type TreeState, volumeTigeM3 } from "./trees";

/**
 * Ce qu'un système produit, par hectare de parcelle et par an.
 *
 * « Par hectare de parcelle » et non « par hectare semé » : c'est ce qui rend
 * le partage du sol visible. Une parcelle dont les arbres occupent un tiers de
 * la surface produit moins de grain par hectare DE PARCELLE, et c'est bien le
 * prix qu'on veut compter.
 */
export interface Production {
  /** grain récolté, t/ha/an */
  grainTHaAn: number;
  /** bois produit (sur pied + récolté), m³/ha/an */
  boisM3HaAn: number;
}

/**
 * Un terme du LER : la surface de monoculture qu'il faudrait pour faire autant.
 *
 * Zéro quand le témoin ne produit rien — pas l'infini : un dénominateur nul dit
 * que la monoculture est impossible sur cette station, donc que la question du
 * partage ne se pose pas pour ce composant.
 */
export function lerPartiel(mixte: number, temoin: number): number {
  return temoin > 0 ? Math.max(0, mixte) / temoin : 0;
}

export interface Ler {
  /** surface équivalente de culture pure */
  culture: number;
  /** surface équivalente de plantation pure */
  arbre: number;
  /** la somme : > 1, le mélange bat les deux monocultures */
  total: number;
}

/**
 * Le LER d'un système mixte contre ses deux monocultures.
 *
 * Les deux témoins sont passés séparément parce qu'ils ne se ressemblent pas :
 * le témoin de culture est un champ sans arbres, le témoin d'arbres est une
 * plantation sans culture — et rien n'oblige la seconde à avoir la densité des
 * alignements. C'est même le point : à Restinclières le témoin forestier est
 * plus dense que l'agroforesterie, et c'est ce qui rend le LER arbre inférieur
 * à 1 pendant que le LER total dépasse 1,2.
 */
export function ler(mixte: Production, temoinCulture: Production, temoinArbre: Production): Ler {
  const culture = lerPartiel(mixte.grainTHaAn, temoinCulture.grainTHaAn);
  const arbre = lerPartiel(mixte.boisM3HaAn, temoinArbre.boisM3HaAn);
  return { culture, arbre, total: culture + arbre };
}

/**
 * Ce qu'une parcelle a produit, ramené à l'hectare et à l'année.
 *
 * Le bois compte ce qui est SUR PIED plus ce qui a été récolté, parce que le
 * LER mesure une production et non un stock : une éclaircie ne doit pas faire
 * baisser le LER arbre de ce qu'elle a sorti. Le grain, lui, est déjà sorti par
 * définition — on ne récolte pas un blé deux fois.
 *
 * Le volume retenu est celui de la TIGE (`volumeTigeM3`), pas l'aérien : c'est
 * ce qui part en scierie, et c'est la grandeur que les tables de production
 * forestières publient.
 */
export function production(
  trees: readonly TreeState[],
  aireHa: number,
  ans: number,
  grainRecolteT: number,
  boisRecolteM3 = 0,
): Production {
  const ha = aireHa;
  if (ha <= 0 || ans <= 0) return { grainTHaAn: 0, boisM3HaAn: 0 };
  let surPied = 0;
  for (const t of trees) {
    if (!t.alive) continue;
    surPied += volumeTigeM3(t.diametreCm, t.heightM);
  }
  return {
    grainTHaAn: grainRecolteT / ha / ans,
    boisM3HaAn: (surPied + boisRecolteM3) / ha / ans,
  };
}
