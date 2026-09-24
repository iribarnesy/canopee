/**
 * Le sol, décrit par sa **physique** (docs/regles.md §2.1, critère de réalisme A9).
 *
 * Un profil = une pile d'horizons, chacun caractérisé par des propriétés
 * primaires mesurables sur le terrain : épaisseur, texture (sable/limon/argile),
 * pierrosité, matière organique, pH, induration. Tout ce dont le moteur a
 * besoin — réserve utile, conductivité, minéralisation, stock de carbone — en
 * est **dérivé** par des lois générales. Aucun sol n'est décrit par des valeurs
 * saisies à la main : c'est ce qui permettra de générer des stations
 * quelconques et de rester juste sur chacune.
 *
 * Les coefficients sont des ordres de grandeur agronomiques *(à caler sur des
 * abaques type INRAE / triangle des textures)*.
 */

/** Un horizon de sol, décrit par ses propriétés primaires. */
export interface Horizon {
  /** épaisseur, cm */
  epaisseurCm: number;
  /** fractions granulométriques (somme = 1) */
  sable: number;
  limon: number;
  argile: number;
  /** part du volume occupée par les cailloux ∈ [0,1] — autant de sol en moins */
  pierrosite: number;
  /** matière organique, % de la masse */
  moPct: number;
  ph: number;
  /**
   * Induration ∈ [0,1] : alios, semelle de labour, dalle — freine le drainage
   * **et** la pénétration des racines. 0 = horizon meuble, 1 = quasi imperméable.
   */
  induration: number;
}

export type SoilProfile = readonly Horizon[];

/** Réserve utile d'un horizon, mm (eau retenue entre capacité au champ et flétrissement). */
export function ruHorizonMm(h: Horizon): number {
  // mm d'eau par cm de sol selon la texture : le limon retient le mieux,
  // le sable très peu, l'argile beaucoup mais la retient trop fort.
  const parCm = 0.6 * h.sable + 2.0 * h.limon + 1.6 * h.argile;
  // La matière organique fait éponge (critère A12). L'ampleur de l'effet est
  // débattue : les estimations vont de ~0,05 à ~0,15 mm/cm par point de MO.
  // On prend le milieu de la fourchette, en sachant que ce paramètre n'est
  // pas anodin — au-delà de 0,1, l'eau reste assez souvent disponible en
  // surface pour que les jeunes arbres n'investissent plus vers le bas
  // (plasticité racinaire, trees.ts) et se fassent surprendre par la première
  // vraie sécheresse. Le mécanisme est réel ; sa violence, elle, dépend d'un
  // chiffre incertain, donc on reste prudent.
  const bonusMo = 0.1 * h.moPct;
  return (parCm + bonusMo) * h.epaisseurCm * (1 - h.pierrosite);
}

/**
 * Conductivité hydraulique d'un horizon, mm/semaine (ordre de grandeur du Ksat
 * ramené à la semaine). La texture agit en loi **puissance** — le sable conduit
 * mille fois mieux que l'argile — et l'induration (alios, semelle) la divise.
 * C'est le drainage **interne** ; l'évacuation réelle dépend aussi de l'exutoire
 * (cf. `drainageExterneMmSemaine` de la station).
 */
export function conductiviteHorizonMmSemaine(h: Horizon): number {
  const exposant = 3.4 * h.sable + 2.2 * h.limon + 0.6 * h.argile;
  return 10 ** exposant * (1 - 0.98 * h.induration);
}

/**
 * Eau gravitaire qu'un horizon peut contenir avant saturation, mm : la
 * macroporosité, soit ~8-15 % du volume selon la texture (1,5 mm/cm de sable).
 */
export function porositeDrainageMm(h: Horizon): number {
  const parCm = 1.5 * h.sable + 1.0 * h.limon + 0.8 * h.argile;
  return parCm * h.epaisseurCm * (1 - h.pierrosite);
}

/** Densité apparente, g/cm³ — l'argile et surtout la MO allègent le sol. */
export function densiteApparente(h: Horizon): number {
  return Math.max(0.9, 1.55 * h.sable + 1.35 * h.limon + 1.2 * h.argile - 0.05 * h.moPct);
}

