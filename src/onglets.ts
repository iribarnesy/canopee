/**
 * **Les trois onglets du site, dans l'URL** — pour qu'un lien mène où il dit.
 *
 * La demande : « il faudrait qu'on puisse accéder directement à la page “le
 * modèle” avec une URL donnée ». C'est la raison d'être de cette page (#224) :
 * elle existe pour être **envoyée**, à un visiteur qui n'ouvrira pas le code et
 * ne lancera pas forcément une partie. Une page qu'on ne peut pas mettre en
 * lien ne remplit pas ce contrat.
 *
 * **Par le hash, et pas par le chemin.** `vite.config.ts` construit avec
 * `base: "./"`, donc le site sait vivre dans un sous-dossier — une page de
 * projet GitHub Pages, par exemple. Une route en `/modele` demanderait au
 * serveur de renvoyer `index.html` pour un chemin qui n'existe pas ; le hash
 * ne demande rien à personne et survit à un rechargement comme à un partage.
 *
 * Module **pur** : il ne lit ni `window` ni `location`, on lui donne la chaîne.
 * C'est ce qui permet de l'éprouver sans navigateur.
 */

export type Onglet = "jeu" | "modele" | "labo";

/**
 * Ce que chaque onglet écrit dans l'URL.
 *
 * Le jeu n'écrit **rien** : c'est l'accueil, et une URL nue doit y mener. Écrire
 * `#/jeu` obligerait à réécrire l'adresse au chargement d'une page qui était
 * déjà la bonne, et ferait porter à tous les liens existants un suffixe qui ne
 * dit rien de plus.
 */
const DANS_L_URL: Record<Onglet, string> = {
  jeu: "",
  modele: "#/modele",
  labo: "#/labo",
};

/**
 * Le titre du document, par onglet.
 *
 * Il valait « Canopée — labo moteur » pour les trois, ce qui était l'ancien nom
 * du site quand il n'y avait que ça. Un onglet de navigateur et un aperçu de
 * lien montrent ce titre : envoyer « le modèle » à quelqu'un sous l'étiquette
 * « labo moteur » n'aide pas.
 */
export const TITRE: Record<Onglet, string> = {
  jeu: "Canopée — agroforesterie tempérée",
  modele: "Canopée — le modèle",
  labo: "Canopée — labo moteur",
};

/** L'onglet qu'une URL désigne, le jeu à défaut. */
export function ongletDeLUrl(hash: string): Onglet {
  // On tolère ce qu'un copier-coller abîme : le « # » perdu, la barre en trop
  // ou en moins, la casse, un espace de fin.
  const propre = hash
    .trim()
    .replace(/^#/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  for (const [onglet, ecrit] of Object.entries(DANS_L_URL) as [Onglet, string][]) {
    if (ecrit !== "" && ecrit.replace(/^#\//, "") === propre) return onglet;
  }
  return "jeu";
}

/** Ce qu'il faut mettre dans l'URL pour désigner cet onglet. */
export function hashDeLOnglet(onglet: Onglet): string {
  return DANS_L_URL[onglet];
}
