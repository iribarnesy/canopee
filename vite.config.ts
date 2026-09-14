import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
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
