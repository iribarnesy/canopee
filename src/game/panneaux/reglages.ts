/**
 * Les **réglages de geste** : ce que le joueur a choisi de faire, et avec quoi.
 *
 * Ils vivent ici plutôt que dans le panneau qui les affiche parce que deux
 * endroits les lisent — le panneau, et le clic sur la parcelle, qui doit
 * savoir quel geste appliquer et sur quel rayon.
 */

import { useState } from "react";

export type Mode =
  | "selection"
  | "planter"
  | "chauler"
  | "faucher"
  | "boisMort"
  | "eclaircir"
  | "brf"
  | "cloturer";

/**
 * Comment l'éclaircie choisit ses tiges — les trois critères du moteur.
 *
 * `espece` existait dans `GameAction` depuis longtemps et n'était exposé nulle
 * part : une capacité entière du moteur était inatteignable (#156).
 */
export type CritereEclaircie = "parLeBas" | "parLeHaut" | "espece";

export interface ReglagesDeGeste {
  mode: Mode;
  setMode: (m: Mode) => void;
  especeId: string;
  setEspeceId: (id: string) => void;
  avecManchon: boolean;
  setAvecManchon: (v: boolean) => void;
  rayonChaulage: number;
  setRayonChaulage: (v: number) => void;
  semainesSaison: number;
  setSemainesSaison: (v: number) => void;
  densiteCible: number;
  setDensiteCible: (v: number) => void;
  critereEclaircie: CritereEclaircie;
  setCritereEclaircie: (v: CritereEclaircie) => void;
  /**
   * L'essence que l'éclaircie par espèce vise (#156).
   *
   * Distincte de `especeId`, qui est ce qu'on **plante** : viser le roncier pour
   * le nettoyer et choisir un merisier pour le remplacer sont deux décisions,
   * et les confondre ferait changer l'une en touchant l'autre.
   */
  especeEclaircie: string;
  setEspeceEclaircie: (id: string) => void;
  mainOuvertePanneau: boolean;
  setMainOuvertePanneau: (v: boolean) => void;
  /** Le choix des essences est-il réduit à ce qui tient sur ce terrain ? */
  seulementTenables: boolean;
  setSeulementTenables: (v: boolean) => void;
}

export function useReglagesDeGeste(): ReglagesDeGeste {
  const [mode, setMode] = useState<Mode>("selection");
  const [especeId, setEspeceId] = useState("betula_pendula");
  const [avecManchon, setAvecManchon] = useState(false);
  const [rayonChaulage, setRayonChaulage] = useState(8);
  const [semainesSaison, setSemainesSaison] = useState(4);
  const [densiteCible, setDensiteCible] = useState(400);
  const [critereEclaircie, setCritereEclaircie] = useState<CritereEclaircie>("parLeBas");
  const [especeEclaircie, setEspeceEclaircie] = useState("");
  const [mainOuvertePanneau, setMainOuvertePanneau] = useState(false);
  // Vrai au départ : sur une lande sèche, la moitié de la liste n'a aucun sens,
  // et c'est le filtre qui fait le gain de cette interface.
  const [seulementTenables, setSeulementTenables] = useState(true);
  return {
    mode,
    setMode,
    especeId,
    setEspeceId,
    avecManchon,
    setAvecManchon,
    rayonChaulage,
    setRayonChaulage,
    semainesSaison,
    setSemainesSaison,
    densiteCible,
    setDensiteCible,
    critereEclaircie,
    setCritereEclaircie,
    especeEclaircie,
    setEspeceEclaircie,
    mainOuvertePanneau,
    setMainOuvertePanneau,
    seulementTenables,
    setSeulementTenables,
  };
}
