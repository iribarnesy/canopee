/**
 * Le module virtuel que sert le greffon de `vite.config.ts`.
 *
 * Il n'a pas de fichier : son contenu est extrait de `docs/realisme.md` et de
 * `src/engine/tick.ts` à la construction. Cette déclaration donne son type à
 * TypeScript, qui ne sait rien des greffons.
 */
declare module "virtual:modele" {
  export const domaines: import("./extraction").Domaine[];
  export const etapes: import("./extraction").Etape[];
}
