/**
 * **Le bilan de période** (#128, §6.8 №2) : ce qui s'est passé entre deux dates,
 * groupé, chiffré, et **situé**.
 *
 * ## Pourquoi il existe
 *
 * Le calque des changements et lui sont les deux moitiés d'une même lecture, et
 * `changements.ts` le dit déjà noir sur blanc : au-delà de `TIGES_PAR_GESTE_MAX`
 * un geste n'est plus pointé tige par tige, et le compte des changements non
 * pointés revient à l'appelant *« parce que c'est le bilan de période (§6.8 №2)
 * qui est le bon outil dans ce cas »*. Sur la friche de référence : quarante-cinq
 * marqueurs, et **sept mille neuf cent soixante-six changements que personne ne
 * montre**. Le calque dit **où**, le bilan dit **quoi** et **combien** — « le gibier a
 * brouté partout, encore » en trois mots plutôt qu'en huit mille repères.
 *
 * ## Ce qu'il n'est pas
 *
 * **Ce n'est pas le fil du journal.** Le worker écrit une ligne par instantané,
 * avec ce que le moteur seul sait — le pH sous l'arbre qui a tué, la gamme de
 * l'espèce, la hauteur du plus grand mort. Le bilan, lui, ne lit que ce qui
 * voyage dans l'instantané, et il couvre une **période** : cinquante instantanés
 * qui disent chacun « deux aulnes asphyxiés » font une ligne à cent.
 *
 * Les deux disent donc parfois la même chose, et le §2.1 veut savoir laquelle
 * des deux tient la règle. Réponse : **aucune des deux ne tient de règle**. Le
 * groupement est une somme, pas un calcul — il n'y a rien qui puisse diverger.
 * Ce qui pouvait diverger, c'est le **vocabulaire**, et il est tenu ailleurs :
 * `mots.ts` tient l'accord des noms d'essence, le genre de chacune, et la
 * cause de mort accordable. Le fil du journal, la fiche d'un arbre, le volet
 * des suivis et ce bilan lisent tous ces mêmes tables.
 *
 * ## Comment il est fait
 *
 * **Un pli, et pas une archive.** On pourrait garder les journaux et les
 * regrouper à l'affichage ; ce serait des dizaines de milliers de morts et de
 * semis retenus pour en afficher quinze lignes. `agreger` replie chaque journal
 * dans le bilan à mesure qu'il arrive, et le bilan ne grandit qu'avec le nombre
 * de **combinaisons** (essence × cause), qui est borné par le catalogue.
 *
 * Le centre de gravité se tient de la même façon, par les sommes : une ligne
 * qui porte mille morts n'a pas besoin de mille positions pour savoir où
 * cadrer la caméra.
 *
 * Module **pur** : pas de React, pas de DOM, pas d'horloge.
 */

import { estGesteSurArbres, type GesteType } from "../engine/actions";
import type { StadeDeDeveloppement } from "../engine/stades";
import type { CauseMort } from "../engine/trees";
import { centreDesCellules } from "../render/temps/changements";
import type { JournalDeSemaine } from "../render/temps/ellipse";
import { accord, causeDite, estFeminin, nomEspeces, s } from "./mots";

/** De quelle nature est une ligne de bilan. */
export type SorteDeBilan = "feu" | "tempete" | "mort" | "chute" | "geste" | "naissance" | "montee";

/**
 * Ce que le bilan retient d'une sorte de changement.
 *
 * Les sommes de positions plutôt que les positions : voir l'en-tête. `places`
 * compte les membres qui en avaient une — un franchissement de stade ne porte
 * qu'un identifiant, et l'arbre peut avoir disparu de l'instantané depuis.
 */
export interface LigneDeBilan {
  sorte: SorteDeBilan;
  /** l'essence, quand la sorte en nomme une */
  especeId?: string;
  /** la cause de mort, pour les morts */
  cause?: CauseMort;
  /** le type de geste, pour les gestes */
  geste?: GesteType;
  /** le stade **atteint**, pour les montées */
  stade?: StadeDeDeveloppement;
  /** combien : des tiges, ou des m² pour le feu */
  combien: number;
  /** sommes des positions des membres situés, m */
  sx: number;
  sy: number;
  /** combien de membres ont donné une position */
  places: number;
  /** la première et la dernière semaine où cette ligne a bougé */
  premiereSemaine: number;
  derniereSemaine: number;
}

/** Ce qui s'est passé sur une période, une ligne par combinaison. */
export type Bilan = ReadonlyMap<string, LigneDeBilan>;

export const BILAN_VIDE: Bilan = new Map();

