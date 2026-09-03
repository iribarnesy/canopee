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
| A. Sol, eau, atmosphère | 15 | 2 | 3 | 20 |
| B. Lumière et structure | 5 | 3 | 2 | 10 |
| C. Nutriments et cycles | 9 | 3 | 1 | 13 |
| D. Climat et phénologie | 7 | 3 | 1 | 11 |
| E. Interactions entre plantes | 7 | 2 | 3 | 12 |
| F. Dynamique des peuplements | 7 | 2 | 3 | 12 |
| G. Faune et santé | 8 | 1 | 0 | 9 |
| H. Gestion, économie, travail | 12 | 4 | 3 | 19 |
| I. Carbone | 5 | 3 | 1 | 9 |
| J. Biodiversité et structure | 4 | 2 | 0 | 6 |
| **Total** | **79** | **25** | **17** | **121** |

**Score de réalisme : 79 pleins + 25 partiels sur 121 → 76 %** *(un partiel compte 1/2)*.

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
arbres-habitats, chalarose, mémoire hydraulique des sécheresses, frottis, geai) → 76 % (relief, écoulement
latéral, adret/ubac).*

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
| A8 | Une nappe accessible soutient la végétation en été | ✅ | remontée capillaire décroissante avec la distance verticale ; hauteur capillaire déduite de la texture (`eau_surface.ts`) |
| A19 | Un ruisseau ou une mare tient une nappe locale : la ripisylve s'installe toute seule | ✅ | `profondeurNappeCm` (subordination au relief × portée d'influence) ; `eau-surface.test.ts` — au bord de l'eau l'aulne domine, le hêtre s'y noie |
| A20 | Sous la surface libre d'une nappe, le sol est saturé (ce n'est pas un flux, c'est un état) | ✅ | saturation imposée dans `profilHydro`, comptée comme un apport de nappe |
| A23 | Le terrain se donne cellule par cellule ; l'eau libre s'en DÉDUIT (cuvettes remplies, talwegs drainés) | ✅ | `terrain.ts` ; `terrain.test.ts` — creuser un trou fait une mare, le percer sur le côté ne fait plus rien |
| A24 | Une cuvette ne tient l'eau que si son bassin couvre l'évaporation et l'infiltration | ✅ | `assecherLesCuvettesQuiNeTiennentPas` — la même cuvette tient dans l'argile, pas dans le sable |
| A26 | Un terrain neuf peut vieillir sans joueur avant la partie (humus, herbe, colonisation, ripisylve) | ✅ | `faireVieillir` — rejoué à l'identique au chargement |
| A25 | L'eau d'amont entre par la bordure haute et traverse en s'infiltrant | ✅ | `entreesDAmont` ; `terrain.test.ts` |
| A22 | Une crue noie le bas de la parcelle quand le bassin d'amont verse, et reflue ensuite | ✅ | `hauteurDeCrueM` ; `eau-surface.test.ts` — même eau que le ruissellement d'amont, relue depuis le cours d'eau |
| A21 | Un orage sur un sol déjà plein ruisselle intégralement | ✅ | passe 1 de `profilHydro` : le refus reflue au lieu d'être perdu ; `profil-hydro-conservation.test.ts` |
| A9 | Les paramètres de sol sont **dérivés** de la texture, la profondeur, la pierrosité et la MO | ✅ | `soil.ts` ; `soil.test.ts` — **le générateur de sols est débloqué** |
| A10 | Le sol est stratifié en horizons ; les racines explorent en profondeur avec l'âge | ✅ | `profilHydro` + `profondeurRacinesCm` ; `racines.test.ts` |
| A17 | Un arbre n'investit vers le bas que s'il manque d'eau (plasticité racinaire) | ✅ | `nouvelleProfondeurRacines` ; `racines.test.ts` |
| A11 | La pente crée ruissellement, érosion et dessèchement d'adret | ✅ | `relief.ts` + `erosion.ts` ; `erosion.test.ts` — 4 t/ha/an à 15 % sur sol nu, quasi rien sous couvert |
| A27 | Ce que l'eau emporte est plus riche que le sol moyen, et se dépose plus bas | ✅ | enrichissement ×3, dépôt fonction du couvert de la cellule d'arrivée — le versant se déshabille par le sommet |
| A15 | Une nappe perchée engorge la profondeur sans asphyxier la surface | ✅ | engorgement par horizon ; drainage externe |
| A16 | Le drainage dépend de l'exutoire autant que de la texture | ✅ | `drainageExterneMmSemaine` |
| A13 | L'eau ruisselle d'une cellule à l'autre : bas de pente frais, crête sèche | ✅ | `relief.ts` ; `relief.test.ts` — le coefficient de ruissellement dépend de la pente, de la COUVERTURE DU SOL et de la saturation |
| A14 | L'altitude refroidit et l'exposition décide du rayonnement (adret/ubac) | ✅ | 0,6 °C/100 m ; ±25 % d'ETP ET ±1,5 °C entre adret et ubac — c'est la même énergie qui fait les deux, un versant sud n'est pas seulement plus sec |
| A28 | La nappe se voit : profondeur et engorgement, cellule par cellule | ✅ | calques « Nappe » et « Engorgement » alimentés par l'instantané |
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

