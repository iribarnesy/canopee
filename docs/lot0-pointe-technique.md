# Lot L0 — la pointe technique, et ce qu'elle a tranché

> **Rejoué le 2026-09-04 sur une machine avec carte graphique, et la réserve
> est levée.** Le prototype vit dans `spike/` et `src/spike/`, le générateur de
> scène dans `scripts/l0-scene.ts`, le script de mesure dans
> `scripts/l0-mesure.mjs`.
>
> Matériel de la mesure de référence :
> `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro)`, écran à 120 Hz.
> Le rendu logiciel reste accessible par `L0_LOGICIEL=1`, mais ce n'est plus le
> défaut — c'est ce forçage, laissé en dur dans le lanceur, qui avait invalidé
> D1.

> **Ce que le rejeu a changé, et c'est plus que prévu.** Trois choses :
>
> 1. **Le pire cas s'est déplacé.** La friche ne plafonne plus à cinq mille
>    tiges : elle culmine à 5 436 vers l'**an 30**, puis s'auto-éclaircit
>    jusqu'à 2 198 tiges à l'an 50. La scène de référence pour D1 est donc
>    désormais celle de l'**an 30**, pas celle de l'an 50.
> 2. **Les mesures d'origine ne mesuraient pas ce qu'elles disaient mesurer.**
>    Le banc chronométrait l'appel de dessin, pas l'image. Or `render()` et
>    `drawImage()` empilent des commandes et rendent la main aussitôt. Les
>    « 9 ms » de Canvas 2D étaient un temps de SOUMISSION ; dans les conditions
>    d'origine, l'image terminée en coûtait **96 ms**, soit 10 images par
>    seconde. Le banc relève maintenant la soumission, l'image terminée et la
>    cadence rAF réelle, et les trois se corroborent.
> 3. **La cuisson de l'atlas n'a pas explosé** — c'était le risque annoncé, il
>    ne s'est pas réalisé. Voir plus bas : les paliers absorbent la hausse des
>    hauteurs.
>
> Ce qui **n'était pas** en cause : le nombre de tiges ne vient pas des
> hauteurs, et la règle sur les primitives vectorielles ne dépend pas de la
> taille des sujets. Elle tient toujours.

> **Attention à qui l'on crédite.** Le recalibrage des hauteurs (`5bbbb78`)
> n'est pas seul responsable de la nouvelle démographie : **treize commits** ont
> touché `src/engine` entre la mesure d'origine et ce rejeu — marcescence,
> croissance pilotée par le feuillage, doublon fusain/troène corrigé, chutes de
> troncs, `ce14601`. Le peuplement observé est leur effet cumulé, et le
> présent document ne cherche pas à démêler leurs parts.

## Le pire cas, enfin mesuré au lieu d'être estimé

Le document d'inventaire parlait de « friche en succession, ~5 000 tiges ».
Vérifié en faisant tourner le moteur sur la station `friche-limon` en 1 ha
(100 × 100 m), météo réelle, graine 42 :

| année | arbres | dont chandelles | h max | tiges < 1 m |
|---|---|---|---|---|
| 10 | 2 278 | 14 | 5,3 m | 825 |
| 25 | 4 614 | 1 329 | 14,5 m | 848 |
| **30 — le pic** | **5 436** | **2 004** | **16,5 m** | 1 105 |
| 50 | 2 198 | 865 | 21,8 m | 28 |

L'estimation de « ~5 000 tiges » était juste sur l'ordre de grandeur, mais
**elle ne l'est qu'un moment**. La friche ne se sature pas pour s'y tenir : elle
culmine à 5 436 tiges à l'an 30, puis **s'auto-éclaircit de moitié** — le
couvert se ferme, et ce qui est dessous meurt. La signature est la ronce : 753
tiges à l'an 50, dont **zéro vivante**. Une pionnière héliophile ne survit pas à
son propre succès.