/**
 * Frein de l'acidité sur la vie du sol : en sol acide la minéralisation est
 * lente (humus de type mor, ch2-B) ; elle est optimale autour de la neutralité.
 */
export function facteurPhBiologie(ph: number): number {
  return Math.min(1, Math.max(0.15, (ph - 3.5) / 2));
}

/** Largeur sur laquelle la vigueur monte de zéro au plein régime, en pH. */
export const RAMPE_PH = 0.7;

/**
 * Ce qui reste de vigueur à une espèce **pile à la borne** de son amplitude.
 *
 * Ce paramètre ne corrige qu'une chose, et il faut savoir laquelle : la borne
 * de l'atlas ne vaut plus **zéro**. Elle le valait pour les 26 espèces — mesuré —
 * ce qui faisait de chaque amplitude de présence un couloir de mort à ses
 * propres bords, et `paysage.ts` en avait tiré une doctrine (« au bord exact de
 * sa gamme, une espèce ne pousse déjà plus du tout »).
 *
 * **Il ne fait pas survivre l'espèce à sa borne**, et c'est mesuré aussi. Sous
 * `STRESS_ONSET` (0,45) le stress monte de (0,45 − f) × 5 par semaine pour
 * 10 de létal : à 0 l'arbre meurt en quatre semaines, à 0,2 en huit. La valeur
 * ne déplace donc qu'un délai. La faire monter à 0,45 pour qu'une espèce tienne
 * vraiment à sa borne relèverait de +0,45 **toute** espèce située dans sa rampe,
 * ce qui casse les tables de production — le pin sylvestre, dont la station de
 * référence est à pH 7, soit dans la rampe de sa borne haute, passe de 15,5 m
 * tabulés à 18,9 m simulés dès qu'on le relève de 0,2.
 *
 * 0,05 est donc choisi pour ce qu'il ne casse pas : c'est la plus petite valeur
 * qui ôte le zéro franc, et les tables de production — le seul ancrage de
 * vérité terrain du dépôt — restent satisfaites. Ce n'est pas une mesure, c'est
 * une borne supérieure imposée par la calibration existante.
 *
 * **Le vrai manque est ailleurs**, et il a son issue : le pH n'a qu'**un** facteur,
 * qui sert à la fois la croissance et la survie. L'eau en a deux, découplés
 * exprès — « le hêtre pousse mal en sec, mais son semis survit ». Un arbre au
 * bord de son amplitude de pH devrait pousser mal **et** tenir ; le moteur n'a
 * aucun moyen de le dire.
 */
export const VIGUEUR_A_LA_BORNE = 0.05;

/**
 * Marge de **survie** au-delà de l'amplitude de présence, en pH (#161).
 *
 * Le second seuil que `VIGUEUR_A_LA_BORNE` appelait de ses vœux. L'eau en a
 * deux depuis toujours — un confort qui ralentit la croissance, un stress qui
 * tue — et l'atlas explique pourquoi : « le hêtre pousse mal dès que l'eau
 * manque mais son semis survit ». Le pH n'en avait qu'un, si bien qu'une espèce
 * au bord de son amplitude ne pouvait pas pousser mal **et** tenir : elle mourait.
 * Mesuré avant ce lot, sur trois graines : un hêtre planté sur la lande sèche,
 * dont le pH (4,50) est **exactement** la borne que l'atlas lui donne pour
 * tolérable, meurt à 20 sur 20 en moins de cinq ans.
 *
 * **Une amplitude d'atlas est une amplitude de présence** : l'espèce s'y trouve,
 * rare et chétive aux bords, pas morte. Au-delà seulement commencent les
 * mécanismes qui tuent — vers l'acide la toxicité aluminique, vers le basique
 * la chlorose calcaire.
 *
 * **La valeur vient d'un relevé**, pas du moteur. Une hêtraie acidiphile à luzule
 * descend vers pH 4 ; la borne déclarée du hêtre est 4,5. Il faut donc qu'il
 * vive un demi-point en dessous, et qu'il meure peu après. Avec 0,7 — qui se
 * trouve être la largeur de la rampe, ce qui est commode mais n'est pas la
 * raison — sa survie vaut 1,00 pile à la borne, passe sous le seuil de stress
 * vers 4,15 et s'éteint vers 3,8. Le hêtre vit à pH 4, comme le relevé le dit.
 *
 * **Une seule valeur pour toutes les espèces**, et c'est une hypothèse, pas une
 * mesure : une spécialiste et une généraliste n'ont sûrement pas la même marge,
 * mais aucune donnée par espèce ne permettrait ici de les distinguer. Uniforme
 * est l'honnête tant qu'on n'a pas mieux *(à mesurer)*.
 */
