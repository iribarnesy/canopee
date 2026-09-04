# Ce que le rendu attend du moteur

> Référence de contrat entre l'agent qui construit la vue isométrique et celui
> qui tient le moteur. Ce fichier dit ce qui voyage déjà, ce que le rendu peut
> calculer seul, et ce qui sera discuté plutôt que livré. **Les demandes, elles,
> ne s'écrivent pas ici : elles s'ouvrent en issue** (voir plus bas).

Le principe est celui de tout le projet : le moteur est l'actif précieux, il
reste pur et testable, et l'UI ne reçoit que des instantanés (`docs/stack.md`).
Une conséquence pratique : le rendu ne peut pas aller chercher ce dont il a
besoin, il faut que ça VOYAGE. D'où ce contrat.

## Une demande = une issue

Le formulaire `.github/ISSUE_TEMPLATE/attente-du-rendu.yml` pose les questions
utiles. Le titre part avec le préfixe `[attente-rendu]`, ce qui suffit à les
retrouver même sans label.

Trois champs comptent, et le deuxième est le plus important :

1. **Ce qu'il me faut** — le champ ou la grandeur, avec sa maille (par arbre ?
   par cellule ? un scalaire par semaine ?) et son unité.
2. **Ce que ça donne à l'écran** — le visuel précis que ça débloque. Pas « ce
   serait plus juste » : « sans ça, les onze morts se ressemblent toutes ».
3. **Ce que j'ai essayé** — si tu as cherché à le recalculer depuis
   l'instantané et que ça ne marche pas, dis pourquoi. C'est ce qui fait gagner
   le plus de temps.

Plus une mention **bloquant** (le rendu ne peut pas démarrer sans) ou
**souhaitable** (il y a un contournement moche mais viable) : elle décide de
l'ordre, et un besoin bloquant passe devant un besoin plus élégant.

Ensuite : le moteur relève les issues ouvertes, livre ce qui est justifié, et la
PR qui livre ferme l'issue (`Closes #N`). L'état d'une demande, c'est donc
l'état de son issue — rien à tenir à jour à la main.

Une demande peut aussi être **discutée** plutôt que livrée. Dans ce cas la
réponse va dans le fil de l'issue, avec l'alternative, et l'issue reste ouverte
tant qu'on n'est pas d'accord. Les quatre motifs, pour qu'ils ne soient jamais
une surprise :

1. **Ça voyage déjà** — ou ça se déduit en une ligne de ce qui voyage.
2. **Ça casse le déterminisme** — l'aléa passe par un PRNG seedé, et l'ordre de
   consommation des tirages fait partie du résultat. Le parcours de
   `feu.ts:propager()` en particulier ne se réordonne pas : il dépile, et les
   tests de non-régression du feu en dépendent. Une grandeur dérivée se calcule
   toujours APRÈS coup, en passe pure.
3. **C'est de la calibration** — le besoin est réel, mais le satisfaire déplace
   des seuils écologiques. Ça se traite comme un chantier de calibration, avec
   des mesures, pas comme un champ à ajouter.
4. **C'est du rendu** — l'interpolation entre deux semaines, le lissage, le
   LOD, le choix des couleurs : le moteur donne des grandeurs, pas des pixels.

Si pour une raison quelconque tu ne peux pas ouvrir d'issue, écris la demande en
bas de ce fichier sous un titre `### `, pousse-la, et elle sera convertie en
issue au passage suivant.

## Ce qui voyage déjà

À vérifier avant d'ouvrir une issue — `src/game/protocol.ts` est la référence.

**Une fois, au lancement** (`StationInfo`) : `altitudesM` (le relief, maille du
tick), `nappeCm` (champ figé), `enEau`, `eau`, `coteM`, `ruMm`, `phInitial`,
`nappeEquilibreCm`, `ventExposition`, `meteoLabel`.

**À chaque instantané** (`Snapshot`) : la semaine, la météo, l'année civile, le
CO₂, l'économie, l'inventaire carbone, la biodiversité, les `fluxes` du tick, la
pression de gibier, le stock de BRF, le paysage, et le contexte phénologique
(`pheno`).

**Par cellule**, en `Float32Array`/`Uint8Array` transférés :