/** La clé d'une ligne : ce qui la distingue de toutes les autres. */
function cleDe(
  l: Omit<LigneDeBilan, "combien" | "sx" | "sy" | "places" | "premiereSemaine" | "derniereSemaine">,
): string {
  return [l.sorte, l.especeId ?? "", l.cause ?? "", l.geste ?? "", l.stade ?? ""].join("|");
}

/**
 * Le centre de gravité d'un lot d'arbres nommés par identifiant.
 *
 * Les inconnus sont **sautés**, pas placés à l'origine : un arbre abattu a quitté
 * l'instantané, et le compter au coin de la parcelle tirerait le centre vers un
 * endroit où rien ne s'est passé. Quand aucun n'est connu, il n'y a pas de
 * centre — la ligne existera sans endroit.
 */
function centreDesArbres(
  ids: readonly number[],
  positionDe: (idArbre: number) => { x: number; y: number } | undefined,
): { x: number; y: number } | undefined {
  let sx = 0;
  let sy = 0;
  let places = 0;
  for (const id of ids) {
    const p = positionDe(id);
    if (p) {
      sx += p.x;
      sy += p.y;
      places++;
    }
  }
  return places > 0 ? { x: sx / places, y: sy / places } : undefined;
}

/**
 * Replie un journal de semaine dans le bilan.
 *
 * `positionDe` rend la position d'un arbre par identifiant, quand l'appelant la
 * connaît — les gestes et les franchissements ne nomment que des identifiants.
 * Un identifiant inconnu fait une ligne **sans** position plutôt qu'une ligne
 * placée à l'origine : mieux vaut une ligne qu'on ne peut pas suivre du doigt
 * qu'un doigt qui montre un coin de parcelle où rien ne s'est passé.
 *
 * Rend un bilan **neuf** : React compare par identité, et replier en place ferait
 * un panneau qui ne se redessine pas.
 */
export function agreger(
  bilan: Bilan,
  journal: JournalDeSemaine,
  semaine: number,
  coteM: number,
  positionDe: (idArbre: number) => { x: number; y: number } | undefined = () => undefined,
): Bilan {
  const suite = new Map(bilan);
  const ajouter = (
    trait: Omit<
      LigneDeBilan,
      "combien" | "sx" | "sy" | "places" | "premiereSemaine" | "derniereSemaine"
    >,
    combien: number,
    ou?: { x: number; y: number },
  ) => {
    if (combien <= 0) return;
    const cle = cleDe(trait);
    const deja = suite.get(cle);
    const ligne: LigneDeBilan = deja
      ? { ...deja }
      : {
          ...trait,
          combien: 0,
          sx: 0,
          sy: 0,
          places: 0,
          premiereSemaine: semaine,
          derniereSemaine: semaine,
        };
    ligne.combien += combien;
    if (ou) {
      ligne.sx += ou.x * combien;
      ligne.sy += ou.y * combien;
      ligne.places += combien;
    }
    ligne.premiereSemaine = Math.min(ligne.premiereSemaine, semaine);
    ligne.derniereSemaine = Math.max(ligne.derniereSemaine, semaine);
    suite.set(cle, ligne);
  };

  for (const m of journal.morts ?? []) {
    ajouter({ sorte: "mort", especeId: m.especeId, cause: m.cause }, 1, m);
  }
  for (const c of journal.chutes ?? []) {
    ajouter({ sorte: "chute", especeId: c.especeId }, 1, c);
  }
  for (const n of journal.naissances ?? []) {
    ajouter({ sorte: "naissance", especeId: n.especeId }, 1, n);
  }
  for (const f of journal.franchissements ?? []) {
    ajouter({ sorte: "montee", stade: f.versStade }, 1, positionDe(f.id));
  }
  for (const geste of journal.gestes ?? []) {
    if (estGesteSurArbres(geste)) {
      // **Le centre de gravité d'abord, l'ajout ensuite**, et pas un ajout par
      // tige : un seul geste de broutage porte deux mille tiges, une semaine de
      // friche en porte quatre, et un instantané couvre jusqu'à vingt-six
      // semaines. Passer tige par tige, c'était deux cent mille copies de ligne
      // par instantané pour un résultat identique.
      ajouter(
        { sorte: "geste", geste: geste.type },
        geste.ids.length,
        centreDesArbres(geste.ids, positionDe),
      );
      continue;
    }
    // Un geste de **zone** se compte en cellules, c'est-à-dire en m² : « labouré
    // 340 m² » dit ce qu'on a fait, « 1 labour » ne dit rien.
    ajouter(
      { sorte: "geste", geste: geste.type },
      geste.cellules.length,
      centreDesCellules(geste.cellules, coteM),
    );
  }
  const feu = journal.incendie;
  if (feu) {
    ajouter({ sorte: "feu" }, feu.cellulesBrulees, centreDesCellules([...feu.brulees], coteM));
  }
  const tempete = journal.tempete;
  if (tempete) {
    // Les arbres **versés** seulement : un arbre ébranché est debout, et compter
    // les trois catégories ensemble dirait une catastrophe là où il y a du
    // ménage à faire. Les victimes portent un identifiant, donc une position.
    ajouter(
      { sorte: "tempete" },
      tempete.arbresVerses,
      centreDesArbres(
        tempete.victimes.map((v) => v.id),
        positionDe,
      ),
    );
  }
  return suite;
}

