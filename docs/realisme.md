# Canopée — Critères de réalisme

> Référentiel de vérification du moteur, v1 (2026-09-01).
> **À quoi ça sert** : le jeu doit produire, pour *n'importe quelle* combinaison
> (sol × climat × espèces × voisinage), le résultat que produirait la réalité —
> y compris sur des stations générées, jamais écrites à la main. Ce document
> liste les comportements réels attendus, dit où on en est, et sert de feuille
> de route : chaque mécanisme ajouté doit faire basculer des critères.
>
> **Principe de non-régression conceptuelle** : aucun critère ne doit être
> satisfait par un cas particulier codé en dur. Tout passe par des paramètres
> continus et des lois générales — un critère « coché » par une exception ne
> compte pas.

## Comment lire

- ✅ **couvert** — mécanisme présent ET prouvé par un test automatisé
- 🟡 **partiel** — mécanisme présent mais grossier, ou non testé
- ❌ **absent** — le moteur ne sait pas faire

Chaque critère indique le mécanisme qui le porte et, quand il existe, le test.

## Score actuel

| Domaine | ✅ | 🟡 | ❌ | Total |
|---|---|---|---|---|
| A. Sol, eau, atmosphère | 13 | 2 | 3 | 18 |
| B. Lumière et structure | 5 | 3 | 2 | 10 |
| C. Nutriments et cycles | 9 | 3 | 1 | 13 |
| D. Climat et phénologie | 7 | 3 | 1 | 11 |
| E. Interactions entre plantes | 7 | 2 | 3 | 12 |
| F. Dynamique des peuplements | 7 | 2 | 3 | 12 |
| G. Faune et santé | 8 | 1 | 0 | 9 |
| H. Gestion, économie, travail | 12 | 4 | 3 | 19 |
| I. Carbone | 5 | 3 | 1 | 9 |
| J. Biodiversité et structure | 4 | 2 | 0 | 6 |
| **Total** | **77** | **25** | **17** | **119** |

**Score de réalisme : 77 pleins + 25 partiels sur 119 → 75 %** *(un partiel compte 1/2)*.

*Historique : 47 % (référentiel initial) → 53 % (horizons de sol, dérivation
physique, profondeur et plasticité racinaires) → 55 % (strate herbacée) →
59 % (feu émergent + sylviculture) → 60 % (éclaircie outillée, liège,
récupération des bois brûlés, indice de biodiversité) → 62 % (gibier) →
65 % (ravageurs, auxiliaires et pollinisateurs — la diversité PAIE enfin) →
66 % (mécanisation déduite de la disposition des arbres) → 67 % (le climat
dérive enfin : trajectoires SSP et effet CO₂) → 69 % (le sol devient un
capital : humus ↔ azote, réserve utile dynamique, labour, dépôts
atmosphériques) → 70 % (faim d'azote, extrêmes climatiques amplifiés) → 71 % (tas de broyat : la fertilité se
transporte) → 71 % (réseaux mycorhiziens) → 72 % (cycles du phosphore et du
potassium) → 73 % (altération biologique : les cycles tiennent, P et K
limitent enfin, et les mycorhizes gagnent leur vie) → chasse et clôture, et
l'exigence minérale devient une propriété des espèces (ce qui ouvre la porte
aux cultures) → 74 % (frêne, trogne,
arbres-habitats, chalarose, mémoire hydraulique des sécheresses, frottis, geai).*

---