export const MARGE_SURVIE_PH = 0.7;

/**
 * Tolérance de **survie** d'une espèce au pH ∈ [0,1] — le pendant de
 * `facteurGammePh`, en plus large (#161).
 *
 * La croissance lit l'amplitude de l'atlas, la survie lit la même élargie de
 * `MARGE_SURVIE_PH`. Entre les deux, l'arbre végète sans mourir : c'est
 * exactement ce qu'on observe aux bords d'une aire.
 *
 * **Ce que ça ne doit pas casser** : la bio-indication (C7). Un hêtre sur podzol ne
 * meurt plus de son pH, mais il y pousse à 5 % de son potentiel — il est donc
 * exclu par la **concurrence** au lieu de l'être par la mort, ce qui est le vrai
 * mécanisme de terrain et non un adoucissement. Mesuré dans `ph-survie.test.ts`.
 */
export function facteurSurviePh(gamme: readonly [number, number], ph: number): number {
  const [min, max] = gamme;
  return facteurGammePh([min - MARGE_SURVIE_PH, max + MARGE_SURVIE_PH], ph);
}

/**
 * Tolérance d'une espèce au pH ∈ [0,1] : un **plateau** à bords en rampe, plein à
 * l'optimum, réduit au cinquième aux bornes de l'atlas, nul peu après.
 *
 * **La forme qu'il faudrait**, **et celle qu'on a**. Les modèles de Huisman-Olff-
 * Fresco, l'étalon pour une réponse d'espèce le long d'un gradient, retiennent
 * cinq formes emboîtées — plate, monotone, plateau, unimodale symétrique,
 * unimodale dissymétrique — et ce sont les unimodales qui l'emportent pour le
 * pH. Aucun relevé ne décrit un plein régime plat suivi d'une falaise.
 *
 * Ce commentaire a un temps annoncé cette unimodale comme livrée. Elle ne
 * l'est pas : mesuré, 2,2 pH sur 3,5 d'amplitude valent exactement 1,00 — un
 * plateau, c'est-à-dire la forme même que ces modèles écartent. La poser
 * déplacerait la calibration de toutes les essences dont la station de
 * référence tombe dans une rampe, à commencer par le pin sylvestre. C'est donc
 * une dette écrite, pas un acquis *(à mesurer)*. Le moteur tient d'ailleurs la
 * réponse du phosphore au pH par une gaussienne : celui-ci fait exception.
 *
 * **Ce qui était faux**. La rampe touchait zéro **aux bornes** : mesuré sur les 26
 * espèces, `f(min) = 0` pour toutes — chacune en mort certaine au pH exact que
 * l'atlas lui donne pour tolérable, ce qui est le contraire de ce qu'une
 * amplitude de présence veut dire. Le journal en arrivait à annoncer « sol à
 * pH 4,5, il leur en faut 4 à 7,5 » sur un pin qu'il était en train de tuer, et
 * `paysage.ts` avait écrit la conséquence en doctrine : « au bord exact de sa
 * gamme, une espèce ne pousse déjà plus du tout ».
 *
 * L'optimum est pris au **milieu** de l'amplitude, faute de mieux : les relevés
 * donnent des réponses souvent dissymétriques, mais aucune donnée par espèce
 * ici ne permettrait de placer un optimum décalé. Symétrique est l'hypothèse
 * honnête, pas la vraie *(à mesurer)*.
 *
 * Elle vit ici, et pas dans `trees.ts`, parce que la strate herbacée la lit
 * aussi (`herbacees.ts`) : c'est une propriété du **sol** confrontée à une gamme,
 * elle ne suppose rien d'un tronc.
 */
