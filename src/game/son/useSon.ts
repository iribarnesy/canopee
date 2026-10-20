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
import type { IncendieAPoser } from "../../render/temps/lecteur";
import type { Snapshot, StationInfo } from "../protocol";
import { MixeurDuSon } from "./mixeur";
import { type EntreeDuSon, niveauxDuSon, prolongerLeChantier } from "./niveaux";
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
  /** part de la parcelle sous la crue ∈ [0,1] (`useCrue`) */
  partNoyee = 0,
): ReglagesDuSon & { regler: (r: Partial<ReglagesDuSon>) => void } {
  const [reglages, setReglages] = useState(lire);
  const mixeur = useRef<MixeurDuSon | undefined>(undefined);
  const chantierJusqua = useRef(0);
  /** Le minuteur qui arrête la scie à son échéance (#403). */
  const arretDuChantier = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dernier = useRef({ snapshot, station, feu, residents, reglages, partNoyee });
  dernier.current = { snapshot, station, feu, residents, reglages, partNoyee };

  /**
   * Refaire les niveaux et les donner au mixeur, à `maintenantMs`. Le pas
   * régulier s'en sert, et la tronçonneuse aussi, qui n'attend pas le pas.
   */
  const ecouter = useCallback((maintenantMs: number) => {
    const m = mixeur.current;
    const { snapshot: s, station: st, feu: f, residents: r, partNoyee: p } = dernier.current;
    if (!m || !s || !st) return;
    m.suivre(
      niveauxDuSon(
        entreeDuSon(
          s,
          st,
          f(maintenantMs),
          r(maintenantMs),
          maintenantMs,
          chantierJusqua.current,
          p,
        ),
      ),
    );
  }, []);

  // Un chantier s'entend quand son instantané arrive — c'est aussi le moment
  // où l'ellipse le joue. Un geste pendant que la scie tourne la prolonge, il
  // ne la relance pas (#403).
  useEffect(() => {
    if (!snapshot) return;
    const maintenant = performance.now();
    const avant = chantierJusqua.current;
    const fin = prolongerLeChantier(avant, maintenant, snapshot.gestes);
    if (fin === avant) return;
    chantierJusqua.current = fin;
    // **Avec le geste, et pas jusqu'à un quart de seconde après** : un coup
    // d'une seconde qui part au pas suivant du mixeur s'entend en retard sur
    // le clic. Une scie qui tourne déjà n'a rien à changer au mélange.
    if (maintenant >= avant) ecouter(maintenant);
    // Et elle se tait à son heure, pas au pas d'après : sur un coup aussi
    // court, un quart de seconde de trop se compte. Jamais avant `fin`, même
    // si le minuteur part une fraction de milliseconde trop tôt.
    clearTimeout(arretDuChantier.current);
    arretDuChantier.current = setTimeout(
      () => ecouter(Math.max(performance.now(), fin)),
      fin - maintenant,
    );
  }, [snapshot, ecouter]);
  useEffect(() => () => clearTimeout(arretDuChantier.current), []);

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
    const id = window.setInterval(() => ecouter(performance.now()), PAS_MS);
    return () => window.clearInterval(id);
  }, [ecouter]);

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
  /** part de la parcelle sous la crue (`useCrue`) — pas le débit, qui passe partout */
  partNoyee = 0,
): EntreeDuSon {
  const nicheurs: Record<string, number> = {};
  for (const f of s.faune ?? []) nicheurs[f.especeId] = (nicheurs[f.especeId] ?? 0) + 1;
  const eau = st.eau.type === "ruisseau" ? "ruisseau" : st.eau.type === "mare" ? "mare" : "aucune";
  return {
    ventMoyMs: s.weather.ventMoyMs,
    ventExposition: st.ventExposition,
    lumiereAuSol: s.soilLumiere,
    // La neige ne crépite pas : on n'entend que la pluie liquide (#303).
    pluieMm: Math.max(0, s.weather.rainMm - s.neigeMm),
    ...(s.weather.joursDePluie !== undefined ? { joursDePluie: s.weather.joursDePluie } : {}),
    eau,
    partNoyee,
    particulesDeFeu: feu.particules.length,
    chantier: maintenantMs < chantierJusquaMs ? 1 : 0,
    semaineAnnee: s.week % 52,
    nicheurs,
    geais: residents.filter((p) => p.dessin === "geai").length,
  };
}
