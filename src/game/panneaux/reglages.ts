/**
 * Les RÉGLAGES DE GESTE : ce que le joueur a choisi de faire, et avec quoi.
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
  critereEclaircie: "parLeBas" | "parLeHaut";
  setCritereEclaircie: (v: "parLeBas" | "parLeHaut") => void;
  mainOuvertePanneau: boolean;
  setMainOuvertePanneau: (v: boolean) => void;
}

export function useReglagesDeGeste(): ReglagesDeGeste {
  const [mode, setMode] = useState<Mode>("selection");
  const [especeId, setEspeceId] = useState("betula_pendula");
  const [avecManchon, setAvecManchon] = useState(false);
  const [rayonChaulage, setRayonChaulage] = useState(8);
  const [semainesSaison, setSemainesSaison] = useState(4);
  const [densiteCible, setDensiteCible] = useState(400);
  const [critereEclaircie, setCritereEclaircie] = useState<"parLeBas" | "parLeHaut">("parLeBas");
  const [mainOuvertePanneau, setMainOuvertePanneau] = useState(false);
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
    mainOuvertePanneau,
    setMainOuvertePanneau,
  };
}
