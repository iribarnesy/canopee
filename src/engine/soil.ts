/**
 * Le sol, décrit par sa PHYSIQUE (docs/regles.md §2.1, critère de réalisme A9).
 *
 * Un profil = une pile d'horizons, chacun caractérisé par des propriétés
 * primaires mesurables sur le terrain : épaisseur, texture (sable/limon/argile),
 * pierrosité, matière organique, pH, induration. Tout ce dont le moteur a
 * besoin — réserve utile, conductivité, minéralisation, stock de carbone — en
 * est DÉRIVÉ par des lois générales. Aucun sol n'est décrit par des valeurs
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
   * ET la pénétration des racines. 0 = horizon meuble, 1 = quasi imperméable.
   */
  induration: number;
}

export type SoilProfile = readonly Horizon[];

/** Réserve utile d'un horizon, mm (eau retenue entre capacité au champ et flétrissement). */
export function ruHorizonMm(h: Horizon): number {
  // mm d'eau par cm de sol selon la texture : le limon retient le mieux,
  // le sable très peu, l'argile beaucoup mais la retient trop fort.
  const parCm = 0.6 * h.sable + 2.0 * h.limon + 1.6 * h.argile;
  // La matière organique fait éponge (critère A12).
  const bonusMo = 0.05 * h.moPct;
  return (parCm + bonusMo) * h.epaisseurCm * (1 - h.pierrosite);
}

/**
 * Conductivité hydraulique d'un horizon, mm/semaine (ordre de grandeur du Ksat
 * ramené à la semaine). La texture agit en loi PUISSANCE — le sable conduit
 * mille fois mieux que l'argile — et l'induration (alios, semelle) la divise.
 * C'est le drainage INTERNE ; l'évacuation réelle dépend aussi de l'exutoire
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
