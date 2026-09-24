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
 * ─── **ce que le terme a changé**, **mesuré** ────────────────────────────────────────
 * Blé continu, limon riche, trente ans, moyenne des dix dernières années. Le
 * témoin est `PERTE_CROISSANCE_MAX = 0`, **refait** après le lot — le reprendre de
 * la mesure d'avant aurait comparé le nouveau moteur à un témoin calculé sur
 * une autre trajectoire de tassement.
 *
 *                      avant   après   témoin refait   Broadbalk
 *     rien              1,07    1,44        1,59          ~1
 *     minéral 192       4,88    6,00        6,32         8-9
 *     fumier 240        6,21    8,01        8,39          ~9
 *
 * Le plot fumé entre dans la gamme de l'essai, et il ne reste plus que 5 %
 * attribuables au tassement sur les plots fertilisés, contre 26 % avant. Le
 * point zéro, lui, monte à 1,44 sur trente ans — mais poursuivi sur cent vingt
 * il converge à 0,70-0,84, donc **sous** le ~1 de Broadbalk : l'écart est dans
 * l'autre sens que redouté, et c'est la limite de C16 (la paille), pas celle du
 * labour. Opposer trente ans de moteur à cent quatre-vingts ans d'épuisement
 * n'était pas le même dispositif.
 *
 * ─── **ce qui n'est toujours pas là** ────────────────────────────────────────────
 * **un seul geste tasse** : `labourer`. Semer, fertiliser et moissonner ne
 * touchent pas la variable, alors que ce sont des passages d'engin eux aussi.
 * Les ajouter demanderait de recalibrer `TASSEMENT_PAR_PASSAGE`, que ce lot n'a
 * pas touché.
 *
 * ─── **ce que c'était avant** (#141) ─────────────────────────────────────────────
 * **un seul geste tasse** : `labourer`. Semer, fertiliser et moissonner ne
 * touchent pas la variable, alors que ce sont des passages d'engin eux aussi.
 * Le compte qui circulait dans le dépôt — « quatre passages, soit 1,00 par an
 * contre 0,20 de réparation, donc épinglé dès la deuxième année » — était faux.
 * La trajectoire relevée au centre d'un blé continu labouré tous les ans était
 * +0,05 par an : 0,25 à l'an 1, 0,50 à l'an 6, 1,000 à partir de l'an 16, et
 * plus jamais rien d'autre.
 *
 * Ce que ce plafond coûtait, mesuré en neutralisant `PERTE_CROISSANCE_MAX` :
 * sans apport 1,07 → 1,70 t/ha, minéral 192 kg N 4,88 → 6,68, fumier 240
 * 6,21 → 8,39. Un bon tiers du rendement.
 *
 * ─── **le terme qui manquait**, **et qui est là** (#141) ────────────────────────────
 * Ce n'était pas un coefficient trop grand, c'était **un terme qui manquait**.
 * Le moteur ne modélisait que les **roues** du tracteur ; or un labour, c'est deux
 * choses en même temps, et elles vont en sens contraire :
 *
 *   - **le soc casse la structure tassée de l'horizon travaillé** — c'est même
 *     la raison agronomique du geste, celle pour laquelle on laboure un sol
 *     compacté ;
 *   - **les roues repassent derrière**, dans la raie ouverte, et retassent.
 *
 * D'où `tassementApresLabour`, qui applique les deux dans cet ordre, et d'où un
 * fait contre-intuitif que personne n'a eu à écrire : **labourer un sol tassé
 * le desserre, labourer un sol meuble le tasse.** Une seule formule, deux
 * comportements opposés, selon l'état du sol. Et le régime n'est plus une
 * saturation mais un **équilibre**, ce qu'un sol labouré depuis 1843 impose.
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
 * Ce qu'il **reste** de tassement là où le soc vient de passer, avant que les roues
 * ne repassent ∈ [0,1] *(à calibrer)*.
 *
 * Un horizon fraîchement labouré est l'état le plus meuble qu'un sol arable
 * connaisse : la charrue le retourne et le fait éclater. **Mais ce n'est pas
 * zéro, et la raison est exactement la limite du modèle** : sous l'horizon
 * travaillé se forme une **semelle de labour**, que le passage répété du soc à la
 * même profondeur lisse et compacte, et que rien ne vient desserrer. Le moteur
 * ne tient qu'une valeur par cellule, pour tout le profil ; ce résidu est la
 * part de cette valeur que la semelle occupe. Un modèle à deux horizons la
 * rendrait explicite — ce serait un autre lot, et il faudrait l'ancrer.
 */
export const TASSEMENT_RESIDUEL_APRES_SOC = 0.05;

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
 * Ce qu'un **labour** laisse : le soc d'abord, les roues ensuite (#141).
 *
 * Les deux termes ne s'ajoutent pas, ils se composent dans l'ordre où ils ont
 * lieu — le soc passe, puis le tracteur roule dans la raie qu'il vient
 * d'ouvrir. Et les deux ne concernent que la part **mécanisée** : là où le tracteur
 * n'entre pas, ni le soc ni les roues ne font quoi que ce soit, et le sol garde
 * l'état qu'il avait. C'est ce qui rend le bénéfice agroforestier lisible — une
 * parcelle plantée serré n'est ni tassée ni desserrée, elle est laissée.
 *
 * **Le fait que ça produit, et qui n'est écrit nulle part** : ce que rend cette
 * fonction ne dépend de l'état d'avant que par la part **non** mécanisée. Sur un
 * champ nu (part = 1), labourer un sol à 0,9 de tassement le ramène à 0,30, et
 * labourer un sol intact le monte à 0,30. Le même geste desserre ou tasse selon
 * ce qu'il trouve, ce qui est le comportement réel d'une charrue.
 */
export function tassementApresLabour(tassement: number, partMecanisee: number): number {
  const part = Math.min(1, Math.max(0, partMecanisee));
  const avant = Math.min(1, Math.max(0, tassement));
  const apresSoc = (1 - part) * avant + part * TASSEMENT_RESIDUEL_APRES_SOC;
  return tassementApresPassage(apresSoc, part);
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
