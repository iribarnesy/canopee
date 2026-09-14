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

## Le référentiel est la mémoire du projet

`docs/realisme.md` doit suivre. Une PR qui change un mécanisme sans mettre à
jour la ligne du critère, le tableau de score et la ligne d'historique laisse le
document mentir — et c'est déjà arrivé.

**Dette connue, non traitée :** le tableau contient deux critères numérotés A13
et deux numérotés A14, et compte **134 lignes pour un score annoncé sur 122**.
Le pourcentage affiché est donc faux. À réconcilier en une passe dédiée.

## File d'attente

- **#65** — dans `extinctionAt` (`light.ts`), un codominant n'ombrage qu'au poids
  0,4. En plantation régulière tout le monde est codominant de tout le monde :
  l'élancement est bridé (le moteur couvre 27–67 là où la sylviculture va de 25 à
  100) et le terme **sature** — deux écartements dans un rapport de quatre
  donnent le même résultat. Attention : ce coefficient gouverne aussi
  l'auto-éclaircie, la succession et le tri des espèces. Label `à-mesurer` : la
  campagne vient avant le code.
- **Instruire `bois.densite`** (pas encore d'issue). L'atlas donne 0,68 pour le
  hêtre, ce qui ressemble à une densité à 12 % d'humidité — la valeur du
  commerce. La biomasse demande l'**infradensité** (masse anhydre sur volume
  vert), ~0,55 pour le hêtre. Si c'est le cas partout, il reste ~20 % de
  surestimation. Vérifier essence par essence, et vérifier à quoi d'autre le
  champ sert avant d'y toucher.
