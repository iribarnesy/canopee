/**
 * La vue de parcelle, montée pour de vrai.
 *
 * Ce n'est pas le jeu — l'écran de jeu viendra avec ses panneaux et ses
 * actions — mais c'est le composant du jeu, monté sur une scène du moteur, avec
 * ses gestes : on glisse, on zoome à la molette, on tourne aux flèches. C'est ce
 * qui permet de vérifier que le montage PixiJS tient, ce qu'aucune capture
 * d'aperçu ne peut dire.
 */

import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { GesteTypeZone } from "../engine/actions";
import { getEspece } from "../engine/especes";
import {
  type ContextePhenologique,
  partFoliaireOmbrageanteDans,
  senescenceDans,
} from "../engine/phenologie";
import { VueParcelle } from "../game/VueParcelle";
import { ficheDe } from "../render/arbres/especes";
import type { ArbreAPoser } from "../render/couches/arbres";
import type { DecorBordures } from "../render/couches/decor";
import type { DonneesSol } from "../render/couches/terrain";
import type { Compte } from "../render/pixi/scene";
import { type JournalDeSemaine, planDEllipse } from "../render/temps/ellipse";
import {
  deformationDe,
  indexerLesChutes,
  indexerLesVoiles,
  voilesEnCours,
} from "../render/temps/lecteur";

interface Scene {
  coteM: number;
  week: number;
  trees: {
    id: number;
    especeId: string;
    x: number;
    y: number;
    heightM: number;
    chandelle: boolean;
    hauteurElagueeM?: number;
    teteTrogneM?: number;
    /** `baseHouppierM` du protocole : la base du houppier, m */
    baseHouppierM?: number;
    /** `floraison` du protocole : part de la couronne en fleur ∈ [0,1] */
    floraison?: number;
    vigueur?: number;
    /** `dommageHydraulique` du protocole : la cime sèche ∈ [0,1] */
    dommageHydraulique?: number;
    /** `brulEeSemaine` du protocole : présent = le feu l'a tué */
    brulEeSemaine?: number;
    /** `protege` du protocole : plant sous manchon */
    protege?: boolean;
    /** `recepages` du protocole : nombre d'étêtages subis */
    recepages?: number;
    /** `frotteSemaine` du protocole : présent = un brocard l'a frotté */
    frotteSemaine?: number;
    /** `derniereLeveeSemaine` du protocole : la semaine du dernier démasclage */
    derniereLeveeSemaine?: number;
    /** `brouteSemaine` du protocole : présent = un chevreuil l'a brouté */
    brouteSemaine?: number;
    /** `diametreTeteCm` du protocole : le renflement à dessiner, cm */
    diametreTeteCm?: number;
    /** `caviteTeteL` du protocole : le creux, en litres */
    caviteTeteL?: number;
    /** `fruitProgress` du protocole : avancement du fruit de l'année ∈ [0,1] */
    fruitProgress?: number;
    /** `fruitsKg` du protocole : les fruits mûrs qui attendent la récolte */
    fruitsKg?: number;
  }[];
  sol: {
    ruMm: number;
    enEau?: boolean[];
    debordementMm?: number[];
    /** `Snapshot.soilBoisAuSol` : bois mort couché, g C/m² */
    boisAuSol?: number[];
    /** `Snapshot.soilBoisEnTravers` : sa transversalité ∈ [0,1] */
    boisEnTravers?: number[];
    altitudesM: number[];
    waterMm: number[];
    herbeCouverture: number[];
    herbeBiomasse: number[];
    litiereCG: number[];
    lumiere?: number[];
    herbeHumidite?: number[];
    bordures?: DecorBordures;
    pheno?: ContextePhenologique;
  };
}

function donneesDe(scene: Scene): DonneesSol {
  const n = scene.coteM * scene.coteM;
  const humidite = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    humidite[i] = Math.min(1, Math.max(0, (scene.sol.waterMm[i] ?? 0) / scene.sol.ruMm));
  }
  return {
    coteM: scene.coteM,
    altitudesM: scene.sol.altitudesM,
    humidite,
    herbe: Float32Array.from(scene.sol.herbeCouverture),
    herbeBiomasse: Float32Array.from(scene.sol.herbeBiomasse),
    litiereCG: Float32Array.from(scene.sol.litiereCG),
    ...(scene.sol.lumiere ? { lumiere: Float32Array.from(scene.sol.lumiere) } : {}),
    ...(scene.sol.herbeHumidite
      ? { herbeHumidite: Float32Array.from(scene.sol.herbeHumidite) }
      : {}),
    ...(scene.sol.enEau ? { enEau: scene.sol.enEau } : {}),
    ...(scene.sol.boisAuSol ? { boisAuSol: Float32Array.from(scene.sol.boisAuSol) } : {}),
    ...(scene.sol.boisEnTravers
      ? { boisEnTravers: Float32Array.from(scene.sol.boisEnTravers) }
      : {}),
    ...(scene.sol.debordementMm
      ? { debordementMm: Float32Array.from(scene.sol.debordementMm) }
      : {}),
  };
}

