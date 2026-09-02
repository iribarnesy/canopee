/**
 * Worker du laboratoire : les expériences simulent des dizaines d'années sur
 * plusieurs variantes ; les faire tourner dans le thread d'interface le
 * figerait pendant des secondes.
 */

import { EXPERIENCES, type ResultatExperience } from "./experiences";

export type VersLabo = { type: "executer"; id: string };
export type DuLabo =
  | { type: "resultat"; resultat: ResultatExperience; dureeMs: number }
  | { type: "erreur"; id: string; message: string };

const post = (msg: DuLabo) => (postMessage as (m: DuLabo) => void)(msg);

self.addEventListener("message", (event: MessageEvent<VersLabo>) => {
  const { id } = event.data;
  const experience = EXPERIENCES.find((e) => e.id === id);
  if (!experience) {
    post({ type: "erreur", id, message: `expérience inconnue : ${id}` });
    return;
  }
  const debut = performance.now();
  try {
    post({ type: "resultat", resultat: experience.executer(), dureeMs: performance.now() - debut });
  } catch (e) {
    post({ type: "erreur", id, message: e instanceof Error ? e.message : String(e) });
  }
});
