/**
 * L'hôte PixiJS : là où les couches cuites deviennent une image
 * (docs/interface-visuelle.md §3, décision D1).
 *
 * **C'est ce qui rend D1 autre chose qu'une intention.** Le lot L0 a tranché
 * pour Pixi sur des chiffres — 43 488 tiges à 60 images/s contre 5 436, et
 * 0,3 ms de fil principal contre 1,8 — mais tout ce qui a suivi dessinait en
 * Canvas 2D. Tant que rien ne passe par le GPU, la décision reste sur le papier
 * et la marge annoncée n'est pas vérifiée.
 *
 * **Le partage du travail est simple, et c'est tout l'intérêt du montage :**
 *
 * - **le Canvas 2D CUIT.** Le terrain, le décor et les arbres sont dessinés une
 *   fois dans des canvas hors écran, par les modules `couches/`. C'est du
 *   vectoriel, c'est cher, et ça ne se refait qu'au changement — de semaine, de
 *   zoom, d'orientation.
 *   - **Pixi POSE.** Chaque canvas cuit devient une texture, chaque texture un
 *   sprite, et le GPU les compose. Par image, il n'y a plus une seule primitive
 *   vectorielle : c'est la règle que L0 a produite en mesurant un facteur trente
 *   sur les ombres, et le montage la rend structurelle plutôt que disciplinaire.
 *
 * **Quatre couches, dans cet ordre**, chacune un conteneur : le décor, le sol,
 * les ombres, les arbres. Elles ne sont pas encore entrelacées — la décision D3
 * l'exigera quand une butte devra masquer le pied des arbres derrière elle — et
 * les listes sont déjà triées par la même clé de profondeur, ce qui rendra la
 * fusion mécanique.
 *
 * **Les ombres passent par une texture de rendu**, et pas par des sprites en
 * `multiply` posés directement. Deux ombres qui se recouvrent ne doivent pas
 * être deux fois plus sombres — le moteur lui-même sature (`MAX_EXTINCTION`) —
 * donc les taches s'accumulent en `darken` dans une texture blanche, qui est
 * ensuite composée en `multiply` en une seule fois. C'est le même schéma qu'en
 * Canvas 2D, transposé.
 */

import { Application, Container, Graphics, RenderTexture, Sprite, Texture } from "pixi.js";
import { ficheDe } from "../arbres/especes";
import { type Vue, versEcranVue } from "../camera";
import {
  type ArbreAPoser,
  AtlasArbres,
  ancrageDePose,
  fourreEnArbre,
  posesDesArbres,
  separerLeFourre,
  tailleDePose,
} from "../couches/arbres";
import { BRUME, type DecorBordures } from "../couches/decor";
import {
  type ArbreOmbre,
  cuireTachesOmbre,
  MODE_ACCUMULATION_GPU,
  MODE_COMPOSITION,
  ombresAPoser,
} from "../couches/ombres";
import { Decor, type DonneesSol, Terrain } from "../couches/terrain";
import { versCss } from "../palette";

/** Budget de cuisson par image, en morceaux de terrain. */
export const BUDGET_TERRAIN = 4;
/**
 * Budget de cuisson par image, en morceaux de décor.
 *
 * Nettement plus large que celui du terrain, et pour une raison simple : un
 * morceau de décor, c'est seize quads de quatre mètres et quelques masses, là
 * où un morceau de terrain porte deux cent cinquante-six cellules, leur tapis
 * et leur eau. À six par image comme le terrain, la ceinture mettait une
 * demi-seconde à apparaître et la parcelle flottait sur du gris pendant ce
 * temps-là — le défaut même que le décor existe pour supprimer.
 */
export const BUDGET_DECOR = 32;
/**
 * Budget de cuisson des vignettes d'arbre, en pixels et par image.
 *
 * En pixels et non en classes : voir `AtlasArbres.cuire`. Une vignette de seize
 * pixels et une de deux cent cinquante-six ne coûtent pas la même chose, et un
 * budget compté en vignettes veut dire deux choses opposées selon le zoom.
 */
export const BUDGET_ARBRES_PX = 300_000;

