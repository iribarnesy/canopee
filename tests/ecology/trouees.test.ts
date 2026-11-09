/**
 * « Les trouées déclenchent une régénération » (docs/realisme.md F7) — et rien
 * dans le moteur ne le déclare.
 *
 * Aucune règle ne dit « sous une trouée, sème ». Ce qui existe, c'est un filtre
 * de lumière à l'installation (`regeneration.ts` : un semis ne s'installe que
 * si le sol reçoit au moins deux fois le point de compensation de son espèce)
 * et une loi de Beer-Lambert qui rend le sol sombre sous les couronnes vivantes
 * (`light.ts`). La concentration des recrues sous les ouvertures, si elle
 * apparaît, **émerge** de ces deux-là.
 *
 * **Le dispositif**, et le soin qu'il demande. La pluie de semis vient du
 * `voisinage`, dont les positions sont tirées **uniformément** sur la parcelle :
 * sous l'hypothèse nulle — la lumière ne compte pas — les recrues se
 * répartissent au hasard et les deux zones comparées en reçoivent autant. Le
 * comparateur est **apparié** : la même zone, la même graine, la même météo, avec
 * et sans la trouée. Seule la trouée change, donc seule elle peut expliquer
 * l'écart.
 *
 * **Et il doit l'être**. Cet essai a d'abord porté un second comparateur, croisé :
 * dans une même partie, la zone ouverte contre une zone témoin restée sous
 * couvert. Il est tombé au premier déplacement du flux aléatoire, et la
 * remesure a montré que le défaut était dans le comparateur, pas dans le
 * moteur — sur certaines graines, la zone témoin est elle-même une ouverture
 * naturelle (17 recrues dont 9 bouleaux **sans** qu'on ait rien creusé). Une
 * hêtraie n'est pas un couvert homogène, ce qui est précisément l'objet de F7 :
 * on ne peut donc pas prendre un point quelconque du peuplement pour un témoin
 * fermé. Apparier la même zone avec elle-même est la seule façon de neutraliser
 * ça.
 *
 * Deux espèces arrivent ensemble, et ce n'est pas une complication gratuite :
 * le bouleau (compensation 0,25, donc 50 % de lumière exigés) ne peut
 * s'installer que dans une ouverture, le charme (0,03, donc 6 %) s'installe
 * aussi sous le couvert. Le charme est le **témoin qu'il y a quelque chose à**
 * **mesurer** : s'il ne recrutait nulle part, un « zéro bouleau sous couvert » ne
 * prouverait rien — la parcelle pourrait être bloquée pour une tout autre
 * raison.
 *
 * **Elle l'était**, **et c'est corrigé** (#95). Le plafond de recouvrement des
 * couronnes se comptait sur la **parcelle entière** : une hêtraie plantée à trois
 * mètres y atteint un recouvrement de 6 à 16 pour un plafond de 2,5, et plus
 * aucun semis ne s'installait nulle part — trouée comprise, alors que la
 * lumière y remontait à 1,00. La première version de cet essai est morte de ça,
 * et l'écartement de **huit** mètres du `describe` ci-dessous est l'écartement de
 * repli qu'il a fallu prendre : le seul qui reste sous le plafond parcellaire.
 *
 * Le plafond est devenu local, et la futaie vraiment dense, qui était le cas
 * intéressant et qui était hors de portée, a son propre banc :
 * `trouees-couvert-ferme.test.ts`, une hêtraie que le moteur fait pousser à
 * trois mètres. Le dispositif de repli reste ici parce qu'il mesure autre chose
 * et le mesure bien : sous un couvert **perméable**, la trouée concentre et trie,
 * là où le couvert serré, lui, oppose un zéro franc. Les deux bancs partagent
 * leur parcelle, leur trouée, leur pluie de semis et leur comptage
 * (`trouees-commun.ts`).
 */

import { beforeAll, describe, expect, it } from "vitest";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { COTE, type Comptage, compterApres, GRAINES, ouvrir, STATION } from "./trouees-commun";

/** Écartement de la hêtraie : couvert fermé, mais **sous** le plafond de recouvrement. */
const ECART = 8;
const H_CANOPEE = 15;

/**
 * Une hêtraie fermée de quinze mètres, quinze ans plus tard, sous une pluie de
 * semis venue du paysage. `ouvre` fait mourir de vieillesse les tiges d'un
 * disque (`ouvrir`, `trouees-commun.ts`).
 */
function hetraie(seed: number, ouvre: boolean): Comptage {
  let state: GameState = createGameState(STATION, rngStateFromSeed(seed));
  for (let x = ECART / 2; x < COTE; x += ECART) {
    for (let y = ECART / 2; y < COTE; y += ECART) {
      state = plantAt(state, "fagus_sylvatica", x, y, H_CANOPEE);
    }
  }
  // Les hêtres du couvert ne grainent pas ici : leur maturité est à quarante
  // ans et la partie en dure quinze. Toutes les recrues viennent donc du
  // paysage, ce qui laisse la seule lumière décider de leur position.
  const dernierPlante = state.nextTreeId - 1;
  return compterApres(ouvre ? ouvrir(state) : state, dernierPlante);
}

