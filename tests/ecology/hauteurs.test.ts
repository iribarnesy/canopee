/**
 * Calibration des **hauteurs absolues** sur les tables de production.
 *
 * Les rapports entre essences et entre stations étaient justes de longue date ;
 * les niveaux, non — un hêtre de plaine plafonnait à moins de cinq mètres à
 * quarante ans. Cet essai attache le moteur à une vérité terrain publiée
 * plutôt qu'à lui-même.
 *
 * **Référence principale** : Jansen J.J., Sevenster J., Faber P.J. (1996),
 * *Opbrengsttabellen voor belangrijke boomsoorten in Nederland*, IBN-DLO
 * rapport 221 / Hinkeloord Report 17 (https://edepot.wur.nl/174739). C'est la
 * seule table du corpus consulté qui donne directement la **hauteur dominante**,
 * avec un âge compté depuis la germination et de nombreuses classes de
 * fertilité ; le CNPF (2025, *Faciliter l'utilisation des tables de production
 * forestières*) la juge parmi les mieux adaptées au contexte français pour
 * plusieurs de ces essences. On prend la **classe médiane** de chaque essence.
 *
 * **Ce qu'on compare.** Le moteur ne connaît pas la notion de « cent plus gros
 * arbres à l'hectare » : on lui fait pousser huit sujets au large sur la
 * station confort et on prend leur hauteur moyenne. C'est la grandeur la plus
 * proche de la hauteur dominante — les dominés, qui tirent la moyenne d'un
 * peuplement vers le bas, n'existent pas ici.
 *
 * **Les autres références**, essence par essence, sont citées dans `TABLE` et
 * dans `MESURES` (bas de fichier) : une table allemande pour le charme, un
 * faisceau de courbes français pour le châtaignier, et pour les arbustes — qui
 * n'ont jamais eu de table, parce qu'on ne les vend pas au mètre cube — des
 * essais en jardin et des monographies britanniques.
 *
 * **Ce que cet essai prouve, et ce qu'il ne prouve pas.** Les âges n'ont pas
 * tous le même statut, et c'est délibéré.
 *
 * **Calées** sur la table à quarante ans, donc gardées et non validées ici : le
 * **hêtre** et le **charme**. Leur `pousseMaxMAn` a été dérivé de cette valeur-là
 * (especes.ts). L'essai ne les mesure pas ; il attrapera leur dérive.
 *
 * **Non calées**, donc réellement mises à l'épreuve : aulne, frêne,
 * **châtaignier** et **bouleau** à quarante ans ; aubépine, fusain, genêt et houx dans
 * le bloc des arbustes. Leur accord avec la mesure est un résultat, pas un
 * réglage — et le bouleau en est le cas le plus net, son `pousseMaxMAn` ayant
 * été posé des mois avant qu'on trouve la table qui le juge (#185).
 *
 * **Le pin est un troisième cas, et il faut le nommer pour ne pas le
 * surestimer** (#254). Son `pousseMaxMAn` reste ce qu'il était, validé contre la
 * table en #201 et non touché ici ; ce qui a été ajusté est sa **station** —
 * `SABLE_PROFOND`, le sable de couverture que la table néerlandaise décrit.
 * L'ajustement s'est fait sur quarante ans, donc cet âge-là le **garde** plutôt
 * qu'il ne le valide, exactement comme le hêtre. Vingt ans reste tenu à
 * l'écart, et c'est là que le pin dit quelque chose du moteur.
 *
 * **À vingt ans**, aucune espèce n'est calée. C'est la vérification tenue à
 * l'écart : un seul paramètre par espèce a été ajusté, sur un seul âge, et le
 * second âge est une **prédiction** de la forme de la courbe. Mesuré : −13 % à
 * +10 % selon l'essence, le charme arrivé depuis à −3 %. C'est ce chiffre-là
 * qui dit quelque chose du moteur.
 *
 * **Convention assumée** : le moteur n'a pas de notion d'indice de fertilité.
 * Caler une essence sur une classe de table oblige donc à décréter qu'une
 * station la représente — ici, `LIMON_RICHE` **vaut** la classe médiane. Une
 * station plus pauvre en jeu donnera moins, une plus riche davantage ; c'est
 * le comportement **relatif** que le moteur modélise, et la table lui donne son
 * échelle.
 *
 * **Et la convention a une limite, qui a coûté une station** (#254) : elle vaut
 * pour les essences dont le limon riche **est** le milieu, c'est-à-dire des
 * feuillus mésophiles. Une classe médiane se lit sur le site médian de
 * l'essence, et celui d'un pionnier de sable n'est pas celui d'un hêtre. Deux
 * essences sont donc jugées ailleurs : le châtaignier sur un limon acide,
 * parce que le pH 7,0 le tue, et le pin sur un sable profond, parce que c'est
 * là que pousse la pineraie que la table mesure.
 *
 * Les tolérances tiennent compte de deux bruits : les classes de fertilité de
 * la table s'étalent déjà de −18 % à +16 % autour de la médiane (hêtre à 40
 * ans : 13,1 m en GK6, 16,0 en GK8, 18,6 en GK10), et chaque arbre porte une
 * vigueur individuelle à ±20 % (`trees.ts`) — d'où la moyenne sur plusieurs
 * individus **et** plusieurs graines.
 */

/**
 * **pourquoi ce fichier est coupé en deux**. Les essais de hauteur pesaient 700 s,
 * soit 16 % de la suite entière, et `vitest --shard` répartit des **fichiers** :
 * tant qu'ils tenaient dans un seul, ce fichier était le **plancher** du temps de
 * CI, qu'on prenne quatre tranches ou vingt.
 *
 * La coupe ne recalcule aucune espèce. Les trois essais de forme ne lisent que
 * le hêtre, le bouleau et le châtaignier ; chacun suit son espèce. Le
 * dispositif partagé est dans `hauteurs-commun.ts`, qui n'est pas collecté.
 */

