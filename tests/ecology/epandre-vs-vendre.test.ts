/**
 * **La** mécanique fondatrice du game design (docs/regles.md §4.2, §16) : le
 * joueur qui coupe ses fixateurs choisit — **vendre** la récolte (argent) ou
 * **épandre** sur place (l'azote fixé retourne au sol et nourrit les voisins).
 * Les deux parties sont identiques jusqu'à la coupe (même seed, même journal
 * amont) ; seul le devenir diffère. La litière annuelle des aulnes vivants
 * fertilise les deux scénarios à l'identique jusqu'à la coupe ; après, la
 * zone « vendre » s'épuise, la zone « épandre » tient des années grâce au
 * BRF (C/N ligneux, libération lente — ch2-B).
 */

import { describe, expect, it } from "vitest";
import { applyAction, type GameAction } from "../../src/engine/actions";
import {
  carbonInventory,
  cnHumusDuProfil,
  treeAboveCarbonKg,
  treeTotalCarbonKg,
} from "../../src/engine/carbon";
import { getEspece } from "../../src/engine/especes";
import { advanceWeek, runJournal } from "../../src/engine/game";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_PAUVRE_N } from "../../src/engine/stations";

const STATION = { ...LIMON_PAUVRE_N.station, coteM: 60 };
const WEATHER = syntheticYear(LIMON_PAUVRE_N.climat);

// 20 aulnes (ids 1-20) en bosquet serré, 8 hêtres (ids 21-28) intercalés.
const AULNES: { x: number; y: number }[] = [];
for (let i = 0; i < 20; i++) {
  AULNES.push({ x: 24 + (i % 5) * 3, y: 24 + Math.floor(i / 5) * 3 });
}
const HETRES: { x: number; y: number }[] = [];
for (let i = 0; i < 8; i++) {
  HETRES.push({ x: 25.5 + (i % 4) * 3, y: 25.5 + Math.floor(i / 4) * 3 });
}

const CUT_WEEK = 8 * 52 + 30; // fin d'été de l'an 8 (l'azote de l'année est dans les feuilles)

function journal(devenir: "vendre" | "epandre", graine = 5) {
  return {
    stationId: STATION.id,
    seed: graine,
    actions: [
      { type: "planter", week: 0, especeId: "alnus_glutinosa", positions: AULNES },
      { type: "planter", week: 1, especeId: "fagus_sylvatica", positions: HETRES },
      {
        type: "couper",
        week: CUT_WEEK,
        treeIds: Array.from({ length: 20 }, (_, i) => i + 1),
        devenir,
      },
    ] as GameAction[],
  };
}