/**
 * **Ce qui s'est passé depuis**, c'est-à-dire un bilan moins un autre.
 *
 * **Une soustraction plutôt qu'un second cumul**, et c'est le §2.1 qui tranche :
 * le bilan de la partie et celui de la période sont la même quantité sur deux
 * fenêtres. Les compter deux fois, c'est se donner deux chances de compter
 * faux — et le jour où l'un se corrige, l'autre ment.
 *
 * Elle marche parce que le bilan ne retient que des **sommes** : les comptes, les
 * positions, les places. Un centre de gravité se soustrait comme le reste.
 *
 * Ce qui ne se soustrait pas, c'est la **date** : le bilan ne garde pas quelle
 * semaine a apporté quoi, donc la première semaine d'une ligne héritée du passé
 * serait celle d'avant la période. On la ramène à `depuis`, qui est vrai par
 * construction — la période commence là.
 */
export function soustraire(bilan: Bilan, reference: Bilan, depuis: number): Bilan {
  const reste = new Map<string, LigneDeBilan>();
  for (const [cle, ligne] of bilan) {
    const avant = reference.get(cle);
    if (!avant) {
      reste.set(cle, ligne);
      continue;
    }
    const combien = ligne.combien - avant.combien;
    if (combien <= 0) continue;
    reste.set(cle, {
      ...ligne,
      combien,
      sx: ligne.sx - avant.sx,
      sy: ligne.sy - avant.sy,
      places: ligne.places - avant.places,
      premiereSemaine: Math.max(ligne.premiereSemaine, depuis),
      derniereSemaine: ligne.derniereSemaine,
    });
  }
  return reste;
}

/** Une ligne de bilan prête à lire : sa phrase, son icône, son endroit. */
export interface LigneLue {
  cle: string;
  icone: string;
  /** la phrase déjà accordée : « 34 bouleaux verruqueux morts de sécheresse » */
  texte: string;
  combien: number;
  /** où cadrer la caméra, quand la ligne sait le dire */
  ou?: { x: number; y: number };
  premiereSemaine: number;
  derniereSemaine: number;
}

/**
 * L'ordre des sortes, et il n'est pas celui des comptes.
 *
 * **Un feu de quarante cellules compte plus qu'un millier de tiges broutées**,
 * et le nombre ne le dit pas : le broutage est le bruit de fond d'une friche,
 * l'incendie est l'événement d'une partie. Les catastrophes d'abord, puis ce
 * qui a disparu, puis ce qu'on a fait, puis ce qui est arrivé — et à sorte
 * égale, le plus gros compte d'abord.
 */
const RANG: Record<SorteDeBilan, number> = {
  feu: 0,
  tempete: 1,
  mort: 2,
  chute: 3,
  geste: 4,
  naissance: 5,
  montee: 6,
};

const ICONE: Record<SorteDeBilan, string> = {
  feu: "🔥",
  tempete: "🌬",
  mort: "💀",
  chute: "🪵",
  geste: "✋",
  naissance: "🌱",
  montee: "📈",
};

/**
 * Ce qu'un geste a fait, dit au passé et au pluriel, avec ce qu'il compte.
 *
 * `quoi` est l'objet compté : des **tiges** pour les gestes sur arbres, des mètres
 * carrés pour les gestes de zone. Le `Record` complet fait le reste — un geste
 * ajouté au moteur ne compile plus tant qu'on ne lui a pas donné sa phrase.
 */
const GESTE_DIT: Record<
  GesteType,
  { quoi: "tiges" | "surface"; participe: string; complement?: string }