## Le relief : l'eau circule enfin

`relief.ts`. Le bilan hydrique était strictement vertical — chaque mètre carré
recevait sa pluie et ne parlait jamais à ses voisins. Désormais une parcelle a
une **altitude**, une **pente**, une **exposition** et une **forme** (plan,
vallon en entonnoir, croupe), et l'eau descend : ce qui ruisselle en haut a une
seconde chance de s'infiltrer en bas, ce qui fait les bas de pente frais et les
crêtes sèches sur la même parcelle.

Le relief se **choisit au lancement** — altitude, pente, exposition, forme,
bassin d'amont — au lieu d'être figé par station : la même terre peut se jouer
à 60 m sur du plat ou à 1 200 m sur un ubac à 30 %.

## L'eau de surface : la ripisylve, sans règle sur les espèces

`eau_surface.ts`. Un ruisseau qui longe un côté, une mare creusée dans la
parcelle. Ce qui compte n'est pas le plan d'eau mais la **nappe** qu'il tient :
elle affleure à la berge et s'enfonce en s'éloignant, selon deux termes qui
disent deux choses différentes — le **relief** (plus une cellule domine le plan
d'eau, plus la nappe est loin sous ses pieds, d'autant plus que le sol conduit
bien l'eau) et la **portée d'influence** (un cours d'eau draine tout un versant,
une mare ne mouille que ses abords).

Trois conséquences, toutes déjà connues du bilan hydrique : une **remontée
capillaire** d'autant plus forte que la nappe est proche, un **exutoire bouché**
là où elle est dans le profil, et surtout la **saturation imposée** sous la
surface libre — le point qui manquait, et sans lequel le ruisseau ne changeait
presque rien. Résultat mesuré à douze ans, ruisseau au sud : au bord de l'eau
l'aulne pousse un peu mieux (6,22 m contre 6,03) et le hêtre s'effondre (1,27 m
contre 2,73) ; à vingt mètres, plus aucune différence. Aucune espèce n'est
nommée nulle part.

**La crue** en découle sans mécanisme neuf : le cours d'eau reçoit le même
ruissellement d'amont que la parcelle, monte d'autant, et sa nappe affleure
dans le bas. Elle reflue dès que l'amont ne verse plus. Sans bassin d'amont,
pas de crue ; sans plan d'eau, la pluie ruisselle et s'en va.

## Les trajectoires climatiques sont françaises

Le moteur partait du réchauffement mondial et l'amplifiait (×1,4 l'hiver,
×1,9 l'été). L'été tombait juste ; l'hiver était trop chaud, et la moyenne
annuelle française sortait à +4,5 °C au lieu de +3,8 sous SSP2-4.5. Il part
maintenant des trajectoires FRANÇAISES — estimation observationnellement
contrainte de Ribes et al., base des paliers TRACC — et ne fait que les
répartir dans l'année, avec une forme saisonnière de moyenne 1 qui concentre
l'excès sur juillet-août. L'interface affiche les deux : monde et France.

## Cas d'étude : après l'incendie, l'inondation

*Notes d'un conseil d'administration d'urgence après les feux de Gironde
(Saumos, Landiras, 2022), transmises par l'auteur du jeu.* Le raisonnement des
gestionnaires est le suivant : **la forêt fait baisser le niveau de la nappe**
en transpirant ; là où elle a brûlé, elle ne pompe plus, la nappe remonte, et
l'hiver suivant les zones brûlées s'inondent. S'y ajoute la perte de rugosité
du terrain, qui accélère le ruissellement, et un exutoire — le canal des étangs
— qu'on ne peut pas charger davantage sans inonder Lège.

**Ce que le simulateur voyait, et ce qu'il ne voyait pas.** Premier essai :
pinède de quarante ans, puis deux futurs à partir du même état, l'un intact,
l'autre brûlé. Il voyait la CAUSE — la transpiration s'effondrait, l'eau
qu'elle prenait percolait — et la rugosité perdue. Mais rien n'était inondé,
parce que l'eau qui percolait **quittait le système** : la profondeur de nappe
était un champ figé, aucun stock ne la recevait.

**La nappe est maintenant un stock** (`nappe.ts`), et la chaîne s'établit
d'elle-même. Aulnaie de fond de vallée, quarante ans, puis incendie :

| | transpiration | nappe d'hiver | parcelle inondée |
|---|---|---|---|
| intacte | 730 mm/an | 0,74 m sous la surface | 0 % |
| brûlée | **196 mm/an** | **0,20 m** | **9 %** |

La forêt tenait la nappe un demi-mètre plus bas ; brûlée, elle la relâche, et
la nappe affleure. Sur un limon planté de hêtres, le même essai donne 3,94 m
→ 3,49 m : le mécanisme est là aussi, simplement la nappe part de trop bas
pour affleurer. Rien de tout cela n'est écrit nulle part — ce sont la
transpiration, la percolation et la remontée capillaire, déjà présentes, qui
se rejoignent une fois qu'un stock les relie.

**Ce que la recalibration a demandé.** Mettre une nappe sous le sol change le
régime hydrique de toutes les stations, et il a fallu :

- **déclarer** la profondeur d'équilibre de chaque station au lieu de la
  déduire de proxys — c'est un relevé de terrain, pas un calcul ;
- un **échange régional dans les deux sens** : à l'échelle d'une parcelle, le
  niveau d'une nappe est décidé par le réseau qui la draine à des kilomètres.
  Une parcelle plus chargée se vide vers la région, un fond de vallée en
  REÇOIT — et c'est pour cela qu'il est engorgé ;
- de laisser la nappe **monter dans le sol** et pas seulement jusqu'à sa base,
  sans quoi l'inondation restait structurellement impossible ;
- de **plafonner la transpiration par l'énergie disponible**. Le défaut est
  apparu avec la nappe : tant que l'eau manquait, c'est elle qui bridait. Une
  aulnaie alimentée par la nappe transpirait 1 021 mm par an, soit bien plus
  que le soleil n'en permet. La demande d'un arbre est proportionnelle à son
  houppier ; quand les couronnes se superposent, la somme dépassait plusieurs
  fois l'ETP. Un mètre carré ne reçoit qu'un mètre carré d'énergie.

Cinq tests ont bougé. Aucun ne portait sur la nappe : ils mesuraient des
équilibres que la nappe déplace, et tous disaient moins que ce qu'ils
croyaient.

*Limites assumées* : la profondeur d'équilibre est une donnée exogène, donc un
incendie à l'échelle d'un MASSIF — celui du cas d'étude — n'est représenté que
sur la parcelle, la région continuant de tenir son niveau ; et le
ruissellement d'un fond de vallée saturé en permanence est surestimé, l'eau y
faisant des allers-retours entre nappe et surface.


## L'érosion : ce qui part d'un versant

`erosion.ts`. Le ruissellement circulait sans rien emporter. Il emporte
maintenant l'horizon de surface — celui qui porte l'humus, l'azote, le
phosphore assimilable —, en gardant la structure de l'équation universelle de
perte en terre ramenée à la semaine : *érosivité × ruissellement × √pente ×
(1 − couverture)²*.

Le carré sur le couvert n'est pas cosmétique : il dit que les premiers
pourcents de sol nu coûtent peu et que les derniers coûtent tout. Mesuré sur
dix ans de limon : **4 t/ha/an arrachées à 15 % de pente sur sol nu, 9 t/ha/an
à 30 %, et pratiquement rien dès que l'herbe couvre** — les ordres de grandeur
européens pour un sol cultivé nu.

Deux choses distinguent l'érosion d'une simple perte de masse, et toutes deux
sont modélisées : ce qui part est **plus riche** que le sol moyen (l'eau
emporte les fines et les matières organiques, pas les cailloux : enrichissement
×3), et ce qui part **se dépose plus bas** dès que l'eau ralentit, d'autant
mieux que la cellule d'arrivée est couverte. C'est le colluvium de bas de
versant, et c'est aussi pourquoi une bande enherbée ou une haie sur courbe de
niveau arrête le sédiment. Seul un cinquième de la terre arrachée quitte
réellement la parcelle — le rapport d'export classique à l'échelle de la
parcelle.

Ce qui franchit la limite est **perdu pour de bon**, et compté comme tel dans
les bilans carbone et azote : sans ce compteur, l'humus emporté aurait disparu
des livres.

*Limite assumée* : l'horizon ne s'amincit pas. On perd la fertilité de la
surface, pas encore son épaisseur ni sa réserve utile.

## La strate arbustive : quatre espèces qui changent la succession

Le noisetier occupait à lui seul 48 % des tiges des soixante premières années.
Deux causes, corrigées l'une après l'autre : un taux de régénération qui ne
savait pas descendre sous 1 semis par pied et par an (alors que la noisette est
mangée par tout le monde), puis surtout l'absence de ses concurrents.

L'atlas les avait, le moteur non : **prunellier**, **aubépine**, **ronce** et
**sureau noir** — tous notés « pionniers » et trois d'entre eux « nurse ». Ce
sont eux qui prennent une friche, pas un arbuste de sous-étage. Avec eux, la
succession se lit enfin comme sur le terrain (limon, lisière forestière) :

| | fourré | arbres | noisetier |
|---|---|---|---|
| an 15 | ronce 42 %, prunellier 11 % | bouleau 17 % | — |
| an 40 | prunellier 17 %, aubépine 13 % | bouleau 35 % | — |
| an 120 | aubépine 18 %, ronce 3 % | bouleau 26 %, hêtre 24 % | 10 % |

La ronce prend tout et s'efface (héliophile, quinze ans de vie) ; l'aubépine,
bicentenaire, tient le sous-étage jusqu'au bout ; les épineux, que le gibier
délaisse, sont ce sous quoi les semis d'arbres passent leurs premières années.

Le plafond d'auto-éclaircie ne compte plus des tiges mais du **recouvrement** :
un peuplement sature quand la somme des couronnes atteint deux fois et demie la
surface au sol. Un nombre fixe était faux aux deux bouts ; celui-ci donne
1 160 tiges/ha à cinq ans, **3 900 en plein fourré à quinze ans**, 956 à
quatre-vingts après auto-éclaircie — les ordres de grandeur réels, sans qu'on
ait eu à choisir un chiffre par étape.

*Manquent encore* : le cornouiller, les saules arbustifs, le fusain, le troène.

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
