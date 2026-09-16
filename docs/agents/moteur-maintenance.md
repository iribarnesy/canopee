# Agent de maintenance du moteur

Lire d'abord [`README.md`](README.md) — assignation, labels, règles communes.

## Périmètre

Corriger ce qui existe : défauts, dérives de calibration, hygiène des tests,
synchronisation du référentiel. Issues portant `moteur:maintenance`.

**Pas** d'ajout de mécanisme : ça revient à l'agent d'évolution. Si un correctif
demande un mécanisme neuf, ouvrir une issue `moteur:évolution` et s'arrêter là.

## Trois règles, tirées d'échecs répétés

Elles sont écrites dans [`../realisme.md`](../realisme.md), section « ce qu'un
test écologique a le droit d'affirmer ». Résumé :

**Un rapport entre deux quantités composites n'est pas une propriété du monde.**
« Le mélange perd deux fois moins d'aulnes », « le réchauffement double les
ravageurs », « épandre vaut +9 % » : tous rabaissés deux ou trois fois, chaque
fois pour une cause réelle. Un seuil qu'on rabaisse à chaque changement de
mécanisme n'enregistre plus que le moteur — il a cessé de le contraindre. Ce qui
résiste, c'est la **direction**, et elle s'exige graine par graine plutôt qu'en
moyenne.

**Une ancre écrite d'après le moteur n'est pas une ancre.** Le seul test qui
confrontait le carbone à une valeur absolue exigeait qu'un hêtre de 25 m stocke
« quelques tonnes ». La borne avait été posée sur le volume du moteur, faux d'un
facteur cinq : elle entérinait l'erreur au lieu de l'attraper.

**La conservation ne valide rien.** Un stock faux d'un facteur cinq se conserve
parfaitement. Les invariants attrapent les fuites, jamais les niveaux — ce qui
ne les rend pas moins précieux : ils ont trouvé une fuite de 0,133 kg due à un
grand livre de test qui mesurait le même arbre avec deux règles.

Corollaire subi deux fois : **un seuil mesuré au milieu d'un lot périme avant la
fin du lot.**

## Le flux aléatoire

Le moteur tire dans **un seul flux séquentiel**. Tout mécanisme qui consomme un
tirage de plus décale tous les suivants et peut renverser une conclusion
écologique sans qu'aucune cause physique n'ait bougé.

Le remède existe et il a un précédent à copier : dériver une graine locale
plutôt que puiser dans le flux (`graineDeChute` dans `boisMort.ts`, l'indice de
marché dans `marche.ts`).

Un test qui bascule après un changement sans rapport est presque toujours un
symptôme de décalage de flux, pas une régression. Le vérifier avant d'accuser le
mécanisme : neutraliser le tirage et remesurer.

## Hygiène des tests

- Un test qui ne peut pas échouer est pire qu'un test absent. Vérifier qu'il y a
  **quelque chose à vérifier** avant de vérifier que c'est correct — par exemple
  `expect(idsRapportes).toBeGreaterThan(5)` avant `expect(anomalies).toEqual([])`.
- Se méfier de `expect(x).toBe(x)` et des `expect(true).toBe(true)` de fin de
  script : ils passent toujours.
- Les scripts d'édition en masse doivent vérifier **chaque** remplacement
  individuellement. Un `assert` global passe quand seules certaines ancres ont
  mordu — ça a fait perdre silencieusement deux assertions et un mécanisme.
- La CI est plus lente que la machine de dev. Deux tests ont eu besoin d'un
  `timeout` explicite (900 s et 600 s). Préférer allonger le délai à réduire
  l'échantillon.
- **Compter une cohorte, c'est deux pièges.** Le moteur PURGE les morts de
  `state.trees` une fois leur bois retourné au sol : un relevé des causes de
  mort fait à la fin d'une partie n'en retrouve que les derniers tombés — 2 sur
  314 dans la campagne de #65. La cause se lit à la semaine de la mort. Et
  au-delà de la maturité, l'espèce se ressème : compter « les tiges vivantes »
  mélange la cohorte plantée et ses propres descendants, ce qui masque
  exactement la mortalité qu'on mesure. Ne compter que les ids initiaux.
- **Une constante peut rendre un essai impossible sans qu'aucun essai le dise.**
  Le plancher de lumière `exp(−MAX_EXTINCTION)` vaut 0,0111 et la compensation
  du hêtre 0,01 : aucun hêtre ne peut mourir d'ombre, nulle part, jamais. Il a
  fallu une campagne de cent vingt ans pour s'en apercevoir, là où comparer deux
  nombres suffisait. Quand une simulation ne bouge pas, chercher d'abord si elle
  PEUT bouger — `lumiere.test.ts` et `elancement.test.ts` portent maintenant ces
  bornes-là, et elles ne coûtent rien.