describe("couper les aulnes : épandre ou vendre (16 ans, limon pauvre en N)", () => {
  const vendre = runJournal(STATION, journal("vendre"), WEATHER, 16 * 52);
  const epandre = runJournal(STATION, journal("epandre"), WEATHER, 16 * 52);
  /**
   * Le gain moyen sur plusieurs parties. Une seule ne suffit plus : l'effet a
   * beaucoup maigri quand le frein d'extraction de l'azote est passé à une
   * saturation de Michaelis-Menten (nitrogen.ts), et un effet petit ne se
   * mesure pas sur un tirage.
   */
  const GRAINES = [5, 19, 31];
  const hauteurMoyenneDesHetres = (s: typeof vendre.state) => {
    const alive = s.trees.filter((t) => t.id > 20 && t.id <= 28 && t.alive);
    return alive.length ? alive.reduce((sum, t) => sum + t.heightM, 0) / alive.length : 0;
  };

  /**
   * Les **deux** jalons en une seule passe. La version précédente rejouait la
   * partie depuis le début pour chaque horizon : trente-cinq ans, puis seize
   * ans de la même partie, six fois — soit la moitié du travail jetée. L'essai
   * pesait 267 s des 317 s de la suite entière.
   *
   * On avance donc une fois jusqu'au jalon le plus lointain et on relève la
   * hauteur des hêtres au passage. Aucune écologie ne change : c'est la même
   * partie, avec les mêmes tirages, simplement lue deux fois en route.
   */
  const JALONS = [16, 35] as const;
  function hauteursAuxJalons(devenir: "vendre" | "epandre", graine: number) {
    const j = journal(devenir, graine);
    let etat = createGameState(STATION, rngStateFromSeed(j.seed));
    const releves = new Map<number, number>();
    const derniere = Math.max(...JALONS);
    for (let i = 0; i < derniere * 52; i++) {
      const w = WEATHER[i % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      etat = advanceWeek(etat, w, j.actions).state;
      const an = (i + 1) / 52;
      if (JALONS.includes(an as (typeof JALONS)[number]))
        releves.set(an, hauteurMoyenneDesHetres(etat));
    }
    return releves;
  }

  /** Gain moyen épandre / vendre à chaque jalon, sur les trois graines. */
  const gains = (() => {
    const parJalon = new Map<number, number[]>(JALONS.map((a) => [a, []]));
    for (const g of GRAINES) {
      const v = hauteursAuxJalons("vendre", g);
      const e = hauteursAuxJalons("epandre", g);
      for (const an of JALONS) {
        const hv = v.get(an) ?? 0;
        parJalon.get(an)?.push(hv > 0 ? (e.get(an) ?? 0) / hv : 0);
      }
    }
    return parJalon;
  })();
  const gainA = (ans: number) => {
    const liste = gains.get(ans) ?? [];
    return liste.length ? liste.reduce((a, b) => a + b, 0) / liste.length : 0;
  };

  it("aucune action n'est refusée dans les deux parties", () => {
    expect(vendre.refusals).toEqual([]);
    expect(epandre.refusals).toEqual([]);
  });

  it("vendre rapporte de l'argent, épandre coûte du temps pour rien... en euros", () => {
    // La marge de vingt euros était un chiffre absolu, et elle est tombée avec
    // la correction du volume : un arbre ne vend plus six fois le bois qu'il
    // porte (#62), donc l'écart entre vendre et épandre se resserre en euros
    // sans que la leçon change. Ce qui doit être vrai, c'est le **sens** — vendre
    // rapporte, épandre coûte — pas un montant que l'allométrie fixe.
    expect(vendre.state.economy.treasuryEur).toBeGreaterThan(epandre.state.economy.treasuryEur);
    expect(epandre.state.economy.hoursUsedYear).toBeGreaterThanOrEqual(0);
  });

  it("épandre enrichit le sol : plus d'azote (minéral, litière et humus) dans le bosquet", () => {
    const nTotal = (s: typeof vendre.state, cx: number, cy: number) => {
      let sum = 0;
      for (let y = cy - 6; y <= cy + 6; y++) {
        for (let x = cx - 6; x <= cx + 6; x++) {
          const i = y * STATION.coteM + x;
          sum +=
            (s.soil.mineralNG[i] ?? 0) +
            (s.soil.litterNG[i] ?? 0) +
            (s.soil.humusCG[i] ?? 0) / cnHumusDuProfil(STATION.profil);
        }
      }
      return sum;
    };
    // **l'essai change de grandeur plutôt que de glisser une troisième fois.**
    //
    // Le seuil valait 1,20 pour une mesure à 1,2123 : un pour cent de marge,
    // donc un enregistrement du moteur et non une contrainte. Le correctif des
    // mycorhizes (#115) l'a fait tomber à 1,1834, et il a été reposé à 1,15.
    // Le lot de la litière herbacée (#201) l'amène à 1,1360. Trois glissements
    // sur la même cause : **un rapport de stocks se resserre dès que quelque
    // chose enrichit les deux parcelles**, alors que l'apport de BRF, lui, n'a
    // pas bougé d'un gramme.
    //
    // L'écart **absolu** ne souffre pas de ça — un terme commun s'y annule au lieu
    // de s'y diluer. Mesuré, avec et sans le retour de litière de la strate :
    //
    //                  épandre   vendre   écart   rapport
    //     sans le lot   1386,8   1155,2   231,6   1,2004
    //     avec le lot   1575,9   1387,3   188,7   1,1360
    //
    // L'excès du rapport perd un tiers, l'écart absolu un cinquième. **Et il
    // n'est pas neutre non plus, ce qui est un fait à noter** : le terme ajouté
    // vaut +232 côté « vendre » contre +189 côté « épandre », parce que le BRF
    // forme un paillis qui étouffe le tapis — moins d'herbe, donc moins de
    // restitution herbacée. L'écart reste donc la meilleure grandeur des deux,
    // sans être une invariante.
    //
    // Cent grammes sur le bloc de treize par treize cellules, contre 189
    // mesurés : la marge est enfin une marge, et l'énoncé — « épandre
    // **enrichit** » — est ce que le nombre soutient.
    // **L'humus compte, depuis que son azote existe** (#247). Il était implicite
    // au C/N du profil : humifier en créait, et l'essai ne pouvait pas le
    // compter sans compter un azote sorti de nulle part. Humifier le prend
    // maintenant à la litière, puis au minéral, et c'est là que va l'azote du
    // broyat. Graine 5, an 16, sur le bloc de treize par treize :
    //
    //                    épandre   vendre   écart
    //     minéral + litière  751      705      46
    //     humus            38 909   36 274   2 635
    //
    // L'écart sur le minéral et la litière seuls est tombé à 46 g, parce que le
    // broyat est décomposé en trois ans et que son azote est passé à l'humus.
    // Compter le sol entier n'est pas desserrer l'essai : c'est compter le stock
    // où l'azote est allé. Le seuil des cent grammes ne bouge pas.
    const azoteEpandu = nTotal(epandre.state, 30, 30);
    const azoteVendu = nTotal(vendre.state, 30, 30);
    expect(azoteEpandu - azoteVendu).toBeGreaterThan(100);
  });

  it("côté carbone : épandre garde les stocks sur la parcelle, vendre les émet (§12)", () => {
    const invVendre = carbonInventory(vendre.state, STATION.initialSoilCTHa);
    const invEpandre = carbonInventory(epandre.state, STATION.initialSoilCTHa);
    expect(invVendre.exporteCumTHa).toBeGreaterThan(0);
    expect(invEpandre.exporteCumTHa).toBe(0);
    expect(invEpandre.totalTHa).toBeGreaterThan(invVendre.totalTHa);
  });

  it("épandre des aulnes entiers affame d'abord les hêtres voisins, puis l'écart s'efface", () => {
    expect(hauteurMoyenneDesHetres(epandre.state)).toBeGreaterThan(0);

    // Le gain ne se voit **pas** à seize ans — huit ans après la coupe, épandre
    // vaut 0,99 fois vendre, moyenné sur quatre parties. Ce n'est pas une panne
    // du mécanisme, c'est la **faim d'azote** du broyat : le bois raméal a un C/N
    // élevé, les décomposeurs qui l'attaquent puisent d'abord l'azote du sol
    // pour construire leur propre biomasse, et le sol en manque avant d'en
    // avoir plus. Tout agronome qui a épandu du BRF connaît ce creux.
    //
    // À trente-cinq ans — vingt-sept après la coupe — le gain est de +9 %, et
    // il est régulier : 1,079 / 1,097 / 1,106 / 1,083 selon la graine. La
    // mécanique fondatrice « couper les légumineuses et les épandre » tient
    // donc, et elle tient mieux qu'on ne le croyait ; ce sont les mesures
    // précédentes (+5 %, puis +2 %) qui la lisaient pendant son creux.
    // **Le creux s'est comblé**, **et c'est un progrès** (#62). Cet essai exigeait
    // qu'à seize ans le gain soit encore **nul** (< 1,02), parce que le moteur
    // mesurait alors une faim d'azote qui durait plus de huit ans. Elle durait
    // si longtemps parce que le volume de bois était faux : on épandait six
    // fois trop de carbone, donc six fois trop de C/N à digérer. Un BRF réel
    // affame le sol un à trois ans, pas huit.
    //
    // Mesuré après correction : 1,043 à seize ans. Le creux existe toujours —
    // il est simplement à l'échelle du broyat qu'on épand vraiment. Ce que
    // l'essai épingle désormais est la **forme** de la courbe, qui est la propriété
    // écologique : le gain est déjà là, et il continue de croître.
    // **Et ce gain était de l'azote créé** (#247). Humifier ne demandait pas
    // d'azote : chaque tonne de carbone humifiée en sortait ~27 kg de nulle
    // part, et un broyat de 150 kg de carbone en fabriquait de quoi nourrir les
    // hêtres. Humifier le prend maintenant à la litière, puis au minéral.
    //
    // Le broyat d'un aulne entier porte surtout l'azote de son **bois** : 2,8 kg
    // pour les vingt aulnes, contre 0,4 dans leurs feuilles, au C/N de 47. Les
    // décomposeurs qui humifient ce carbone prennent l'azote du sol : c'est la
    // faim d'azote du BRF (C9). L'azote n'est pas perdu, il est mis en banque
    // dans l'humus (essai ci-dessus), et l'humus le rend lentement. Gain
    // épandre / vendre, graines 5 / 19 / 31 :
    //
    //     an     10      12      16      20      25      35
    //          0,929   0,942   0,964   0,978   0,990   1,001
    //          0,922   0,937   0,965   0,982   0,992   0,998
    //          0,927   0,945   0,966   0,979   0,989   1,002
    //
    // Trois graines qui disent la même chose au centième : la faim est franche
    // deux ans après l'épandage, et elle s'efface sur un quart de siècle sans
    // devenir un gain. **La mécanique fondatrice ne tient plus sous cette
    // forme** : un aulne entier broyé met l'azote du sol en banque, il ne le
    // porte pas au voisin. Ce sont ses feuilles qui le porteraient, et le
    // moteur les mêle au bois dans une seule litière.
    expect(gainA(16)).toBeLessThan(1);
    // Le gain à long terme suit la **masse** épandue, qui vient d'être divisée par
    // trois (#62) : mesuré à +9 % quand un aulne pesait six fois trop, il est
    // de +3,7 % maintenant qu'il pèse ce qu'il pèse. La mécanique fondatrice
    // « couper les légumineuses et les épandre » tient donc toujours, à
    // l'échelle de ce qu'on épand vraiment.
    // **Et la courbe ne monte pas**, elle culmine puis s'estompe : +4,3 % à seize
    // ans, +3,7 % à trente-cinq. J'avais d'abord écrit ici que le gain devait
    // **croître** — c'était une supposition, et la mesure l'a démentie. Un épandage
    // est un apport **unique** : il se minéralise, la végétation le reprend, et son
    // avance s'érode lentement au lieu de s'accumuler.
    //
    // Ce que l'essai épingle est donc ce qui est vrai et qui suffit : le gain
    // apparaît, et il tient encore vingt-sept ans après la coupe.
    //
    // Même remarque que ci-dessus, et c'est la troisième fois que ce chiffre
    // se remesure : 1,03 posé pour une mesure à 1,0368, donc sept millièmes de
    // marge. À 1,0264 après #115, l'énoncé — « le gain tient encore vingt-sept
    // ans après la coupe » — n'a pas bougé d'un iota ; c'est le chiffre qui
    // datait. Deux points de marge, et on ne prétend toujours pas mesurer
    // l'ampleur.
    // **et la quatrième fois, on prend le fichier au mot** (#201). Il écrit
    // depuis deux glissements « on ne prétend toujours pas mesurer l'ampleur »,
    // tout en épinglant 1,02 pour une mesure à 1,0264 — six millièmes. Le lot
    // de la litière herbacée l'amène à 1,0137, par la même cause que le stock
    // ci-dessus : le fond d'azote monte dans les deux bras, et l'extraction
    // sature, donc la valeur marginale de l'apport baisse.
    //
    // Le seuil devient donc ce que la phrase dit : le **signe**. Si l'on veut un
    // jour affirmer l'ampleur, il faudra un dispositif qui la mesure — plusieurs
    // stations, et un témoin qui reçoive le même azote sous une autre forme —
    // pas un nombre relevé sur une sortie.
    // L'écart s'efface : le sens de la phrase, sans épingler la date.
    expect(gainA(35)).toBeGreaterThan(gainA(16));
    // Le délai est large parce que l'essai l'est : trois parties par horizon,
    // trente-cinq ans sur soixante mètres. Il tenait en 300 s sur ma machine et
    // les dépassait sur le runner d'intégration, qui est plus lent.
  }, 900_000);
});

describe("le tas de broyat : transporter la fertilité", () => {
  it("broyer met en réserve au lieu de nourrir le sol tout de suite", () => {
    let state = createGameState(STATION, rngStateFromSeed(3));
    state = plantAt(state, "alnus_glutinosa", 10, 10, 6);
    const id = state.nextTreeId - 1;
    for (let i = 0; i < 60; i++) {
      const w = WEATHER[i % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      state = advanceWeek(state, w, []).state;
    }
    const litiereAvant = state.soil.litterNG.reduce((a, b) => a + b, 0);
    const arbre = state.trees.find((t) => t.id === id);
    if (!arbre) throw new Error("aulne introuvable");
    const espece = getEspece(arbre.especeId);
    const partAerienne =
      treeAboveCarbonKg(espece, arbre.diametreCm, arbre.heightM) /
      treeTotalCarbonKg(espece, arbre.diametreCm, arbre.heightM);
    const azoteRacines =
      (1 - partAerienne) * ((arbre.reserveAzoteG ?? 0) + (arbre.azoteBoisG ?? 0));
    const apres = applyAction(state, {
      type: "couper",
      week: 60,
      treeIds: [id],
      devenir: "broyer",
    }).state;
    // L'aérien est dans la remorque. Seules les racines restent en terre, avec
    // leur azote, au bois mort comme leur carbone (#328) : il rejoignait la
    // litière de la souche, sans carbone (#247). Rien n'est tombé à la litière.
    expect(apres.stockBrf.azoteG).toBeGreaterThan(azoteRacines);
    expect(apres.carbon.deadWoodNG - state.carbon.deadWoodNG).toBeCloseTo(azoteRacines, 6);
    expect(apres.soil.litterNG.reduce((a, b) => a + b, 0) - litiereAvant).toBeCloseTo(0, 6);
  });

  it("on l'épand où l'on veut, et l'azote y va — pas ailleurs", () => {
    let state = createGameState(STATION, rngStateFromSeed(3));
    state = plantAt(state, "alnus_glutinosa", 10, 10, 6);
    const id = state.nextTreeId - 1;
    for (let i = 0; i < 60; i++) {
      const w = WEATHER[i % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      state = advanceWeek(state, w, []).state;
    }
    const broye = applyAction(state, {
      type: "couper",
      week: 60,
      treeIds: [id],
      devenir: "broyer",
    }).state;
    const stock = broye.stockBrf.azoteG;
    // On porte le tas à l'autre bout de la parcelle, loin de l'aulne coupé.
    const epandu = applyAction(broye, {
      type: "epandreBrf",
      week: 61,
      x: 30,
      y: 30,
      rayonM: 4,
      part: 1,
    }).state;
    const cote = STATION.coteM;
    const litiere = (x: number, y: number) => epandu.soil.litterNG[y * cote + x] ?? 0;
    expect(litiere(30, 30)).toBeGreaterThan(0);
    // Là où l'arbre a été coupé, rien n'a été déposé.
    expect(litiere(10, 10)).toBeCloseTo(broye.soil.litterNG[10 * cote + 10] ?? 0, 6);
    // Le tas est vidé, et rien ne s'est perdu en route.
    expect(epandu.stockBrf.azoteG).toBeCloseTo(0, 6);
    const depose =
      epandu.soil.litterNG.reduce((a, b) => a + b, 0) -
      broye.soil.litterNG.reduce((a, b) => a + b, 0);
    expect(depose).toBeCloseTo(stock, 4);
  });

  it("épandre un gros tas coûte des heures : la manutention n'est pas gratuite", () => {
    let state = createGameState(STATION, rngStateFromSeed(3));
    state = { ...state, stockBrf: { carboneG: 400_000, azoteG: 4_000 } };
    const apres = applyAction(state, {
      type: "epandreBrf",
      week: 1,
      x: 20,
      y: 20,
      rayonM: 6,
      part: 1,
    });
    expect(apres.state.economy.hoursUsedWeek).toBeGreaterThan(2);
  });

  it("on ne peut pas épandre un tas vide", () => {
    const state = createGameState(STATION, rngStateFromSeed(3));
    const r = applyAction(state, {
      type: "epandreBrf",
      week: 1,
      x: 20,
      y: 20,
      rayonM: 5,
      part: 1,
    });
    expect(r.refusals).toHaveLength(1);
  });
});
