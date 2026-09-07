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
  cleClasse,
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
import { DEBOUT, type Deformation } from "../temps/chute";

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
  /**
   * Millisecondes passées à POSER, hors cuisson et hors rendu GPU.
   *
   * **Le poste que rien ne mesurait, et donc que rien ne surveillait.** Le
   * compte disait combien de sprites étaient posés, jamais ce que les poser
   * coûtait — or c'est là que vit la « primitive par image » que le lot L0 a
   * proscrite. Un chiffre qu'on ne mesure pas est un chiffre qui dérive.
   *
   * Séparé du reste exprès : la cuisson est budgétée et s'arrête d'elle-même,
   * le rendu GPU dépend de la machine, la POSE est du JavaScript pur et ne
   * dépend que de nous. C'est le seul des trois qu'on puisse comparer d'une
   * version à l'autre depuis un conteneur sans carte graphique.
   */
  msPose: number;
  /** millisecondes passées à cuire, budget compris */
  msCuisson: number;
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
  /**
   * Le fond blanc du masque d'ombre — « blanc » voulant dire « pas d'ombre ».
   *
   * Gardé d'une image à l'autre, et refait seulement quand le cadre change de
   * taille : c'était un `Graphics` neuf, rempli et détruit soixante fois par
   * seconde pour dessiner le même rectangle.
   */
  private fondOmbre?: Graphics;
  private fondOmbreTaille = "";
  /**
   * La signature du masque d'ombre déjà cuit : caméra + arbres.
   *
   * **Le masque est une FONCTION de (arbres, caméra), et rien d'autre.** Tant
   * que ni l'une ni les autres ne bougent, la texture d'ombre déjà rendue est
   * exactement celle qu'on s'apprêtait à refaire — et la refaire coûte deux
   * passes plein écran plus un placement par arbre.
   *
   * Ce n'est pas une optimisation de banc : le jeu est au TOUR. Entre deux
   * ticks, la caméra immobile est le régime normal, pas le cas particulier.
   * Ce qui bouge dans une image d'attente, ce sont les cuissons en retard et
   * rien d'autre.
   */
  private signatureOmbres = "";
  private spriteOmbres?: Sprite;
  private decoupeOmbres?: Sprite;
  /**
   * Ce qui déforme les arbres en cours d'animation, s'il y a lieu.
   *
   * Une FONCTION et non un état : la scène ne tient pas d'horloge et ne sait
   * rien d'une ellipse. Elle demande, par identifiant d'arbre, comment poser
   * le sprite — et par défaut la réponse est « debout ». Tout le reste vit
   * au-dessus, dans `src/render/temps`, qui est pur et testé.
   */
  private deformer?: (idArbre: number) => Deformation;
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

  /**
   * Branche (ou débranche) la déformation des arbres.
   *
   * Appelée par la boucle d'animation avant `rafraichir`. Sans elle, tous les
   * arbres sont debout — ce qui est l'état normal d'une scène au repos, et le
   * seul que le jeu au tour montre entre deux ellipses.
   */
  public deformerLesArbres(deformer?: (idArbre: number) => Deformation): void {
    this.deformer = deformer;
  }

  /** Redimensionne le rendu. Le masque d'ombre suit, sinon il se décadre. */
  public redimensionner(largeur: number, hauteur: number): void {
    if (!this.monte) return;
    this.app.renderer.resize(Math.max(1, Math.round(largeur)), Math.max(1, Math.round(hauteur)));
    this.masque?.destroy(true);
    this.masque = undefined;
    this.silhouette?.destroy(true);
    this.silhouette = undefined;
    // **Les deux sprites tenaient ces textures**, et depuis qu'ils survivent
    // d'une image à l'autre, les oublier ici laisserait la couche d'ombre
    // pointer sur deux textures détruites — le même plantage que la clé de
    // classe recopiée, un cran plus bas. Ils se refont à la prochaine image.
    this.couches.ombres.removeChildren();
    this.spriteOmbres = undefined;
    this.decoupeOmbres = undefined;
    this.signatureOmbres = "";
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
        msPose: 0,
        msCuisson: 0,
      };
    }
    this.terrain ??= new Terrain(this.fabriquer, etat.sol.coteM);
    this.atlas ??= new AtlasArbres(this.fabriquer);
    if (etat.bordures && !this.decor) {
      this.decor = new Decor(this.fabriquer, etat.sol.coteM, etat.bordures, etat.sol.altitudesM);
    }

    const debutCuisson = performance.now();
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

    const msCuisson = performance.now() - debutCuisson;

    const debutPose = performance.now();
    let spritesPoses = 0;
    spritesPoses += this.poserDecor(vue);
    spritesPoses += this.poserSol(vue);
    spritesPoses += this.poserArbres(poses, vue);
    // **Un morceau de sol cuit invalide le masque d'ombre**, et l'oublier
    // laissait une découpe périmée. La signature ne regarde que les arbres et
    // la caméra ; or l'ombre est aussi découpée à la SILHOUETTE de la parcelle,
    // rendue depuis la couche du sol — qui, elle, change tant que la cuisson
    // rattrape son retard. Sans ce forçage, les premières secondes d'une
    // parcelle froide gardaient l'ombre découpée sur un sol à moitié cuit.
    const msPose = performance.now() - debutPose + this.poserOmbres(etat, vue, morceauxCuits > 0);

    this.app.render();
    return {
      morceauxCuits,
      decorCuit,
      classesCuites,
      spritesPoses,
      solEnRetard: enRetardTerrain,
      decorEnRetard: enRetardDecor,
      arbresEnRetard: enRetardArbres,
      msPose,
      msCuisson,
    };
  }

  /**
   * Le sprite numéro `rang` d'une couche : celui qui y est déjà, sinon un neuf.
   *
   * **La couche est un POOL, pas une liste qu'on refait.** Chaque couche
   * gardait ses sprites une image seulement : `removeChildren()` en tête de
   * pose, puis un `new Sprite` par image — soit, sur une friche, trois mille
   * objets alloués et jetés soixante fois par seconde. C'est exactement la
   * « primitive par image » que le lot L0 a proscrite, réintroduite dans la
   * couche de pose.
   *
   * Mesuré sur la friche de `scripts/apercu-perf.mjs` (2 995 sprites,
   * 1 500 × 1 000) : **35,7 ms** de pose par image avant, **5,4 / 9,2 / 11,9 ms**
   * sur trois relevés après (avec le saut de masque d'ombre décrit plus bas).
   * Trois chiffres et pas un seul parce que le conteneur de mesure partage son
   * processeur : l'écart entre relevés y est du même ordre que ce qu'on mesure,
   * donc le gain honnête est « un facteur trois environ », pas une valeur.
   *
   * L'ordre de grandeur, lui, se lit sans ambiguïté contre le budget d'une
   * image à soixante par seconde, qui est de 16,7 ms : la pose seule le
   * dépassait du double, avant même que quoi que ce soit ne soit dessiné.
   * Et contrairement au temps de RENDU, ce chiffre-là veut dire quelque chose
   * depuis ce conteneur — c'est du JavaScript, il ne passe pas par SwiftShader.
   *
   * Le rang suffit comme identité : ce qui compte n'est pas QUEL sprite sert à
   * quoi — ils sont interchangeables — mais qu'il y en ait le bon nombre et
   * qu'ils portent la bonne texture.
   */
  private static sprite(couche: Container, rang: number, texture: Texture): Sprite {
    const deja = couche.children[rang] as Sprite | undefined;
    if (deja) {
      // Réaffecter une texture identique invalide quand même le lot de rendu
      // de Pixi : on ne le fait que si elle a vraiment changé.
      if (deja.texture !== texture) deja.texture = texture;
      deja.visible = true;
      return deja;
    }
    const neuf = new Sprite(texture);
    couche.addChild(neuf);
    return neuf;
  }

  /** Jette ce qui dépasse : la couche a servi plus de sprites à l'image d'avant. */
  private static tailler(couche: Container, gardes: number): void {
    while (couche.children.length > gardes) couche.removeChildAt(couche.children.length - 1);
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
    let rang = 0;
    for (const image of images) {
      let texture = this.posees.get(image.cle);
      if (!texture || texture.source.resource !== image.canvas) {
        texture?.destroy(true);
        texture = Texture.from(image.canvas);
        this.posees.set(image.cle, texture);
      }
      const sprite = SceneParcelle.sprite(couche, rang++, texture);
      sprite.x = image.x;
      sprite.y = image.y;
      // Le morceau a été cuit sur un barreau de l'échelle de zoom ; on l'étire
      // du rapport au zoom courant. Un facteur au plus 1,41 sur une image déjà
      // anticrénelée ne se voit pas, et il évite de tout recuire à chaque cran
      // de molette.
      //
      // Le sprite est RECYCLÉ : il peut porter la taille d'un autre morceau, à
      // une autre échelle. On repose donc la taille dans les deux cas, sans
      // quoi un morceau posé à l'échelle 1 garderait l'étirement du précédent.
      sprite.setSize(texture.width * image.echelle, texture.height * image.echelle);
    }
    SceneParcelle.tailler(couche, rang);
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
    let n = 0;
    for (const pose of poses) {
      const vignette = this.atlas.vignette(pose.classe);
      if (!vignette) continue;
      // **`cleClasse`, et surtout pas une clé écrite à la main.** Il y en avait
      // une ici, recopiée champ par champ depuis `cleClasse` — et elle a dérivé
      // trois fois de suite : la santé, le fruit et le liège sont entrés dans la
      // classe sans entrer dans cette copie.
      //
      // Ce n'était pas un défaut cosmétique, c'était un PLANTAGE. Deux classes
      // distinctes tombaient sur la même clé de texture ; à la deuxième, le
      // canvas ne correspondait plus, on détruisait la texture — celle qu'un
      // sprite déjà posé de la première classe tenait encore — et `app.render()`
      // lisait `alphaMode` sur une source nulle. L'exception remontait dans le
      // rappel de `requestAnimationFrame`, qui n'atteignait donc jamais son
      // `requestAnimationFrame` suivant : **la vue de parcelle rendait une seule
      // image puis gelait**, en silence.
      //
      // Deux copies d'une règle dérivent, et rien ne le signale (§2.1). Ici
      // « rien » aura duré trois passes.
      const cle = `arbre:${cleClasse(pose.classe)}`;
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
      const sprite = SceneParcelle.sprite(this.couches.arbres, n++, texture);
      // **La déformation à la pose, et l'atlas ne bouge pas d'un octet.**
      // C'est la contrainte que le §5.11 pose nommément : « une animation
      // continue ne doit pas invalider un cache de cuisson […] ce sera une
      // déformation à la POSE (un sprite qu'on incline), pas un redessin ».
      // Une chandelle qui tombe passe donc par ici, avec la vignette déjà
      // cuite de l'arbre debout.
      const d = this.deformer?.(pose.arbre.id) ?? DEBOUT;
      sprite.width = taille.largeur;
      sprite.height = taille.hauteur * d.hauteur;
      sprite.alpha = d.opacite;
      if (d.rotationRad === 0) {
        sprite.pivot.set(0, 0);
        sprite.rotation = 0;
        sprite.x = pose.sx - ancre.dx;
        sprite.y = pose.sy - ancre.dy;
      } else {
        // **On pivote autour du PIED**, pas du centre du sprite : une souche
        // reste où elle est. Le pivot est en coordonnées de TEXTURE, donc le
        // point du pied dans la vignette — d'où la division par l'échelle de
        // pose, que `setSize` a déjà appliquée.
        const echelleX = taille.largeur / Math.max(1, texture.width);
        const echelleY = (taille.hauteur * d.hauteur) / Math.max(1, texture.height);
        sprite.pivot.set(ancre.dx / echelleX, ancre.dy / echelleY);
        sprite.rotation = d.rotationRad;
        sprite.x = pose.sx;
        sprite.y = pose.sy;
      }
    }
    SceneParcelle.tailler(this.couches.arbres, n);
    return n;
  }

  /**
   * Les ombres, en deux temps : accumulation dans une texture blanche, puis une
   * seule composition en `multiply`.
   *
   * Rend les millisecondes de POSE, et elles seules : les deux passes de rendu
   * de cette couche sont du GPU et n'ont rien à faire dans un chiffre censé
   * mesurer notre JavaScript.
   */
  private poserOmbres(etat: EtatScene, vue: Vue, forcer: boolean): number {
    const largeur = this.app.renderer.width;
    const hauteur = this.app.renderer.height;
    this.masque ??= RenderTexture.create({ width: largeur, height: hauteur });

    const debut = performance.now();
    // La signature se calcule sur des NOMBRES seulement — position, hauteur,
    // caméra, semaine. La part ombrageante en fait partie sans y figurer : elle
    // ne dépend que de l'espèce et de la phénologie, l'une ne change pas sans
    // que la liste d'arbres change, l'autre est la semaine. La lire ici
    // reviendrait à appeler `ombreDe` pour chaque arbre à chaque image, ce qui
    // coûte plus cher que ce qu'on cherche à éviter — mesuré : +4 ms.
    let h = 0x811c9dc5;
    for (const a of etat.arbres) {
      h = Math.imul(h ^ (a.x * 64), 0x01000193) >>> 0;
      h = Math.imul(h ^ (a.y * 64), 0x01000193) >>> 0;
      h = Math.imul(h ^ (a.heightM * 64), 0x01000193) >>> 0;
    }
    const signature = `${largeur}x${hauteur}|${vue.cam.zoom.toFixed(4)}|${vue.cam.orientation}|${vue.centre.x.toFixed(3)},${vue.centre.y.toFixed(3)}|${etat.arbres.length}|${etat.semaineAnnee}|${h}`;
    if (!forcer && signature === this.signatureOmbres && this.spriteOmbres && this.decoupeOmbres) {
      return performance.now() - debut;
    }
    this.signatureOmbres = signature;
    const taille = `${largeur}x${hauteur}`;
    if (!this.fondOmbre || this.fondOmbreTaille !== taille) {
      const ancien = this.fondOmbre;
      this.fondOmbre = new Graphics().rect(0, 0, largeur, hauteur).fill(0xffffff);
      this.fondOmbreTaille = taille;
      // Le fond occupe toujours le rang 0 : les taches se posent par-dessus.
      this.pinceau.addChildAt(this.fondOmbre, 0);
      if (ancien) {
        this.pinceau.removeChild(ancien);
        ancien.destroy();
      }
    }
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
    // Le rang 0 du pinceau est le fond ; les taches suivent.
    let rang = 1;
    for (const o of ombresAPoser(arbresOmbre, vue)) {
      const tache = this.taches[o.densite];
      if (!tache) continue;
      const sprite = SceneParcelle.sprite(this.pinceau, rang++, tache);
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
    }
    SceneParcelle.tailler(this.pinceau, rang);
    const ms = performance.now() - debut;
    this.app.renderer.render({ container: this.pinceau, target: this.masque, clear: true });

    // Les deux sprites de cette couche — la nappe d'ombre et sa découpe —
    // gardent la même texture d'une image à l'autre : seul leur CONTENU change,
    // puisque ce sont des `RenderTexture` redessinées juste au-dessus. Les
    // refaire à chaque image ne servait qu'à jeter deux objets de plus.
    if (!this.spriteOmbres) {
      this.spriteOmbres = new Sprite(this.masque);
      this.spriteOmbres.blendMode = MODE_COMPOSITION;
      this.couches.ombres.addChild(this.spriteOmbres);
    }

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
    // qui n'est pas la parcelle.
    //
    // **Ce que ça coûte, mesuré et non supposé** : une passe plein écran de
    // plus, soit +10 % sur le temps par image (1 640 → 1 807 ms de médiane sur
    // 90 images, friche de 3 264 sprites, 1 500 × 1 000). Le chiffre ABSOLU ne
    // veut rien dire — le conteneur de mesure n'a pas de GPU et rend par
    // SwiftShader, un rastériseur logiciel — mais l'écart RELATIF, si : une
    // passe plein écran n'est pas gratuite ici, et il ne faut pas prétendre
    // qu'elle l'est. Sur un vrai GPU, un quad plein écran se compte en dixièmes
    // de milliseconde et la part serait invisible ; ce n'est pas vérifiable
    // depuis ce conteneur, donc ce n'est pas affirmé.
    //
    // Le vrai poste de cette couche était ailleurs, et il était bien plus gros :
    // un `Sprite` reconstruit PAR ARBRE À CHAQUE IMAGE. C'est corrigé — la
    // couche est un pool (voir `sprite`), et le masque entier est sauté quand
    // ni la caméra ni les arbres n'ont bougé, ce qui est le régime normal d'un
    // jeu au tour. Ces deux passes-ci ne se paient donc plus qu'aux images qui
    // changent vraiment.
    this.silhouette ??= RenderTexture.create({ width: largeur, height: hauteur });
    this.app.renderer.render({
      container: this.couches.sol,
      target: this.silhouette,
      clear: true,
    });
    if (!this.decoupeOmbres) {
      this.decoupeOmbres = new Sprite(this.silhouette);
      this.couches.ombres.addChild(this.decoupeOmbres);
      this.spriteOmbres.mask = this.decoupeOmbres;
    }
    return ms;
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
    this.spriteOmbres = undefined;
    this.decoupeOmbres = undefined;
    this.fondOmbre = undefined;
    this.fondOmbreTaille = "";
    this.signatureOmbres = "";
    this.app.destroy(true, { children: true, texture: true });
    this.monte = false;
  }
}
