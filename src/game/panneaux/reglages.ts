/**
 * Les **réglages de geste** : ce que le joueur a choisi de faire, et avec quoi.
 *
 * Ils vivent ici plutôt que dans le panneau qui les affiche parce que deux
 * endroits les lisent — le panneau, et le clic sur la parcelle, qui doit
 * savoir quel geste appliquer et sur quel rayon.
 */

import { useState } from "react";
import { bornerLaDose, ENGRAIS, type FormeEngrais } from "../fertilisation";

export type Mode =
  | "selection"
  | "planter"
  | "chauler"
  | "faucher"
  | "boisMort"
  | "eclaircir"
  | "brf"
  | "cloturer"
  | "fertiliser";

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
  /**
   * Le geste se trace-t-il en **bande** plutôt qu'en disque (#205) ?
   *
   * Une allée agroforestière *est* une bande, et le moteur sait la traiter
   * depuis #186 : dix actions acceptent `{ longueurM, largeurM, orientationRad,
   * zone: "bande" }` à la place d'un rayon. Tant que l'interface ne savait
   * demander qu'un disque, on labourait jusqu'au pied des rangs — ce qu'aucun
   * agroforestier ne fait (#184).
   *
   * Un seul réglage pour tous les gestes de zone, comme le rayon : c'est une
   * façon de travailler, pas un paramètre par outil.
   */
  traceBande: boolean;
  setTraceBande: (v: boolean) => void;
  /** Largeur de la bande tracée, m. La longueur vient du tracé. */
  largeurBande: number;
  setLargeurBande: (v: number) => void;
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
  /** La forme d'engrais que le geste « Fertiliser » épand (#435). */
  formeEngrais: FormeEngrais;
  setFormeEngrais: (f: FormeEngrais) => void;
  /**
   * La dose de **chaque** forme, dans son unité (#435).
   *
   * Une par forme et non une seule : l'ammonitrate et le fumier se dosent en
   * kg N/ha, la potasse en kg K₂O/ha. Garder un seul nombre aurait fait passer
   * 170 kg N/ha de fumier en 170 kg K₂O/ha de potasse au changement de forme —
   * plus de trois fois la dose proposée.
   */
  dosesEngrais: Readonly<Record<FormeEngrais, number>>;
  /** Règle la dose d'une forme, ramenée dans ce que le moteur accepte. */
  setDoseEngrais: (forme: FormeEngrais, dose: number) => void;
  /** Le choix des essences est-il réduit à ce qui tient sur ce terrain ? */
  seulementTenables: boolean;
  setSeulementTenables: (v: boolean) => void;
}

export function useReglagesDeGeste(): ReglagesDeGeste {
  const [mode, setMode] = useState<Mode>("selection");
  const [especeId, setEspeceId] = useState("betula_pendula");
  const [avecManchon, setAvecManchon] = useState(false);
  const [rayonChaulage, setRayonChaulage] = useState(8);
  const [traceBande, setTraceBande] = useState(false);
  // Quatre mètres : la largeur d'une allée entretenue au gyrobroyeur, et la
  // borne basse que le CNPF donne pour une bande le long d'un rang (« des
  // bandes larges de plus d'un mètre », `zone.ts`).
  const [largeurBande, setLargeurBande] = useState(4);
  const [semainesSaison, setSemainesSaison] = useState(4);
  const [densiteCible, setDensiteCible] = useState(400);
  const [critereEclaircie, setCritereEclaircie] = useState<CritereEclaircie>("parLeBas");
  const [especeEclaircie, setEspeceEclaircie] = useState("");
  const [mainOuvertePanneau, setMainOuvertePanneau] = useState(false);
  // L'ammonitrate d'abord, dans l'ordre des boutons. Armer le geste n'épand
  // rien : c'est le clic sur la parcelle qui décide, comme pour le chaulage.
  // Chaque forme part de sa dose sourcée (`fertilisation.ts`).
  const [formeEngrais, setFormeEngrais] = useState<FormeEngrais>("mineral");
  const [dosesEngrais, setDosesEngrais] = useState<Readonly<Record<FormeEngrais, number>>>(() => ({
    mineral: ENGRAIS.mineral.doseParDefaut,
    fumier: ENGRAIS.fumier.doseParDefaut,
    potasse: ENGRAIS.potasse.doseParDefaut,
  }));
  const setDoseEngrais = (forme: FormeEngrais, dose: number) =>
    setDosesEngrais((avant) => ({ ...avant, [forme]: bornerLaDose(forme, dose) }));
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
    traceBande,
    setTraceBande,
    largeurBande,
    setLargeurBande,
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
    formeEngrais,
    setFormeEngrais,
    dosesEngrais,
    setDoseEngrais,
    seulementTenables,
    setSeulementTenables,
  };
}
