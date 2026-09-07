/**
 * La chute d'une chandelle : une déformation à la pose.
 *
 * **Ce que ces essais gardent avant tout, c'est la contrainte du §5.11** : une
 * animation ne doit pas invalider un cache de cuisson. Le module ne rend donc
 * que des nombres, et c'est exactement ce qui le rend testable — un angle et
 * une échelle se vérifient, un sprite incliné non.
 */

import { describe, expect, it } from "vitest";
import { type Vue, vueInitiale } from "../../src/render/camera";
import { chuteEnCours, DEBOUT, HAUTEUR_LA_PLUS_COURTE } from "../../src/render/temps/chute";

const COTE = 100;
const vue = (orientation: 0 | 1 | 2 | 3 = 0): Vue => {
  const v = vueInitiale(COTE, 900, 640, 0);
  return { ...v, cam: { ...v.cam, orientation } };
};

/** Une chandelle au centre, de quinze mètres, qui tombe vers l'est. */
const chandelle = (directionRad = 0) => ({
  x: 50,
  y: 50,
  heightM: 15,
  directionRad,
});

describe("la chute, aux deux bouts du mouvement", () => {
  it("part debout : ni inclinée, ni raccourcie", () => {
    const d = chuteEnCours(chandelle(), 0, vue());
    expect(d.rotationRad).toBeCloseTo(DEBOUT.rotationRad, 6);
    expect(d.hauteur).toBeCloseTo(DEBOUT.hauteur, 6);
  });

  /**
   * **Un tronc couché peut être PLUS LONG à l'écran qu'il n'était haut**, et
   * ça a pris un essai raté pour le voir. Dans cette dimétrie, un mètre
   * horizontal le long d'un axe se projette sur 5,03 px et un mètre vertical
   * sur 4,50 : un arbre de quinze mètres mesure 67,5 px debout et 75,4 px
   * couché vers l'est. Le facteur de hauteur n'est donc pas borné par 1, et
   * mon assertion l'était.
   */
  it("finit couchée : inclinée, et allongée si elle tombe le long d'un axe", () => {
    const d = chuteEnCours(chandelle(), 1, vue());
    expect(Math.abs(d.rotationRad)).toBeGreaterThan(0.4);
    expect(d.hauteur).toBeCloseTo(Math.hypot(4.5, 2.25) / 4.5, 2);
  });

  it("accélère au lieu de tourner à vitesse constante", () => {
    // Un quart de cercle parcouru linéairement se lit comme une porte qui
    // s'ouvre. À mi-parcours, l'arbre doit être encore près de la verticale.
    const mi = chuteEnCours(chandelle(), 0.5, vue());
    const fin = chuteEnCours(chandelle(), 1, vue());
    expect(Math.abs(mi.rotationRad)).toBeLessThan(Math.abs(fin.rotationRad) / 2);
  });

  it("avance de façon monotone : un arbre ne se redresse pas", () => {
    let precedent = 0;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const a = Math.abs(chuteEnCours(chandelle(), t, vue()).rotationRad);
      expect(a).toBeGreaterThanOrEqual(precedent - 1e-9);
      precedent = a;
    }
  });

  it("borne l'avancement : hors de [0,1] rien de fou n'arrive", () => {
    expect(chuteEnCours(chandelle(), -3, vue()).hauteur).toBeCloseTo(1, 6);
    const trop = chuteEnCours(chandelle(), 5, vue());
    const juste = chuteEnCours(chandelle(), 1, vue());
    expect(trop.rotationRad).toBeCloseTo(juste.rotationRad, 6);
  });
});

describe("la direction : le même mouvement vu de deux côtés", () => {
  /**
   * **Le cœur du module.** La direction de chute est un azimut de PARCELLE et
   * la vignette un panneau vu de face : un arbre qui tombe vers la caméra ne
   * pivote presque pas, il RACCOURCIT. Sans cette distinction, un tel arbre
   * resterait debout jusqu'à disparaître d'un coup.
   */
  it("fait pivoter une chute de profil et raccourcir une chute vers l'objectif", () => {
    // **Mesuré, pas supposé.** Dans cette projection, un vecteur unité de
    // parcelle vers l'azimut +45° se projette en (0 ; +3,18) px — droit vers
    // l'observateur, aucun décalage horizontal — et vers −45° en (6,36 ; 0) —
    // purement de profil. C'est ce relevé qui fixe les deux cas, et ma
    // première version de cet essai les avait justement inversés.
    const versLObjectif = chuteEnCours(chandelle(Math.PI / 4), 1, vue());
    const deProfil = chuteEnCours(chandelle(-Math.PI / 4), 1, vue());
    // De profil : le quart de tour entier. Vers l'objectif : rien du tout.
    expect(Math.abs(deProfil.rotationRad)).toBeCloseTo(Math.PI / 2, 2);
    expect(Math.abs(versLObjectif.rotationRad)).toBeCloseTo(0, 6);
    // Et c'est la chute vers l'objectif qui raccourcit le plus.
    expect(versLObjectif.hauteur).toBeLessThan(deProfil.hauteur);
  });

  it("tombe des deux côtés selon l'azimut, pas toujours du même", () => {
    const est = chuteEnCours(chandelle(0), 1, vue());
    const ouest = chuteEnCours(chandelle(Math.PI), 1, vue());
    expect(Math.sign(est.rotationRad)).not.toBe(Math.sign(ouest.rotationRad));
  });

  /**
   * **Et ça doit suivre la caméra.** Le joueur tourne la parcelle d'un quart de
   * tour aux flèches ; une chute vers l'est se voit alors de profil au lieu de
   * face. Une constante d'orientation ne marcherait que pour une vue — d'où la
   * projection de deux points et leur différence.
   */
  it("change d'aspect quand la caméra tourne", () => {
    // La même chute, vue d'un quart de tour plus loin : ce qui venait vers
    // l'objectif passe de profil.
    const nord = chuteEnCours(chandelle(Math.PI / 4), 1, vue(0));
    const est = chuteEnCours(chandelle(Math.PI / 4), 1, vue(1));
    expect(Math.abs(Math.abs(est.rotationRad) - Math.abs(nord.rotationRad))).toBeGreaterThan(0.5);
  });

  /**
   * Le plancher d'écrasement : un arbre qui pointe exactement vers l'objectif a
   * une projection nulle, et ne doit pas pour autant disparaître.
   */
  it("ne laisse jamais un arbre s'évanouir au milieu de sa chute", () => {
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const d = chuteEnCours(chandelle(Math.PI / 4), t, vue());
      expect(d.hauteur).toBeGreaterThanOrEqual(HAUTEUR_LA_PLUS_COURTE - 1e-9);
    }
  });
});