| Grille | Ce qu'elle porte |
|---|---|
| `soilWater` | eau de l'horizon de surface, mm |
| `soilPh` | pH |
| `soilN` | azote minéral, g/m² |
| `soilHerbe` | couverture herbacée ∈ [0,1] |
| `soilHerbeBiomasse` | herbe SUR PIED — elle reste quand l'herbe jaunit |
| `soilLitiereCG` | litière, gC/m² : le tapis de novembre, le paillage, les cendres |
| `soilBoisAuSol` | bois mort COUCHÉ, gC/m² : où poser des troncs |
| `soilRavageurs` | pression de ravageurs — la TACHE de défoliation, pas sa moyenne |
| `soilEpaisseurPerdueCm` | érosion cumulée, signée : négatif = dépôt |
| `soilNappeCm` | profondeur de la nappe, cm |
| `soilEngorgement` | engorgement du profil ∈ [0,1] |
| `soilDebordementMm` | ce qui n'est pas rentré dans le sol cette semaine, mm |
| `soilLumiere` | lumière arrivant au sol ∈ [0,1] |
| `soilCloture` | cellules closes (1) |

**Par arbre** (`SnapshotTree`, chandelles comprises) : `id`, `especeId`, `x`,
`y`, `heightM`, `ageWeeks`, `stress`, `fruitsKg`, `hauteurElagueeM`, `protege`,
`chandelle`, `teteTrogneM`, `recepages`, `vigueur`, `dommageHydraulique`,
`mortSemaine`, `brulEeSemaine`, `causeMort`, `derniereLeveeSemaine`,
`fruitProgress`, `bloomFrosted`, `pousseTendreM`, `frotteSemaine`.

**Ce qui s'est passé depuis le dernier instantané** : `events`, `refusals`,
`morts` (avec `id` et position), `chutes` (chandelles abattues : direction et
empreinte du tronc), `incendie` (compteurs + `origine`, `brulees` et `rangs` du
front), et `gestes`, qui ont DEUX mailles :

- `{ type, ids }` pour ce qui désigne des arbres — `couper`, `eclaircir`,
  `elaguer`, `trogner`, `receper`, `brouter`, `frotter` ;
- `{ type, cellules }` pour ce qui désigne du sol — `chauler`, `faucher`,
  `epandreBrf`, `labourer`, `ramasserBoisMort`, `cloturer`. Indices de cellule
  identiques à ceux des grilles.

Dans les deux cas, ce qui est nommé est ce qui a RÉELLEMENT été touché : le
plafond horaire arrête souvent un chantier en cours de route, et une pelouse
déjà rase ne se fauche pas. `estGesteSurArbres` et `estGesteSurZone` discriminent
les deux mailles (`find` rend l'union entière, que TypeScript ne rétrécit pas
sur le seul `type`).

**Et ce que le rendu peut calculer lui-même**, sans rien demander : tout ce qui
est une fonction pure de l'instantané et des fiches d'espèces, puisque le moteur
est importable depuis l'UI. En particulier le rayon de houppier depuis la
hauteur (`light.ts:crownRadiusM`), et le feuillage de n'importe quelle espèce
depuis `Snapshot.pheno` — mais il y en a **TROIS**, et pour une fois c'est le
rendu que la distinction concerne le plus :

- `partFoliaireOmbrageanteDans(espece, pheno)` — ce qui intercepte la lumière,
  feuilles mortes d'un marcescent comprises. C'est la silhouette : la masse à
  dessiner, et l'ombre qu'elle porte. La plus grande des trois.
- `partFoliaireActiveDans(espece, pheno)` — le feuillage vivant déployé, celui
  qui commande la croissance et la transpiration.
- `partFoliaireAssimilanteDans(espece, pheno)` — le vivant **encore vert**. La
  plus petite des trois.

**Les deux écarts sont ce que le rendu vient chercher**, et aucun champ n'a à
voyager pour les dire :

| écart | ce que ça donne à l'écran |
|---|---|
| ombrageante − active | la part de feuillage **mort** encore accroché : le charme brun-roux de février, à colorer en brun plutôt qu'en vert |
| active − assimilante | la part **jaunie mais toujours attachée** : le houppier entièrement doré d'octobre, garni et à l'arrêt |

Deux fonctions séparent l'oui/non de l'avancement, et il ne faut pas les
confondre — la confusion a déjà coûté un bug ici :
`senescenceEnCoursDans(pheno)` dit si la chute est enclenchée ;
`senescenceDans(espece, pheno)` dit **à quel point** le feuillage a jauni,
∈ [0,1]. C'est la seconde qu'il faut pour colorer un houppier.

