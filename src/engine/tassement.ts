/**
 * La structure du sol : ce que les engins tassent et ce que les racines
 * réparent.
 *
 * Le moteur n'avait aucune variable de structure. Un sol y était défini par sa
 * texture, sa matière organique et son pH — trois choses qui ne bougent pas ou
 * peu — alors que ce qui change vraiment sous une conduite agricole, c'est
 * l'**arrangement** de ces particules. Un limon tassé et le même limon en bonne
 * structure ont la même texture et ne se comportent pas pareil.
 *
 * ─── **ce que fait le tassement** ────────────────────────────────────────────────
 * Il réduit l'infiltration de l'eau et de l'air, il restreint la pénétration
 * des racines, et il gêne l'activité biologique. Les essais d'Arvalis sur cinq
 * ans mesurent des pertes de rendement de **5 à 30 %** selon les passages, quel
 * que soit la culture ou le système.
 *
 * ─── **ce qui le répare** ────────────────────────────────────────────────────────
 * Les racines, d'abord : elles percent, meurent, et laissent des galeries.
 * L'alternance gel-dégel et l'activité biologique ensuite. C'est lent, et les
 * sources consultées ne chiffrent **pas** ce temps de retour — on prend une échelle
 * pluriannuelle, marquée comme telle *(à calibrer)*.
 *
 * ─── **ce qu'il en est aujourd'hui**, **mesuré** ─────────────────────────────────────
 * **un seul geste tasse** : `labourer`. Semer, fertiliser et moissonner ne
 * touchent pas la variable, alors que ce sont des passages d'engin eux aussi.
 * Le compte qui circulait dans le dépôt — « quatre passages, soit 1,00 par an
 * contre 0,20 de réparation, donc épinglé dès la deuxième année » — était donc
 * faux. La trajectoire relevée au centre d'un blé continu labouré tous les ans
 * est +0,05 par an : 0,25 à l'an 1, 0,50 à l'an 6, 1,000 à partir de l'an 16,
 * et plus jamais rien d'autre.
 *
 * Ce que ce plafond coûte, mesuré en neutralisant `PERTE_CROISSANCE_MAX`
 * (moyenne des dix dernières années sur trente, blé continu, limon riche) :
 * sans apport 1,07 → 1,70 t/ha, minéral 192 kg N 4,88 → 6,68, fumier 240
 * 6,21 → 8,39. Un bon tiers du rendement, et le plot fumé neutralisé tombe
 * dans la gamme de Broadbalk (~9 t/ha).
 *
 * **ce n'est pas un coefficient trop grand, c'est un terme qui manque** : le
 * soc **desserre** l'horizon travaillé — c'est même la raison agronomique du
 * geste — et le moteur ne modélise que les roues du tracteur. Broadbalk est
 * labouré chaque année depuis 1843 et fait 9 t/ha. Baisser
 * `TASSEMENT_PAR_PASSAGE` soulèverait aussi le point zéro (1,07 → 1,70 alors
 * que les parcelles nues de l'essai tiennent ~1), c'est-à-dire déplacerait le
 * défaut : le tassement fait en partie le travail de la paille qui manque.
 * Voir l'issue #141, passée à `moteur:évolution` pour cette raison.
 *
 * ─── **et c'est un argument agroforestier** ──────────────────────────────────────
 * Le tassement ne se produit que là où l'engin **passe**. Or le moteur sait déjà
 * dire quelle part d'une zone est mécanisable selon la façon dont c'est planté
 * (mecanisation.ts) : une parcelle plantée serré ne se tasse pas, parce que le
 * tracteur n'y entre pas. La densité d'arbres protège donc la structure, et
 * c'est un bénéfice de l'agroforesterie que personne n'a écrit dans une règle.
 */

/** Ce qu'un passage d'engin ajoute au tassement d'une cellule ∈ [0,1]. */
export const TASSEMENT_PAR_PASSAGE = 0.25;

/**
 * Ce que le sol répare tout seul en une année, hors racines : gel-dégel,
 * vers de terre, alternance d'humectation *(à calibrer : aucune des sources
 * consultées ne chiffre le temps de retour d'une structure tassée)*.
 */
export const REPARATION_BIOLOGIQUE_PAR_AN = 0.06;

/** Ce que des racines denses ajoutent à la réparation, par an. */
export const REPARATION_RACINAIRE_MAX_PAR_AN = 0.14;

/** Part d'infiltration qu'un sol entièrement tassé a perdue. */
export const PERTE_INFILTRATION_MAX = 0.5;

/** Part de croissance qu'un sol entièrement tassé retire à ce qui y pousse. */
export const PERTE_CROISSANCE_MAX = 0.3;

/** Tassement après une année, sous une densité racinaire donnée ∈ [0,1]. */
export function tassementApresUneAnnee(tassement: number, partRacinaire: number): number {
  const repare =
    REPARATION_BIOLOGIQUE_PAR_AN +
    REPARATION_RACINAIRE_MAX_PAR_AN * Math.min(1, Math.max(0, partRacinaire));
  return Math.max(0, Math.min(1, tassement) - repare);
}

/**
 * Ce qu'un passage d'engin laisse, sachant que seule la part **mécanisable** de la
 * zone est réellement parcourue : là où le tracteur n'entre pas, il ne tasse
 * pas.
 */
export function tassementApresPassage(tassement: number, partMecanisee: number): number {
  return Math.min(1, tassement + TASSEMENT_PAR_PASSAGE * Math.min(1, Math.max(0, partMecanisee)));
}

/**
 * Facteur d'infiltration qu'il reste à un sol tassé ∈ [0,1] : ce qui n'entre
 * pas ruisselle, et rejoint donc l'érosion.
 */
export function facteurInfiltration(tassement: number): number {
  return 1 - PERTE_INFILTRATION_MAX * Math.min(1, Math.max(0, tassement));
}

/**
 * Facteur de croissance qu'il reste à ce qui pousse sur un sol tassé ∈ [0,1].
 * Calé sur la fourchette d'Arvalis : jusqu'à 30 % de perte au pire.
 */
export function facteurCroissanceTassement(tassement: number): number {
  return 1 - PERTE_CROISSANCE_MAX * Math.min(1, Math.max(0, tassement));
}
