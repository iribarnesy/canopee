# Canopée — L'interface visuelle (vue isométrique)

> Inventaire, v0.1 (2026-09-03). **Rien n'est développé.** Ce document est la
> liste de tout ce qu'il faut construire, dans quel ordre, et ce que le moteur
> devra apprendre à dire pour que ce soit possible. Les estimations de charge
> sont en journées d'un développeur qui connaît le dépôt (S ≈ ½ j, M ≈ 1–2 j,
> L ≈ 3–5 j, XL ≈ une semaine et plus).

---

## 0. Ce qu'on construit, et ce qu'on ne touche pas

L'écran de jeu actuel (`src/game/GameView.tsx`) est un **tableau de bord** :
une carte en vue oblique, six calques de sol, un HUD dense, un fil
d'événements, tous les leviers. Il est fait pour comprendre et pour régler.
Il ne bouge pas — c'est l'instrument de mesure, et c'est aussi la vue de
débogage dont on aura besoin pour développer l'autre.

On ajoute une **vue parcelle** : isométrique, en diagonale vue d'en haut,
minimaliste, animée. Elle est faite pour *regarder* la parcelle vivre, pas
pour la piloter au gramme d'azote près. Les deux vues partagent la même
partie : même worker, même instantané, une bascule dans l'écran de jeu (pas
un troisième onglet à côté du labo — sinon on jouerait deux parties).

### Trois principes non négociables

1. **Le rendu n'invente rien que le moteur ne sache.** Un arbre jaunit à
   l'écran parce que sa `vigueur` a baissé, pas parce que c'est joli en
   septembre. Quand on *met en scène* quelque chose que le moteur ne calcule
   pas — la vague d'une crue, la forme exacte du front de flamme — on le dit
   ici, explicitement, et la mise en scène ne doit jamais contredire l'état :
   la vague monte là où `soilNappeCm ≤ 5`, nulle part ailleurs. C'est la même
   exigence que le « proxy honnête » de l'indice de biodiversité
   (docs/regles.md §13).
2. **Aucun asset externe.** Pas de PNG dessinés à la main, pas de pipeline
   d'art. Les silhouettes sont **générées au démarrage** par du code vectoriel
   dans un atlas de textures. Conséquences : le style est paramétrable d'un
   seul endroit, chaque combinaison (essence × stade × saison × gestion) est
   gratuite, la palette reste une source unique partagée avec
   `src/ui/couleurs.ts`, et le dépôt ne grossit pas. C'est ce qui rend un
   projet solo tenable sur 19 espèces.
3. **Le moteur reste pur.** `src/render/` peut lire `src/engine/` (types et
   fonctions pures) ; l'inverse est déjà interdit par
   `scripts/check-boundaries.sh`. À ajouter au même script : **pas de
   `Math.random` dans `src/render/`** non plus (§8).

### Hors périmètre (assumé)

