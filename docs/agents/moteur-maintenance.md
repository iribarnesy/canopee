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

## File d'attente

- **#65** — dans `extinctionAt` (`light.ts`), un codominant n'ombrage qu'au poids
  0,4. En plantation régulière tout le monde est codominant de tout le monde :
  l'élancement est bridé (le moteur couvre 27–67 là où la sylviculture va de 25 à
  100) et le terme **sature** — deux écartements dans un rapport de quatre
  donnent le même résultat. Attention : ce coefficient gouverne aussi
  l'auto-éclaircie, la succession et le tri des espèces. Label `à-mesurer` : la
  campagne vient avant le code.
- **#68** — `bois.densite` porte une densité du commerce (0,68 pour le hêtre) là
  où la biomasse demande l'**infradensité** (~0,55). Il reste ~20 % de
  surestimation du carbone vivant. **Le recensement est fait** : deux lecteurs
  seulement, dont un seul (`treeAboveCarbonKg`) veut l'infradensité — l'autre
  (`dureeChandelleSemaines`) n'y lit qu'un proxy de dureté. Donc **un champ, pas
  deux**. Ne reste que le plus dur : une table d'infradensités SOURCÉE, essence
  par essence. Deux avertissements pour qui la reprendra — un facteur global
  appliqué à l'aveugle remplacerait une erreur par une autre, et l'unique ancre
  extérieure du dépôt (1 000–1 400 kg C pour un hêtre de 25 m) accepte les DEUX
  valeurs : elle est à resserrer dans le même lot, sans quoi le correctif ne
  fera basculer aucun essai.
