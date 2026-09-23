/**
 * Worker du laboratoire : les expériences simulent des dizaines d'années sur
 * plusieurs variantes ; les faire tourner dans le thread d'interface le
 * figerait pendant des secondes.
 */

import { EXPERIENCES, type Reglages, type ResultatExperience } from "./experiences";
import {
  anneesDeLaSonde,
  type BilanCarbone,
  bilanDeLaSonde,
  meteoDeLaSonde,
  type SimResult,
  simulate,
  stationDeLaSonde,
} from "./sonde";

export type VersLabo =
  | { type: "executer"; id: string; reglages: Reglages }
  /**
   * LA SONDE D'UNE STATION (#123). Elle passe par le même worker que les
   * expériences, et pour la même raison : c'est vingt ans de moteur, et le fil
   * d'interface n'a rien à y faire.
   */
  | { type: "sonder"; stationId: string; meteoReelle: boolean };
export type DuLabo =
  | { type: "resultat"; resultat: ResultatExperience; dureeMs: number }
  | { type: "erreur"; id: string; message: string }
  /** où en est la sonde : une année simulée, et combien en tout */
  | { type: "avancementSonde"; annees: number; total: number }
  | { type: "sonde"; resultat: SimResult; bilan: BilanCarbone; dureeMs: number };

const post = (msg: DuLabo) => (postMessage as (m: DuLabo) => void)(msg);

function sonder(stationId: string, meteoReelle: boolean) {
  const debut = performance.now();
  const sc = stationDeLaSonde(stationId);
  const resultat = simulate(sc, meteoDeLaSonde(sc, meteoReelle), (annees) =>
    post({ type: "avancementSonde", annees, total: anneesDeLaSonde(sc) }),
  );
  post({
    type: "sonde",
    resultat,
    bilan: bilanDeLaSonde(resultat.finalState),
    dureeMs: performance.now() - debut,
  });
}

self.addEventListener("message", (event: MessageEvent<VersLabo>) => {
  const msg = event.data;
  if (msg.type === "sonder") {
    try {
      sonder(msg.stationId, msg.meteoReelle);
    } catch (e) {
      post({ type: "erreur", id: "sonde", message: e instanceof Error ? e.message : String(e) });
    }
    return;
  }
  const { id, reglages } = msg;
  const experience = EXPERIENCES.find((e) => e.id === id);
  if (!experience) {
    post({ type: "erreur", id, message: `expérience inconnue : ${id}` });
    return;
  }
  const debut = performance.now();
  try {
    post({
      type: "resultat",
      resultat: experience.executer(reglages ?? {}),
      dureeMs: performance.now() - debut,
    });
  } catch (e) {
    post({ type: "erreur", id, message: e instanceof Error ? e.message : String(e) });
  }
});