## A. Sol, eau, atmosphère

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| A1 | L'eau du sol suit un bilan conservatif (rien ne se perd, rien n'apparaît) | ✅ | `water.ts` ; `tick-conservation.test.ts` |
| A2 | Un sol à faible réserve utile se vide plus vite qu'un sol profond | ✅ | RU par station ; `determinism.test.ts` |
| A3 | L'évaporation d'un sol nu s'auto-limite quand la surface sèche | ✅ | `soilEvapFactor` quadratique |
| A4 | Un couvert végétal réduit l'évaporation du sol (microclimat) | ✅ | `CANOPY_EVAP_FLOOR` × ombrage au sol |
| A5 | Un paillis/litière au sol réduit encore l'évaporation | ✅ | `MULCH_MAX_EFFECT` sur le stock de litière |
| A18 | Un sol couvert d'herbe évapore moins qu'un sol nu | ✅ | couverture herbacée dans le bilan d'évaporation |
| A6 | Un sol engorgé asphyxie les racines des espèces sensibles | ✅ | `waterloggingFactor` ; `tolerances.test.ts` |
| A7 | Le vent augmente la demande évaporative ; un abri la réduit | ✅ | `windShelterAt` (portée 12 H) ; `nurse.test.ts` |
| A8 | Une nappe accessible soutient la végétation en été | 🟡 | recharge l'horizon profond ; pas encore de battement saisonnier |
| A9 | Les paramètres de sol sont **dérivés** de la texture, la profondeur, la pierrosité et la MO | ✅ | `soil.ts` ; `soil.test.ts` — **le générateur de sols est débloqué** |
| A10 | Le sol est stratifié en horizons ; les racines explorent en profondeur avec l'âge | ✅ | `profilHydro` + `profondeurRacinesCm` ; `racines.test.ts` |
| A17 | Un arbre n'investit vers le bas que s'il manque d'eau (plasticité racinaire) | ✅ | `nouvelleProfondeurRacines` ; `racines.test.ts` |
| A11 | La pente crée ruissellement, érosion et dessèchement d'adret | ❌ | Aucune pente dans le moteur |
| A15 | Une nappe perchée engorge la profondeur sans asphyxier la surface | ✅ | engorgement par horizon ; drainage externe |
| A16 | Le drainage dépend de l'exutoire autant que de la texture | ✅ | `drainageExterneMmSemaine` |
| A12 | La MO du sol augmente la réserve utile (humus = éponge) | ✅ | `ruHorizonMm` + réserve de surface recalculée par cellule selon son humus ; `sol-vivant.test.ts` |
| A13 | La structure/compaction évolue (tassement, restauration par les racines) | ❌ | Pas de variable structure |
| A14 | Deux plantes voisines se disputent réellement l'eau de leurs cellules communes | ✅ | Allocation spatiale en 2 passes ; `nurse.test.ts` |

## B. Lumière et structure

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| B1 | Un couvert dense intercepte la lumière (Beer-Lambert) | ✅ | `light.ts` |
| B2 | L'ombre est portée vers le nord (soleil au sud) : l'orientation des lignes compte | ✅ | `SHADOW_NORTH_OFFSET` |
| B3 | L'ombre est dégradée : pénombre en bordure de houppier | ✅ | atténuation en (1 − d²/r²) |
| B4 | Un héliophile meurt sous couvert fermé ; un sciaphile y patiente | ✅ | points de compensation ; `lumiere.test.ts` |
| B5 | Les caducs n'ombragent pas hors saison (fenêtre des vernales) | ✅ | `leavesOn` ; pas encore de strate herbacée pour en profiter |
| B6 | Les arbres de même hauteur se gênent latéralement (auto-éclaircie) | 🟡 | poids 0,4 pour les codominants — calibré à la main |
| B7 | La hauteur du soleil varie avec la saison et la latitude | 🟡 | décalage d'ombre constant, pas de course saisonnière |
| B8 | Les strates basses (arbustes, herbacées, couvre-sol) existent et se partagent la lumière | 🟡 | strate herbacée en couverture (`herbe.ts`) ; pas encore d'espèces herbacées distinctes |
| B9 | Une lisière reçoit plus de lumière latérale qu'un cœur de massif | ❌ | Pas d'effet de bord |
| B10 | La forme du houppier réagit à la compétition (élagage naturel, port serré) | ❌ | Houppier = ratio fixe × hauteur |

