/**
 * **Le son de la parcelle**, branché sur le jeu (#129, lot L9).
 *
 * Quatre fois par seconde, les niveaux sont refaits depuis l'instantané et
 * l'ellipse en cours (`niveaux.ts`), et le mixeur les suit. Le son est allumé
 * par défaut et démarre au premier geste du joueur, parce que le navigateur
 * n'en permet pas d'autre. Le volume et la coupure se gardent d'une partie à
 * l'autre, dans le navigateur.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PoseDHabitant } from "../../render/faune/residents";
import { estInondee } from "../../render/palette";
import type { IncendieAPoser } from "../../render/temps/lecteur";
import type { Snapshot, StationInfo } from "../protocol";
import { MixeurDuSon } from "./mixeur";
import { dureeDuChantier, type EntreeDuSon, niveauxDuSon } from "./niveaux";
import { URLS_DES_SONS } from "./sons";

const CLE = "canopee.son";
const PAS_MS = 250;

export interface ReglagesDuSon {
  volume: number;
  coupe: boolean;
}

function lire(): ReglagesDuSon {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? "null");
    if (brut && typeof brut.volume === "number" && typeof brut.coupe === "boolean") return brut;
  } catch {
    // Un stockage refusé ou illisible : les réglages par défaut.
  }
  return { volume: 0.7, coupe: false };
}

export function useSon(
  snapshot: Snapshot | undefined,
  station: StationInfo | undefined,
  feu: (maintenantMs: number) => IncendieAPoser,
  residents: (maintenantMs: number) => readonly PoseDHabitant[],
): ReglagesDuSon & { regler: (r: Partial<ReglagesDuSon>) => void } {
  const [reglages, setReglages] = useState(lire);
  const mixeur = useRef<MixeurDuSon | undefined>(undefined);
  const chantierJusqua = useRef(0);
  const dernier = useRef({ snapshot, station, feu, residents, reglages });
  dernier.current = { snapshot, station, feu, residents, reglages };

  // Un chantier s'entend quand son instantané arrive — c'est aussi le moment
  // où l'ellipse le joue.
  useEffect(() => {
    if (!snapshot) return;
    const d = dureeDuChantier(snapshot.gestes);
    if (d > 0) chantierJusqua.current = performance.now() + d;
  }, [snapshot]);

  // Le premier geste du joueur ouvre le son.
  useEffect(() => {
    const ouvrir = () => {
      if (mixeur.current) return;
      const Contexte = window.AudioContext;
      if (!Contexte) return;
      const ctx = new Contexte();
      const m = new MixeurDuSon(ctx, URLS_DES_SONS);
      mixeur.current = m;
      const { volume, coupe } = dernier.current.reglages;
      m.regler(volume, coupe);
      void m.preparer();
      window.removeEventListener("pointerdown", ouvrir);
      window.removeEventListener("keydown", ouvrir);
    };
    window.addEventListener("pointerdown", ouvrir);
    window.addEventListener("keydown", ouvrir);
    return () => {
      window.removeEventListener("pointerdown", ouvrir);
      window.removeEventListener("keydown", ouvrir);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const m = mixeur.current;
      const { snapshot: s, station: st, feu: f, residents: r } = dernier.current;
      if (!m || !s || !st) return;
      const maintenant = performance.now();
      m.suivre(
        niveauxDuSon(
          entreeDuSon(s, st, f(maintenant), r(maintenant), maintenant, chantierJusqua.current),
        ),
      );
    }, PAS_MS);
    return () => window.clearInterval(id);
  }, []);

  const regler = useCallback((r: Partial<ReglagesDuSon>) => {
    setReglages((avant) => {
      const apres = { ...avant, ...r };
      try {
        localStorage.setItem(CLE, JSON.stringify(apres));
      } catch {
        // Pas de stockage : le réglage vaut pour la séance.
      }
      mixeur.current?.regler(apres.volume, apres.coupe);
      return apres;
    });
  }, []);

  return { ...reglages, regler };
}

/** Ce que les niveaux ont besoin de savoir, lu dans l'instantané et l'ellipse. */
export function entreeDuSon(
  s: Snapshot,
  st: StationInfo,
  feu: IncendieAPoser,
  residents: readonly PoseDHabitant[],
  maintenantMs: number,
  chantierJusquaMs: number,
): EntreeDuSon {
  let noyees = 0;
  for (let i = 0; i < s.soilDebordementMm.length; i++) {
    if (estInondee(s.soilDebordementMm[i] ?? 0)) noyees++;
  }
  const nicheurs: Record<string, number> = {};
  for (const f of s.faune ?? []) nicheurs[f.especeId] = (nicheurs[f.especeId] ?? 0) + 1;
  const eau = st.eau.type === "ruisseau" ? "ruisseau" : st.eau.type === "mare" ? "mare" : "aucune";
  return {
    ventMoyMs: s.weather.ventMoyMs,
    ventExposition: st.ventExposition,
    lumiereAuSol: s.soilLumiere,
    // La neige ne crépite pas : on n'entend que la pluie liquide (#303).
    pluieMm: Math.max(0, s.weather.rainMm - s.neigeMm),
    eau,
    partNoyee: noyees / Math.max(1, s.soilDebordementMm.length),
    particulesDeFeu: feu.particules.length,
    chantier: maintenantMs < chantierJusquaMs ? 1 : 0,
    semaineAnnee: s.week % 52,
    nicheurs,
    geais: residents.filter((p) => p.dessin === "geai").length,
  };
}