import { describe, expect, it } from "vitest";
import { profondeurPenetrableCm, profondeurTotaleCm } from "../../src/engine/soil";
import { LIMON_RICHE } from "../../src/engine/stations";
import {
  a,
  hauteurs,
  LIMON_ACIDE,
  TABLE,
  TOLERANCE_CALAGE,
  TOLERANCE_TENUE_A_LECART,
} from "./hauteurs-commun";

describe("chaque essence est jugée sur la station de sa table", () => {
  /**
   * Le contrôle du lot #254, et il porte sur le **dispositif** plutôt que sur une
   * hauteur : déplacer une espèce de station de référence change ce que le banc
   * mesure, donc il faut que rien d'autre ne se déplace en douce.
   *
   * Il est structurel et non simulé, et c'est plus fort qu'une mesure : le
   * moteur est déterministe, donc une essence dont la fiche, la station et le
   * climat n'ont pas bougé rend la même course sur **toutes** les graines, pas
   * seulement sur les deux du banc.
   */
  it("seuls le pin et le châtaignier quittent le limon riche, et on sait pourquoi", () => {
    const ailleurs: Record<string, string> = {
      // Le pH 7,0 du limon riche est hors de son amplitude : il y meurt.
      castanea_sativa: LIMON_ACIDE.station.id,
      // Le site médian d'un pin est un sable, pas un limon (#254).
      pinus_sylvestris: "sable-profond",
    };
    for (const [especeId, ref] of Object.entries(TABLE)) {
      expect((ref.sc ?? LIMON_RICHE).station.id, especeId).toBe(
        ailleurs[especeId] ?? LIMON_RICHE.station.id,
      );
    }
  });

  it("la station du pin est un sable que rien n'ampute", () => {
    // Ce qui la distingue de la lande, et c'est tout l'objet de #254 : la lande
    // est un sable dont l'alios arrête les racines à 75 cm. Si un plancher
    // revenait ici, le pin retomberait sous sa table sans que rien ne le dise.
    const profil = (TABLE.pinus_sylvestris?.sc ?? LIMON_RICHE).station.profil;
    expect(profondeurPenetrableCm(profil)).toBeCloseTo(profondeurTotaleCm(profil), 6);
    expect(profondeurTotaleCm(profil)).toBeGreaterThan(100);
    for (const h of profil) expect(h.sable).toBeGreaterThan(0.8);
  });
});

describe("hauteurs absolues contre les tables de production (hêtre, pin, aulne)", () => {
  const especes = ["fagus_sylvatica", "pinus_sylvestris", "alnus_glutinosa", "betula_pendula"];
  for (const [especeId, ref] of Object.entries(TABLE)) {
    if (!especes.includes(especeId)) continue;
    it(`${ref.nom} : 20 et 40 ans dans la bande de la table`, () => {
      const sim = hauteurs(especeId, 40, ref.sc);
      const jalons: [string, number, number, number][] = [
        ["40 ans", ref.h40, a(sim, 40), TOLERANCE_CALAGE],
      ];
      if (ref.h20 !== undefined) {
        jalons.push(["20 ans", ref.h20, a(sim, 20), TOLERANCE_TENUE_A_LECART]);
      }
      for (const [jalon, attendu, obtenu, tolerance] of jalons) {
        const ecart = obtenu / attendu - 1;
        expect(
          Math.abs(ecart),
          `${ref.nom} à ${jalon} : ${obtenu.toFixed(1)} m simulés contre ${attendu} m dans la table (${(100 * ecart).toFixed(0)} %)`,
        ).toBeLessThan(tolerance);
      }
    }, 300_000);
  }
  it("le bouleau reste devant le hêtre en jeunesse : c'est un pionnier", () => {
    // **le tempérament**, qui ne se lit dans aucune table : un pionnier prend
    // l'avance sur une climacique et la garde à vingt ans. L'essai porte sur
    // le **rang**, et le niveau est désormais tenu par l'essai calé ci-dessus.
    //
    // Sa prémisse a changé (#185) : il disait « le bouleau n'est calé sur
    // aucune table, la seule du corpus est norvégienne (Braastad 1967), donc
    // boréale ». Ce refus tient toujours — 8,6 m à vingt ans, c'est un bouleau
    // de Norvège — mais il existe une table de **plaine tempérée**, celle de
    // Lockow 1996 pour le nord-est allemand, et le bouleau y est entré.
    //
    // Il lit la même course de quarante ans que l'essai calé, et pas une
    // course de vingt : la mémoire de `hauteurs` porte l'horizon dans sa clé,
    // donc demander vingt ans ici rejouerait une partie entière pour un
    // chiffre déjà calculé.
    expect(a(hauteurs("betula_pendula", 40), 20)).toBeGreaterThan(
      a(hauteurs("fagus_sylvatica"), 20),
    );
  }, 600_000);

  it("la courbe a la forme d'une sigmoïde, pas d'une exponentielle qui s'épuise", () => {
    // Ce que le moteur faisait avant : pousse maximale à la germination, puis
    // décroissance — la seule forme de la famille Chapman-Richards qui ne
    // soit pas sigmoïde. Sur la table, un hêtre fait 21 % de sa hauteur de
    // quarante ans au bout de dix ans ; avec l'ancienne forme il en faisait
    // 39 %. On vérifie donc que le début de courbe reste bas.
    const sim = hauteurs("fagus_sylvatica");
    expect(a(sim, 10) / a(sim, 40)).toBeLessThan(0.3);
    expect(a(sim, 10) / a(sim, 40)).toBeGreaterThan(0.13);
  }, 300_000);
});
