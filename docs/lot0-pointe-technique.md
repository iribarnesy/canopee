# Lot L0 — la pointe technique, et ce qu'elle a tranché

> **Lot clos. Le banc a été supprimé, ses résultats sont ici.** Le prototype
> (`spike/`, `src/spike/`, `scripts/l0-mesure.mjs`, `scripts/l0-scene.ts`) était
> jetable et a été jeté : L1 est parti sur Pixi, il n'y a plus de question à
> mesurer. Ce document garde les chiffres qui ont tranché, parce que la décision
> ne se comprend pas sans eux. Ce qui survit en code : `src/render/projection.ts`
> et le garde-fou de `scripts/check-boundaries.sh`.
>
> Mesuré le 2026-09-04 sur
> `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro)`, écran à 120 Hz.
> Pour retrouver le banc, il est dans l'historique : `git show 0b7ede6 -- spike
> src/spike scripts/l0-mesure.mjs scripts/l0-scene.ts`.

> **Ce que la mesure a valu, et ce qu'elle a coûté d'apprendre.** Elle a été
> faite deux fois. La première ne valait rien, pour trois raisons qui méritent
> d'être écrites parce qu'elles se retendent à chaque banc de rendu :
>
> 1. **le lanceur forçait le rendu logiciel** (SwiftShader) en dur, donc le bras
>    Pixi était mesuré privé de ce qu'il apporte. Pire : sans argument explicite
>    (`--enable-gpu`), le Chromium « headless » de Playwright y retombe **tout
>    seul et sans le dire** ;
> 2. **le banc chronométrait l'appel de dessin, pas l'image.** `render()` et
>    `drawImage()` empilent des commandes et rendent la main aussitôt. Les
>    « 9 ms » attribuées à Canvas 2D étaient un temps de SOUMISSION ; l'image
>    terminée, dans les mêmes conditions, en coûtait **96 ms** — soit 10 images
>    par seconde et non 111 ;
> 3. **la scène figée datait.** Le peuplement avait changé sous elle.
>
> Le juge de paix, au second passage, a été la **cadence réelle** entre deux
> `requestAnimationFrame`, et — quand elle plafonne au rafraîchissement de
> l'écran — la **capacité** : jusqu'à combien de tiges chaque bras tient
> 60 images par seconde. Deux pièges rencontrés au passage : `gl.finish()` ne
> synchronise pas de façon fiable selon le pilote, et enchaîner K images pour
> contourner le vsync ne marche pas non plus (une image qui commence par un
> `fillRect` plein écran autorise le navigateur à jeter les intermédiaires).

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

Conséquence pratique : **c'est l'an 30 qui a été mesuré**, pas l'an 50, parce
que c'est là qu'est la charge. À hauteurs recalibrées la forêt est **plus
haute** (21,8 m contre 15,1 m à l'an 50) et, à terme, **beaucoup moins
peuplée** qu'on ne le croyait.

Ces chiffres sont ceux du moteur au 2026-09-04 (`df97f2c`). Ils bougent de
quelques pour cent à chaque commit qui touche la croissance — sans conséquence,
puisque les chiffres de rendu se jouent à l'ordre de grandeur du millier de
tiges. **Ce qu'il faut retenir n'est pas « 5 436 » mais « cinq mille tiges au
pic, vers l'an 30, puis moitié moins ».**

**Ce que ça dit du LOD, et ce n'est pas ce qu'on croyait.** Le banc coupait les
tiges sous 1,5 px à l'écran, et **cette coupure ne s'est jamais déclenchée** —
ni sur la nouvelle scène, ni sur l'ancienne. Au zoom 1 un mètre vaut 8 px, donc
il faudrait une tige de moins de 19 cm pour tomber sous le seuil ; la plus
petite de l'ancienne scène en faisait 30 cm, soit 2,4 px. Les cinq mille arbres
étaient donc tous dessinés, dans les deux cas.

Le LOD reste une bonne idée pour L1, mais **il n'a rien économisé ici** : ce
n'est pas lui qui explique les chiffres. Ce qui compte au zoom rapproché, c'est
de **découper par emprise visible** — ne pas dessiner ce qui est hors champ —
et non de remplacer les petites tiges par des taches.

## D1 / Q1 — Pixi ou Canvas 2D : **tranché sur GPU, et c'est Pixi**

### Les chiffres, sur le pire cas (an 30, 5 436 tiges, h max 16,5 m)

| | Canvas 2D | **PixiJS v8** |
|---|---|---|
| aplat — image terminée | 12,6 ms (p95 13,5) | 0,3 ms *(voir la note)* |
| aplat — temps de fil principal | 1,8 ms | **0,3 ms** |
| aplat — **cadence** | 63 img/s | **120 img/s** (plafond écran) |
| liseré — **cadence** | 60 img/s | **120 img/s** |
| ombre portée par image — **cadence** | 60 img/s (16,7 ms/img) | **120 img/s** |
| zoom 4, parcelle entière — **cadence** | **30 img/s** | **120 img/s** |
| **capacité à 60 img/s** | 5 436 tiges | **43 488 tiges** |

Note sur la ligne « image terminée » de Pixi : elle n'est pas fiable, parce que
`gl.finish()` ne synchronise pas selon le pilote. C'est pour cette raison que la
décision repose sur la **cadence** et la **capacité**, qui ne dépendent d'aucune
barrière — et qui, elles, concordent d'une scène à l'autre.

Mesuré sur trois scènes pour vérifier que l'écart n'était pas un accident de
peuplement :

| scène | Canvas 2D tient 60 img/s jusqu'à | Pixi jusqu'à | rapport |
|---|---|---|---|
| an 30 (5 436 tiges) | 5 436 | 43 488 | **×8** |
| an 50 (2 198 tiges) | 8 792 | 35 168 | ×4 |
| ancienne (5 017 tiges) | 5 017 | 20 068 | ×4 |

### La décision : **Pixi**

**Canvas 2D tenait le budget, mais sans aucune marge.** 60 à 63 images par
seconde sur le pic, et une capacité qui vaut *exactement* la scène : à charge
doublée il tombe à 40 img/s. Autrement dit, il passe l'examen et rien de plus —
alors qu'il reste à financer, sur le même budget de 16,7 ms, la simulation,
l'interface, les animations et les particules du lot L8.

**Pixi porte quatre à huit fois plus de tiges, et six fois moins de temps de fil
principal** (0,3 ms contre 1,8). C'est cette seconde ligne qui compte autant que
la première : le temps que le rendu ne prend pas est du temps que le moteur peut
prendre.

L'argument qui plaidait pour Canvas 2D — zéro dépendance de production, contrôle
total sur des formes de toute façon procédurales — reste vrai, mais il ne pèse
pas contre un facteur huit sur le pire cas et un point de rupture déjà atteint
au zoom rapproché. **`pixi.js` passe donc en dépendance de production**, et L1
est parti dessus.

Deux précisions honnêtes sur ce que ces chiffres ne disent pas :

- **on ne connaît pas le coût réel d'une image en Pixi.** Il ne quitte jamais le
  plafond du vsync dans les configurations normales, donc son avance est un
  plancher mesuré, pas une mesure ;
- **la ligne du zoom 4 est une borne pessimiste.** Le banc y dessinait l'hectare
  **entier** dans un canvas de 6 400 × 3 584 px — 16 fois les pixels du zoom 1,
  11 fois une fenêtre de 1 700 × 1 200. Une vraie caméra n'affiche qu'un
  seizième de la parcelle à ce zoom. Le chiffre ne dit donc pas le coût d'une vue
  zoomée ; il dit où regarder, et c'est ce qui fonde l'exigence de **découper par
  emprise visible** dès L1.

Et une garantie qui reste acquise, même si elle ne sert plus de défaut : **le
rendu ne dépend pas d'un GPU pour être possible.** En pur logiciel, Canvas 2D
descend à 10 img/s sur cette scène — jouable, non ; affichable, oui. C'est le
filet en cas de machine sans accélération.

## La règle d'architecture : aucune primitive vectorielle par image

La ligne « ombre portée par image » dessine 5 436 ellipses vectorielles à
chaque image. Sur GPU, elle coûte à Canvas 2D **16,7 ms par image contre
12,6 ms en aplat** — 4,1 ms de plus, et surtout la cadence passe de 63 à
60 img/s, c'est-à-dire pile sur le budget. Pixi, où l'ombre est un sprite,
n'en sent rien (120 img/s dans les deux cas).

En rendu logiciel, la même ligne coûtait **411 ms par image**, soit 2 img/s.
Le GPU réduit donc énormément la pénalité, mais **il ne l'annule pas** : les
4,1 ms consommés sont exactement la marge qui n'existe pas.

**La règle tient, et le choix de Pixi ne dispense pas de l'appliquer :
aucune primitive vectorielle par image.** Ombres, halos, liserés, marqueurs de
changement — tout est cuit une fois dans un bitmap, puis posé en sprite. Sous
Pixi la tentation prend la forme d'un `Graphics` redessiné à chaque image ; le
coût est le même que celui mesuré ici, il n'est simplement plus visible dans un
profil de dessin. C'est la contrainte d'architecture la plus importante que ce
lot ait produite, et elle ne se voit sur aucune capture.

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
2. **le squelette était invariant d'échelle** : la récursion de branchement
   s'arrêtait sur une longueur minimale **proportionnelle** à la hauteur
   (`max(1,5 px ; H × 0,035)`), donc au-delà de ~43 px un arbre plus grand
   n'avait pas plus de segments, seulement des segments plus longs. Le coût
   suivait la surface du bitmap, pas la topologie. **À reproduire dans le vrai
   générateur** : c'est ce seuil relatif qui a évité l'explosion redoutée.

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

Note de lecture : les 1 740–3 369 ms annoncés par la première mesure ne sont
**pas comparables** aux 182 ms ci-dessus — la machine n'est pas la même. Et la
première cuisson d'une session paie la chauffe du JIT : en rendu logiciel elle
coûtait 1 190 ms contre 247 ms pour les suivantes. Se méfier donc d'un chiffre
de cuisson relevé une seule fois.

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
cadence pile sur le budget — chez Canvas 2D ; sous Pixi, où l'ombre est un
sprite, aucun des trois ne se distingue.

**Retenu : aplats avec liseré**, l'ombre en sprite cuit. Le liseré est donc
gratuit dans les deux mondes, et c'est lui qui donne la lisibilité des tuiles.

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

**Gardé en code** : `src/render/projection.ts` (pur, quatorze tests dont des
propriétés d'aller-retour sur terrain accidenté aux quatre orientations), et le
garde-fou de `scripts/check-boundaries.sh` — `Math.random` interdit dans
`src/render` comme dans `src/engine`, et **le moteur ne doit importer ni React
ni `pixi.js`**. Ce dernier point compte davantage maintenant que Pixi est une
dépendance de production : c'est ce qui garde `src/engine` pur et testable sans
navigateur.

**`pixi.js` est passé en dépendance de production**, D1 l'ayant retenu.

**Supprimé** : `spike/`, `src/spike/`, `scripts/l0-mesure.mjs` et
`scripts/l0-scene.ts`. C'était un banc, annoncé jetable, et il n'y a plus de
question à mesurer — L1 est parti sur Pixi. Tout est dans l'historique
(`git show 0b7ede6 -- spike src/spike scripts/l0-mesure.mjs scripts/l0-scene.ts`)
si quelqu'un veut relire l'atlas à la demande ou le tri en profondeur, qui y
étaient éprouvés sur 5 436 sprites.

**Une leçon de méthode, qui est le vrai legs du lot.** La scène du premier
passage avait été produite par un script jetable et non versionné : le jour où
le moteur a changé, elle est devenue fausse **sans que rien ne le signale**, et
c'est ce qui a fait mesurer une forêt deux fois trop courte pendant des
semaines. Un banc dont l'entrée n'est pas régénérable est un banc qui mentira,
tôt ou tard. Si un banc revient un jour dans ce dépôt, son générateur doit être
versionné avec lui.

Les conclusions ci-dessus sont reportées dans `docs/interface-visuelle.md`,
aux endroits marqués **(L0)** : D1, D4, §3, §4, §9, Q1, Q6 et le risque n° 2.

## Ce qui change dans le plan

| Décision | Avant | Après L0 |
|---|---|---|
| **D1** | Pixi par défaut, Canvas 2D en témoin | **Pixi confirmé par la mesure, sur GPU** : Canvas 2D tenait le budget mais sans marge (60–63 img/s, capacité = la scène exactement), Pixi porte 4 à 8× plus de tiges et coûte 6× moins de fil principal |
| **D4** | le houppier émerge du branchement | l'enveloppe du houppier est un **paramètre explicite** de la fiche |
| **Q6** | à trancher sur captures | aplats + liseré recommandés ; **le sol ne peut pas être clair** |
| — | (rien) | **aucune primitive vectorielle par image** — règle d'architecture |
| — | (rien) | l'atlas cuit à **une taille de référence**, pas par palier |
| — | (rien) | **L1 doit découper par emprise visible** : le zoom rapproché est le point de rupture, pas la parcelle entière |
| — | (rien) | **le pire cas est l'an 30, pas l'an 50** : la friche s'auto-éclaircit de moitié ensuite |
| — | (rien) | **toute mesure d'image doit porter une barrière** : sans elle on chronomètre la soumission, pas l'affichage |
