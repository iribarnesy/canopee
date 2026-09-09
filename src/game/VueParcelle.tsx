/**
 * La vue de la parcelle : le composant React qui monte la scène PixiJS et lui
 * donne la caméra (docs/interface-visuelle.md §7).
 *
 * **C'est la première fois que le rendu du chantier entre dans le jeu.** Tout
 * ce qui a été construit aux lots L1 et L2 — le sol, l'eau, les ombres, le
 * hors-parcelle, les arbres — vivait jusqu'ici dans une page d'aperçu qui
 * produit des captures. Utile pour juger, inutile pour jouer.
 *
 * **Le composant ne fait que trois choses**, et c'est délibéré :
 *
 * 1. il monte la scène et la démonte proprement — un contexte WebGL qui fuit,
 *    ce sont quelques rechargements avant que le navigateur refuse d'en donner
 *    un de plus ;
 * 2. il tient la CAMÉRA, qui est un état de React parce qu'elle change sur
 *    interaction et qu'elle doit se rendre à nouveau ;
 * 3. il traduit les gestes en appels de `camera.ts`, sans faire de géométrie
 *    lui-même. Le glissement, le zoom au curseur et le quart de tour sont
 *    tous des fonctions PURES, testées ; ce fichier ne fait que les appeler.
 *
 * **Ce qu'il ne fait pas** : dessiner. Aucun canvas, aucun tracé, aucune
 * couleur. La frontière est la même que partout ailleurs dans le dépôt — la
 * géométrie est pure et testée, le DOM est mince et ne contient pas de règles.
 */

import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { deplacer, tournerVue, type Vue, vueInitiale, zoomer } from "../render/camera";
import type { ArbreAPoser } from "../render/couches/arbres";
import type { DecorBordures } from "../render/couches/decor";
import type { DonneesSol } from "../render/couches/terrain";
import { type Compte, SceneParcelle } from "../render/pixi/scene";
import type { Deformation } from "../render/temps/chute";
import type { ArbreVivant, EtatMourant } from "../render/temps/mort";
import type { CelluleVoilee } from "../render/temps/voile";

export interface VueParcelleProps {
  sol: DonneesSol;
  /** semaine DANS l'année (0–51) */
  semaineAnnee: number;
  arbres: readonly ArbreAPoser[];
  bordures?: DecorBordures;
  hauteurMaxDe: (especeId: string) => number;
  ombreDe: (arbre: ArbreAPoser) => number;
  /** appelé après chaque image, pour afficher le coût quand on le veut */
  surCompte?: (compte: Compte) => void;
  /**
   * Comment déformer les arbres en cours d'animation, s'il y a lieu.
   *
   * Interrogé à CHAQUE image, avec l'horloge et la VUE courante : c'est ainsi
   * qu'une chandelle tombe sans qu'aucune vignette soit recuite (§5.11). La vue
   * est passée parce qu'une déformation en dépend — un arbre qui tombe vers
   * l'objectif ne pivote pas comme un arbre qui tombe de profil, et le joueur
   * fait tourner la caméra. Absent = tous les arbres debout, l'état normal d'un
   * jeu au tour entre deux ellipses.
   */
  deformer?: (idArbre: number, maintenantMs: number, vue: Vue) => Deformation;
  /**
   * Quelles cellules voiler en cours d'animation, s'il y a lieu.
   *
   * Le pendant de `deformer` pour les gestes de zone, et interrogé une fois
   * par image et non une fois par cellule : un front n'éclaire qu'un anneau,
   * le lecteur rend donc la liste entière d'un coup. Pas de VUE ici — un voile
   * est posé au sol, il ne dépend pas de l'angle de caméra, alors qu'un arbre
   * qui tombe vers l'objectif ne pivote pas comme un arbre de profil.
   */
  voiler?: (maintenantMs: number) => readonly CelluleVoilee[];
  /**
   * Comment un arbre en train de mourir se dessine, s'il y a lieu.
   *
   * **Le troisième canal, et il ne ressemble pas aux deux autres** : il ne
   * déforme pas un sprite, il change l'ÉTAT de l'arbre avant qu'on en calcule
   * la classe de vignette. C'est ce que le §5.11 exige — un feuillage qui
   * jaunit puis tombe ne s'obtient pas en inclinant une image déjà cuite, il
   * faut la recuire. Le coût est borné par la quantification de la classe :
   * une mort ne traverse que les quelques paliers de feuillage qui existent
   * déjà.
   *
   * Rend `undefined` pour tout arbre qui ne meurt pas — le cas normal — et
   * l'arbre part alors tel que l'instantané le donne, sans copie.
   */
  mourant?: (idArbre: number, maintenantMs: number, vivant: ArbreVivant) => EtatMourant | undefined;
}