## C. Nutriments et cycles

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| C1 | L'azote suit un bilan conservatif | ✅ | `tick-conservation.test.ts` |
| C2 | La minéralisation dépend de la température, de l'humidité et de l'anoxie | ✅ | `decompositionClimateFactor` |
| C3 | Les nitrates sont lessivés par le drainage | ✅ | `cellLeachedG` |
| C4 | Une litière à C/N bas se décompose vite ; les aiguilles, lentement | ✅ | `litterDecayRate` ; `litiere.test.ts` |
| C5 | Les fixateurs enrichissent réellement leur voisinage | ✅ | fixation → litière ; `litiere.test.ts` |
| C6 | Un frugal se contente d'un sol pauvre là où un exigeant a faim | ✅ | besoin en g/individu ; `nitrogen-conservation.test.ts` |
| C7 | Le pH exclut les espèces hors de leur gamme (calcicoles / acidiphiles) | ✅ | `phFactor` ; `embauche-chaulage.test.ts` |
| C8 | Le carbone du sol et l'azote sont couplés (retourner une prairie libère N et C) | ✅ | la minéralisation de l'humus rend C ET N au C/N de l'humus ; action `labourer` ; `sol-vivant.test.ts` |
| C13 | Les dépôts atmosphériques apportent de l'azote (et fertilisent les milieux pauvres) | ✅ | `station.depositionNKgHaAn` ; 9 à 20 kg/ha/an selon la région |
| C9 | Enfouir un matériau à C/N élevé provoque une faim d'azote | ✅ | `azoteNetDecomposition` (bascule vers C/N 27) ; l'azote est immobilisé, pas perdu ; `sol-vivant.test.ts` |
| C10 | Le pH dérive lentement (litières acidifiantes, lessivage, chaulage) | 🟡 | Chaulage seul ; pas de dérive |
| C11 | Phosphore et potassium peuvent limiter la croissance | ✅ | `pk.ts` ; `pk.test.ts` — cycles conservatifs, flux réalistes, branchés sur la loi du minimum : rien sur un limon profond, décisifs sur un podzol acide |
| C12 | Les mycorhizes améliorent l'absorption et se construisent avec le temps | ✅ | `mycorhizes.ts` : trois réseaux incompatibles, ~5 ans à se tisser, détruits par le labour ; gain sur l'azote dilué ET **altération biologique de la roche** — c'est là qu'ils gagnent leur vie |

## D. Climat et phénologie

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| D1 | Le climat est réel, variable d'une année à l'autre, avec vraies sécheresses | ✅ | séries Météo-France ; `meteo-reelle.test.ts` |
| D2 | L'ETP suit le rayonnement, la latitude et l'amplitude thermique | ✅ | Hargreaves/FAO-56 ; `etp.test.ts` |
| D3 | La floraison suit un cumul de degrés-jours | ✅ | `ddYearBase5` ; `fruits.test.ts` |
| D4 | Un gel tardif détruit les fleurs ouvertes : les précoces sont un pari | ✅ | `tMinAbsC` ; `fruits.test.ts` |
| D5 | La variabilité climatique ouvre des fenêtres d'installation | 🟡 | visible (`fenetres-installation.test.ts`), non piloté par un mécanisme dédié |
| D6 | Le couvert tamponne la température (moins de gel, moins de canicule) | ❌ | Microclimat = humidité seulement |
| D7 | Les espèces ont un besoin de froid hivernal (vernalisation) | ❌ | `besoin_froid_h` prévu, non implémenté |
| D8 | Le climat dérive au fil de la partie (trajectoires SSP) | ✅ | `climat.ts` ; `climat.test.ts` — anomalie AR6 superposée aux observations, amplification française plus forte en été, étés qui s'assèchent |
| D9 | La hausse du CO₂ augmente la production et l'efficience hydrique, en saturant | ✅ | réponse logarithmique sur le potentiel (donc bornée par Liebig) + fermeture stomatique testée |
| D11 | Les extrêmes s'aggravent plus vite que les moyennes (canicules, sécheresses) | ✅ | écarts chauds et déficits de pluie amplifiés (`normalesHebdo`) ; et la mémoire pluriannuelle existe — non dans le sol (qui se recharge chaque hiver, mesuré à 94-100 %) mais dans l'arbre, par la cavitation (`dommageHydraulique`) |
| D10 | L'altitude et l'exposition modifient températures et rayonnement | 🟡 | latitude seule ; pas d'altitude ni d'adret/ubac |