describe("une trouée dans un couvert fermé", () => {
  const parties: { seed: number; trouee: Comptage; fermee: Comptage }[] = [];

  // La campagne tourne dans un **hook** et non dans le corps du `describe` : dix
  // parties de quinze ans, c'est une minute sur ma machine et davantage sur le
  // runner d'intégration, qui est plus lent. Dans le corps du `describe`, ce
  // temps passe à la collecte, où aucun délai ne le couvre ; ici, `hookTimeout`
  // le couvre et la panne se lit au lieu de bloquer.
  beforeAll(() => {
    for (const seed of GRAINES) {
      parties.push({ seed, trouee: hetraie(seed, true), fermee: hetraie(seed, false) });
    }
  }, 600_000);

  it("la parcelle recrute, et le charme recrute jusque sous le couvert", () => {
    // **Avant** de vérifier que c'est bien réparti, vérifier qu'il y a quelque
    // chose à répartir. Sans ce garde-fou, une parcelle entièrement bloquée
    // ferait passer toutes les assertions suivantes pour de mauvaises raisons —
    // et c'est exactement ce qui est arrivé à la première version.
    //
    // Mesuré sur le code livré : 130 à 179 recrues par partie fermée, dont 3 à
    // 9 charmes dans chacune des deux zones comptées.
    for (const p of parties) {
      expect(p.fermee.total).toBeGreaterThan(50);
      expect(p.fermee.charmeTrouee).toBeGreaterThan(0);
      expect(p.fermee.charmeTemoin).toBeGreaterThan(0);
    }
  });

  it("concentre la régénération, graine par graine", () => {
    // **Le comparateur apparié** : la même zone, la même graine, avec et sans la
    // trouée. Tout le reste est identique — position, météo, voisinage.
    //
    // Mesuré sur le code livré, recrues dans la zone (12,20) : 17 / 17 / 14 /
    // 23 / 17 avec la trouée, contre 6 / 9 / 12 / 10 / 5 sans elle. La
    // direction tient sur les cinq graines — et sur huit, en élargissant la
    // campagne. Le **rapport**, lui, va de 1,2 à 3,4, et c'est pourquoi il n'est
    // pas épinglé (docs/realisme.md, « ce qu'un test écologique a le droit
    // d'affirmer »).
    for (const p of parties) {
      expect(p.trouee.trouee).toBeGreaterThan(p.fermee.trouee);
    }
  });

  // **Il y avait ici un troisième essai**, **et il était mal fondé**. Il comparait, dans
  // une seule partie, la zone ouverte à la zone témoin restée sous couvert. Le
  // lot des tempêtes, du sanglier et de la strate herbacée a déplacé le flux
  // aléatoire, et il est tombé sur la graine 1 : 16 recrues dans la trouée
  // contre 21 dans le témoin.
  //
  // La remesure a montré que ce n'était **ni** un décalage de flux innocent, **ni** une
  // régression du mécanisme, mais un défaut du comparateur lui-même. Dans la
  // partie **sans** trouée de cette graine, la zone témoin porte déjà 17 recrues
  // dont 9 bouleaux, contre 4 dans la zone de la future trouée : sur cette
  // graine, le « témoin sous couvert fermé » est lui-même une ouverture
  // naturelle. Le comparateur supposait un témoin fermé et rien ne le
  // garantissait — la hêtraie n'est pas un couvert homogène, c'est tout l'objet
  // de F7.
  //
  // Il n'est pas remplacé par un seuil plus bas, ce qui aurait été l'erreur que
  // `realisme.md` décrit : il est retiré parce que sa prémisse est fausse. Ce
  // qu'il prétendait montrer est démontré par le comparateur apparié ci-dessus
  // (5/5, et 8/8 sur la campagne élargie).
  //
  // **J'avais gardé une comparaison croisée pour le bouleau**, en me disant qu'elle
  // était fondée là où celle des totaux ne l'était pas. Elle est tombée au lot
  // suivant (#84, le plancher racinaire) sur une égalité 13 contre 13, et c'est
  // la même prémisse fausse qui lâchait : elle suppose un témoin **fermé**, et rien
  // ne le garantit — y compris pour le bouleau, puisque la zone témoin est
  // parfois une ouverture naturelle. Retirée pour la même raison que l'autre, et
  // non parce qu'un seuil manquait de marge. Ce qu'elle disait est porté par
  // l'appariement, qui ne suppose rien.

  it("ce n'est pas « plus de semis », c'est un TRI : le pionnier n'entre que par la trouée", () => {
    // La trouée ne se contente pas d'ajouter des tiges, elle change **qui**
    // s'installe. Le bouleau exige 50 % de lumière (compensation 0,25) : il
    // n'a presque nulle part où s'installer sous le couvert, et l'ouverture lui
    // rend toute la place.
    //
    // Le comparateur est **apparié**, comme celui des totaux et pour la même
    // raison : la même zone, la même graine, avec et sans la trouée.
    //
    // Mesuré sur le code livré, bouleaux dans la zone (12,20) : 14 / 12 / 11 /
    // 13 / 12 avec la trouée, contre 3 / 3 / 4 / 1 / 0 sans elle. Un facteur 4
    // à l'infini, là où les recrues **toutes espèces** confondues ne font qu'un
    // facteur 1,2 à 3,4 : c'est bien un tri, pas un supplément.
    for (const p of parties) {
      expect(p.trouee.bouleauTrouee).toBeGreaterThan(p.fermee.bouleauTrouee);
    }
  });
});
