# Ce que le rendu attend du moteur

> Fichier d'échange entre l'agent qui construit la vue isométrique et celui qui
> tient le moteur. Le rendu écrit ici ce qui lui manque, au fil de ses
> découvertes ; le moteur relève, discute, livre, et annote.

Le principe est celui de tout le projet : le moteur est l'actif précieux, il
reste pur et testable, et l'UI ne reçoit que des instantanés (`docs/stack.md`).
Une conséquence pratique : le rendu ne peut pas aller chercher ce dont il a
besoin, il faut que ça VOYAGE. D'où ce fichier.

## Écrire une attente

Une entrée par besoin, en titre de niveau 3, la plus récente en bas. Trois
choses suffisent, et la troisième est la plus importante :

```markdown
### Le nom court du besoin

**Ce qu'il me faut** — le champ ou la grandeur, avec son unité et sa maille
(par arbre ? par cellule ? un scalaire par semaine ?).

**Ce que ça donne à l'écran** — le visuel précis que ça débloque. Pas
« ce serait plus juste » : « sans ça, les onze morts se ressemblent toutes ».

**Ce que j'ai essayé** — si tu as cherché à le recalculer côté rendu et que ça
ne marche pas, dis pourquoi. C'est ce qui fait gagner le plus de temps.
```

Dire aussi si c'est **bloquant** (le rendu ne peut pas démarrer sans) ou
**souhaitable** (il y a un contournement moche mais viable) : ça décide de
l'ordre, et un besoin bloquant passe devant un besoin plus élégant.

## Ce que le moteur répond

Chaque entrée traitée reçoit une ligne d'annotation, ajoutée par la PR
elle-même :

```markdown
> **Traité : PR #12** — `Snapshot.pheno` porte les cinq scalaires ; le rendu
> appelle `partFoliaireDans(espece, snapshot.pheno)`.
```

Une demande peut aussi être **discutée** plutôt que livrée — l'annotation le
dit alors, avec l'alternative :

```markdown
> **Discuté : PR #12** — pas de part foliaire par arbre : elle se recalcule à
> l'identique depuis `pheno` et la fiche d'espèce, et un champ par arbre
> dériverait le jour où la phénologie se raffine.
```

Les quatre motifs de discussion, pour qu'ils ne soient pas une surprise :

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

## Ce qui voyage déjà

À vérifier avant d'écrire une entrée — `src/game/protocol.ts` est la référence.

**Une fois, au lancement** (`StationInfo`) : `altitudesM` (le relief, maille du
tick), `nappeCm` (champ figé), `enEau`, `eau`, `coteM`, `ruMm`, `phInitial`,
`nappeEquilibreCm`, `meteoLabel`.

**À chaque instantané** (`Snapshot`) : la semaine, la météo, l'année civile, le
CO₂, l'économie, l'inventaire carbone, la biodiversité, les `fluxes` du tick, la
pression de gibier, le stock de BRF, le paysage.

**Par cellule**, en `Float32Array`/`Uint8Array` transférés : `soilWater`,
`soilPh`, `soilN`, `soilHerbe`, `soilNappeCm`, `soilEngorgement`, `soilCloture`,
`soilDebordementMm`, `soilLumiere`, `soilLitiereCG`.

**Par arbre** (`SnapshotTree`, chandelles comprises) : `id`, `especeId`, `x`,
`y`, `heightM`, `ageWeeks`, `stress`, `fruitsKg`, `hauteurElagueeM`, `protege`,
`chandelle`, `teteTrogneM`, `recepages`, `vigueur`, `dommageHydraulique`,
`mortSemaine`, `brulEeSemaine`, `causeMort`, `derniereLeveeSemaine`,
`fruitProgress`, `bloomFrosted`, `pousseTendreM`, `frotteSemaine`.

**Ce qui s'est passé depuis le dernier instantané** : `events`, `refusals`,
`morts` (avec `id` et position), `gestes` (`couper`, `eclaircir`, `elaguer`,
`trogner`, `receper`, `brouter`, `frotter`, avec les ids réellement touchés),
`incendie` (compteurs + `origine`, `brulees` et `rangs` du front).

**Et ce que le rendu peut calculer lui-même**, sans rien demander : la part
foliaire et la sénescence de n'importe quelle espèce, depuis `Snapshot.pheno` et
`especes.ts` (`partFoliaireDans`, `senescenceFoliaire`) ; le rayon de houppier
depuis la hauteur (`light.ts:crownRadiusM`) ; tout ce qui est une fonction pure
de l'instantané et des fiches d'espèces, puisque le moteur est importable depuis
l'UI.

## Deux limites connues

- **Les arbres sont sérialisés, pas transférés.** Au-delà de ~20 000 arbres il
  faudra passer en tableaux typés parallèles (un `Float32Array` par champ). Si
  tu vois le coût monter sur une friche en pleine succession, écris-le ici.
- **Le rembobinage n'est pas fait.** Rejouer une période à ×1 après avoir joué à
  ×64 demande un instantané par semaine SIMULÉE quand l'enregistrement est
  actif, au lieu d'un par lot (`startLoop` avale jusqu'à 26 semaines par pas).
  ~280 ko par instantané sur 1 ha, ~15 Mo l'année : tenable, à cadrer avant de
  figer le protocole.

## Les attentes

_(rien pour l'instant — la première entrée va ici)_
