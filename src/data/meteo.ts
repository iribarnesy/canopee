/**
 * Séries météo réelles des stations du jeu — construites par
 * scripts/build_meteo.py depuis l'open data Météo-France (licence ouverte).
 * 60 ans hebdomadaires (1964-2023), avec les vraies sécheresses (1976, 2003,
 * 2022) et les vraies années humides : la variabilité interannuelle qui crée
 * les fenêtres d'installation (ch4-B).
 */

import fricheLimon from "../../data/meteo/friche-limon.json";
import landeSeche from "../../data/meteo/lande-seche.json";
import limonRiche from "../../data/meteo/limon-riche.json";
import valleeEngorgee from "../../data/meteo/vallee-engorgee.json";
import type { SerieMeteoHebdo } from "../engine/meteo";

const SERIES: SerieMeteoHebdo[] = [
  landeSeche as SerieMeteoHebdo,
  valleeEngorgee as SerieMeteoHebdo,
  limonRiche as SerieMeteoHebdo,
  fricheLimon as SerieMeteoHebdo,
];

/** Série réelle pour une station du jeu (le limon pauvre partage Abbeville). */
export function serieMeteoPour(stationId: string): SerieMeteoHebdo | undefined {
  const id = stationId === "limon-pauvre-n" ? "limon-riche" : stationId;
  return SERIES.find((s) => s.id === id);
}
