/**
 * La vue de parcelle, montée pour de vrai.
 *
 * Ce n'est pas le jeu — l'écran de jeu viendra avec ses panneaux et ses
 * actions — mais c'est le composant du jeu, monté sur une scène du moteur, avec
 * ses gestes : on glisse, on zoome à la molette, on tourne aux flèches. C'est ce
 * qui permet de vérifier que le montage PixiJS tient, ce qu'aucune capture
 * d'aperçu ne peut dire.
 */

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getEspece } from "../engine/especes";
import {
  type ContextePhenologique,
  partFoliaireOmbrageanteDans,
  senescenceDans,
} from "../engine/phenologie";
import { VueParcelle } from "../game/VueParcelle";
import type { ArbreAPoser } from "../render/couches/arbres";
import type { DecorBordures } from "../render/couches/decor";
import type { DonneesSol } from "../render/couches/terrain";
import type { Compte } from "../render/pixi/scene";
import { chuteEnCours, DEBOUT } from "../render/temps/chute";

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

  // **La démonstration de l'ellipse, et rien de plus qu'une démonstration.**
  // Les scènes du banc sont un INSTANTANÉ : elles ne portent aucun journal de
  // changements, donc aucune chute réelle à jouer. On en fabrique donc une —
  // les chandelles de la scène, tombant chacune dans une direction tirée de
  // son identifiant — pour voir le mécanisme du §5.11 fonctionner : une
  // déformation à la pose, sans qu'une seule vignette soit recuite.
  //
  // Ce que ce n'est pas : une lecture du protocole. Le jour où le worker
  // livrera `Snapshot.chutes` à la vue, ces directions inventées disparaîtront
  // au profit de `directionRad`, qui est déjà dans le message.
  // Toutes les chandelles, échelonnées par identifiant : où qu'on regarde, il
  // y en a qui tombent. Une `Map` et non un `find` par arbre — le rappel est
  // appelé une fois par arbre et par image, soit quelques milliers de fois par
  // seconde, et c'est exactement le genre de coût que le lot L0 a proscrit.
  const chutes = new Map(
    arbres
      .filter((a) => a.chandelle)
      .map((a) => [
        a.id,
        {
          x: a.x,
          y: a.y,
          heightM: a.heightM,
          directionRad: ((a.id % 360) * Math.PI) / 180,
          debutMs: (a.id % 20) * 400,
        },
      ]),
  );
  const DUREE_CHUTE_MS = 1600;
  // Avancement figé, si l'adresse en demande un : `?chute=0.4`.
  const brut = new URLSearchParams(location.search).get("chute");
  const FIGE = brut === null ? undefined : Math.min(1, Math.max(0, Number(brut)));

  return (
    <VueParcelle
      sol={donneesDe(scene)}
      semaineAnnee={scene.week % 52}
      arbres={arbres}
      {...(scene.sol.bordures ? { bordures: scene.sol.bordures } : {})}
      hauteurMaxDe={(especeId) => getEspece(especeId)?.hauteurMaxM ?? 20}
      ombreDe={(a) => a.partFoliaire}
      surCompte={setCompte}
      deformer={(id, maintenantMs, vue) => {
        const c = chutes.get(id);
        if (!c) return DEBOUT;
        // **`?chute=0.4` FIGE toutes les chandelles à cet avancement**, et
        // c'est ce qui rend la démonstration jugeable. Sans ça, elle est une
        // cible mouvante : la boucle tourne à une image par seconde sur un
        // conteneur sans carte graphique, une chute dure une seconde et demie,
        // et une capture n'attrape jamais deux fois le même instant — j'ai
        // cherché le mouvement dans huit captures avant de comprendre que le
        // problème était l'instrument, pas le mécanisme.
        if (FIGE !== undefined) return chuteEnCours(c, FIGE, vue);
        const dansLaBoucle = maintenantMs % 12000;
        const t = (dansLaBoucle - c.debutMs) / DUREE_CHUTE_MS;
        if (t <= 0) return DEBOUT;
        return chuteEnCours(c, Math.min(1, t), vue);
      }}
    />
  );
}

const racine = document.getElementById("racine");
if (racine) createRoot(racine).render(<Demo />);