/**
 * Remplace l'état des arbres qui meurent, et laisse les autres tels quels.
 *
 * **Le tableau d'origine est rendu TEL QUEL quand personne ne meurt**, ce qui
 * est le cas à toutes les images sauf pendant une ellipse : la scène compare
 * des références pour décider quoi recuire, et lui donner un tableau neuf à
 * chaque image lui ferait croire que tout a changé.
 *
 * Quand quelqu'un meurt, seuls les arbres concernés sont copiés — les autres
 * gardent leur objet, donc leur classe de vignette, donc leur texture.
 */
function appliquerLesMorts(
  arbres: readonly ArbreAPoser[],
  mourant: VueParcelleProps["mourant"],
  maintenantMs: number,
): readonly ArbreAPoser[] {
  if (!mourant) return arbres;
  let touche = false;
  const sortie = arbres.map((a) => {
    const e = mourant(a.id, maintenantMs, {
      partFoliaire: a.partFoliaire,
      senescence: a.senescence,
      vigueur: a.vigueur,
      dommageHydraulique: a.dommageHydraulique ?? 0,
    });
    if (!e) return a;
    touche = true;
    return {
      ...a,
      partFoliaire: e.partFoliaire,
      senescence: e.senescence,
      vigueur: e.vigueur,
      dommageHydraulique: e.dommageHydraulique,
      ...(e.chandelle ? { chandelle: true } : {}),
    };
  });
  return touche ? sortie : arbres;
}

/** Facteur de zoom par cran de molette. Un cran = un pas net, pas un glissement. */
const PAS_DE_ZOOM = 1.18;

/** Intervalle d'annonce du coût d'une image, en millisecondes. */
const ANNONCE_MS = 250;

