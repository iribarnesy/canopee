import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { criteresDuReferentiel, etapesDuTick } from "./src/modele/extraction";

/**
 * LE MODÈLE, LU À LA SOURCE (#224).
 *
 * La page « Le modèle » ne tient aucune liste : elle reçoit ce que portent
 * déjà `docs/realisme.md` et `src/engine/tick.ts`. L'extraction se fait ICI,
 * à la construction, pour deux raisons :
 *
 * - **rien ne peut dériver** — une ligne ajoutée au référentiel paraît sur la
 *   page sans que personne n'y touche, et une ligne retirée en disparaît ;
 * - **rien n'entre dans le paquet que la page affiche** — importer les deux
 *   fichiers en brut coûterait quatre cents kilo-octets de source pour en
 *   montrer quinze.
 *
 * Les deux planchers ne sont pas de la prudence décorative : si quelqu'un
 * change la forme du tableau du référentiel ou la convention de commentaire du
 * tick, la page se viderait EN SILENCE. La construction tombe à la place.
 */
const PLANCHER_CRITERES = 100;
const PLANCHER_ETAPES = 15;

function modeleDuSimulateur(): Plugin {
  const id = "virtual:modele";
  const resolu = `\0${id}`;
  const fichiers = ["docs/realisme.md", "src/engine/tick.ts"];
  return {
    name: "canopee-modele",
    resolveId: (source) => (source === id ? resolu : undefined),
    load(source) {
      if (source !== resolu) return undefined;
      for (const f of fichiers) this.addWatchFile(resolve(f));
      const domaines = criteresDuReferentiel(readFileSync("docs/realisme.md", "utf8"));
      const etapes = etapesDuTick(readFileSync("src/engine/tick.ts", "utf8"));
      const criteres = domaines.reduce((n, d) => n + d.criteres.length, 0);
      if (criteres < PLANCHER_CRITERES) {
        throw new Error(
          `modèle : ${criteres} critères extraits de docs/realisme.md, moins que le plancher de ${PLANCHER_CRITERES} — la forme du tableau a dû changer.`,
        );
      }
      if (etapes.length < PLANCHER_ETAPES) {
        throw new Error(
          `modèle : ${etapes.length} étapes extraites de tick.ts, moins que le plancher de ${PLANCHER_ETAPES} — la convention « // ── n. » a dû changer.`,
        );
      }
      return `export const domaines = ${JSON.stringify(domaines)};
export const etapes = ${JSON.stringify(etapes)};`;
    },
  };
}

export default defineConfig({
  plugins: [react(), modeleDuSimulateur()],
  base: "./",
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Les tests écologiques simulent des décennies sur des grilles de milliers
    // de cellules : le défaut de 5 s ne suffit pas, surtout sur les runners CI.
    //
    // Passé de 120 à 180 s avec la strate herbacée par espèces, qui coûte 11 %
    // de temps par semaine simulée. Les quatre scénarios les plus lourds
    // tournaient déjà entre 80 et 96 s en CI, soit 20 à 26 % sous la limite :
    // onze pour cent de plus les y amenait à dix. Un test long n'est pas un
    // test lent — ceux-là DOIVENT simuler soixante ans, et leurs commentaires
    // expliquent pourquoi les raccourcir les falsifierait.
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