## E. Interactions entre plantes

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| E1 | Une nurse protège (vent, rayonnement) mais concurrence (eau) : tout est dans la distance | ✅ | `nurse.test.ts` |
| E2 | Un fixateur voisin profite aux autres | ✅ | `litiere.test.ts` |
| E3 | La facilitation domine en milieu contraint, la compétition en milieu riche | 🟡 | émergent, non testé comme tel |
| E4 | Les espèces xérophiles transpirent moins par unité de feuillage (WUE) | 🟡 | dérivé du tempérament, à calibrer sur données |
| E11 | Un pivot résiste à la sécheresse là où un traçant souffre | ✅ | `racines.test.ts` (sable sur limon : le pivot survit, le traçant meurt) |
| E5 | Une haie brise-vent améliore la production sur 10-20 fois sa hauteur | ✅ | `windShelterAt` |
| E6 | L'allélopathie (juglone du noyer) pénalise les sensibles | ❌ | Champ prévu, non implémenté |
| E7 | Les racines se stratifient : deux espèces peuvent puiser à des profondeurs différentes | ✅ | `fractionsRacinairesParHorizon` ; `racines.test.ts` |
| E8 | Un couvert nurse peut être « levé » (coupe progressive) au bon moment | ✅ | coupe/recépage sélectifs de la nurse |
| E9 | Les plantes de sous-bois profitent de la fenêtre de printemps | ❌ | Dépend d'espèces herbacées distinctes |
| E12 | La concurrence herbacée fait échouer les plantations non entretenues | ✅ | `herbe.ts` ; `herbe.test.ts` — d'autant plus forte que le sol est pauvre |
| E10 | La densité de plantation modifie la forme et la vitesse (serré = élancé) | ❌ | Dépend de B10 |

## F. Dynamique des peuplements

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| F1 | Une friche abandonnée se boise selon la succession pionniers → climaciques | ✅ | `succession.test.ts` (200 ans) |
| F2 | La dissémination dépend du mode (vent, oiseaux, gravité) | ✅ | `regeneration.ts` |
| F3 | Les semis ne s'installent que dans leurs conditions (lumière, pH) | ✅ | filtres d'installation |
| F4 | Les arbres vieillissent et meurent (sénescence) | ✅ | `fAge` ; `succession.test.ts` |
| F5 | Le voisinage hors-parcelle ensemence en continu | ✅ | `station.voisinage` |
| F6 | L'auto-éclaircie régule la densité d'un peuplement dense | 🟡 | plafond de densité arbitraire + ombrage codominant |
| F7 | Les trouées déclenchent une régénération (cycle sylvigénétique) | 🟡 | émergent, non testé |
| F8 | Certaines espèces rejettent de souche ou drageonnent | ❌ | Champs prévus, non implémentés |
| F9 | La banque de graines du sol garde une mémoire du passé | ❌ | Absente |
| F10 | Le feu tue, sélectionne et régénère (espèces pyrophytes) | ✅ | `feu.ts` ; `feu.test.ts` |
| F11 | Le risque d'incendie ÉMERGE du climat (il remontera vers le nord) | ✅ | `indiceRisqueFeu` : sécheresse × chaleur × combustible × vent, aucune station déclarée « à feu » |
| F12 | Le feu se propage selon ce qui brûle : une coupure ou un feuillu frais l'arrêtent | ✅ | `probabilitePropagation` ; `feu.test.ts` |

## G. Faune et santé

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| G1 | Le gibier abroutit les jeunes plants non protégés | ✅ | `gibier.ts` ; `gibier.test.ts` — au-dessus de ~0,35 cervidé/ha, une plantation appétente ne sort jamais de la hauteur de dent |
| G9 | Passer la hauteur de dent ne met pas à l'abri : frottis et écorçage | ✅ | `frottisDeLaSemaine` — le brocard vise les tiges ISOLÉES, à écorce lisse, entre 1,2 et 5 m ; sous 1,6 m la blessure annelle |
| G7 | Sa sélectivité réoriente la composition (le noisetier trinque, le pin passe) | ✅ | `especes.gibier.appetence` ; émergent, rien n'est codé espèce par espèce |
| G8 | Un herbivore ne détruit rien : il déplace et concentre le C et l'azote | ✅ | déjections rendues à la cellule broutée ; conservation C et N testée |
| G2 | Les ravageurs apparaissent quand les hôtes s'affaiblissent | ✅ | `ravageurs.ts` ; `ravageurs.test.ts` — sans seuil scripté : vigueur → ressource → pullulation, avec hivernage donc crises pluriannuelles |
| G3 | Les auxiliaires régulent les ravageurs selon l'habitat offert | ✅ | prédation ∝ habitat du voisinage (essences, strates, herbe, bois mort) ; aulnaie pure décimée, mélange épargné |
| G4 | Les pollinisateurs conditionnent la fructification | 🟡 | service ∝ habitat local (mêmes milieux que les auxiliaires) ; pas d'insectes individualisés ni de calendrier de floraison |
| G5 | Les disséminateurs (geai) transportent les grosses graines | ✅ | mode `geai` : loin du parent ET **en découvert**, parce que l'oiseau doit retrouver ses caches. C'est ce biais qui fait coloniser les friches par les chênes et explique leur mauvaise régénération sous leur propre couvert (`geai.test.ts`) |
| G6 | Les maladies datées frappent (chalarose du frêne) | ✅ | `maladies.ts` ; `maladies.test.ts` — mieux qu'une date : une année d'arrivée historique, puis une pression qui suit la densité d'hôtes et l'humidité. Une frênaie pure perd un tiers de ses tiges en trente ans, le même nombre de frênes en mélange s'en tire deux fois mieux |