export function VueParcelle(props: VueParcelleProps): React.ReactElement {
  const hote = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneParcelle | null>(null);
  const [taille, setTaille] = useState({ largeur: 0, hauteur: 0 });
  const [vue, setVue] = useState<Vue>();
  const [pret, setPret] = useState(false);
  const glisse = useRef<{ x: number; y: number } | null>(null);

  const altitudeMax = useRef(0);
  altitudeMax.current = props.sol.altitudesM.reduce((m, z) => Math.max(m, z), 0);

  // ── Taille : la scène suit son conteneur ────────────────────────────────
  useLayoutEffect(() => {
    const cible = hote.current;
    if (!cible) return;
    const mesurer = () => {
      const r = cible.getBoundingClientRect();
      setTaille({ largeur: Math.max(1, r.width), hauteur: Math.max(1, r.height) });
    };
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(cible);
    return () => observateur.disconnect();
  }, []);

  // ── Montage : une seule fois, et démonté pour de bon ────────────────────
  // La scène ne se remonte PAS au redimensionnement : elle se redimensionne,
  // dans l'effet suivant. Remonter détruirait le contexte WebGL à chaque coup
  // de souris sur le bord de la fenêtre, et un contexte perdu ne se rend pas
  // toujours.
  // biome-ignore lint/correctness/useExhaustiveDependencies: voir ci-dessus
  useEffect(() => {
    const cible = hote.current;
    if (!cible || taille.largeur <= 1) return;
    let vivant = true;
    const s = new SceneParcelle();
    scene.current = s;
    void s.monter(cible, taille.largeur, taille.hauteur).then(() => {
      if (!vivant) {
        s.demonter();
        return;
      }
      setPret(true);
    });
    return () => {
      vivant = false;
      setPret(false);
      s.demonter();
      scene.current = null;
    };
  }, [taille.largeur > 1]);

  useEffect(() => {
    if (!pret || taille.largeur <= 1) return;
    scene.current?.redimensionner(taille.largeur, taille.hauteur);
    setVue((precedente) =>
      precedente
        ? { ...precedente, largeurPx: taille.largeur, hauteurPx: taille.hauteur }
        : vueInitiale(props.sol.coteM, taille.largeur, taille.hauteur, altitudeMax.current),
    );
  }, [pret, taille.largeur, taille.hauteur, props.sol.coteM]);

  // ── L'image ─────────────────────────────────────────────────────────────
  //
  // **La boucle d'images n'est PAS un effet de React**, et le premier jet l'a
  // apprise à ses dépens : un effet sans tableau de dépendances qui appelle
  // `surCompte`, lequel pose un état, lequel refait un rendu, lequel relance
  // l'effet — React coupe au bout de cinquante tours avec « Maximum update
  // depth exceeded », et il a raison.
  //
  // Une boucle d'images se pilote par `requestAnimationFrame`. React tient la
  // caméra, parce qu'elle change sur interaction ; le dessin, lui, lit ce qu'il
  // lui faut dans des références et ne redéclenche jamais de rendu. C'est aussi
  // ce qui permet à la cuisson budgétée de rattraper son retard image après
  // image sans que personne ne la relance.
  const dernier = useRef({ props, vue });
  dernier.current = { props, vue };

  useEffect(() => {
    if (!pret) return;
    let vivant = true;
    let derniereAnnonce = 0;
    const image = () => {
      if (!vivant) return;
      const { props: p, vue: v } = dernier.current;
      if (v) {
        // L'horloge est ici et nulle part ailleurs : la scène Pixi n'apprend
        // pas le mot « temps », et `src/render/temps` reste pur.
        const horloge = performance.now();
        const rappel = p.deformer;
        scene.current?.deformerLesArbres(rappel ? (id) => rappel(id, horloge, v) : undefined);
        scene.current?.voilerLesCellules(p.voiler?.(horloge) ?? []);
        const compte = scene.current?.rafraichir(
          {
            sol: p.sol,
            semaineAnnee: p.semaineAnnee,
            arbres: appliquerLesMorts(p.arbres, p.mourant, horloge),
            ...(p.bordures ? { bordures: p.bordures } : {}),
            hauteurMaxDe: p.hauteurMaxDe,
            ombreDe: p.ombreDe,
          },
          v,
        );
        // Le compte est annoncé quelques fois par seconde et non à chaque
        // image : c'est un indicateur, et un appelant qui en fait un état de
        // React ne doit pas se retrouver à rendre soixante fois par seconde.
        const maintenant = performance.now();
        if (compte && maintenant - derniereAnnonce > ANNONCE_MS) {
          derniereAnnonce = maintenant;
          p.surCompte?.(compte);
        }
      }
      boucle = requestAnimationFrame(image);
    };
    let boucle = requestAnimationFrame(image);
    return () => {
      vivant = false;
      cancelAnimationFrame(boucle);
    };
  }, [pret]);

  // ── Les gestes ──────────────────────────────────────────────────────────
  const surMolette = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const cible = hote.current;
    if (!cible) return;
    const r = cible.getBoundingClientRect();
    const curseur = { sx: e.clientX - r.left, sy: e.clientY - r.top };
    const facteur = e.deltaY < 0 ? PAS_DE_ZOOM : 1 / PAS_DE_ZOOM;
    setVue((v) => (v ? zoomer(v, facteur, curseur, altitudeMax.current) : v));
  }, []);

  const surAppui = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    glisse.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const surGlissement = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const depart = glisse.current;
    if (!depart) return;
    const dx = e.clientX - depart.x;
    const dy = e.clientY - depart.y;
    glisse.current = { x: e.clientX, y: e.clientY };
    setVue((v) => (v ? deplacer(v, dx, dy) : v));
  }, []);

  const surRelachement = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    glisse.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const surTouche = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Les deux quarts de tour, au clavier : c'est le geste le plus utile de la
    // vue isométrique, et le plus pénible à découvrir sans raccourci.
    if (e.key === "a" || e.key === "ArrowLeft") setVue((v) => (v ? tournerVue(v, -1) : v));
    if (e.key === "e" || e.key === "ArrowRight") setVue((v) => (v ? tournerVue(v, 1) : v));
  }, []);

  return (
    <div
      ref={hote}
      className="vue-parcelle"
      // Le conteneur reçoit le focus pour que la rotation au clavier marche
      // sans qu'on ait à cliquer d'abord sur un bouton. La vue EST interactive :
      // on y glisse, on y zoome, on la tourne — et `role="application"` est
      // justement le rôle qui dit « ce conteneur gère ses propres touches ».
      // biome-ignore lint/a11y/noNoninteractiveTabindex: voir ci-dessus
      tabIndex={0}
      role="application"
      aria-label="Vue de la parcelle"
      onWheel={surMolette}
      onPointerDown={surAppui}
      onPointerMove={surGlissement}
      onPointerUp={surRelachement}
      onPointerCancel={surRelachement}
      onKeyDown={surTouche}
      style={{ width: "100%", height: "100%", touchAction: "none", cursor: "grab" }}
    />
  );
}