/** Ce que la scène a besoin de recevoir à chaque rafraîchissement. */
export interface EtatScene {
  sol: DonneesSol;
  /** semaine DANS l'année (0–51) : c'est elle qui décale la palette */
  semaineAnnee: number;
  arbres: readonly ArbreAPoser[];
  /** les quatre bordures ; absentes = pas de hors-parcelle */
  bordures?: DecorBordures;
  /** hauteur maximale d'une espèce, pour quantifier les classes d'arbre */
  hauteurMaxDe: (especeId: string) => number;
  /** part du feuillage qui intercepte la lumière, par arbre */
  ombreDe: (arbre: ArbreAPoser) => number;
}

/** Ce qu'une image a coûté. À surveiller : c'est la grandeur qui dit si ça tient. */
export interface Compte {
  morceauxCuits: number;
  decorCuit: number;
  classesCuites: number;
  spritesPoses: number;
  /** morceaux de terrain en attente de cuisson */
  solEnRetard: number;
  /** morceaux de décor en attente de cuisson */
  decorEnRetard: number;
  /** classes de vignette en attente de cuisson */
  arbresEnRetard: number;
}

/**
 * La scène.
 *
 * `monter` est asynchrone parce que l'initialisation de Pixi v8 l'est ; tout le
 * reste est synchrone, y compris `rafraichir`, qui est appelé par la boucle de
 * jeu et doit rendre la main dans le budget d'une image.
 */
export class SceneParcelle {
  private readonly app = new Application();
  private readonly couches = {
    decor: new Container(),
    sol: new Container(),
    ombres: new Container(),
    arbres: new Container(),
  };
  private terrain?: Terrain;
  private decor?: Decor;
  private atlas?: AtlasArbres;
  private taches: Texture[] = [];
  private masque?: RenderTexture;
  private silhouette?: RenderTexture;
  private readonly pinceau = new Container();
  private spriteOmbres?: Sprite;
  /** textures posées à l'image précédente, à libérer quand elles changent */
  private readonly posees = new Map<string, Texture>();
  private monte = false;