> = {
  planter: { quoi: "tiges", participe: "plantée" },
  couper: { quoi: "tiges", participe: "abattue" },
  eclaircir: { quoi: "tiges", participe: "abattue", complement: " en éclaircie" },
  elaguer: { quoi: "tiges", participe: "élaguée" },
  trogner: { quoi: "tiges", participe: "étêtée", complement: " en trogne" },
  receper: { quoi: "tiges", participe: "recépée" },
  recolter: { quoi: "tiges", participe: "récoltée" },
  leverEcorce: { quoi: "tiges", participe: "démasclée" },
  brouter: { quoi: "tiges", participe: "broutée", complement: " par le gibier" },
  frotter: { quoi: "tiges", participe: "frottée", complement: " par un cervidé" },
  chauler: { quoi: "surface", participe: "chaulé" },
  faucher: { quoi: "surface", participe: "fauché" },
  epandreBrf: { quoi: "surface", participe: "couvert", complement: " de broyat" },
  labourer: { quoi: "surface", participe: "labouré" },
  ramasserBoisMort: { quoi: "surface", participe: "débarrassé", complement: " de son bois mort" },
  cloturer: { quoi: "surface", participe: "clôturé" },
};

/**
 * Une surface, dite dans l'unité qui se lit.
 *
 * Une cellule du moteur fait un mètre de côté (`centreDesCellules`), donc un
 * compte de cellules **est** une surface en m². Au-delà d'un demi-hectare on passe
 * à l'hectare : « 12 000 m² » ne se lit pas.
 */
export function surface(m2: number): string {
  return m2 >= EN_HECTARES
    ? `${(m2 / 10000).toFixed(1).replace(".", ",")} ha`
    : `${Math.round(m2)} m²`;
}

/** Au-delà de quoi une surface se dit en hectares, m². */
const EN_HECTARES = 5000;

/**
 * L'accord d'un participe qui suit une surface.
 *
 * Il ne se lit pas sur le nombre de mètres carrés mais sur le nombre dans
 * l'unité **affichée** : « 12 000 m² » s'écrit « 1,2 ha brûlé », au singulier.
 */
function accordDeSurface(m2: number): string {
  return m2 >= EN_HECTARES ? s(m2 / 10000) : s(m2);
}

/** La phrase d'une ligne, accordée à son compte. */
function texteDe(l: LigneDeBilan): string {
  const n = l.combien;
  switch (l.sorte) {
    case "feu":
      return `${surface(n)} brûlé${accordDeSurface(n)}`;
    case "tempete":
      return `${n} tige${s(n)} couchée${s(n)} par la tempête`;
    case "mort": {
      // **Accordé à l'essence, en genre et en nombre.** La partie jouée l'a
      // pris en faute sur l'écran de fin : « 90 ronces morts étouffés par
      // l'ombre ». Trois essences du catalogue sont féminines.
      const f = estFeminin(l.especeId ?? "");
      return `${n} ${nomEspeces(l.especeId ?? "", n)} mort${accord(f, n)} ${causeDite(l.cause ?? "vieillesse", n, f)}`;
    }
    case "chute":
      return `${n} chandelle${s(n)} de ${nomEspeces(l.especeId ?? "", 1)} tombée${s(n)}`;
    case "naissance":
      return `${n} semis de ${nomEspeces(l.especeId ?? "", 1)}`;
    case "montee":
      return `${n} tige${s(n)} passée${s(n)} au stade ${l.stade}`;
    case "geste": {
      const dit = GESTE_DIT[l.geste ?? "couper"];
      // **L'accord porte sur le participe, pas sur la phrase.** Le premier jet
      // collait le « s » à la fin, et la partie jouée l'a pris en faute :
      // « 27 279 tiges broutée par le gibiers ».
      return dit.quoi === "surface"
        ? `${surface(n)} ${dit.participe}${accordDeSurface(n)}${dit.complement ?? ""}`
        : `${n} tige${s(n)} ${dit.participe}${s(n)}${dit.complement ?? ""}`;
    }
  }
}

/**
 * Le bilan, prêt à afficher.
 *
 * Trié une fois pour toutes ici, et non dans le panneau : la fin de niveau et
 * le volet montrent le même bilan, et deux tris divergeraient.
 */
export function lignesDuBilan(bilan: Bilan): LigneLue[] {
  return [...bilan]
    .map(([cle, l]) => ({
      cle,
      icone: ICONE[l.sorte],
      texte: texteDe(l),
      combien: l.combien,
      ou: l.places > 0 ? { x: l.sx / l.places, y: l.sy / l.places } : undefined,
      premiereSemaine: l.premiereSemaine,
      derniereSemaine: l.derniereSemaine,
      rang: RANG[l.sorte],
    }))
    .sort((a, b) => a.rang - b.rang || b.combien - a.combien)
    .map(({ rang: _rang, ...ligne }) => ligne);
}