/**
 * Durée d'écran d'une ellipse, ms.
 *
 * Deux secondes et demie, et c'est un BUDGET : c'est tout l'intérêt du §5.11 —
 * le joueur qui saute une semaine et celui qui saute dix ans attendent le même
 * temps, l'un voyant quatre actes et l'autre quarante.
 */
const DUREE_ELLIPSE_MS = 2500;

/**
 * Où en est la lecture : l'horloge, ou l'avancement figé par `?ellipse=`.
 *
 * Partagée par les deux rappels — la déformation des arbres et le voile des
 * gestes — parce que deux horloges qui devraient être la même finissent par ne
 * plus l'être. La boucle tourne un peu plus longtemps que l'ellipse pour qu'on
 * voie l'état d'arrivée avant qu'elle ne reprenne.
 */
function ouLire(maintenantMs: number, fige: number | undefined, dureeMs: number): number {
  return fige === undefined ? maintenantMs % (DUREE_ELLIPSE_MS * 1.6) : fige * dureeMs;
}

function Demo(): React.ReactElement {
  const [scene, setScene] = useState<Scene>();
  const [compte, setCompte] = useState<Compte>();

  useEffect(() => {
    const nom = new URLSearchParams(location.search).get("scene") ?? "friche-s28";
    void fetch(`/apercu/scenes/${nom}.json`)
      .then((r) => r.json())
      .then((s: Scene) => setScene(s));
  }, []);

  useEffect(() => {
    const etat = document.getElementById("etat");
    if (etat) etat.textContent = scene ? "" : "chargement de la scène…";
  }, [scene]);

  // **L'ellipse, branchée de bout en bout** : un journal de changements, un
  // plan, un lecteur, une déformation à la pose. C'est le chemin que le jeu
  // suivra ; seule l'origine du journal est postiche ici.
  //
  // Postiche parce que les scènes du banc sont un INSTANTANÉ : elles ne
  // portent aucun journal. On en fabrique donc un — les chandelles de la scène
  // qui ne sont pas du fourré, tombant chacune dans une direction tirée de son
  // identifiant. Le jour où le worker livrera `Snapshot.chutes` à la vue, ces
  // deux champs inventés (la direction, la masse) laisseront place à ceux du
  // message, qui les porte déjà — et rien d'autre ne changera.
  //
  // **Le fourré est écarté et il faut le savoir** : `separerLeFourre` agrège
  // les ronces par carreau, elles perdent leur identité, donc rien ne peut les
  // animer une par une. Sur une friche à trente ans, 1 874 des 1 918
  // chandelles sont des ronces — ce qui tombe, ce sont les quelques dizaines
  // d'arbres restants.
  //
  // `?ellipse-tout=1` fait tomber TOUS les arbres et non les seules
  // chandelles. **Ce n'est pas une scène, c'est un banc de mécanisme, et il
  // fallait le construire** : les quelques dizaines de chandelles non-fourré
  // d'un hectare font quelques pixels au zoom de parcelle, et il n'y en a
  // aucune dans le cadre au zoom rapproché. J'ai cherché le mouvement dans une
  // quinzaine de captures avant d'admettre que le sujet manquait, pas le
  // mécanisme.
  //
  // **Le tout AVANT le retour anticipé**, et pas après : des `useMemo` placés
  // sous un `if (!scene) return` s'exécutent en nombre variable d'un rendu à
  // l'autre, et React refuse — « Rendered more hooks than during the previous
  // render ». La page ne chargeait plus du tout.
  const ellipse = useMemo(() => {
    const tout = new URLSearchParams(location.search).get("ellipse-tout") === "1";
    const journal: JournalDeSemaine = {
      chutes: (scene?.trees ?? [])
        .filter((t) => t.heightM > 0 && (tout ? true : t.chandelle) && !ficheDe(t.especeId)?.fourre)
        .map((t) => ({
          id: t.id,
          x: t.x,
          y: t.y,
          especeId: t.especeId,
          heightM: t.heightM,
          directionRad: ((t.id % 360) * Math.PI) / 180,
          masseKgC: 0,
          empreinte: [],
        })),
    };
    // Indexé UNE FOIS : le rappel de déformation est appelé une fois par arbre
    // et par image, et une recherche linéaire à cet endroit-là ne tient pas —
    // trois mille chutes en donnaient neuf millions de comparaisons par image,
    // et la page ne finissait jamais de charger.
    // `?geste=chauler&geste-rayon=18` ajoute un geste de zone POSTICHE, au
    // centre de la parcelle. Postiche pour la même raison que les chutes — un
    // instantané ne porte pas de journal — mais la maille est celle du moteur :
    // des indices `y * coteM + x`, ceux que `applyChauler` rend vraiment.
    const quel = new URLSearchParams(location.search).get("geste");
    if (quel && scene) {
      const rayon = Number(new URLSearchParams(location.search).get("geste-rayon") ?? 18);
      const c = scene.coteM / 2;
      const cellules: number[] = [];
      for (let y = 0; y < scene.coteM; y++) {
        for (let x = 0; x < scene.coteM; x++) {
          if ((x + 0.5 - c) ** 2 + (y + 0.5 - c) ** 2 <= rayon * rayon) {
            cellules.push(y * scene.coteM + x);
          }
        }
      }
      journal.gestes = [{ type: quel as GesteTypeZone, cellules }];
    }
    const plan = planDEllipse([journal], DUREE_ELLIPSE_MS);
    // La DURÉE du plan et non le budget : un plan vide dure zéro, et c'est ce
    // zéro-là qu'il faut porter pour que `?ellipse=` ne prétende pas figer une
    // ellipse qui n'existe pas.
    return {
      index: indexerLesChutes(plan),
      voiles: indexerLesVoiles(plan, scene?.coteM ?? 1),
      dureeMs: plan.dureeMs,
    };
  }, [scene]);

  useEffect(() => {
    const boite = document.getElementById("compte");
    if (!boite) return;
    boite.textContent = compte
      ? [
          `sprites   ${compte.spritesPoses}`,
          `pose      ${compte.msPose.toFixed(2)} ms`,
          `cuisson   ${compte.msCuisson.toFixed(2)} ms`,
          `sol cuit  ${compte.morceauxCuits}`,
          `décor     ${compte.decorCuit}`,
          `classes   ${compte.classesCuites}`,
          `sol att. ${compte.solEnRetard}`,
          `décor a. ${compte.decorEnRetard}`,
          `arbres a. ${compte.arbresEnRetard}`,
        ].join("\n")
      : "";
  }, [compte]);

  if (!scene) return <div />;
  const pheno = scene.sol.pheno;
  const arbres: ArbreAPoser[] = scene.trees
    .filter((t) => t.heightM > 0)
    .map((t) => {
      const espece = getEspece(t.especeId);
      const part = espece && pheno ? partFoliaireOmbrageanteDans(espece, pheno) : 1;
      return {
        id: t.id,
        especeId: t.especeId,
        x: t.x,
        y: t.y,
        z:
          scene.sol.altitudesM[
            Math.min(scene.coteM - 1, Math.floor(t.y)) * scene.coteM +
              Math.min(scene.coteM - 1, Math.floor(t.x))
          ] ?? 0,
        heightM: t.heightM,
        houppierRatio: espece?.lumiere.houppierRatio ?? 0.4,
        baseHouppierM: t.baseHouppierM ?? 0,
        ...(t.teteTrogneM ? { teteTrogneM: t.teteTrogneM } : {}),
        ...(t.chandelle ? { chandelle: true } : {}),
        ...(t.brulEeSemaine === undefined ? {} : { brulee: true }),
        ...(t.protege ? { protege: true } : {}),
        ...(t.recepages ? { recepages: t.recepages } : {}),
        ...(t.frotteSemaine === undefined ? {} : { frotte: true }),
        ...(t.brouteSemaine === undefined ? {} : { broute: true }),
        ...(t.diametreTeteCm ? { diametreTeteCm: t.diametreTeteCm } : {}),
        ...(t.caviteTeteL ? { caviteTeteL: t.caviteTeteL } : {}),
        // Une DURÉE, pas une présence : le moteur donne la rotation, donc on
        // peut dire où en est l'écorce et pas seulement qu'elle a été levée.
        ...(t.derniereLeveeSemaine === undefined
          ? {}
          : { semainesDepuisLevee: Math.max(0, scene.week - t.derniereLeveeSemaine) }),
        partFoliaire: t.chandelle ? 0 : part,
        senescence: espece && pheno ? senescenceDans(espece, pheno) : 0,
        vigueur: t.vigueur ?? 1,
        ...(t.dommageHydraulique ? { dommageHydraulique: t.dommageHydraulique } : {}),
      };
    });

  // `?ellipse=0.4` FIGE la lecture à cet avancement, et c'est ce qui rend la
  // démonstration jugeable : une animation qui tourne à une image par seconde
  // sur un conteneur sans carte graphique n'est pas observable autrement.
  const brut = new URLSearchParams(location.search).get("ellipse");
  const fige = brut === null ? undefined : Math.min(1, Math.max(0, Number(brut)));

  return (
    <VueParcelle
      sol={donneesDe(scene)}
      semaineAnnee={scene.week % 52}
      arbres={arbres}
      {...(scene.sol.bordures ? { bordures: scene.sol.bordures } : {})}
      hauteurMaxDe={(especeId) => getEspece(especeId)?.hauteurMaxM ?? 20}
      ombreDe={(a) => a.partFoliaire}
      surCompte={setCompte}
      deformer={(id, maintenantMs, vue) =>
        deformationDe(ellipse.index, ouLire(maintenantMs, fige, ellipse.dureeMs), id, vue)
      }
      voiler={(maintenantMs) =>
        voilesEnCours(ellipse.voiles, ouLire(maintenantMs, fige, ellipse.dureeMs))
      }
    />
  );
}

const racine = document.getElementById("racine");
if (racine) createRoot(racine).render(<Demo />);