export function facteurGammePh(gamme: readonly [number, number], ph: number): number {
  const [min, max] = gamme;
  // Le zéro est **dehors**, et c'est tout ce qui change par rapport à la version
  // qui le posait sur la borne. La rampe garde sa largeur, donc le plein régime
  // couvre presque la même plage qu'avant et la calibration bâtie dessus tient.
  const debordement = RAMPE_PH * VIGUEUR_A_LA_BORNE;
  return Math.min(
    1,
    Math.max(
      0,
      Math.min((ph - (min - debordement)) / RAMPE_PH, (max + debordement - ph) / RAMPE_PH),
    ),
  );
}

/**
 * Poids d'un horizon dans la vie du sol : l'activité biologique se concentre en
 * surface, la MO profonde est plus stable et moins accessible.
 */
function poidsBiologique(profondeurSommetCm: number): number {
  return profondeurSommetCm <= 0 ? 1 : Math.max(0.15, Math.exp(-profondeurSommetCm / 45));
}

/** Profondeur de sol pénétrable par les racines, cm (l'induration forte les arrête). */
export function profondeurPenetrableCm(profil: SoilProfile): number {
  let total = 0;
  for (const h of profil) {
    if (h.induration >= 0.9) break; // dalle, alios massif : les racines butent
    // Un horizon partiellement induré n'est exploré qu'en partie.
    total += h.epaisseurCm * (1 - h.induration);
  }
  return total;
}

/** Réserve utile totale du profil, mm. */
export function ruProfilMm(profil: SoilProfile): number {
  return profil.reduce((sum, h) => sum + ruHorizonMm(h), 0);
}

/** Le drainage du profil est celui de son horizon le plus lent (goulot). */
export function drainageProfilMmSemaine(profil: SoilProfile): number {
  return profil.reduce(
    (min, h) => Math.min(min, conductiviteHorizonMmSemaine(h)),
    Number.POSITIVE_INFINITY,
  );
}

/** Porosité de drainage totale, mm. */
export function porositeProfilMm(profil: SoilProfile): number {
  return profil.reduce((sum, h) => sum + porositeDrainageMm(h), 0);
}

/**
 * Azote potentiellement minéralisable, kg/ha/semaine en conditions optimales :
 * proportionnel au stock de MO accessible, freiné par l'acidité.
 */
export function mineralisationPotentielleKgHaSemaine(profil: SoilProfile): number {
  let profondeur = 0;
  let kgAn = 0;
  for (const h of profil) {
    kgAn += 1.7 * h.moPct * h.epaisseurCm * (1 - h.pierrosite) * poidsBiologique(profondeur);
    profondeur += h.epaisseurCm;
  }
  const ph = phSurface(profil);
  return (kgAn * facteurPhBiologie(ph)) / 52;
}

/**
 * Carbone organique du sol, t C/ha : masse de MO × 58 % de carbone. On ne
 * compte que la fraction biologiquement active (pondérée par la profondeur) —
 * le moteur ne modélise pas encore le carbone profond stabilisé.
 */
export function carboneProfilTHa(profil: SoilProfile): number {
  let profondeur = 0;
  let tC = 0;
  for (const h of profil) {
    const masseMoTHa = (h.moPct / 100) * h.epaisseurCm * densiteApparente(h) * 100;
    tC += masseMoTHa * 0.58 * (1 - h.pierrosite) * poidsBiologique(profondeur);
    profondeur += h.epaisseurCm;
  }
  return tC;
}

/** pH de l'horizon de surface (celui que voient les semis et la vie du sol). */
export function phSurface(profil: SoilProfile): number {
  return profil[0]?.ph ?? 7;
}

/** Épaisseur totale du profil, cm. */
export function profondeurTotaleCm(profil: SoilProfile): number {
  return profil.reduce((sum, h) => sum + h.epaisseurCm, 0);
}

/** Raccourci de saisie d'un horizon (les fractions sont normalisées). */
export function horizon(
  epaisseurCm: number,
  texture: { sable: number; limon: number; argile: number },
  options: { moPct: number; ph: number; pierrosite?: number; induration?: number },
): Horizon {
  const somme = texture.sable + texture.limon + texture.argile || 1;
  return {
    epaisseurCm,
    sable: texture.sable / somme,
    limon: texture.limon / somme,
    argile: texture.argile / somme,
    pierrosite: options.pierrosite ?? 0,
    moPct: options.moPct,
    ph: options.ph,
    induration: options.induration ?? 0,
  };
}