Vraie 3D · cycle jour/nuit · personnages et animaux visibles individuellement
(le gibier se lit à ses dégâts, pas à un sprite de chevreuil) · météo
volumétrique · son · vue première personne · éditeur de terrain isométrique
(l'éditeur actuel suffit).

---

## 1. Les sept décisions à prendre avant d'écrire une ligne

| # | Décision | Recommandation | Pourquoi, et le risque |
|---|---|---|---|
| **D1** | Moteur de rendu | **PixiJS v8** (WebGL) | `docs/stack.md` l'a déjà acté. Ce qu'on y gagne vraiment : le batching de quelques milliers de sprites, les conteneurs et le culling, les filtres (flou de chaleur, reflet d'eau) et **les particules** (braises, feuilles, embruns) — c'est la moitié des animations du §6. Coût : ~400 ko de bundle, une dépendance de plus. *Alternative crédible* : Canvas 2D en couches (terrain cuit dans un canvas hors écran, arbres blittés depuis un atlas). Zéro dépendance, et nos formes sont procédurales de toute façon — mais les particules et les filtres se paient à la main. **Le lot 0 (§9) tranche pour de bon.** |
| **D2** | Projection | **dimétrique 2:1** (losange de largeur 2× la hauteur) | Le classique. Les diagonales tombent sur des pentes entières, la profondeur se trie par `x + y`, et le picking s'inverse analytiquement. Une vraie isométrie 30° donne des losanges à hauteurs non entières : joli, et pénible. |
| **D3** | Échelle verticale | **relief exagéré ×0,5 à ×1 ; arbres à l'échelle vraie** | En iso, l'emprise horizontale double (200 demi-tuiles pour 100 m de côté) : un arbre de 25 m ne fait plus qu'un huitième de la largeur de la parcelle, contre un quart en vue de dessus. On n'a donc **pas besoin** du tassement à 0,55 de la vue actuelle — la hauteur redevient lisible pour rien. Le relief, lui, doit sans doute être tassé : 30 % de pente sur 100 m, c'est 30 m de dénivelé, et le fond de parcelle passerait derrière la crête. À régler au lot 0, avec les vraies stations. |
| **D4** | Silhouettes par espèce ? | **8 archétypes** + teinte et paramètres par espèce | 19 espèces (et l'atlas en promet 40) × 5 stades × 4 saisons est un travail d'illustrateur. Huit ports d'arbre couvrent la réalité : ce qui distingue un frêne d'un châtaignier à 40 m de distance, c'est sa couleur et sa densité, pas sa géométrie. Détail des archétypes au §5.4. |
| **D5** | Composition ou sprites entiers ? | **composition en trois pièces** (tronc / couronne / accessoires) | Un arbre élagué **et** trogné **et** avec des fruits **et** en train de brûler est une combinaison légitime. En sprites entiers, c'est un produit cartésien ; en pièces, c'est trois `drawImage`. Compte de textures au §5.9. |
| **D6** | Où vit l'état d'animation ? | **dans le rendu** (le moteur n'a pas d'états de mise en scène) — *sauf* les arbres morts sur pied, qui méritent d'exister dans le moteur (§2.6) | Le rendu tient une « scène » persistante entre deux instantanés : positions interpolées, animations en cours, cadavres en cours de chute. Le moteur ne doit jamais apprendre le mot « frame ». |
| **D7** | Le temps | horloge d'animation en temps réel, **découplée** du tick, + une **politique de vitesse** | Point dur, et il faut le regarder en face : le worker tourne à 10 Hz et avale **jusqu'à 26 semaines par pas** (`worker.ts:startLoop`), en ne postant qu'un instantané par lot. À ×512, une année entière passe entre deux images. Aucune animation ponctuelle ne peut se jouer. La politique : voir §6.8. |

---

## 2. Le contrat de données : ce que le moteur sait déjà, et ne dit pas

C'est **le plus gros morceau technique du chantier**, et le moins
spectaculaire. Presque tout ce qu'il faut est déjà calculé ; l'instantané
(`src/game/protocol.ts`) n'en transporte qu'un extrait, taillé pour la carte
en aplats.

### 2.1 Par arbre

`SnapshotTree` envoie aujourd'hui : `id, especeId, x, y, heightM, ageWeeks,
stress, fruitsKg, hauteurElagueeM, protege`.

| Champ de `TreeState` | Envoyé ? | Ce qu'il permet de dessiner |
|---|---|---|
| `hauteurElagueeM` | ✅ | La bille nue jusqu'au houppier — déjà exploité par la vue oblique. |
| `protege` | ✅ | Le manchon au pied du plant. |
| `fruitsKg` | ✅ | Les fruits mûrs sur la couronne. |
| `stress` | ✅ | Rien pour l'instant : le stress ne monte qu'au bord de la mort. Utile pour les 2–3 dernières semaines d'un arbre. |
| **`teteTrogneM`** | ❌ | **La trogne** : tête renflée à hauteur d'homme, faisceau de rejets au-dessus. Demandé explicitement. |
| **`recepages`** | ❌ | L'âge de gestion : une trogne à son 6ᵉ étêtage a une tête grosse et creuse, pas la même qu'au premier. Sert aussi à la cavité (habitat). |
| **`vigueur`** | ❌ | **La clé de la santé visible** : moyenne lissée du facteur limitant. Un arbre qui végète a un feuillage clairsemé et pâle *avant* d'accumuler du stress. C'est ce qui rendra une parcelle « en souffrance » lisible d'un coup d'œil. |
| **`dommageHydraulique`** | ❌ | La **cime sèche** : branches mortes en haut du houppier, la signature des sécheresses passées. Mémoire pluriannuelle — visuellement, l'arbre garde la trace. |
| **`brulEeSemaine`** | ❌ | L'arbre **mort debout et carbonisé**, encore récoltable un an. Il est déjà dans `state.trees` mais `alive: false`, donc filtré à l'envoi : *aujourd'hui, un arbre brûlé disparaît de l'écran alors que le moteur le garde en jeu*. |
| **`alive`** | ❌ (filtré) | Idem : sans ce champ, aucun cadavre n'est affichable. |
| **`causeMort`** | ❌ | Choisit l'animation de mort (§6.3). |
| **`derniereLeveeSemaine`** | ❌ | Le tronc **démasclé** du chêne-liège : ocre-rouge vif pendant quelques années, puis il grisonne. Un des plus beaux détails disponibles gratuitement. |
| **`rootDepthCm`** | ❌ | Pour une coupe de sol en option (« voir les racines ») ; pas prioritaire. |
| **`fruitProgress`, `bloomFrosted`** | ❌ | Floraison → nouaison → maturation, et les **fleurs grillées** par un gel tardif (fleurs brunes, pas de fruits cette année). |
| **`pousseTendreM`** | ❌ | Ce que le chevreuil mange. Pour l'animation de broutage (rameaux coupés net). |

**À faire** : élargir `SnapshotTree` à ces champs (`M`). Coût mémoire : ~14
nombres × quelques milliers d'arbres par instantané, négligeable. Attention à
`stationInfo`/`postSnapshot` : les tableaux de sol sont **transférés** (zéro
copie) ; les arbres sont sérialisés — au-delà de ~20 000 arbres il faudra
passer les arbres en tableaux typés parallèles (`Float32Array` par champ).
À surveiller, pas à faire tout de suite.

### 2.2 Par cellule

| Donnée | Envoyée ? | Usage visuel |
|---|---|---|
| `soilWater`, `soilPh`, `soilN`, `soilEngorgement`, `soilNappeCm` | ✅ | Nuances du sol, mares, sol détrempé. Les calques analytiques restent à l'autre vue ; ici c'est de l'ambiance. |
| `soilHerbe` | ✅ | Le tapis : rase, haute, sèche, fauchée. |
| `soilCloture` | ✅ | Le grillage (déjà tracé en périmètre par la vue actuelle). |
| `enEau` (fixe) | ✅ | Ruisseau, mare. |
| **`altitudesM`** | ❌ | **Le relief.** `altitudeParCellule()` est déjà appelé dans `worker.ts:stationInfo()` pour placer l'eau — il suffit de le joindre à `StationInfo`. Sans ça, pas d'isométrique du tout. **Bloquant, `S`.** |
| **`debordementParCellule`** (mm/sem) | ❌ | **L'eau qui court en surface** — la seule base honnête pour une crue, une nappe d'eau, une ravine. Calculé dans `tick.ts:456` et jeté. **`S`.** |
| **`groundLight`** | ❌ | La lumière au sol (`light.ts:computeGroundLight`). Donne le sous-bois sombre, les taches de lumière, la clarté d'une clairière — l'ambiance, presque gratuitement. **`S`.** |
| **`litterCG`** | ❌ | Le tapis de feuilles mortes en novembre, le paillage sous une couronne, le noir des cendres après un feu. **`S`.** |
| **`cellules brûlées`** | ❌ | Voir §2.3. |
| `herbeBiomasse` | ❌ | Le foin sur pied de l'été (jaune) ≠ la couverture verte. Nuance, `S`. |

### 2.3 Les événements spatialisés — le vrai manque

Le fil d'événements est **du texte** (`GameEvent = { week, icone, message }`).
Pour animer, il faut savoir *où*.

| Événement | Ce que le moteur a | Ce qu'il faut | Charge |
|---|---|---|---|
| **Morts** | `TickResult.morts: { especeId, cause, heightM }[]` — pas d'`id`, pas de position | `{ id, especeId, x, y, heightM, cause, semaine }` | `S` (ajouter les champs, `tick.ts:1313`) |
| **Incendie** | `{ cellulesBrulees, arbresTues, rejets, carboneTHa }` — des compteurs | **l'ensemble des cellules brûlées**, plus pour chacune son **rang d'arrivée du front** (distance à l'origine), et la liste des arbres tués / des souches qui rejettent | `M` — voir la note ci-dessous |
| **Crue** | `fluxes.partInondee` (un scalaire) | dérivable côté rendu : `soilNappeCm ≤ 5` par cellule + `debordement` + le côté du ruisseau. Rien à changer dans le moteur si on expose `debordementParCellule`. | `S` |
| **Coupe / éclaircie / recépage** | l'arbre disparaît (ou rapetisse) entre deux instantanés | `{ ids, type }` pour animer la chute plutôt que l'escamotage | `S` |
| **Broutage / frottis** | `fluxes.broutageKg`, `tree.frotteSemaine` | les `id` touchés cette semaine | `S` |
| **Gel des fleurs** | `bloomFrosted` par arbre | rien de plus | — |

**Note sur le front de feu.** `feu.ts:propager()` fait un parcours en pile
(`file.pop()`, donc en profondeur) et l'ordre de consommation du PRNG en
dépend : **le remplacer par une file casserait le déterminisme et les tests**
(`tests/ecology/feu.test.ts`, `incendie-nappe.test.ts`). La bonne façon :
garder le parcours tel quel, et calculer *après coup*, en passe pure sur
l'ensemble des cellules brûlées, la distance de chacune à l'origine (BFS sur
le seul ensemble brûlé). Aucun tirage, aucun changement de résultat, et le
rendu obtient exactement ce qu'il lui faut pour faire courir un front.

### 2.4 La phénologie

`leavesOn = weather.tMean > 6 °C` est calculé dans `tick.ts` et **jamais
transmis**. La chute des feuilles est un couperet : semaine 44, tout tombe
d'un coup (`LITTERFALL_WEEK`). Le débourrement n'existe pas comme date, c'est
un seuil de température franchi.

Pour une belle vue saisonnière il faut un **état phénologique continu** ∈ [0,1]
par arbre (ou au moins par espèce) : nu → débourrement → pleine feuille →
coloration → chute. Deux chemins :

- **Cheap (`S`)** : le rendu le dérive lui-même d'un lissage de `tMean` sur
  quelques semaines + `LITTERFALL_WEEK`. Suffisant, mais c'est le rendu qui
  invente une phénologie que le moteur ignore — contraire au principe 1, à
  assumer comme approximation d'affichage.
- **Propre (`M`)** : le moteur porte un `phenologie ∈ [0,1]` par arbre, piloté
  par les degrés-jours (`ddYearBase5` existe déjà !) et le besoin en froid de
  l'espèce. Utile *au moteur* aussi : le gel tardif, l'ombre portée d'hiver et
  l'interception de la lumière méritent mieux qu'un seuil binaire à 6 °C.
  C'est un critère de `docs/realisme.md` §D qui se débloquerait au passage.

**Recommandation : la voie propre**, mais au lot 3, pas au lot 0.

### 2.5 Récapitulatif des changements de protocole

| # | Changement | Charge | Bloque quoi |
|---|---|---|---|
| P1 | `StationInfo.altitudesM` | `S` | tout le relief iso (lot 1) |
| P2 | `SnapshotTree` élargi (14 champs) | `M` | stades, gestion, santé (lots 2, 4) |
| P3 | arbres morts inclus dans l'instantané (`alive`, `causeMort`) | `S` | les morts, les brûlés (lots 5, 6) |
| P4 | `soilDebordement`, `soilLumiereAuSol`, `soilLitiere` | `S` | eau de surface, ambiance, cendres |
| P5 | `TickResult.morts` avec `id`, `x`, `y` | `S` | animations de mort |
| P6 | `TickResult.incendie` avec cellules + rang du front | `M` | l'incendie (lot 6) |
| P7 | événements de gestion spatialisés (coupes, brout) | `S` | retours d'action (lot 4) |
| P8 | phénologie continue dans le moteur | `M` | les saisons (lot 3) |

Total protocole : **~2,5 j**, sans une ligne de rendu. C'est le prix d'entrée.

### 2.6 Un changement de moteur qui vaut le détour : les arbres morts restent debout

Aujourd'hui, un arbre tué par la sécheresse quitte `state.trees` **le tick
même** de sa mort (`tick.ts:1305`) — sauf s'il a brûlé, cas déjà traité avec
`brulEeSemaine` et un an de sursis. Le rendu peut compenser en gardant un
« fantôme » issu de l'instantané précédent, mais c'est un pansement, et à
grande vitesse le fantôme n'a même pas le temps de tomber.

**Ce qui serait juste** : tout arbre mort reste sur pied quelques années
(`mortSemaine`, chandelle), puis tombe et devient du bois mort au sol. Ce
n'est pas un artifice d'affichage — c'est de l'écologie, et
`docs/regles.md` §13 liste précisément « arbres à cavités » et « bois mort »
parmi les manques de l'indice de biodiversité. Une chandelle est un habitat.

Coût : `M` côté moteur (généraliser le mécanisme de `brulEeSemaine`, revoir la
comptabilité carbone du bois mort — le carbone irait au pool sur pied, pas
immédiatement au sol) + des tests à ajuster. **Décision à prendre par toi**
(§11, Q4) : je le recommande, mais c'est du moteur, donc c'est ton domaine
scientifique, pas une facilité de rendu.

---

## 3. Architecture de rendu

```
src/render/
  projection.ts      # parcelle (m) ↔ écran (px), aller ET retour. Pur, testable.
  camera.ts          # pan, zoom, orientation (4 quarts de tour), limites
  scene.ts           # la scène persistante : ce qui est à l'écran, entre deux instantanés
  interpolation.ts   # lissage d'un instantané au suivant (hauteurs, fruits, eau)
  couches/
    terrain.ts       # sol cuit en tuiles, reconstruit par morceaux quand ça change
    eau.ts           # ruisseau, mare, nappe affleurante, ruissellement
    tapis.ts         # herbe, litière, cendres, labour
    arbres.ts        # tri en profondeur, composition tronc/couronne/accessoires
    particules.ts    # braises, feuilles, embruns, poussière, fumée
    ciel.ts          # fond, lumière de saison, pluie, neige, brume
  atlas/
    generateur.ts    # dessin vectoriel → textures, au démarrage
    silhouettes.ts   # les 8 archétypes, paramétrés
    troncs.ts        # droit, bille élaguée, trogne, cépée, chandelle
    palette.ts       # LA palette (partagée avec ui/couleurs.ts)
  animations/
    registre.ts      # une animation = { déclencheur, durée, ce qu'elle lit, ce qu'elle dessine }
    morts.ts  feu.ts  crue.ts  gestion.ts  meteo.ts
  VueParcelle.tsx    # le composant React : monte le canvas, branche useGame()
```

**Boucle par image** (cible 60 fps, budget 16 ms) :

1. `camera` → rectangle visible en coordonnées parcelle ;
2. terrain : rien à faire si aucun morceau n'est sale (il ne change qu'au tick) ;
3. `interpolation` : avancer les valeurs vers l'instantané courant ;
4. `animations` : faire progresser les animations en cours, en retirer les finies ;
5. arbres : filtrer au rectangle visible, trier par profondeur, composer ;
6. particules, ciel, curseur d'action.

**Ce qui coûte, et comment on paie** :

- **10 000 tuiles de sol.** Jamais dessinées une par une par image : le
  terrain est **cuit** en morceaux de 16×16 m dans des textures, et un morceau
  n'est reconstruit que quand une de ses cellules a changé de tranche de
  valeur. Un tick change l'humidité de tout le monde d'un poil → il faut
  **quantifier** (8 niveaux, pas 256) pour ne pas tout invalider chaque
  semaine. Sinon, on recuit 10 000 tuiles par tick et le jeu rame à ×512.
- **Le tri en profondeur.** Le terrain étant une couche cuite sous tout le
  reste, seuls les arbres se trient entre eux : tri par `x + y` (ordre du
  peintre), incrémental (l'ordre ne change que si un arbre naît ou meurt).
- **LOD.** Dézoomé, un semis n'est qu'un point ; sous ~3 px, un arbre devient
  une tache de couleur ; les fourrés (archétype 8) sont dessinés **par cellule
  agrégée**, pas par individu — c'est aussi ainsi qu'on lit un fourré sur le
  terrain (un fourré, pas des individus, cf. `ui/couleurs.ts`).
- **Le pire cas** : une friche en pleine succession, plusieurs milliers de
  semis (`plantScattered` + régénération). C'est ce cas-là que le lot 0 doit
  mesurer, pas une parcelle de 400 tiges plantées.

---

## 4. Direction artistique

**Minimalisme** ici veut dire : formes pleines sans contour (ou un liseré d'un
pixel plus sombre), deux à trois tons par forme, **une seule source de
lumière** (au sud-ouest, cohérente avec le soleil au sud de `light.ts`),
ombres portées longues et douces, palette courte, aucune texture. La lisibilité
vient de la silhouette et de la valeur, pas du détail. Références de sensation :
*Dorfromantik*, *Islanders*, les vignettes d'un atlas botanique.

**Ce qui doit se lire sans info-bulle**, par ordre de priorité :

1. la **structure** du peuplement (qui domine, où sont les trous, la lisière) ;
2. le **stade** de chaque arbre (semis, gaulis, perchis, futaie, sénescent) ;
3. la **gestion** subie (élagué, trogné, recépé, manchonné, démasclé) ;
4. la **souffrance** (vigueur basse, cime sèche, feuillage jauni hors saison) ;
5. l'**essence**, en dernier — c'est ce que la couleur et l'info-bulle font.

**La palette** : les couleurs d'espèce de `ui/couleurs.ts` sont des couleurs
*catégorielles de graphique* (violet, rouge brique, rose). Un arbre violet
dans un paysage, non. Il faut une **seconde palette, naturaliste** : chaque
espèce reçoit un vert (ou un ocre, un gris-vert) crédible, et la couleur
catégorielle reste réservée aux graphiques et aux étiquettes. Les deux
palettes cohabitent, avec la correspondance dans `atlas/palette.ts`. `S`, mais
à faire en conscience.

**Les saisons** décalent la palette entière (sol, herbe, feuillage, ciel,
lumière) : quatre jeux de tons interpolés en continu sur l'année. C'est
l'effet le plus rentable du chantier — quatre valeurs à interpoler, et la
parcelle respire.

---

## 5. Inventaire des visuels

### 5.1 Le terrain

| Élément | Détail | Charge |
|---|---|---|
| Tuile de sol | losange, teinte selon humidité de surface (quantifiée), ton du sol dérivé du profil (limon brun, sable clair, argile ocre) | `M` |
| Falaises / flancs | le côté vertical d'une tuile plus haute que sa voisine : c'est ce qui *fait* le relief | `M` |
| Ombrage de pente | assombrir selon l'orientation face à la lumière — l'adret et l'ubac, visibles | `S` |
| Sol nu / labouré | sillons, après `labourer` | `S` |
| Chaulage | voile clair sur le disque chaulé, qui s'estompe en quelques semaines | `S` |
| BRF épandu | tapis de plaquettes clair sous l'ancienne couronne | `S` |
| Cendres | noir profond après un feu, qui verdit au printemps suivant | `S` |
| Ravines | traces d'érosion là où `erosionArrachee` s'accumule | `M` |
| Bordures hors parcelle | les 4 côtés : forêt, prairie, grande culture, route, lotissement, lande (`paysage.ts`) — une bande de 10 m au-delà du bord, floue, qui cadre la parcelle | `M` |

### 5.2 L'eau

| Élément | Charge |
|---|---|
| Ruisseau en bord de parcelle (lit, berge selon `bergeM`) | `M` |
| Mare (disque, rive, reflet) | `S` |
| Nappe affleurante (`soilNappeCm ≤ 5`) : sol miroitant, jonchaie | `S` |
| Ruissellement en nappe (`debordement`) : lame d'eau qui court dans le sens de la pente | `M` |
| Reflet du ciel / de la végétation sur l'eau | `M` |

### 5.3 Les objets

Clôture (`S`, grillage sur les bords du clos — déjà résolu dans la vue
actuelle), manchon de plant (`S`), tas de BRF (`S`, mais il n'a pas de
position dans le moteur : à poser conventionnellement au bord), piquets
d'éclaircie ? (non).

### 5.4 Les arbres — les huit archétypes

| # | Archétype | Espèces | Signature |
|---|---|---|---|
| 1 | **Feuillu de futaie** | hêtre, chêne pubescent, châtaignier, frêne | tronc net, houppier globuleux, dense |
| 2 | **Pionnier léger** | bouleau | port fin, cime claire et transparente, tronc pâle |
| 3 | **Ripisylve** | aulne glutineux | port dressé étroit, feuillage sombre, souvent en cépée |
| 4 | **Conifère** | pin sylvestre | étages de branches, cime en plateau chez le vieux sujet, fût rouge |
| 5 | **Sempervirent méditerranéen** | chêne-liège, arbousier | houppier bas et dense, tronc tortueux, **jamais nu en hiver** |
| 6 | **Fruitier greffé** | pommier, abricotier | petit tronc, houppier en gobelet, floraison spectaculaire |
| 7 | **Arbuste en cépée** | noisetier, sureau, prunellier, aubépine | plusieurs brins depuis la souche, port en boule |
| 8 | **Fourré bas / lande** | ronce, ajonc, genêt, callune | masse au sol, dessinée par cellule, pas par individu |

**Les stades** (fonction continue de `heightM / hauteurMaxM`, pas cinq
sprites) : semis (< 0,5 m — un trait et deux feuilles), gaulis (0,5–3 m),
perchis (3–10 m), futaie (10 m–max), sénescent (`fAge < 1` : cime dégarnie,
grosses branches mortes, houppier étalé).

### 5.5 Les états de gestion — le cœur de la demande

| État | Ce qu'on voit | Donnée |
|---|---|---|
| **Élagué** | bille nue jusqu'à `hauteurElagueeM`, houppier au-dessus. La silhouette de la futaie, opposée au branchu de plein vent. | ✅ déjà envoyé |
| **Trogne** | tronc court, **tête renflée** à `teteTrogneM`, faisceau de rejets dressés au-dessus. La tête grossit et se creuse avec `recepages` → cavité visible au-delà de 3–4 étêtages. | ❌ P2 |
| **Juste étêtée** | tête nue, moignons de coupe clairs, aucun rejet — pendant une saison | ❌ P2 + P7 |
| **Cépée recépée** | souche large, brins courts et nombreux (`heightM = 0,5` après l'action), qui repartent | ❌ P2 |
| **Démasclé** | tronc **ocre-rouge** sur les 2–3 premiers mètres pendant quelques années, puis grisonnant | ❌ P2 |
| **Manchonné** | fût blanc translucide au pied | ✅ |
| **Fruits mûrs** | ponctuation orange sur la couronne | ✅ (à raffiner : `fruitProgress`) |
| **En fleurs** | voile blanc/rose sur la couronne du fruitier | ❌ P2 |
| **Fleurs gelées** | fleurs brunes, chute rapide, pas de fruits cette année | ❌ P2 |

### 5.6 Les états de santé

| État | Ce qu'on voit | Donnée |
|---|---|---|
| Vigueur basse | feuillage clairsemé, ton pâle et jauni | `vigueur` (P2) |
| Cime sèche | branches mortes en haut du houppier, en proportion du dommage | `dommageHydraulique` (P2) |
| Défoliation | couronne mangée par les ravageurs | `ravageurs` par cellule (P4) |
| Brouté | rameaux coupés net, plant rabougri en boule | `pousseTendreM` (P2) |
| Frotté | écorce arrachée en bas du tronc | `frotteSemaine` (P2) |
| Mort sur pied | chandelle grise, sans feuille | P3 (+ §2.6) |
| Brûlé sur pied | chandelle noire | `brulEeSemaine` (P3) |

### 5.7 Saisons, météo, lumière

Quatre palettes interpolées · pluie (rideau léger) · neige (tuiles blanches
au-dessus d'un seuil de froid) · gel (givre) · brume de fond de vallon quand la
nappe affleure · voile de chaleur en canicule · ciel qui change de teinte avec
la saison et la pluie. Ensemble : `L`.

### 5.8 Le hors-parcelle

Une bande de contexte sur les quatre côtés, dérivée de `bordures` : ça ancre
la parcelle dans un paysage au lieu de la faire flotter, et ça rend visible une
donnée qui décide de tout (semis, gibier, vent, feu). `M`.

### 5.9 Compte de textures à générer

- troncs : 4 formes (droit, bille élaguée, trogne, cépée) × 3 tailles = **12**
- couronnes : 8 archétypes × 4 états foliaires (pleine, coloration, nue, souffrante) × 3 tailles = **96**
- accessoires : fruits, fleurs, manchon, démasclage, cavité, chandelle, flamme, feuille qui tombe, moignon de coupe ≈ **12**
- terrain : ~10 tons de sol × 4 saisons + flancs + eau + tapis ≈ **60**

**≈ 180 textures générées au démarrage** (quelques dizaines de ms), zéro
fichier au dépôt. C'est là que se paie la décision D5.

---

## 6. Inventaire des animations

Chaque animation est une entrée de registre : `{ déclencheur, durée réelle,
données lues, ce qu'elle dessine, priorité }`.

### 6.1 Continues (l'ambiance)

| Animation | Durée | Données | Charge |
|---|---|---|---|
| Croissance interpolée (l'arbre grandit en douceur entre deux instantanés) | continu | `heightM` | `M` |
| Balancement au vent (amplitude ∝ `ventExposition`, plus fort sur les cimes libres) | continu | station + hauteur | `M` |
| Débourrement (la couronne se remplit au printemps) | 2–3 semaines | phénologie (P8) | `M` |
| Coloration d'automne | 3–4 semaines | phénologie | `S` |
| **Chute des feuilles** | 2–3 semaines, particules | phénologie + `LITTERFALL_WEEK` | `M` |
| Herbe qui pousse, jaunit, est fauchée | continu | `soilHerbe`, `herbeBiomasse` | `S` |
| Eau qui ondule, reflets | continu | — | `M` |
| Ombres qui tournent avec la saison | continu | semaine | `S` |
| Fumée / brume | continu | nappe, feu | `M` |

### 6.2 Croissance et gestion (retour d'action immédiat)

| Animation | Durée | Charge |
|---|---|---|
| Plantation : le plant apparaît, la terre est retournée autour | 0,5 s | `S` |
| **Élagage** : les branches basses tombent, la bille devient nette | 1 s | `M` |
| **Étêtage (trogne)** : la charpente tombe, la tête reste, les rejets partent au printemps suivant | 1 s + une saison | `L` |
| **Recépage** : la cépée tombe, la souche reste, les brins repartent | 1 s + une saison | `M` |
| Coupe / éclaircie : **l'arbre tombe** (rotation autour du pied, poussière), il ne s'escamote pas | 1,5 s | `M` |
| Démasclage : le tronc change de couleur, planches de liège empilées | 1 s | `S` |
| Fauche : l'herbe se couche en andains | 1 s | `S` |
| Chaulage / BRF : un voile s'étale sur le disque traité | 1 s | `S` |
| Clôture : les piquets se posent | 1 s | `S` |
| Récolte : les fruits quittent la couronne | 0,5 s | `S` |

### 6.3 Les morts — une animation par cause

`CauseMort` a onze valeurs. Chacune raconte quelque chose de différent, et
c'est exactement ce que le joueur doit comprendre.

| Cause | Mise en scène | Durée | Charge |
|---|---|---|---|
| **`secheresse`** | le feuillage jaunit puis roussit → **les feuilles tombent** (particules) → squelette gris → chute quelques semaines/années plus tard. C'est la demande explicite. | 3–4 semaines puis chandelle | `L` |
| **`engorgement`** | jaunissement **par le bas**, feuillage terne, sol miroitant au pied, l'arbre penche | 3–4 semaines | `M` |
| **`ombre`** | étiolement : l'arbre s'étire, pâlit, se dégarnit, puis s'efface sans bruit. Une mort discrète — c'est la plus fréquente en régénération, elle ne doit pas voler la vedette. | 4 semaines | `M` |
| **`vieillesse`** | cime dégarnie progressive sur des années, grosses branches mortes, puis la chandelle | des années | `M` |
| **`solHorsGamme`** | chlorose : le feuillage **jaunit entre les nervures** en gardant sa forme, la croissance s'arrête | 6–8 semaines | `M` |
| **`feu`** | voir §6.4 | — | — |
| **`abroutissement`** | le plant rapetisse par paliers, en boule, puis disparaît | quelques semaines | `S` |
| **`ravageurs`** | défoliation qui progresse, couronne trouée | quelques semaines | `M` |
| **`labour`** | disparition immédiate, terre retournée | 0,5 s | `S` |
| **`maladie`** | dessèchement d'une branche puis de l'ensemble, feuilles qui restent accrochées et brunes | quelques semaines | `M` |
| **`frottis`** | écorce arrachée au pied, l'arbre garde ses feuilles puis s'effondre d'un coup (annelé) | une saison | `M` |

**Dépendance dure** : sans P3 + P5 (les morts avec leur `id`, leur position et
leur cause, et les cadavres dans l'instantané), **aucune** de ces animations
n'est possible. Et sans §2.6, le cadavre n'existe qu'au bon vouloir du rendu.

### 6.4 L'incendie

Le morceau le plus spectaculaire, et le mieux servi par le moteur — `feu.ts`
sait déjà où le feu part, où il passe, qui il tue, qui rejette.

| Étape | Mise en scène | Charge |
|---|---|---|
| Conditions | l'herbe jaunit, l'air tremble, le ciel se charge (le risque est calculable : `indiceRisqueFeu`) | `M` |
| Départ | une lueur sur la cellule d'origine, un filet de fumée | `S` |
| **Le front** | une ligne de flammes qui court de cellule en cellule dans l'ordre du rang d'arrivée, s'essouffle dans le feuillu frais, fonce dans la lande. **C'est la carte de combustibilité qui devient visible** — donc la pédagogie des coupures et du choix d'essences. | `L` (dépend de P6) |
| **Arbres qui brûlent** | torchage : la couronne s'embrase, les particules montent, il reste une chandelle noire. Un chêne-liège, lui, **survit** : écorce noircie, houppier intact — la démonstration de l'adaptation, gratuite. | `L` |
| Fumée | colonne au-dessus du front, panache incliné par le vent, ciel orangé | `M` |
| Après | sol noir, cendres, chandelles, puis **rejets de souche verts au printemps suivant** (`rejetteApresFeu`) — le feu n'élimine pas, il trie | `M` |
| Caméra | le moteur met déjà le jeu en pause (`autopause`) sur incendie : la vue peut cadrer le départ | `S` |

### 6.5 La crue

| Étape | Mise en scène | Honnêteté |
|---|---|---|
| Montée | l'eau **entre par le côté du ruisseau** (`eau.cote`) et gagne les cellules dans l'ordre des altitudes croissantes | ⚠️ **mise en scène** : le moteur ne route pas d'eau de surface dans le temps, il calcule un état hebdomadaire. La vague est une *interpolation ordonnée* de l'état, pas une simulation. À afficher comme telle (elle ne mouille que ce que l'état déclare mouillé). |
| Nappe d'eau | lame d'eau réfléchissante sur les cellules à `soilNappeCm ≤ 5`, profondeur ∝ `debordement` | ✅ données réelles |
| Courant | le ruissellement suit la pente (`penteParCellule`) | ✅ |
| Retrait | l'eau redescend, laisse du limon clair et des débris à la ligne de crue | `M` |
| Victimes | les arbres noyés meurent d'`engorgement` — donc §6.3, pas d'animation spécifique | — |

Charge totale : `L`.

### 6.6 Les autres coups durs

Gel tardif (givre une nuit, fleurs qui brunissent, `S`) · canicule et
sécheresse (herbe grillée, feuillages ternes, voile de chaleur, `M`) · érosion
(ravines qui se creusent après un gros ruissellement, `M`) · pullulation de
ravageurs (défoliation qui s'étend en tache, `M`) · arrivée du gibier (rameaux
coupés, écorces frottées — jamais de sprite d'animal, `S`).

### 6.7 Le curseur d'action

Prévisualisation avant clic : le disque de chaulage, la trace de la fauche, la
position du plant avec son ombre et sa couronne à maturité (celle-là est
pédagogique : elle montre l'emprise future), l'emprise de la clôture, la
sélection d'arbres. `M`.

### 6.8 Politique de vitesse (D7) — à trancher

Le worker peut avaler 26 semaines entre deux instantanés. Proposition :

| Vitesse | Comportement |
|---|---|
| Pause | animations continues seules (vent, eau). On peut contempler. |
| ×1 à ×4 | tout se joue, en temps réel étiré (une semaine ≈ 0,25–1 s). |
| ×8 à ×64 | les animations ponctuelles sont **raccourcies** (×4) et **fusionnées** (dix morts = une animation groupée). |
| > ×64 | plus d'animations ponctuelles : la parcelle **change** entre deux images, avec un marqueur discret sur ce qui vient de se passer. Le fil d'événements reste la mémoire. |
| Catastrophe | l'`autopause` existe déjà pour l'incendie et la faillite : on l'étend (option) à la crue et aux mortalités de masse, puis on **rejoue la scène** à vitesse ×1. C'est le « mode cinéma », et c'est ce qui donne son poids à un incendie. |

Charge : `M` pour la politique, `L` avec le rejeu de scène (il faut garder les
instantanés de la fenêtre récente en mémoire — quelques Mo, faisable).

---

## 7. Caméra et interaction

| Besoin | Détail | Charge |
|---|---|---|
| Pan | glisser, flèches, limites (on ne perd pas la parcelle) | `S` |
| Zoom | molette vers le curseur, de la parcelle entière à ~15 m de large | `M` |
| Orientation | quatre quarts de tour (le nord n'est pas toujours du bon côté pour voir un versant). **Attention** : l'ombre portée du moteur est au nord (`light.ts`), le rendu doit rester cohérent en tournant. | `M` |
| Picking | écran → cellule (inverse analytique de la projection) et écran → arbre (test dans l'ordre inverse du tri en profondeur, la couronne d'abord) | `M` |
| Survol | l'arbre sous le curseur s'éclaircit, étiquette courte (essence, hauteur, état) | `S` |
| Sélection | partagée avec l'autre vue (même `selectedIds`), rectangle de sélection | `M` |
| Modes d'action | les modes existants (`planter`, `chauler`, `faucher`, `eclaircir`, `brf`, `cloturer`) réutilisés tels quels — la vue visuelle **dispatche les mêmes actions** | `S` |
| HUD minimal | date, saison, météo du moment, trésorerie, vitesse. Le reste est dans l'autre vue. | `M` |
| Bascule des vues | un bouton, la même partie, la même sélection, le même worker | `S` |

---

## 8. Tests et garde-fous

Un rendu ne se teste pas comme un moteur, mais il n'est pas intestable :

- **Projection** : test de propriété (fast-check) — `écran(parcelle(p)) == p`
  pour tout point, à toutes les orientations et tous les zooms. `S`
- **Tri en profondeur** : un arbre devant en cache un derrière, jamais
  l'inverse ; l'ordre est stable d'une image à l'autre. `S`
- **Atlas** : le générateur rend le nombre attendu de textures, aux bonnes
  dimensions ; une empreinte des pixels détecte une régression de style
  involontaire. `M`
- **Registre d'animations** : chaque animation déclare les champs
  d'instantané qu'elle lit → un test vérifie que **le protocole les fournit
  tous**. C'est ce qui empêche une animation d'inventer une donnée (principe 1,
  vérifié par la machine). `M`
- **Déterminisme du rendu** : toute variation « organique » (le penchant d'un
  arbre, la phase de son balancement, la forme de sa couronne) dérive de son
  `id` via `engine/rng.ts`, pas de `Math.random`. Deux parties de même graine
  donnent **la même image**. À ajouter à `scripts/check-boundaries.sh` :
  interdire `Math.random` dans `src/render/`. `S`
- **Budget d'image** : un test headless qui monte la scène du pire cas et
  vérifie le temps de la boucle. Fragile en CI — plutôt un script de mesure
  qu'un test bloquant. `M`

---

## 9. Découpage en lots

| Lot | Contenu | Livre | Protocole | Charge |
|---|---|---|---|---|
| **L0** | **Pointe technique** : Pixi vs Canvas 2D tranché sur le pire cas réel (friche en succession, 5 000 tiges, 10 000 tuiles), projection et échelles calées sur les vraies stations, atlas généré au démarrage | un prototype jetable, une décision écrite | P1 | `M` |
| **L1** | Terrain isométrique : tuiles, relief, flancs, ombrage de pente, eau libre, caméra (pan/zoom/orientation), picking | on navigue sur une parcelle vide et belle | P1, P4 | `L` |
| **L2** | Arbres statiques : 8 archétypes, stades continus, tri en profondeur, LOD, survol et sélection | on reconnaît le peuplement | P2 | `L` |
| **L3** | Le temps : interpolation entre instantanés, croissance douce, saisons et phénologie, vent, herbe | la parcelle vit | P8 | `L` |
| **L4** | Gestion : élagage, **trogne**, recépage, démasclage, manchon, coupe qui tombe, fleurs et fruits, retours d'action | **la demande centrale : on voit ce qu'on fait aux arbres** | P2, P7 | `L` |
| **L5** | **Les morts** : les onze causes, les chandelles, la chute des feuilles de sécheresse | on comprend pourquoi ça meurt | P3, P5 (+ §2.6) | `L` |
| **L6** | **L'incendie** : front, torchage, fumée, cendres, rejets, cadrage caméra | l'événement mémorable d'une partie | P6 | `L` |
| **L7** | **La crue** : montée, lame d'eau, courant, retrait, limon | l'autre catastrophe | P4 | `M` |
| **L8** | Finition : particules partout, hors-parcelle, ciel et météo, mode cinéma, politique de vitesse, HUD minimal | ça devient un jeu qu'on montre | — | `L` |

**Ordre imposé** : L0 → L1 → L2 sont en série (rien ne se dessine sans terrain
ni projection). Ensuite L3 et L4 peuvent aller en parallèle. L5, L6, L7 sont
indépendants entre eux mais tous après L2 et L3. L8 en dernier, en continu.

**Charge totale : de l'ordre de 25 à 35 journées**, dont ~3 de protocole et
~2 de pointe technique. C'est un vrai chantier — d'où le découpage : L0+L1+L2
(≈ 10 j) donnent déjà une vue isométrique navigable et jolie, et chaque lot
suivant est jouable.

---

## 10. Risques

1. **La perf sur la friche en succession.** Le cas nominal (400 tiges) est
   facile ; plusieurs milliers de semis, non. Mitigation : L0 mesure ce cas
   précis, le LOD et l'agrégation des fourrés sont prévus dès L2, pas
   rattrapés après.
2. **Le terrain recuit à chaque tick.** Si la quantification des valeurs de
   sol est trop fine, chaque semaine invalide tous les morceaux et on perd le
   bénéfice du cache. À traiter dès L1, c'est trois lignes bien placées.
3. **La vitesse ×512.** L'écart entre « regarder pousser » et « avaler
   quarante ans » est irréductible. La politique du §6.8 le gère, mais il faut
   accepter que la belle vue soit une vue *lente* — et que le tableau de bord
   reste l'outil du temps long.
4. **Deux vues à maintenir.** Chaque nouvelle mécanique du moteur devra être
   racontée deux fois. Mitigation : la vue visuelle ne montre **pas** tout —
   elle montre ce qui a une forme. Un flux d'azote n'en a pas.
5. **L'honnêteté sous pression du joli.** Le jour où on voudra une vague
   spectaculaire, on aura envie de mouiller des cellules que le moteur dit
   sèches. La règle du §0 et le test du registre d'animations (§8) sont là pour
   ça.
6. **La palette naturaliste vs les couleurs de graphique.** Deux palettes,
   donc deux sources de vérité pour « la couleur d'une espèce ». À cadrer dans
   `atlas/palette.ts`, sinon dérive.

---

## 11. Questions ouvertes — à toi de trancher

- **Q1 — Pixi ou Canvas 2D ?** Ma recommandation : Pixi (D1), conforme à
  `docs/stack.md`, et les particules seules le justifient. Mais si tu préfères
  zéro dépendance, Canvas 2D en couches tient, au prix des effets. **Le lot 0
  peut décider à ta place, avec des chiffres.**
- **Q2 — Une vue ou deux ?** Bascule dans l'écran de jeu (ma reco), ou vue
  visuelle avec son propre HUD complet et le tableau de bord relégué au débogage ?
- **Q3 — Le niveau de mise en scène acceptable.** La vague de crue et le front
  de flamme sont des mises en scène ordonnées d'un état hebdomadaire. Est-ce
  que ça te va, avec la mention explicite, ou veux-tu que le moteur route
  vraiment l'eau de surface dans le temps (gros chantier moteur, hors de ce
  périmètre) ?
- **Q4 — Les arbres morts restent-ils debout dans le *moteur* ?** (§2.6.)
  C'est écologiquement juste, ça débloque des critères de biodiversité, et ça
  rend les animations de mort possibles proprement. Mais c'est du moteur, avec
  des tests à revoir.
- **Q5 — La phénologie continue dans le moteur ?** (§2.4.) Même arbitrage :
  le rendu peut s'en passer en l'approximant, le moteur y gagnerait.
- **Q6 — Le style.** Aplats sans contour et ombres longues, ou liseré fin ?
  Ça se décide sur trois captures au lot 0 plutôt que sur du texte.
