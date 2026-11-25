/**
 * **Les commandes de la caméra se lisent sans ouvrir le menu** (#510).
 *
 * « Glisser pour déplacer · molette pour zoomer » n'était écrit que dans le
 * volet « La partie ». Une ligne d'aide le pose maintenant sur la vue à
 * l'arrivée, et elle s'efface au premier geste (`VueParcelle`).
 *
 * Ce que ces essais défendent, et que la capture ne dit pas :
 *
 * 1. **L'aide ne prend aucun clic.** Elle est posée sur la parcelle, et
 *    cliquer la parcelle est le geste qu'on fait : une aide qui avalerait le
 *    clic de plantation sous elle serait pire que pas d'aide.
 * 2. **L'aide et le menu disent la même chose**, et le menu n'a rien perdu.
 * 3. **Estompée, elle se cache aussi aux lecteurs d'écran** : une ligne
 *    devenue invisible ne doit plus être lue.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AideCamera, COMMANDES_DE_LA_CAMERA } from "../../src/game/panneaux/AideCamera";
import { PanneauMenu } from "../../src/game/panneaux/PanneauMenu";
import type { GameApi } from "../../src/game/useGame";

const GAME = {
  autoHarvest: false,
  setAutoHarvest: () => {},
  politiqueHoraire: "demander",
  setPolitiqueHoraire: () => {},
  arretSurLesMorts: true,
  setArretSurLesMorts: () => {},
} as unknown as GameApi;

describe("l'aide de la caméra (#510)", () => {
  it("dit comment déplacer, zoomer et tourner la vue", () => {
    const html = renderToStaticMarkup(createElement(AideCamera, { estompee: false }));
    expect(html).toContain("Glisser pour déplacer");
    expect(html).toContain("molette pour zoomer");
    expect(html).toContain("pour tourner");
    expect(html).toContain('aria-hidden="false"');
  });

  it("ne prend aucun clic à la parcelle qu'elle recouvre", () => {
    const html = renderToStaticMarkup(createElement(AideCamera, { estompee: false }));
    expect(html).toContain("pointer-events:none");
  });

  it("estompée, elle devient transparente et muette", () => {
    const html = renderToStaticMarkup(createElement(AideCamera, { estompee: true }));
    expect(html).toContain("opacity:0");
    expect(html).toContain('aria-hidden="true"');
  });

  it("le volet « La partie » garde les mêmes commandes, et le reste", () => {
    const html = renderToStaticMarkup(
      createElement(PanneauMenu, { game: GAME, surQuitter: () => {} }),
    );
    expect(html).toContain(COMMANDES_DE_LA_CAMERA);
    expect(html).toContain("maj+clic = sélection multiple");
    expect(html).toContain("Échap referme");
  });
});