  /**
   * La fabrique de canvas hors écran. Injectée comme partout ailleurs dans le
   * rendu : c'est ce qui permet de tester les couches sans navigateur.
   */
  private readonly fabriquer = (largeur: number, hauteur: number): HTMLCanvasElement => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(largeur));
    c.height = Math.max(1, Math.ceil(hauteur));
    return c;
  };

  public get vueDuCanvas(): HTMLCanvasElement | undefined {
    return this.monte ? (this.app.canvas as HTMLCanvasElement) : undefined;
  }

  /** Prépare le contexte GPU et accroche le canvas au parent donné. */
  public async monter(parent: HTMLElement, largeur: number, hauteur: number): Promise<void> {
    await this.app.init({
      width: Math.max(1, Math.round(largeur)),
      height: Math.max(1, Math.round(hauteur)),
      background: versCss(BRUME),
      antialias: false,
      // Le rendu est fait d'images cuites : lisser une deuxième fois ne ferait
      // que ramollir ce que le Canvas 2D a déjà anticrénelé.
      resolution: 1,
      autoDensity: false,
      preference: "webgl",
    });
    parent.appendChild(this.app.canvas as HTMLCanvasElement);
    this.app.stage.addChild(
      this.couches.decor,
      this.couches.sol,
      this.couches.ombres,
      this.couches.arbres,
    );
    // Les taches d'ombre sont cuites UNE fois pour la partie : ce sont des
    // dégradés radiaux, ils ne dépendent ni du zoom ni de la saison.
    this.taches = cuireTachesOmbre(this.fabriquer).map((c) => Texture.from(c));
    this.monte = true;
  }

  /** Redimensionne le rendu. Le masque d'ombre suit, sinon il se décadre. */
  public redimensionner(largeur: number, hauteur: number): void {
    if (!this.monte) return;
    this.app.renderer.resize(Math.max(1, Math.round(largeur)), Math.max(1, Math.round(hauteur)));
    this.masque?.destroy(true);
    this.masque = undefined;
    this.silhouette?.destroy(true);
    this.silhouette = undefined;
  }

  /**
   * Une image : cuit ce qui manque dans les budgets, puis pose.
   *
   * **Cuire d'abord, poser ensuite, et jamais l'inverse.** Un morceau pas
   * encore prêt garde son ancienne image plutôt que de disparaître : on préfère
   * un sol d'une semaine de retard à un trou, et c'est la leçon de l'atlas de
   * L0, où trois secondes de gel arrivaient d'un coup au premier affichage.
   */
  public rafraichir(etat: EtatScene, vue: Vue): Compte {
    if (!this.monte) {
      return {
        morceauxCuits: 0,
        decorCuit: 0,
        classesCuites: 0,
        spritesPoses: 0,
        solEnRetard: 0,
        decorEnRetard: 0,
        arbresEnRetard: 0,
      };
    }
    this.terrain ??= new Terrain(this.fabriquer, etat.sol.coteM);
    this.atlas ??= new AtlasArbres(this.fabriquer);
    if (etat.bordures && !this.decor) {
      this.decor = new Decor(this.fabriquer, etat.sol.coteM, etat.bordures, etat.sol.altitudesM);
    }

    const enRetardTerrain = this.terrain.rafraichir(etat.sol, etat.semaineAnnee, vue);
    const morceauxCuits = this.terrain.cuire(etat.sol, etat.semaineAnnee, vue, BUDGET_TERRAIN);
    const enRetardDecor = this.decor?.rafraichir(vue) ?? 0;
    const decorCuit = this.decor?.cuire(vue, BUDGET_DECOR) ?? 0;

    // Le fourré bas prend son chemin AVANT le reste : agrégé par carreau, il
    // passe de plusieurs milliers de tiges à quelques centaines de masses.
    const separe = separerLeFourre(etat.arbres);
    const poses = posesDesArbres(
      [...separe.arbres, ...separe.fourre.map(fourreEnArbre)],
      etat.hauteurMaxDe,
      vue,
    );
    const enRetardArbres = this.atlas.rafraichir(poses);
    const classesCuites = this.atlas.cuire(BUDGET_ARBRES_PX);

    let spritesPoses = 0;
    spritesPoses += this.poserDecor(vue);
    spritesPoses += this.poserSol(vue);
    spritesPoses += this.poserArbres(poses, vue);
    this.poserOmbres(etat, vue);

    this.app.render();
    return {
      morceauxCuits,
      decorCuit,
      classesCuites,
      spritesPoses,
      solEnRetard: enRetardTerrain,
      decorEnRetard: enRetardDecor,
      arbresEnRetard: enRetardArbres,
    };
  }

  /**
   * Pose les images d'une couche, en réutilisant les textures déjà envoyées au
   * GPU.
   *
   * **La réutilisation n'est pas une optimisation, c'est une nécessité.**
   * Refabriquer une texture à chaque image, c'est retéléverser le canvas dans
   * la mémoire graphique soixante fois par seconde : on paierait en bande
   * passante ce que Pixi fait gagner en dessin, et la mémoire monterait
   * jusqu'à la panne. Une texture n'est refaite que quand son canvas change.
   */
  private poserImages(
    couche: Container,
    images: readonly {
      cle: string;
      canvas: HTMLCanvasElement;
      x: number;
      y: number;
      echelle: number;
    }[],
  ): number {
    couche.removeChildren();
    for (const image of images) {
      let texture = this.posees.get(image.cle);
      if (!texture || texture.source.resource !== image.canvas) {
        texture?.destroy(true);
        texture = Texture.from(image.canvas);
        this.posees.set(image.cle, texture);
      }
      const sprite = new Sprite(texture);
      sprite.x = image.x;
      sprite.y = image.y;
      // Le morceau a été cuit sur un barreau de l'échelle de zoom ; on l'étire
      // du rapport au zoom courant. Un facteur au plus 1,41 sur une image déjà
      // anticrénelée ne se voit pas, et il évite de tout recuire à chaque cran
      // de molette.
      if (image.echelle !== 1)
        sprite.setSize(texture.width * image.echelle, texture.height * image.echelle);
      couche.addChild(sprite);
    }
    return images.length;
  }

  /**
   * Où poser une image cuite à un autre zoom, et de combien l'étirer.
   *
   * L'ancre est un point de PARCELLE : on le reprojette au zoom courant, et le
   * décalage relatif — mesuré en pixels du zoom de cuisson — suit le même
   * rapport. C'est exact parce que la projection est linéaire en zoom : tout
   * point de l'image retombe exactement là où il tomberait s'il avait été cuit
   * au zoom courant.
   */
  private replacer(
    m: {
      ancre?: { x: number; y: number; z: number };
      decalage?: { dx: number; dy: number };
      decalageRelatif?: { dx: number; dy: number };
      zoomCuit?: number;
    },
    vue: Vue,
  ): { x: number; y: number; echelle: number } {
    if (!m.ancre || !m.decalageRelatif || !m.zoomCuit) {
      return { x: m.decalage?.dx ?? 0, y: m.decalage?.dy ?? 0, echelle: 1 };
    }
    const echelle = vue.cam.zoom / m.zoomCuit;
    const ancre = versEcranVue(m.ancre, vue);
    return {
      x: ancre.sx + m.decalageRelatif.dx * echelle,
      y: ancre.sy + m.decalageRelatif.dy * echelle,
      echelle,
    };
  }

  private poserSol(vue: Vue): number {
    if (!this.terrain) return 0;
    const images = [];
    for (const m of this.terrain.aPoser(vue)) {
      if (!m.image || !m.decalage) continue;
      images.push({ cle: `sol:${m.ix},${m.iy}`, canvas: m.image, ...this.replacer(m, vue) });
    }
    return this.poserImages(this.couches.sol, images);
  }

  private poserDecor(vue: Vue): number {
    if (!this.decor) return 0;
    const images = this.decor.aPoser(vue).map((m) => ({
      cle: `decor:${m.ix},${m.iy}`,
      canvas: m.image,
      ...this.replacer(m, vue),
    }));
    return this.poserImages(this.couches.decor, images);
  }

  private poserArbres(poses: ReturnType<typeof posesDesArbres>, vue: Vue): number {
    if (!this.atlas) return 0;
    this.couches.arbres.removeChildren();
    let n = 0;
    for (const pose of poses) {
      const vignette = this.atlas.vignette(pose.classe);
      if (!vignette) continue;
      const cle = `arbre:${pose.classe.especeId}|${pose.classe.palier}|${pose.classe.variante}|${pose.classe.feuillage}|${pose.classe.gestion}|${pose.classe.taillePx}`;
      let texture = this.posees.get(cle);
      if (!texture || texture.source.resource !== vignette.image) {
        texture?.destroy(true);
        texture = Texture.from(vignette.image);
        this.posees.set(cle, texture);
      }
      // La vignette est cuite à une RÉSOLUTION et posée à sa TAILLE écran : ce
      // sont deux choses différentes, et les confondre donnait des arbres trois
      // fois trop grands.
      const taille = tailleDePose(pose.arbre.heightM, vignette, vue);
      const ancre = ancrageDePose(vignette, taille);
      const sprite = new Sprite(texture);
      sprite.x = pose.sx - ancre.dx;
      sprite.y = pose.sy - ancre.dy;
      sprite.width = taille.largeur;
      sprite.height = taille.hauteur;
      this.couches.arbres.addChild(sprite);
      n++;
    }
    return n;
  }

  /**
   * Les ombres, en deux temps : accumulation dans une texture blanche, puis une
   * seule composition en `multiply`.
   */
  private poserOmbres(etat: EtatScene, vue: Vue): void {
    const largeur = this.app.renderer.width;
    const hauteur = this.app.renderer.height;
    this.masque ??= RenderTexture.create({ width: largeur, height: hauteur });

    this.pinceau.removeChildren();
    // Le fond blanc : dans ce schéma, blanc veut dire « pas d'ombre ».
    const fond = new Graphics().rect(0, 0, largeur, hauteur).fill(0xffffff);
    this.pinceau.addChild(fond);
    // Le fourré ne porte pas d'ombre portée : à cinquante centimètres de haut,
    // son ombre tient sous lui.
    const arbresOmbre: ArbreOmbre[] = etat.arbres
      .filter((a) => !a.chandelle && a.heightM > 0 && !ficheDe(a.especeId)?.fourre)
      .map((a) => ({
        x: a.x,
        y: a.y,
        z: a.z,
        heightM: a.heightM,
        houppierRatio: a.houppierRatio,
        partOmbrageante: etat.ombreDe(a),
      }));
    for (const o of ombresAPoser(arbresOmbre, vue)) {
      const tache = this.taches[o.densite];
      if (!tache) continue;
      const sprite = new Sprite(tache);
      sprite.x = o.sx - o.largeurPx / 2;
      sprite.y = o.sy - o.hauteurPx / 2;
      sprite.width = o.largeurPx;
      sprite.height = o.hauteurPx;
      // Deux ombres superposées ne sont pas plus sombres qu'une seule : c'est la
      // saturation, obtenue sans compter les recouvrements.
      //
      // `MODE_ACCUMULATION_GPU` et non `MODE_ACCUMULATION` : le mode Canvas
      // (`darken`) est un mode AVANCÉ pour Pixi, donc un shader qui lit le fond
      // — lecture qui échoue dans une `RenderTexture` fraîchement effacée et
      // assombrit le quad entier au lieu du seul disque. C'est ce qui faisait
      // l'escalier de rectangles le long du bord de la parcelle.
      sprite.blendMode = MODE_ACCUMULATION_GPU;
      this.pinceau.addChild(sprite);
    }
    this.app.renderer.render({ container: this.pinceau, target: this.masque, clear: true });

    this.couches.ombres.removeChildren();
    this.spriteOmbres = new Sprite(this.masque);
    this.spriteOmbres.blendMode = MODE_COMPOSITION;
    this.couches.ombres.addChild(this.spriteOmbres);

    // **Borner l'ombre À LA PARCELLE.** Un arbre du bord projette son ombre
    // au-delà de la limite ; composée sur toute la surface, elle se poserait
    // sur le CIEL, et c'est la frange grise qui faisait flotter le plateau.
    //
    // **La découpe était conditionnelle, et c'était une erreur de jugement.**
    // On ne découpait que sans décor, au motif que la nappe du hors-parcelle
    // couvre tout le cadre et qu'une ombre de bordure tombant dessus est
    // « correcte ». Correcte physiquement, oui. Mais le décor est là pour se
    // taire — il est désaturé, brumé, assombri exprès — et y semer des taches
    // sombres attire l'œil exactement là où il n'y a rien à voir. Le retour est
    // sans ambiguïté : « je vois encore des taches à l'extérieur de la
    // parcelle, c'est vraiment étrange », et « les taches d'ombre autour de la
    // parcelle, c'est pas important ». Ce qui compte, c'est l'ombre PORTÉE SUR
    // CE QU'ON GÈRE : elle dit où il fait sombre, donc où rien ne poussera.
    //
    // On découpe donc toujours, et sur `couches.sol` seul — jamais sur le décor,
    // qui n'est pas la parcelle. La passe coûte un plein écran : une seule
    // primitive pour le GPU, mesurée sans effet sur le coût par image.
    this.silhouette ??= RenderTexture.create({ width: largeur, height: hauteur });
    this.app.renderer.render({
      container: this.couches.sol,
      target: this.silhouette,
      clear: true,
    });
    const decoupe = new Sprite(this.silhouette);
    this.couches.ombres.addChild(decoupe);
    this.spriteOmbres.mask = decoupe;
    fond.destroy();
  }

  /** Libère le contexte GPU et toutes les textures. */
  public demonter(): void {
    if (!this.monte) return;
    for (const t of this.posees.values()) t.destroy(true);
    this.posees.clear();
    for (const t of this.taches) t.destroy(true);
    this.taches = [];
    this.masque?.destroy(true);
    this.masque = undefined;
    this.silhouette?.destroy(true);
    this.silhouette = undefined;
    this.app.destroy(true, { children: true, texture: true });
    this.monte = false;
  }
}
