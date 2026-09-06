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
    /** `fruitProgress` du protocole : avancement du fruit de l'année ∈ [0,1] */
    fruitProgress?: number;
    /** `fruitsKg` du protocole : les fruits mûrs qui attendent la récolte */
    fruitsKg?: number;
  }[];
  sol: {
    ruMm: number;
    enEau?: boolean[];
    debordementMm?: number[];
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

  return (
    <VueParcelle
      sol={donneesDe(scene)}
      semaineAnnee={scene.week % 52}
      arbres={arbres}
      {...(scene.sol.bordures ? { bordures: scene.sol.bordures } : {})}
      hauteurMaxDe={(especeId) => getEspece(especeId)?.hauteurMaxM ?? 20}
      ombreDe={(a) => a.partFoliaire}
      surCompte={setCompte}
    />
  );
}

const racine = document.getElementById("racine");
if (racine) createRoot(racine).render(<Demo />);