Conséquence pratique : **le banc mesure l'an 30**, pas l'an 50, parce que c'est
là qu'est la charge. Les deux scènes sont versionnées
(`spike/scene-an30.json`, `spike/scene-an50.json`), et le générateur les
reproduit en une commande (`npm run l0:scene`, `L0_ANS=10,25,30,50` pour la
série complète). La comparaison avec l'ancienne mesure, sur ce point, est
franche : à hauteurs recalibrées la forêt est **plus haute** (21,8 m contre
15,1 m à l'an 50) et, à terme, **beaucoup moins peuplée**.

**Ce que ça dit du LOD, et ce n'est pas ce qu'on croyait.** La coupure sous
1,5 px de `preparerArbres()` **ne se déclenche jamais** — ni sur la nouvelle
scène, ni sur l'ancienne. Au zoom 1 un mètre vaut 8 px, donc il faudrait une
tige de moins de 19 cm pour tomber sous le seuil ; la plus petite de l'ancienne
scène en faisait 30 cm (2,4 px). Les 5 017 arbres d'alors étaient donc tous
dessinés, et les 5 436 d'aujourd'hui le sont aussi. La nouvelle scène de l'an 50
n'a même plus que **28 tiges sous un mètre**, contre 1 214.

Le LOD reste une bonne idée pour plus tard, mais **il n'a jamais rien
économisé** dans ce banc : ce n'est pas lui qui explique les chiffres, ni avant
ni maintenant.

## D1 / Q1 — Pixi ou Canvas 2D : **tranché, sur GPU, et Canvas 2D reste le défaut**

```
ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)
```

### Comment on mesure, parce que la première fois c'était faux

`render()` et `drawImage()` **n'attendent pas l'image** : ils empilent des
commandes. Chronométrer l'appel mesure donc le temps de soumission, pas le
temps d'affichage — et l'écart est énorme (1,8 ms contre 12,6 ms pour le même
dessin). Le banc relève maintenant quatre grandeurs :

- **soumission** — le temps de fil principal, celui que la simulation ne peut
  pas utiliser ;
- **image terminée** — avec une barrière (`gl.finish()` pour WebGL, relecture
  d'un pixel pour Canvas 2D). La barrière à vide coûte 0,01 ms, donc elle ne
  contamine pas la mesure ;
- **cadence** — l'écart réel entre deux `requestAnimationFrame`. C'est la
  réponse littérale à « tient-on 16,7 ms ? » ;
- **capacité** — jusqu'à combien de tiges chaque bras tient 60 images par
  seconde, en empilant la parcelle sur elle-même.

Deux mises en garde de méthode, pour qui rejouera :

1. **`gl.finish()` ne synchronise pas de façon fiable.** Pixi annonce 0,2 ms
   par image même en rendu logiciel, ce qui est faux — sa cadence, elle, tombe
   à 9 img/s dans ce cas. Pour Pixi, **seules la cadence et la capacité sont
   dignes de foi** ; pour Canvas 2D les quatre grandeurs concordent.
2. **Le « débit » a été essayé et jeté.** Enchaîner K images puis attendre une
   fois devait contourner le vsync ; ça mesure faux, parce que chaque image
   commence par un `fillRect` plein écran et que le navigateur jette alors les
   images intermédiaires. C'est la capacité qui répond à la question sans ce
   piège. Le commentaire est resté dans `banc.ts` pour que personne ne le
   refasse.

### Les chiffres, sur le pire cas (an 30, 5 436 tiges, h max 16,5 m)

| | Canvas 2D | PixiJS v8 |
|---|---|---|
| aplat — image terminée | 12,6 ms (p95 13,5) | 0,3 ms *(non fiable)* |
| aplat — soumission | 1,8 ms | 0,3 ms |
| aplat — **cadence** | **63 img/s** | **120 img/s** (plafond écran) |
| liseré — **cadence** | **60 img/s** | **120 img/s** |
| ombre portée par image — **cadence** | **60 img/s** (16,7 ms/img) | **120 img/s** |
| zoom 4, parcelle entière — **cadence** | **30 img/s** | **120 img/s** |
| **capacité à 60 img/s** | **5 436 tiges** (×1) | **43 488 tiges** (×8) |

Et pour mémoire, la même scène **en rendu logiciel** : Canvas 2D tombe à
10 img/s (96 ms par image). Le GPU n'est donc pas un luxe pour Canvas 2D non
plus — c'est lui qui fait passer le budget.

### La réponse

**Canvas 2D tient le budget de 16,7 ms sur une forêt de vraie taille, mais
tout juste : 60 à 63 images par seconde, et zéro marge.** La capacité le dit
sans ambiguïté — à ×1 il passe, à ×2 il tombe à 40 img/s. Il est exactement à
sa limite sur le pire cas.

**Pixi le bat d'un facteur 4 à 8 en capacité** (43 488 tiges contre 5 436 à
l'an 30 ; 20 068 contre 5 017 sur l'ancienne scène ; 35 168 contre 8 792 à
l'an 50). On ne peut pas donner mieux qu'une fourchette : Pixi ne quitte jamais
le plafond du vsync dans les configurations normales, donc son coût réel par
image n'est pas mesurable ici — seule sa capacité l'est.

**D1 ne change pas : Canvas 2D reste le défaut.** Il tient le pire cas réel,
avec zéro dépendance de production et un contrôle total sur des formes qui sont
procédurales de toute façon. Mais la décision est désormais **plus serrée
qu'elle en avait l'air**, et il faut le dire clairement : les « 9 ms sur un
budget de 16,7 » étaient un artefact de mesure ; la vraie marge est nulle. Deux
conséquences pour L1 :

- **le zoom rapproché est le point de rupture, pas la parcelle entière.** Au
  zoom 4 la cadence tombe à 30 img/s. À nuancer honnêtement : le banc dessine
  l'hectare **entier** dans un canvas de 6 400 × 3 584 px, soit 16 fois les
  pixels du zoom 1 et 11 fois une fenêtre de 1 700 × 1 200. Une vraie caméra
  n'affiche qu'un seizième de la parcelle à ce zoom. Le chiffre est donc une
  **borne pessimiste**, pas le coût d'une vue zoomée — mais il dit où
  regarder : **L1 doit découper par emprise visible**, ce qui n'était pas une
  exigence tant qu'on croyait le zoom 4 gratuit ;
- **Pixi passe de « option de montée en charge » à « issue de secours
  identifiée et chiffrée »**. Le facteur 4 à 8 est la marge qu'on achèterait si
  les particules du lot L8, une parcelle plus grande ou un matériel plus modeste
  faisaient sauter Canvas 2D. Il reste en dépendance de développement.

**À rejouer sur la scène de référence**, c'est trois commandes :

```bash
L0_ANS=30,50 npm run l0:scene     # régénère les scènes depuis le moteur
npm run dev &                     # sert /spike/index.html
L0_URL='http://localhost:5173/spike/index.html?scene=/spike/scene-an30.json' node scripts/l0-mesure.mjs
```

`npm run l0:scene` seul ne produit que l'an 50 ; `L0_ANS` prend une liste
d'années et une seule passe les écrit toutes. Côté mesure, `L0_LOGICIEL=1`
force le rendu logiciel, `L0_URL` choisit l'instantané (défaut : l'an 50) et
`L0_SORTIE` le dossier de sortie.

**Vérifier la ligne `MATÉRIEL` avant de croire un chiffre.** Sans
`--enable-gpu`, le Chromium « headless » de Playwright retombe sur SwiftShader
**sans le dire** — c'est le piège qui a coûté la première mesure, et il se
retend à chaque rejeu.

## La règle d'architecture : confirmée, et le GPU ne la sauve pas

La ligne « ombre portée par image » dessine 5 436 ellipses vectorielles à
chaque image. Sur GPU, elle coûte à Canvas 2D **16,7 ms par image contre
12,6 ms en aplat** — 4,1 ms de plus, et surtout la cadence passe de 63 à
60 img/s, c'est-à-dire pile sur le budget. Pixi, où l'ombre est un sprite,
n'en sent rien (120 img/s dans les deux cas).

En rendu logiciel, la même ligne coûtait **411 ms par image**, soit 2 img/s.
Le GPU réduit donc énormément la pénalité, mais **il ne l'annule pas** : les
4,1 ms consommés sont exactement la marge qui n'existe pas.

**La règle tient, et elle vaut pour les deux bras : aucune primitive
vectorielle par image.** Ombres, halos, liserés, marqueurs de changement : tout
est cuit une fois dans un bitmap ou posé en sprite. C'est la contrainte
d'architecture la plus importante que ce lot ait produite, et elle ne se voit
sur aucune capture.

## L'atlas à la demande : validé, et **le risque annoncé ne s'est pas réalisé**

C'était la crainte principale du rejeu : des arbres deux fois plus hauts, un
coût de cuisson à peu près quadratique en hauteur, donc une explosion. **Elle
n'a pas eu lieu**, et pour une raison qui tient à la conception :

| scène | tiges | silhouettes cuites | arbres / texture | paliers | plus grand bitmap | cuisson |
|---|---|---|---|---|---|---|
| ancienne (h max 15,1 m) | 5 017 | 474 | 10,6 | 3→14 | 128 px | 231 ms |
| an 30 (h max 16,5 m) | 5 436 | **398** | 13,7 | 3→14 | 128 px | **182 ms** |
| an 50 (h max 21,8 m) | 2 198 | **240** | 9,2 | 4→15 | 181 px | **199 ms** |

Le nombre de silhouettes **baisse** au lieu d'exploser. Deux mécanismes :

1. **les paliers sont logarithmiques**, donc doubler les hauteurs n'ajoute que
   deux paliers — la plage reste couverte, sans trou et sans débordement ;
2. **le squelette est invariant d'échelle** : `longueurMinimale = max(1,5;
   H × 0,035)` arrête la récursion à une fraction de la hauteur, donc au-delà
   de ~43 px un arbre plus grand n'a pas plus de segments, seulement des
   segments plus longs. Le coût suit la surface du bitmap, pas la topologie.

Et la strate haute est **moins diverse** que la strate basse : à l'an 50 il
reste six essences en nombre, donc moins de combinaisons à cuire.

**Reste que 182 à 200 ms de gel au premier affichage sont encore trop**, et que
la cuisson au zoom 4 monte à 372 ms. Les trois remèdes prévus restent valables,
mais leur urgence baisse d'un cran :

1. **cuire à UNE taille de référence** et mettre à l'échelle, au lieu de cuire
   par palier — c'est ce qui divise le travail par douze, et c'est le seul
   remède qui reste clairement rentable ;
2. **étaler la cuisson sur plusieurs images** plutôt que tout au premier
   affichage ;
3. **plafonner le nombre de segments** par arbre — utile comme garde-fou, mais
   la mesure montre que ce n'est pas là que ça se joue.

Note de lecture : les 1 740–3 369 ms annoncés dans la version précédente ne
sont **pas comparables** aux 182 ms ci-dessus. La machine n'est pas la même, et
la première mesure d'une session paie la chauffe du JIT — visible en rendu
logiciel, où la première cuisson coûte 1 190 ms et les suivantes 247 ms.

## D4 — les silhouettes reconnaissables : validé, avec une correction de méthode

![Trois essences × trois saisons](lot0-silhouettes.png)

Bouleau, chêne pubescent et pin sylvestre, en été, en automne et en hiver,
squelette généré par branchement et feuilles tracées à la main. **Ils se
distinguent au premier coup d'œil**, y compris nus : le fût blanc et les
rameaux fins du bouleau, le tronc sombre et la masse globuleuse du chêne, les
étages horizontaux et le fût orangé du pin.

**Mais le houppier n'ÉMERGE PAS du branchement, et c'est la correction que ce
lot apporte au §4 du document.** Il a fallu :

- baisser la dominance apicale du bouleau de 0,85 à 0,62 et lui ajouter un
  ordre : à 0,85, l'axe garde tout et le feuillage finit en touffe au sommet
  d'un bâton ;
- donner au pin un port **étagé** distinct (un axe droit et des verticilles
  presque horizontaux) au lieu d'une fourche : aucun réglage d'angle sur un
  port fourchu ne produit un cône ;
- **écourter explicitement les étages vers le sommet** : sans cette
  décroissance imposée, le pin fait une boule.

Autrement dit : l'enveloppe du houppier doit être un **paramètre explicite** de
la fiche graphique, pas une propriété espérée du branchement. À corriger dans
le §4 avant d'écrire les vingt-cinq fiches, sinon on les écrira deux fois.

Trois bugs de la première version, pour mémoire, parce qu'ils sont instructifs :
les feuilles ne s'accrochaient qu'au dernier **ordre** de récursion (or les
branches deviennent trop courtes avant d'y arriver — le bouleau sortait nu) ;
le bitmap était dimensionné sur la hauteur nominale, donc les arbres étaient
coupés en haut ; et une feuille par rameau donne une brindille décorée, pas une
masse foliaire — il faut un **bouquet**.

## Q6 — le style

Trois traitements ont été rendus sur la scène complète. Sur GPU, `liseré` ne
coûte quasiment **rien** de plus qu'`aplat` (13,0 contre 12,6 ms par image, et
60 contre 63 img/s), là où l'ombre portée par image coûte 4,1 ms et ramène la
cadence pile sur le budget. **Le rejeu confirme la recommandation d'origine**,
et sur des chiffres plus solides que les p95 erratiques de la première fois.

Ma recommandation, inchangée : **aplats avec liseré**, l'ombre en sprite cuit.
Mais la décision t'appartient, et les captures sont dans le prototype.

**Un constat de direction artistique qu'aucun chiffre ne donnait** : sur un
fond blanc cassé, **le bouleau disparaît**. Son écorce blanche est sa signature
la plus forte, et elle ne peut pas se lire sur un sol clair. Il a fallu passer
la planche à un vert-gris moyen pour que les trois essences se distinguent.
Conséquence pour §4 : la palette de sol ne peut pas être claire — ou bien le
bouleau a besoin d'un liseré sombre. C'est le genre de contrainte qu'on ne
trouve qu'en regardant.

## D3 — le relief à l'échelle vraie : confirmé bon marché

Le terrain se cuit en morceaux de 16 × 16 m (49 morceaux pour 10 000 cellules),
flancs verticaux et ombrage de pente compris : **13 à 29 ms** sur GPU (62 à
114 ms à la mesure d'origine), une fois. Et
`projection.ts` porte la condition qui rend tout cela gratuit — un mètre
vertical occupe à l'écran ce qu'un mètre horizontal occupe en largeur, donc le
cube unité est un cube (test à l'appui).

## Ce que le lot laisse derrière lui

**Gardé** : `src/render/projection.ts` (pur, quatorze tests dont des propriétés
d'aller-retour sur terrain accidenté aux quatre orientations), ce document, et
le garde-fou de déterminisme dans `scripts/check-boundaries.sh` (`Math.random`
interdit dans `src/render`).

`pixi.js` est installé en **dépendance de développement**, pas de production :
seul le banc l'importe, et D1 ne l'a pas retenu par défaut. C'est là qu'il faut
qu'il soit tant que la question reste ouverte — et il ne coûte rien au paquet
livré à cet endroit.

**Jetable, et maintenant jetable pour de bon** : `spike/` et `src/spike/`
n'ont plus de question ouverte à garder — D1 est tranchée sur GPU, sur une
forêt de vraie taille, et sur une mesure dont on sait ce qu'elle mesure. Ils
peuvent partir avec `scripts/l0-mesure.mjs` dès que L1 démarre. Une raison de
les garder un peu, cependant : **la capacité est le seul chiffre qui dira si
L1 dérive**, et la refaire coûte deux commandes.

**Ce qui vaut la peine de survivre au banc**, en revanche, c'est
`scripts/l0-scene.ts` : le premier jet de la scène avait été produit par un
script jetable et non versionné, ce qui l'a rendue silencieusement obsolète le
jour où le moteur a changé. Le générateur est maintenant du code, avec sa
commande (`npm run l0:scene`), et il repose sur le moteur sans le modifier.

`spike/scene-an30.json` et `spike/scene-an50.json` sont les scènes **figées** :
sorties du moteur (station `friche-limon`, 1 ha, graine 42, météo réelle,
climat figé) et versionnées telles quelles. Elles ne sont pas dans `public/`
exprès — le banc est un outil de développement, il n'a rien à faire dans le
paquet livré — et elles sont figées plutôt que régénérées pour que le même jeu
d'arbres soit mesuré d'une machine à l'autre. **L'an 30 est la scène de
référence** (le pic de charge) ; l'an 50 est gardée parce que c'est la forêt la
plus haute, donc le pire cas de remplissage par arbre.

**Les deux fichiers sont épinglés à un état du moteur : `df97f2c`.** C'est la
contrepartie du gel, et il faut la dire, sinon elle se lit comme un bug : gelée
veut dire qu'elle NE SUIT PAS le moteur. Régénérer sur un moteur plus récent
donnera donc un fichier différent, et **c'est normal**. Constaté dès la fusion
de la PR #1 : `72e4162` (le carbone racinaire préservé au rabattage) déplace la
démographie de ~1 % — 5 378 tiges au lieu de 5 436 à l'an 30, 2 180 au lieu de
2 198 à l'an 50, hauteurs maximales inchangées à 0,01 m près. Aucune conclusion
de ce document n'en dépend.

Comment lire un écart, donc :

- **écart de quelques pour cent après un commit moteur** — attendu, rien à
  faire. Les chiffres de perf restent valables : ils se jouent à l'ordre de
  grandeur du millier de tiges, pas à la cinquantaine près ;
- **écart sur les HAUTEURS, ou de plus de ~20 % sur le nombre de tiges** — là
  il faut rejouer le banc. C'est exactement ce qui a invalidé la première
  mesure, et le remplissage par image dépend de la hauteur au carré ;
- **écart sans commit moteur entre-temps** — celui-là est un vrai bug, dans le
  générateur ou dans le déterminisme du moteur. Le PRNG est seedé et
  `scripts/check-boundaries.sh` interdit `Math.random` : deux passes sur le
  même arbre doivent donner le même octet.

Les conclusions ci-dessus sont reportées dans `docs/interface-visuelle.md`
v0.4, aux endroits marqués **(L0)** : D1, D4, §3, §4, §9, Q1, Q6 et le
risque n° 2.

## Ce qui change dans le plan

| Décision | Avant | Après L0 |
|---|---|---|
| **D1** | Pixi par défaut, Canvas 2D en témoin | **Canvas 2D par défaut, confirmé sur GPU** — mais sans marge (60–63 img/s sur le pire cas). Pixi = issue de secours chiffrée à 4–8× |
| **D4** | le houppier émerge du branchement | l'enveloppe du houppier est un **paramètre explicite** de la fiche |
| **Q6** | à trancher sur captures | aplats + liseré recommandés ; **le sol ne peut pas être clair** |
| — | (rien) | **aucune primitive vectorielle par image** — règle d'architecture |
| — | (rien) | l'atlas cuit à **une taille de référence**, pas par palier |
| — | (rien) | **L1 doit découper par emprise visible** : le zoom rapproché est le point de rupture, pas la parcelle entière |
| — | (rien) | **le pire cas est l'an 30, pas l'an 50** : la friche s'auto-éclaircit de moitié ensuite |
| — | (rien) | **toute mesure d'image doit porter une barrière** : sans elle on chronomètre la soumission, pas l'affichage |
