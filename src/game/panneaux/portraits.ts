/**
 * Le **portrait** d'une essence : la même silhouette que sur la parcelle, cuite
 * une fois pour qu'on puisse la regarder de près.
 *
 * Les vingt-cinq silhouettes existent déjà et ne servaient qu'au peuplement.
 * On choisissait pourtant son essence sur un nom et un prix — « Arbousier
 * (9 €) » — sans jamais voir l'arbre qu'on plante.
 *
 * **Rien n'est redessiné ici.** Le portrait passe par `classeDe` puis
 * `cuireVignette`, exactement comme un arbre de la parcelle : une classe
 * écrite à la main dériverait de la vraie au premier champ ajouté, et ce
 * fichier a déjà coûté trois passes à quelqu'un (voir `poserArbres`).
 */

import { getEspece } from "../../engine/especes";
import type { Vue } from "../../render/camera";
import { type ArbreAPoser, classeDe, cleClasse, cuireVignette } from "../../render/couches/arbres";
import { METRE_VERTICAL_PX } from "../../render/projection";

/** Hauteur du sujet portraituré, en part de la hauteur maximale de l'espèce. */
const PART_ADULTE = 0.75;

/**
 * La taille de cuisson visée, en pixels — la même pour **tous** les portraits.
 *
 * Le zoom ne cadre rien ici : `classeDe` s'en sert pour décider la finesse de
 * cuisson, et rien d'autre. Un zoom **fixe** la faisait donc dépendre de la taille
 * de l'arbre — 16 pixels pour un semis d'un mètre, 256 pour un chêne — c'est-à-
 * dire une vignette floue pour les petits et, pour les grands, quatre fois le
 * travail nécessaire à une image affichée en 74 pixels. On vise la taille de
 * **sortie** et on en déduit le zoom : chaque portrait coûte la même chose, et
 * aucun n'est flou.
 */
const TAILLE_DU_PORTRAIT_PX = 128;

const dejaCuits = new Map<string, string>();

/** Combien d'images on garde en mémoire — voir le bornage dans `portraitDeLArbre`. */
export const PORTRAITS_GARDES = 200;

/** La vue du portrait : elle ne cadre rien, elle décide la finesse de cuisson. */
function vueDuPortrait(hauteurM: number): Vue {
  return {
    cam: {
      coteM: 100,
      zoom: TAILLE_DU_PORTRAIT_PX / (Math.max(0.1, hauteurM) * METRE_VERTICAL_PX * 1.2),
      orientation: 0,
    },
    centre: { x: 50, y: 50 },
    largeurPx: 400,
    hauteurPx: 400,
  };
}

/**
 * **le portrait d'un arbre particulier** — celui qu'on suit, tel qu'il est (#149).
 *
 * « Peut-être voir le sprite de l'arbre, pour voir ce qu'il a en moins que
 * prévu. » C'est exactement la même cuisson que sur la parcelle : on lui donne
 * l'arbre **posé** que la scène dessine (`arbresAPoser`), et il en sort la même
 * silhouette, en grand. Un houppier clairsemé, une cime sèche, un fût nu sur
 * dix mètres se voient alors d'un coup d'œil, là où la fiche les épelle.
 *
 * **La clé du cache est celle de la classe**, plus les deux grandeurs que la
 * cuisson prend hors classe — **arrondies** au demi-mètre. C'est ce qui rend
 * l'affaire abordable quand on suit cent quarante-neuf bouleaux : ils partagent
 * une poignée de classes, donc une poignée d'images, et un arbre qui grandit
 * de dix centimètres ne fait pas recuire la sienne. À soixante-quatorze pixels,
 * ce demi-mètre ne se voit pas ; sans lui, chaque semaine de croissance
 * invaliderait tout.
 */
/**
 * **la clé** d'un portrait, sans le cuire.
 *
 * Elle sert à savoir s'il y a quelque chose à refaire : une cuisson coûte
 * **175 ms** sur la machine de mesure (sans carte graphique, `toDataURL`
 * compris), et redessiner trente silhouettes à chaque instantané figeait
 * l'interface cinq secondes — mesuré, volet ouvert à ×13. Comparer deux clés
 * coûte une comparaison de chaînes.
 */
export function cleDuPortrait(arbre: ArbreAPoser, hauteurMaxM: number): string {
  const hauteurM = Math.max(0.1, Math.round(arbre.heightM * 2) / 2);
  const baseHouppierM = Math.min(hauteurM, Math.round(arbre.baseHouppierM * 2) / 2);
  return `${cleClasse(classeDe(arbre, hauteurMaxM, vueDuPortrait(arbre.heightM)))}|${hauteurM}|${baseHouppierM}`;
}

