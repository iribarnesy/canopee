/**
 * Profils de départ : figer un terrain, son entourage, son relief, son eau et
 * son climat, pour pouvoir REJOUER plusieurs parties dans les mêmes
 * conditions.
 *
 * Sans cela, comparer deux conduites — planter dense ou clair, mélanger ou non
 * les essences, creuser une mare ou pas — oblige à repositionner une vingtaine
 * de réglages à la main entre chaque essai, et la moindre erreur invalide la
 * comparaison. C'est aussi ce qu'il faut pour reproduire un cas réel : on
 * décrit la parcelle une fois, on l'enregistre, et on l'éprouve.
 *
 * Les profils vivent dans le navigateur (localStorage) et s'exportent en JSON
 * pour être partagés ou versionnés.
 */

import type { ScenarioId } from "../engine/climat";
import { type EauDeSurface, SANS_EAU } from "../engine/eau_surface";
import { type Bordures, bordersUniformes } from "../engine/paysage";
import type { Relief } from "../engine/relief";

/** Tout ce qui décrit une situation de départ, sans la partie elle-même. */
export interface ProfilDepart {
  version: 1;
  nom: string;
  stationId: string;
  bordures: Bordures;
  relief: Relief;
  eau: EauDeSurface;
  /** profondeur d'équilibre de la nappe, cm */
  nappeCm: number;
  /** part du bassin qui subit le même sort que la parcelle ∈ [0,1] */
  partBassinSemblable: number;
  scenario: ScenarioId;
  anneeDepart: number;
  maturationAns: number;
  /**
   * La graine ne fait PAS partie du profil : c'est justement ce qu'on veut
   * faire varier pour savoir si un résultat tient du hasard ou du terrain.
   * Elle est donc laissée au choix à chaque partie.
   */
}

/**
 * Profils LIVRÉS avec le jeu : des situations réelles, décrites une fois et
 * prêtes à éprouver. Ils ne vivent pas dans le navigateur — on ne peut ni les
 * modifier ni les effacer, mais rien n'empêche d'en repartir et d'enregistrer
 * sa propre variante à côté.
 */
export const PROFILS_LIVRES: readonly ProfilDepart[] = [
  {
    version: 1,
    nom: "Saumos 2022 (Gironde)",
    stationId: "lande-seche",
    bordures: bordersUniformes("lande-ouverte"),
    // Sable landais plat : ce n'est pas le relief qui fait l'inondation ici,
    // c'est la nappe qui remonte quand la forêt cesse de pomper.
    relief: { altitudeM: 60, pentePct: 1, expositionDeg: 180, forme: "plan", bassinAmontHa: 0 },
    eau: SANS_EAU,
    // Nappe landaise perchée : c'est elle qui fait tenir une forêt sur un sable
    // sans réserve utile.
    nappeCm: 400,
    // Tout le bassin subit le même sort : c'est un incendie de MASSIF, pas un
    // feu de parcelle entouré de vert.
    partBassinSemblable: 1,
    scenario: "ssp245",
    anneeDepart: 2026,
    maturationAns: 0,
  },
];

const CLE = "canopee.profils.v1";

export function chargerProfils(): ProfilDepart[] {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return [];
    const lus = JSON.parse(brut);
    return Array.isArray(lus) ? (lus as ProfilDepart[]).filter((p) => p?.version === 1) : [];
  } catch {
    // Stockage indisponible ou contenu corrompu : on repart de zéro plutôt que
    // d'empêcher de jouer.
    return [];
  }
}

function ecrire(profils: readonly ProfilDepart[]): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(profils));
  } catch {
    // Rien à faire de plus : le profil vaudra pour cette session.
  }
}

/** Enregistre un profil, en remplaçant celui du même nom s'il existe. */
export function enregistrerProfil(profil: ProfilDepart): ProfilDepart[] {
  const autres = chargerProfils().filter((p) => p.nom !== profil.nom);
  const tous = [...autres, profil].sort((a, b) => a.nom.localeCompare(b.nom));
  ecrire(tous);
  return tous;
}

export function supprimerProfil(nom: string): ProfilDepart[] {
  const restants = chargerProfils().filter((p) => p.nom !== nom);
  ecrire(restants);
  return restants;
}

/**
 * Relit un profil exporté. On vérifie la forme plutôt que de faire confiance :
 * un JSON collé à la main est le premier endroit où une faute se glisse.
 */
export function lireProfilExporte(texte: string): ProfilDepart | string {
  let lu: unknown;
  try {
    lu = JSON.parse(texte);
  } catch {
    return "Ce n'est pas du JSON valide.";
  }
  const p = lu as Partial<ProfilDepart>;
  if (p?.version !== 1) return "Profil d'une autre version, ou champ « version » manquant.";
  const manquants = (["stationId", "bordures", "relief", "eau", "scenario"] as const).filter(
    (cle) => p[cle] === undefined,
  );
  if (manquants.length > 0) return `Champs manquants : ${manquants.join(", ")}.`;
  return {
    version: 1,
    nom: p.nom ?? "profil importé",
    stationId: p.stationId as string,
    bordures: p.bordures as Bordures,
    relief: p.relief as Relief,
    eau: p.eau as EauDeSurface,
    nappeCm: p.nappeCm ?? 300,
    partBassinSemblable: p.partBassinSemblable ?? 0,
    scenario: p.scenario as ScenarioId,
    anneeDepart: p.anneeDepart ?? 2026,
    maturationAns: p.maturationAns ?? 0,
  };
}
