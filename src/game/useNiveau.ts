/**
 * LE NIVEAU EN COURS, côté écran (#188).
 *
 * Trois choses vivent ici, et aucune ne pouvait vivre ailleurs :
 *
 * 1. **La fiche**, parce qu'un palier est une fermeture : ça ne traverse pas la
 *    frontière d'un worker. Le worker range un IDENTIFIANT, l'écran retrouve la
 *    fiche.
 * 2. **La mémoire des paliers franchis**, parce qu'un palier de STOCK ne se
 *    retrouve pas : douze arbres protégés puis broutés ne laissent aucune trace
 *    dans l'état. Elle repart vers le worker, qui l'écrit dans la sauvegarde.
 * 3. **L'arrêt du temps à la fin**, parce que c'est l'écran qui commande la
 *    vitesse — le worker, lui, ne sait pas qu'il joue un niveau.
 */

import { useEffect, useMemo, useRef } from "react";
import { type Avancement, avancementDuNiveau, paliersFranchis } from "./niveaux";
import { niveauParId } from "./niveauxLivres";
import type { GameApi } from "./useGame";

export interface NiveauEnCours {
  /** la fiche jouée, s'il y en a une */
  niveau?: ReturnType<typeof niveauParId>;
  avancement?: Avancement;
  /** le niveau est fini : l'écran de fin s'affiche */
  fini: boolean;
}

export function useNiveau(game: GameApi): NiveauEnCours {
  const { snapshot, cumuls, niveauRange, rangerLeNiveau } = game;
  const niveau = useMemo(
    () => (niveauRange.id ? niveauParId(niveauRange.id) : undefined),
    [niveauRange.id],
  );

  /**
   * La mémoire des paliers franchis — CELLE DU WORKER, et pas une copie.
   *
   * Elle a d'abord été tenue ici, en état local, synchronisée par une garde sur
   * l'identifiant du niveau. Le défaut est arrivé par là : rejouer LE MÊME
   * niveau ne change pas l'identifiant, la garde sortait, et la mémoire de la
   * partie précédente survivait. On voyait une coche sur un palier qui
   * affichait « 0 / 12 ».
   *
   * Deux copies d'un même état divergent dès qu'un chemin oublie d'en remettre
   * une à zéro. Il n'y en a donc plus qu'une : le worker la tient, la remet à
   * zéro pour une partie neuve, la restaure d'une sauvegarde, et l'écran la lit.
   * Le prix est un aller-retour de message avant qu'une coche apparaisse ; il
   * est invisible et il vaut mieux que le défaut qu'il supprime.
   */
  const acquis = useMemo(() => new Set(niveauRange.acquis), [niveauRange.acquis]);

  const avancement = useMemo(() => {
    if (!niveau || !snapshot) return undefined;
    return avancementDuNiveau(niveau, { snapshot, cumuls, semaines: snapshot.week }, acquis);
  }, [niveau, snapshot, cumuls, acquis]);

  // **Un palier franchi se retient**, et le worker l'apprend pour l'écrire dans
  // la sauvegarde. La comparaison porte sur le CONTENU et non sur la taille :
  // un ensemble peut changer sans grandir quand une fiche évolue.
  const ranger = useRef(rangerLeNiveau);
  ranger.current = rangerLeNiveau;
  useEffect(() => {
    if (!avancement || !niveauRange.id) return;
    const franchis = paliersFranchis(avancement);
    if (franchis.length === acquis.size && franchis.every((id) => acquis.has(id))) return;
    ranger.current(niveauRange.id, franchis);
  }, [avancement, acquis, niveauRange.id]);

  // **Le temps s'arrête quand le niveau est fini.** Sans ça, la parcelle
  // continuerait de vivre derrière l'écran de fin, et le bilan qu'on lit ne
  // serait plus celui de la partie qu'on vient de jouer.
  const fini = avancement !== undefined && avancement.issue !== "en-cours";
  const arreter = useRef(game.setSpeed);
  arreter.current = game.setSpeed;
  useEffect(() => {
    if (fini) arreter.current(0);
  }, [fini]);

  return { niveau, avancement, fini };
}