L'assimilante n'est branchée sur rien côté moteur, et c'est délibéré : brancher
la sénescence sur la croissance suppose de recalibrer une seconde fois
(`docs/realisme.md`, « le houppier doré produit encore »). L'écart vaut deux
semaines par an sur vingt-six.

## Deux limites connues

- **Les arbres sont sérialisés, pas transférés.** Au-delà de ~20 000 arbres il
  faudra passer en tableaux typés parallèles (un `Float32Array` par champ). Si
  tu vois le coût monter sur une friche en pleine succession, ouvre une issue.
- **Le rembobinage n'est pas fait.** Rejouer une période à ×1 après avoir joué à
  ×64 demande un instantané par semaine SIMULÉE quand l'enregistrement est
  actif, au lieu d'un par lot (`startLoop` avale jusqu'à 26 semaines par pas).
  ~280 ko par instantané sur 1 ha, ~15 Mo l'année : tenable, à cadrer avant de
  figer le protocole.

---

# Ce qui est tranché, et ce sur quoi je me suis trompé

> Cette partie vient de la version que la branche de rendu portait avant que ce
> fichier ne devienne la référence du contrat. Ce ne sont **pas** des demandes —
> aucune n'attend quoi que ce soit du moteur. C'est de la mémoire : ce qu'il ne
> faut pas rouvrir sans raison neuve, et ce que j'ai affirmé à tort.

## Déjà tranché — ne pas rouvrir sans raison neuve

| Sujet | Décision |
|---|---|
| **Les animaux d'élevage** (poules, volaille en verger) | **Plus tard**, quand le moteur les aura prévus. Pas de sprite d'élevage avant son module : une poule qu'on ne peut ni déplacer ni nourrir se retourne contre nous. La faune SAUVAGE, elle, entre dès le lot L9 — le moteur sait déjà la peupler (pression de gibier, broutage, frottis, biodiversité), et la règle est que le nombre et l'activité des bêtes lisent l'état, l'individu restant du décor. |
| **La vraie 3D** | Non. Raisons au §0 de `docs/interface-visuelle.md` — la première étant que la qualité d'illustration par jour de travail y est bien plus basse, la seconde que le moteur est plat (couronne = disque, ombre = disque décalé) et que la 3D afficherait une précision que le modèle n'a pas. |
| **La météo volumétrique** | Non : c'est la simulation de l'atmosphère en volume, elle n'a pas de sens sans 3D. L'**effet** (pluie, neige, gel, brume) est dedans et ne coûte rien — `weather` est déjà dans l'instantané. |
| **Le routage de l'eau de surface dans le temps** | Non demandé. La vague d'une crue est une mise en scène ordonnée d'un état hebdomadaire, explicitement bornée : elle ne mouille que ce que `soilNappeCm` et `soilDebordementMm` déclarent mouillé. |

## Branches absorbées

`claude/focused-mayer-w6gcf6` (supprimée le 2026-09-04) portait deux
correctifs de carbone, tous deux intégrés à la vue isométrique avant
suppression :

- `8c408c5` — le carbone d'une chandelle coupée (~933 kgC créés de rien passé
  le délai de récupération). Son `actions.ts` n'a pas été reprise : la même
  correction, avec la même clé (`mortSemaine`) et la même borne, était déjà
  là. **Ses deux fichiers de tests, si** — ils comblaient un angle mort réel de
  l'invariant de conservation (les arbres tués par le feu et encore sur pied,
  dont le carbone n'est ni dans le vivant ni dans le pool).
- `3c68769` — le feu qui recréait les chandelles au lieu de les consumer
  (51 840 kgC en une semaine sur quarante charmes morts). Repris tel quel.

Les SHA restent valables si l'on veut y revenir : `git show 8c408c5`,
`git show 3c68769`.

## Deux endroits où j'ai eu tort, pour calibrer ma crédibilité

- J'ai écrit que `partMecanisable` comptait les chandelles comme obstacles. Le
  code les **filtrait** : un tracteur passait à travers les troncs morts.
  Corrigé depuis, dans les deux sens.
- J'ai demandé que `litterCG` remonte dans le résultat du tick. C'est de
  l'**état** — elle s'accumule et se décompose —, donc elle se lit comme
  `soilPh`. La réponse livrée était meilleure que ma demande.

Autrement dit : quand une entrée de ce fichier te paraît fausse, elle l'est
peut-être.
