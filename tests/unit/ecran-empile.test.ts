/**
 * **Ce qu'un retour du navigateur déclenche** (#226).
 *
 * > *« Étant sur Mac c'est vraiment souvent que je fais retour intempestivement
 * > en scrollant avec deux doigts. »*
 *
 * Ce qui est éprouvé ici est la **règle**, pas la plomberie : les écouteurs et
 * la pile d'historique ne se vérifient qu'à l'écran, et ils l'ont été. La règle,
 * elle, tient en trois cas et c'est elle qui coûterait une partie si elle se
 * trompait.
 */

import { describe, expect, it } from "vitest";
import { queFaireAuRetour } from "../../src/game/ecranEmpile";

describe("le retour du navigateur, sur un écran empilé", () => {
  it("demande, sur un écran qui a quelque chose à défaire", () => {
    // Et « demander » veut dire repousser l'entrée d'abord : `popstate` n'est
    // pas annulable, le navigateur a déjà reculé quand on l'apprend.
    expect(queFaireAuRetour({ sortieEnCours: false, confirmer: true })).toBe("demander");
  });

  it("sort sans rien demander quand il n'y a rien à défaire", () => {
    // Le bac à sable : ses réglages survivent au retour, les deux écrans les
    // partagent. Une boîte qui demande pour rien apprend à répondre oui sans
    // lire — et la question de la partie, elle, mérite d'être lue.
    expect(queFaireAuRetour({ sortieEnCours: false, confirmer: false })).toBe("sortir");
  });

  it("ignore le retour qu'il a lui-même provoqué", () => {
    // Sortir par un bouton consomme l'entrée avec `history.back()`. Sans ce
    // cas, ce retour-là redéclencherait une sortie — ou reposerait la question
    // qu'on vient de trancher.
    expect(queFaireAuRetour({ sortieEnCours: true, confirmer: true })).toBe("ignorer");
    expect(queFaireAuRetour({ sortieEnCours: true, confirmer: false })).toBe("ignorer");
  });
});