- **Un témoin pris APRÈS le tri n'est pas un témoin.** `tempete.test.ts` posait
  en hypothèse que les deux peuplements « arrivent à taille comparable », et le
  vérifiait sur la hauteur des SURVIVANTS à soixante ans — c'est-à-dire après
  que la tempête a emporté les plus grands. « Le pin était petit » et « le pin
  s'est fait coucher » y étaient la même mesure, si bien que l'hypothèse tombait
  d'autant plus vite que la conclusion était vraie. La hauteur ATTEINTE, relevée
  semaine après semaine, dit ce que la phrase voulait dire. Règle générale :
  quand un essai mesure un tri, sa prémisse se relève avant le tri, ou sur le
  témoin non trié (ici, la parcelle abritée).
- **Et ce délai doit porter là où le temps passe.** Une campagne lancée dans le
  corps d'un `describe` tourne à la COLLECTE, que ni `testTimeout` ni un délai
  posé sur le `describe` ne couvrent : si elle s'emballe, la suite bloque au
  lieu d'échouer. La mettre dans un `beforeAll` avec son `hookTimeout` rend la
  panne lisible. `elancement.test.ts` est l'ancien usage, `trouees.test.ts` le
  nouveau.

## Le référentiel est la mémoire du projet

`docs/realisme.md` doit suivre. Une PR qui change un mécanisme sans mettre à
jour la ligne du critère, le tableau de score et la ligne d'historique laisse le
document mentir — et c'est déjà arrivé.

**Cette dette-là est soldée.** Le tableau comptait 134 lignes pour un score
annoncé sur 122, et deux critères portaient un numéro déjà pris (A13, A14) : la
passe dédiée a eu lieu (#76), les doublons sont renumérotés A29 et A30, et
l'en-tête se recompte désormais DEPUIS LES LIGNES.

Ce qui reste de la leçon : **un compte tenu à la main diverge.** Recompter en
parsant le document coûte dix lignes de script et attrape ce qu'un œil ne voit
pas. Un tel recompte a resservi en livrant #74, et il a confirmé les deux
colonnes touchées au lieu de les croire.

**Et le document ne ment pas qu'en chiffres.** Une justification de critère est
une AFFIRMATION, au même titre qu'un `expect`. Celle de E10 désignait le poids
0,4 des codominants comme la cause de l'amplitude manquante ; elle a été recopiée
dans `trees.ts` et dans `elancement.test.ts`, si bien que trois endroits du dépôt
disaient la même chose fausse, et que chaque lot suivant y lisait une
confirmation. Personne ne l'avait mesurée. La mesure a demandé une demi-heure de
calcul et a renvoyé le verrou dans un autre fichier (#79).

La règle qui en sort : **une cause écrite dans le référentiel se mesure ou
s'annonce comme une hypothèse.** Et quand elle se mesure, elle se mesure une
fois — pas trois copies d'une même intuition.

## File d'attente

- **#65 est CLOSE, et sans qu'une ligne de moteur ait bougé.** Le poids 0,4 des
  codominants ne porte rien de ce qu'on lui prêtait, et les deux campagnes l'ont
  mesuré : ni l'élancement (poids porté à 1, les dominants passent de H/D 42,1 à
  41,7), ni l'auto-éclaircie (terme ANNULÉ, une pineraie dense passe quand même
  de 361 à 59-69 tiges en 120 ans contre 47-54), ni le tempo de la succession,
  ni le tri des espèces. Ce qui éclaircit ce moteur, ce sont les RAVAGEURS et
  les CHABLIS : sur ~310 morts, 205-244 et 55-98 contre 4-7 pour l'ombre.
  Le verrou de l'élancement est parti dans #79, celui de la mortalité d'ombre
  dans une issue d'évolution.

- **#84 est CLOSE, et elle a coûté trois essais d'autres lots.** Le plancher
  racinaire valait 0,35 du potentiel à tout âge : un hêtre de vingt mètres
  jamais assoiffé avait les racines d'un semis (44 cm). Il croît maintenant avec
  la maturité (0,35 → 0,80, `partPlancherRacines`), l'extrémité jeune
  inchangée, et le seuil d'ancrage de `tempete.ts` est REVENU à sa valeur
  mesurée (6 % au lieu du pansement à 4 %). La leçon de méthode est là :
  `tempete.ts` écrivait noir sur blanc « le vrai sujet est ailleurs, issue
  #84 » — une constante calée pour compenser le défaut d'un autre fichier est
  une DETTE, et les essais qui tombent quand on la solde ne sont pas des dégâts
  collatéraux, ce sont les créanciers. Trois sont tombés ainsi (`tempete`,
  `feu`, `climat`), et les trois mesuraient effectivement la mauvaise chose.

- **L'expansion de branchage** (pas encore d'issue, sorti de #68). Une fois
  l'infradensité en place, le carbone total d'un hêtre de 25 m et 50 cm tombe à
  1 078 kg, soit 3 % SOUS le plancher des équations de biomasse aérienne de
  Zianis 2005 pour cet arbre. Ni `EXPANSION_BRANCHES` (1,30) ni l'infradensité
  de l'IGN (0,55) n'est fautive prise seule — chacune est dans sa fourchette
  publiée — mais toutes deux sont au bas de la leur et l'écart se cumule. À
  regarder SÉPARÉMENT de #79 : deux corrections de biomasse dans le même lot se
  masquent l'une l'autre, et c'est précisément ce que #68 a évité.
