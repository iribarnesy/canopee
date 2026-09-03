/**
 * Couleur de chaque espèce, partagée entre le labo et le jeu.
 *
 * Quatorze couleurs catégorielles, c'est au-delà de ce qu'un œil distingue —
 * la limite raisonnable tourne autour de six ou huit. On ne triche donc pas
 * avec la palette : les graphiques n'affichent que les espèces qui comptent
 * (les autres sont repliées en gris) et **étiquettent les courbes
 * directement**, de sorte que la couleur n'est jamais le seul porteur de
 * l'identité.
 *
 * Les six premières — celles qui dominent le plus souvent un peuplement —
 * forment un jeu vérifié : bandes de clarté et de saturation homogènes,
 * séparation maintenue en vision deutan/protan/tritan, contraste ≥ 3:1 sur le
 * fond. Les suivantes sont choisies aussi distinctes que possible, mais c'est
 * l'étiquette qui fait foi.
 */

/** Les six teintes validées, dans l'ordre d'attribution. */
export const PALETTE_PRINCIPALE = [
  "#2f7d4f", // vert
  "#8d5bc0", // violet
  "#d0553f", // rouge brique
  "#2f86c5", // bleu
  "#b58900", // ocre
  "#c94f8f", // rose
] as const;

export const SPECIES_COLORS: Record<string, string> = {
  // Les six essences qui structurent le plus souvent un peuplement.
  alnus_glutinosa: PALETTE_PRINCIPALE[0],
  fagus_sylvatica: PALETTE_PRINCIPALE[1],
  quercus_pubescens: PALETTE_PRINCIPALE[2],
  pinus_sylvestris: PALETTE_PRINCIPALE[3],
  betula_pendula: PALETTE_PRINCIPALE[4],
  castanea_sativa: PALETTE_PRINCIPALE[5],
  // Les autres : distinctes autant que possible, identifiées par l'étiquette.
  quercus_suber: "#0f766e",
  arbutus_unedo: "#9f1239",
  corylus_avellana: "#a16207",
  ulex_europaeus: "#65a30d",
  cytisus_scoparius: "#4d7c0f",
  calluna_vulgaris: "#a21caf",
  malus_domestica: "#e11d48",
  prunus_armeniaca: "#ea580c",
  fraxinus_excelsior: "#0e7490",
  // La strate arbustive : des teintes proches les unes des autres, parce que
  // c'est ainsi qu'on la lit sur le terrain — un fourré, pas des individus.
  prunus_spinosa: "#7e22ce",
  crataegus_monogyna: "#be185d",
  rubus_fruticosus: "#4338ca",
  sambucus_nigra: "#1e40af",
};

/** Espèces repliées dans « autres » : un gris qui ne prétend à aucune identité. */
export const COULEUR_AUTRES = "#9a9384";