## H. Gestion, économie, travail

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| H1 | Chaque action coûte du temps de travail et de l'argent | ✅ | `actions.ts` ; `actions.test.ts` |
| H2 | Le temps de travail est plafonné par semaine et budgété à l'année (UTH) | ✅ | `WEEK_HOURS_CAP` |
| H3 | Saisonnier vs CDI : coûts, durées et ruptures réalistes | ✅ | `embauche-chaulage.test.ts` |
| H4 | La cadence de récolte dépend de l'espèce (pommes vs noisettes) | ✅ | `fruits.recolteHKg` |
| H5 | Une récolte non faite dans sa fenêtre est perdue | ✅ | `fruits.test.ts` |
| H6 | Le bois d'œuvre vaut beaucoup plus que le bois énergie (qualité, diamètre) | ✅ | `valeurSurPied` ; `sylviculture.test.ts` — il faut une bille élaguée ET du diamètre |
| H7 | Les prix varient (marché, saturation locale) | ❌ | Prix fixes |
| H8 | Éclaircies, élagage, taillis, trognes : la sylviculture a des gestes distincts | ✅ | élagage, recépage, éclaircie par critère et **trogne** (`trogner` ; `trogne.test.ts`) — quatre gestes qui ne se confondent pas |
| H14 | Certaines récoltes ne tuent pas l'arbre et suivent une rotation (liège) | ✅ | `leverEcorce` ; `especes.ecorce` ; `sylviculture.test.ts` |
| H15 | Un bois tué sur pied reste valorisable un temps, avec décote | ✅ | `DECOTE_CHABLIS`, `CHABLIS_RECUPERABLE_SEMAINES` ; qualité d'œuvre perdue |
| H9 | Irrigation, fertilisation, protections individuelles, clôtures | 🟡 | chaulage, fauche, protections individuelles et **clôtures** ; irrigation et fertilisation absentes |
| H18 | Le gibier se régule aussi par la chasse — et l'immigration compense | ✅ | `chasser` ; `gibier.test.ts` — une journée fait reculer la pression, un an plus tard elle est revenue |
| H16 | Un chantier se mécanise ou non selon la disposition des arbres, et la machine se paie | ✅ | `mecanisation.ts` ; `mecanisation.test.ts` — la part accessible se déduit des positions, aucune parcelle n'est déclarée mécanisable |
| H17 | La fertilité se TRANSPORTE : on récolte la biomasse ici et on l'épand là | ✅ | tas de broyat (`stockBrf`) + action `epandreBrf` ; `epandre-vs-vendre.test.ts` |
| H13 | Entretenir une plantation (dégagements) change son sort | ✅ | action `faucher` ; `herbe.test.ts` |
| H10 | Les aides publiques et paiements pour services existent | ❌ | Absents |
| H11 | La trésorerie peut plonger jusqu'à la faillite | ✅ | découvert plafonné |
| H12 | Le sol se découvre par observation ou analyse payante | 🟡 | tout est visible dans l'UI (calques) |