export function portraitDeLArbre(arbre: ArbreAPoser, hauteurMaxM: number): string | undefined {
  if (arbre.heightM <= 0) return undefined;
  const hauteurM = Math.max(0.1, Math.round(arbre.heightM * 2) / 2);
  const baseHouppierM = Math.min(hauteurM, Math.round(arbre.baseHouppierM * 2) / 2);
  const classe = classeDe(arbre, hauteurMaxM, vueDuPortrait(arbre.heightM));
  const cle = `${cleClasse(classe)}|${hauteurM}|${baseHouppierM}`;
  const deja = dejaCuits.get(cle);
  if (deja) return deja;
  const vignette = cuireVignette(
    classe,
    hauteurM,
    arbre.houppierRatio,
    (largeur, hauteur) => {
      const c = document.createElement("canvas");
      c.width = largeur;
      c.height = hauteur;
      return c;
    },
    baseHouppierM,
    arbre.teteTrogneM
      ? {
          teteTrogneM: arbre.teteTrogneM,
          diametreTeteCm: arbre.diametreTeteCm ?? 0,
          caviteTeteL: arbre.caviteTeteL ?? 0,
        }
      : undefined,
  );
  const url = vignette.image.toDataURL();
  // Le cache est **borné** : une partie de cinquante ans traverse des centaines de
  // classes, et chaque image est une `data:` URL de plusieurs kilo-octets. On
  // jette la plus ancienne — celle d'un arbre qui a grandi depuis.
  if (dejaCuits.size >= PORTRAITS_GARDES) {
    const premiere = dejaCuits.keys().next();
    if (!premiere.done) dejaCuits.delete(premiere.value);
  }
  dejaCuits.set(cle, url);
  return url;
}

/**
 * **Le même arbre en pleine forme** : même espèce, même taille, rien d'autre.
 *
 * C'est le **témoin** de la comparaison, et il est honnête parce qu'il ne change
 * qu'une chose à la fois — la santé et le port, pas la taille. Il ne dit pas
 * « voilà ce que cet arbre aurait dû être à son âge » : le moteur ne donne
 * aucune hauteur attendue pour un âge, et l'inventer serait refaire sa
 * croissance chez nous. Le retard, lui, se lit en chiffres dans la fiche —
 * vigueur et élancement — qui sont les réponses du moteur à cette question-là.
 */
export function portraitEnPleineForme(arbre: ArbreAPoser, hauteurMaxM: number): string | undefined {
  return portraitDeLArbre(
    {
      id: arbre.id,
      especeId: arbre.especeId,
      x: 0,
      y: 0,
      z: 0,
      heightM: arbre.heightM,
      houppierRatio: arbre.houppierRatio,
      // Un arbre de plein vent, branchu bas : le port de l'espèce, pas le fût
      // que la compétition fabrique.
      baseHouppierM: arbre.heightM * 0.25,
      partFoliaire: 1,
      senescence: 0,
      vigueur: 1,
    },
    hauteurMaxM,
  );
}

/**
 * Le portrait d'une essence, en `data:` URL, cuit à la première demande.
 *
 * Rendu en URL et non en canvas : le portrait sert dans du JSX, où une image
 * se pose et se redimensionne, alors qu'un canvas demanderait un `ref` et un
 * effet par vignette.
 */
export function portraitDEspece(especeId: string): string | undefined {
  const deja = dejaCuits.get(especeId);
  if (deja) return deja;
  const espece = getEspece(especeId);
  if (!espece) return undefined;

  const hauteurM = Math.max(0.6, espece.hauteurMaxM * PART_ADULTE);
  const arbre: ArbreAPoser = {
    id: -1,
    especeId,
    x: 0,
    y: 0,
    z: 0,
    heightM: hauteurM,
    houppierRatio: espece.lumiere.houppierRatio,
    // Un arbre de plein vent, branchu bas : c'est le port de l'espèce qu'on
    // montre, pas le fût nu que la compétition fabrique en futaie.
    baseHouppierM: hauteurM * 0.25,
    partFoliaire: 1,
    senescence: 0,
    vigueur: 1,
  };
  const url = portraitDeLArbre(arbre, espece.hauteurMaxM);
  if (url) dejaCuits.set(especeId, url);
  return url;
}
