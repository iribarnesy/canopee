/**
 * Calibration des HAUTEURS ABSOLUES sur les tables de production.
 *
 * Les rapports entre essences et entre stations étaient justes de longue date ;
 * les niveaux, non — un hêtre de plaine plafonnait à moins de cinq mètres à
 * quarante ans. Cet essai attache le moteur à une vérité terrain publiée
 * plutôt qu'à lui-même.
 *
 * **Référence principale** : Jansen J.J., Sevenster J., Faber P.J. (1996),
 * *Opbrengsttabellen voor belangrijke boomsoorten in Nederland*, IBN-DLO
 * rapport 221 / Hinkeloord Report 17 (https://edepot.wur.nl/174739). C'est la
 * seule table du corpus consulté qui donne directement la HAUTEUR DOMINANTE,
 * avec un âge compté depuis la germination et de nombreuses classes de
 * fertilité ; le CNPF (2025, *Faciliter l'utilisation des tables de production
 * forestières*) la juge parmi les mieux adaptées au contexte français pour
 * plusieurs de ces essences. On prend la CLASSE MÉDIANE de chaque essence.
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
 * CALÉES sur la table à quarante ans, donc gardées et non validées ici : le
 * HÊTRE et le CHARME. Leur `pousseMaxMAn` a été dérivé de cette valeur-là
 * (especes.ts). L'essai ne les mesure pas ; il attrapera leur dérive.
 *
 * NON CALÉES, donc réellement mises à l'épreuve : pin, aulne, frêne,
 * CHÂTAIGNIER et BOULEAU à quarante ans ; aubépine, fusain, genêt et houx dans
 * le bloc des arbustes. Leur accord avec la mesure est un résultat, pas un
 * réglage — et le bouleau en est le cas le plus net, son `pousseMaxMAn` ayant
 * été posé des mois avant qu'on trouve la table qui le juge (#185).
 *
 * À VINGT ANS, aucune espèce n'est calée. C'est la vérification tenue à
 * l'écart : un seul paramètre par espèce a été ajusté, sur un seul âge, et le
 * second âge est une PRÉDICTION de la forme de la courbe. Mesuré : −13 % à
 * +10 % selon l'essence, le charme arrivé depuis à −3 %. C'est ce chiffre-là
 * qui dit quelque chose du moteur.
 *
 * **Convention assumée** : le moteur n'a pas de notion d'indice de fertilité.
 * Caler une essence sur une classe de table oblige donc à décréter qu'une
 * station la représente — ici, `LIMON_RICHE` VAUT la classe médiane. Une
 * station plus pauvre en jeu donnera moins, une plus riche davantage ; c'est
 * le comportement RELATIF que le moteur modélise, et la table lui donne son
 * échelle.
 *
 * Les tolérances tiennent compte de deux bruits : les classes de fertilité de
 * la table s'étalent déjà de −18 % à +16 % autour de la médiane (hêtre à 40
 * ans : 13,1 m en GK6, 16,0 en GK8, 18,6 en GK10), et chaque arbre porte une
 * vigueur individuelle à ±20 % (`trees.ts`) — d'où la moyenne sur plusieurs
 * individus ET plusieurs graines.
 */

/**
 * POURQUOI CE FICHIER EST COUPÉ EN DEUX. Les essais de hauteur pesaient 700 s,
 * soit 16 % de la suite entière, et `vitest --shard` répartit des FICHIERS :
 * tant qu'ils tenaient dans un seul, ce fichier était le PLANCHER du temps de
 * CI, qu'on prenne quatre tranches ou vingt.
 *
 * La coupe ne recalcule aucune espèce. Les trois essais de forme ne lisent que
 * le hêtre, le bouleau et le châtaignier ; chacun suit son espèce. Le
 * dispositif partagé est dans `hauteurs-commun.ts`, qui n'est pas collecté.
 */

import { describe, expect, it } from "vitest";
import { a, hauteurs, TABLE, TOLERANCE_CALAGE, TOLERANCE_TENUE_A_LECART } from "./hauteurs-commun";

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
    // LE TEMPÉRAMENT, qui ne se lit dans aucune table : un pionnier prend
    // l'avance sur une climacique et la garde à vingt ans. L'essai porte sur
    // le RANG, et le niveau est désormais tenu par l'essai calé ci-dessus.
    //
    // Sa prémisse a changé (#185) : il disait « le bouleau n'est calé sur
    // aucune table, la seule du corpus est norvégienne (Braastad 1967), donc
    // boréale ». Ce refus tient toujours — 8,6 m à vingt ans, c'est un bouleau
    // de Norvège — mais il existe une table de PLAINE TEMPÉRÉE, celle de
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
