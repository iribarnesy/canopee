/**
 * Compte EXACTEMENT les classes de vignette qu'une animation ajoute.
 *
 * **Hors navigateur, et c'est tout l'intérêt.** J'ai d'abord compté au
 * navigateur, en échantillonnant seize images sur soixante et en additionnant
 * les « classes recuites » : la somme d'un échantillon n'est pas un total, et
 * deux variantes du même code ont donné 965 puis 1 364 sans que rien ne le
 * justifie. Ici on énumère les CLÉS, ce qui est exact, déterministe et
 * instantané.
 *
 * Usage :  npx tsx scripts/apercu-classes.ts [scene]
 */
import { readFileSync } from "node:fs";
import { getEspece } from "../src/engine/especes";
import type { CauseMort } from "../src/engine/trees";
import { ficheDe } from "../src/render/arbres/especes";
import { vueInitiale } from "../src/render/camera";
import { type ArbreAPoser, classeDe, cleClasse } from "../src/render/couches/arbres";
import { mourirEnCours, PALIERS_DE_MORT, TRAJECTOIRES } from "../src/render/temps/mort";

const nom = process.argv[2] ?? "pelouse-arbres-s28";
type TigeDeScene = {
  id: number;
  especeId: string;
  x: number;
  y: number;
  heightM: number;
  chandelle?: boolean;
  baseHouppierM?: number;
  vigueur?: number;
};
const scene = JSON.parse(readFileSync(`apercu/scenes/${nom}.json`, "utf8")) as {
  coteM: number;
  trees: TigeDeScene[];
};
const vue = vueInitiale(scene.coteM, 1100, 800, 0);
const hauteurMaxDe = (id: string) => getEspece(id)?.hauteurMaxM ?? 20;

const arbres: ArbreAPoser[] = scene.trees
  .filter((t) => t.heightM > 0 && !t.chandelle && !ficheDe(t.especeId)?.fourre)
  .map((t) => ({
    id: t.id,
    especeId: t.especeId,
    x: t.x,
    y: t.y,
    z: 0,
    heightM: t.heightM,
    houppierRatio: getEspece(t.especeId)?.lumiere.houppierRatio ?? 0.4,
    baseHouppierM: t.baseHouppierM ?? 0,
    partFoliaire: 1,
    senescence: 0,
    vigueur: t.vigueur ?? 1,
  }));

const repos = new Set<string>();
for (const a of arbres) repos.add(cleClasse(classeDe(a, hauteurMaxDe(a.especeId), vue)));
console.log(`${nom} : ${arbres.length} arbres vivants, ${repos.size} classes au repos`);

for (const cause of Object.keys(TRAJECTOIRES) as CauseMort[]) {
  const toutes = new Set(repos);
  for (let k = 0; k < PALIERS_DE_MORT; k++) {
    const t = k / (PALIERS_DE_MORT - 1);
    for (const a of arbres) {
      const e = mourirEnCours(
        cause,
        {
          partFoliaire: a.partFoliaire,
          senescence: a.senescence,
          vigueur: a.vigueur,
          dommageHydraulique: a.dommageHydraulique ?? 0,
        },
        t,
      );
      toutes.add(
        cleClasse(
          classeDe(
            {
              ...a,
              partFoliaire: e.partFoliaire,
              senescence: e.senescence,
              vigueur: e.vigueur,
              dommageHydraulique: e.dommageHydraulique,
              ...(e.chandelle ? { chandelle: true } : {}),
            },
            hauteurMaxDe(a.especeId),
            vue,
          ),
        ),
      );
    }
  }
  const ajout = toutes.size - repos.size;
  console.log(
    `  ${cause.padEnd(15)} ${String(toutes.size).padStart(5)} classes  (+${ajout}, soit ${(ajout / repos.size).toFixed(1)} × le repos)`,
  );
}