## I. Carbone

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| I1 | Le carbone suit un bilan conservatif entre tous les pools | ✅ | `carbon-conservation.test.ts` |
| I2 | Le sol est le plus gros stock en tempéré | ✅ | `carbon.test.ts` |
| I3 | Le bois énergie vendu est émis immédiatement (il ne stocke rien) | ✅ | `epandre-vs-vendre.test.ts` |
| I4 | Le bois d'œuvre stocke pendant la durée de vie du produit | 🟡 | comptabilisé comme stock (`oeuvreCumKgC`) ; pas encore de fin de vie du produit |
| I5 | Le bois mort et la litière s'humifient partiellement | ✅ | coefficients d'humification |
| I6 | Le travail du sol déstocke massivement le carbone | ✅ | `labourer` : 5 % de l'humus par passage, émis et comptés dans le bilan |
| I9 | Un incendie renvoie d'un coup le carbone accumulé | ✅ | `feu.ts` ; `feu.test.ts` |
| I7 | L'allométrie biomasse→carbone est plausible par espèce | 🟡 | proxy 0,015·H² × densité, à caler sur l'IFN |
| I8 | Le bilan peut être négatif au début d'une plantation | 🟡 | observé dans le jeu, non testé |

---

## J. Biodiversité et structure

Ce que vaut un peuplement au-delà de sa récolte. L'indice est un proxy assumé :
il classe des situations les unes par rapport aux autres, il ne remplace pas un
inventaire.

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| J1 | La richesse en essences ET leur équilibre comptent (une essence à 95 % est un désert) | ✅ | `biodiversite.ts` équitabilité de Shannon ; `biodiversite.test.ts` |
| J2 | Le bois mort est un habitat, pas un déchet | ✅ | pool `deadWoodKgC` intégré à l'indice (ch4-A) |
| J3 | Les gros arbres et les arbres à cavités valent plusieurs jeunes | ✅ | gros sujets ET trognes recoupées, dont la tête se creuse (`biodiversite.ts` ; `trogne.test.ts`) |
| J4 | Un couvert étagé et permanent abrite plus qu'une strate unique | 🟡 | strates et sempervirence comptées ; pas de lisières ni de structure horizontale |
| J5 | La diversité rétroagit sur le peuplement (régulation, pollinisation, résilience) | ✅ | c'est le cœur de `ravageurs.ts` : la diversité du voisinage nourrit les auxiliaires, qui écrêtent les pullulations, et les pollinisateurs, qui font la nouaison |
| J6 | Des floraisons étalées nourrissent les pollinisateurs sans rupture | 🟡 | le service de pollinisation dépend de l'habitat, mais pas encore du calendrier de floraison (les deux périodes de soudure, ch4-C) |

## Ce qui débloquerait le plus de critères

2. **Le sanglier** : retournement du sol, consommation des glands et des
   châtaignes — le dernier grand absent du module biotique.
3. **Variabilité individuelle** (v2) : tous les individus d'une espèce sont
   aujourd'hui identiques, ce qui rend certains résultats en tout-ou-rien.
3. **Climat qui dérive** : trajectoires SSP + effet CO₂ (D8, D9).
4. **Couplage humus ↔ azote et labour** (C8, C9, I6) — et l'humus qui gagne de la réserve utile (A12 dynamique).

## Le paysage : ce que l'entourage décide

`paysage.ts` regroupe en un objet nommé ce qui était éparpillé — gibier, dépôts
d'azote, semenciers, vent, fréquentation humaine. C'est ce qui permet de dire
« au milieu des champs » ou « en lisière de banlieue » et d'en tirer des
conséquences cohérentes, au lieu de saisir quatre nombres indépendants.

*Restent hors du modèle, et ce sont les mêmes racines* : la **pente**,
l'**altitude**, et tout ce qui suppose un écoulement LATÉRAL de l'eau (mare,
ruisseau, ruissellement, inondation, exposition adret/ubac). Le bilan hydrique
est aujourd'hui strictement vertical, cellule par cellule.

## Générateur de stations : ce qu'il reste à faire

La dérivation (A9) est en place : une station se décrit par un profil
d'horizons, tout le reste est calculé. Pour générer des stations quelconques,
il manque seulement le tirage cohérent des profils (une texture, une
profondeur et une MO plausibles ensemble, et cohérentes avec le climat et la
position topographique) — pas de nouveau mécanisme moteur.

## Règle de travail

À chaque ajout au moteur, mettre ce document à jour : cocher, recompter, et
vérifier qu'aucun critère n'a été coché par un cas particulier. Le score n'est
pas une note — c'est une carte de ce qui reste à rendre vrai.
