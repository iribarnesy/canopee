/**
 * La taille d'un semis dépend de l'espèce, pas d'une constante.
 *
 * Tous les semis naissaient à trente centimètres. C'est la bonne taille pour un
 * chêne, dont le gland porte les réserves qu'il faut. C'est la **moitié** de sa
 * taille adulte pour la callune : elle naissait presque faite, et sautait
 * entièrement sa phase pionnière — celle qui dure des années dans la nature, et
 * pendant laquelle un sous-arbrisseau est vulnérable au broutage, à la
 * concurrence herbacée et au piétinement.
 *
 * Le défaut touchait tous les sous-arbrisseaux de l'atlas, et il faussait dans
 * le sens de la facilité.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { getEspece } from "../../src/engine/especes";
import { serieToWeeks } from "../../src/engine/meteo";
import { hauteurDuSemisM } from "../../src/engine/regeneration";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantScattered } from "../../src/engine/state";
import { LANDE_SECHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const hauteurAdulte = (id: string) => getEspece(id).hauteurMaxM;

describe("un semis n'a pas la même taille selon ce qu'il deviendra", () => {
  it("la callune naît à six centimètres, pas à trente", () => {
    // Un dixième de sa taille adulte, contre la moitié auparavant.
    expect(hauteurDuSemisM(hauteurAdulte("calluna_vulgaris"))).toBeCloseTo(0.06, 6);
  });

  it("les arbres, eux, ne bougent pas d'un centimètre", () => {
    // Le plafond joue dès trois mètres de hauteur adulte : pour un chêne, un
    // hêtre ou un pin, la règle proportionnelle donnerait deux mètres et c'est
    // absurde. Trente centimètres restent la valeur, et cette borne est ce qui
    // permet de corriger les arbustes sans toucher aux arbres.
    for (const id of ["quercus_pubescens", "fagus_sylvatica", "pinus_sylvestris"]) {
      expect(hauteurDuSemisM(hauteurAdulte(id))).toBeCloseTo(0.3, 9);
    }
  });

  it("et entre les deux, c'est continu — aucun palier", () => {
    // L'ajonc, à deux mètres et demi d'adulte, tombe juste sous le plafond.
    expect(hauteurDuSemisM(hauteurAdulte("ulex_europaeus"))).toBeCloseTo(0.25, 6);
    // Monotone, et jamais au-dessus du plafond, quelle que soit la taille.
    expect(hauteurDuSemisM(1)).toBeLessThan(hauteurDuSemisM(2));
    expect(hauteurDuSemisM(1000)).toBeCloseTo(0.3, 9);
  });
});

describe("la phase pionnière existe enfin, et elle dure", () => {
  it("une callune met quinze ans à faire sa taille, et elle y arrive", () => {
    // Les deux moitiés du résultat comptent. Qu'elle mette des années est le
    // correctif ; qu'elle y arrive quand même prouve qu'on n'a pas simplement
    // rendu les sous-arbrisseaux incapables de s'installer sur la lande, qui
    // est pourtant leur terrain.
    //
    // **La météo est celle de Mont-de-Marsan, 2004-2023, pas l'été synthétique**
    // (#312). Depuis que le front racinaire d'un petit arbre suit sa taille,
    // une callune de six centimètres n'a plus trente centimètres de racines
    // mais cinq, et l'été synthétique les tue toutes, vingt sur vingt, à la
    // vingt-sixième semaine (graines 3, 7 et 9). Or cet été-là est plus dur
    // pour un plant de l'année que chacun des cinquante-neuf étés réels de la
    // station : un hêtre planté à trente centimètres y reçoit en moyenne 0,20
    // de sa demande d'eau, contre 0,31 au plus sec des étés réels, 1964 et 2022
    // (mesuré sur main avant #312, graine 42) — une pluie lissée semaine après
    // semaine n'a pas les orages qui rechargent le haut du sable. Dans le
    // terrain, 93,7 % des semis naturels de callune passent leur premier été
    // sur un sable acide à 560 mm par an (Henning et al. 2017, *Ecol. Evol.*
    // 7 : 2091), 25,8 % sont encore là au bout de trois ans.
    //
    // La fenêtre a été fixée avant la mesure : les vingt dernières années de
    // la série, la durée de l'essai. Elle contient les étés secs de 2005 et de
    // 2022, pas au premier été. Mesuré : 5 / 2 / 0 mortes d'autre chose que le
    // feu (graines 3, 7, 9), adulte à l'an 11 sur la graine 3. Commencée en
    // 2003, la fenêtre les tue toutes au premier été ; commencée en 1993,
    // l'hiver noyé de 2000-2001 en tue douze à seize par engorgement, sur main
    // comme sur la branche.
    const station = { ...LANDE_SECHE.station, coteM: 30, gibierParHa: 0, voisinage: [] };
    const serie = serieMeteoPour(LANDE_SECHE.station.id);
    if (!serie) throw new Error("série météo manquante");
    const debut = (2004 - serie.periode[0]) * 52;
    const meteo = serieToWeeks(serie, LANDE_SECHE.climat).slice(debut, debut + 20 * 52);
    let state = createGameState(station, rngStateFromSeed(3));
    state = plantScattered(
      state,
      "calluna_vulgaris",
      20,
      hauteurDuSemisM(hauteurAdulte("calluna_vulgaris")),
    );

    let anAdulte = -1;
    let morteAutrementQueParLeFeu = 0;
    for (let i = 0; i < 20 * 52; i++) {
      const semaine = meteo[i];
      if (!semaine) throw new Error("météo manquante");
      const r = tick(state, semaine);
      state = r.state;
      for (const m of r.morts) if (m.id <= 20 && m.cause !== "feu") morteAutrementQueParLeFeu++;
      const vivantes = state.trees.filter((t) => t.alive && t.id <= 20);
      const moyenne = vivantes.length
        ? vivantes.reduce((s, t) => s + t.heightM, 0) / vivantes.length
        : 0;
      if (anAdulte < 0 && moyenne > 0.5) anAdulte = Math.floor(i / 52);
    }
    // Elle survit : ce n'est pas un semis condamné qu'on a fabriqué. Ce que
    // l'essai mesure est les trois quarts qui passent la phase pionnière, ce qui
    // reste très loin d'un semis condamné.
    //
    // **Le feu n'est pas compté, et c'est #291 qui l'a appris.** La lande sèche
    // brûle : sur dix graines de ce décor, le moteur d'avant #291 y perd **toutes**
    // ses callunes sur trois (graines 7, 9 et 12, feux des ans 18, 14 et 5), celui
    // d'après sur quatre — les neuf autres identiques au chiffre près, la graine 3
    // de l'essai étant la seule qui diverge (un feu à l'an 15). L'essai passait
    // parce que sa graine ne brûlait pas. Or un feu tue l'adulte comme le semis :
    // il ne dit rien de la phase pionnière, qui est ce qu'on juge ici. On compte
    // donc les morts **d'autre chose** — boutis, sécheresse, concurrence —, au
    // même seuil qu'avant : cinq sur vingt au plus. Relevé sur les dix graines :
    // une à cinq, toutes des boutis.
    expect(morteAutrementQueParLeFeu).toBeLessThanOrEqual(5);
    // Mais il lui faut plus d'une décennie, là où elle partait presque faite.
    expect(anAdulte).toBeGreaterThan(8);
    expect(anAdulte).toBeLessThan(20);
  });
}, 300_000);
