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
| F. Dynamique des peuplements | 7 | 3 | 3 | 13 |
| G. Faune et santé | 8 | 1 | 0 | 9 |
| H. Gestion, économie, travail | 12 | 4 | 3 | 19 |
| I. Carbone | 5 | 3 | 1 | 9 |
| J. Biodiversité et structure | 4 | 2 | 0 | 6 |
| **Total** | **79** | **26** | **17** | **122** |

**Score de réalisme : 79 pleins + 26 partiels sur 122 → 75 %** *(un partiel compte 1/2)*.

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
latéral, adret/ubac) → 75 % (hauteurs absolues calées sur les tables de
production).*

*Oui, le score BAISSE d'un point au dernier chantier, et c'est voulu : les
hauteurs ont été multipliées par deux à trois, mais on a ajouté au référentiel
un critère qu'on ne remplit qu'à moitié (F13) là où, avant, personne ne
comptait les points. Un référentiel qui ne s'allonge jamais finit par ne plus
mesurer que ce qu'on sait déjà faire.*

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
| D7 | Les espèces ont un besoin de froid hivernal (vernalisation) | ✅ | `besoinFroidSemaines` par espèce ; un hiver doux gonfle le forçage exigé (`debourrementExigeDJ`), `phenologie.test.ts` |
| D12 | Le feuillage a un calendrier par espèce : forçage, photopériode, déploiement progressif | ✅ | `phenologie.ts` ; `phenologie.test.ts` |
| D13 | L'automne se joue en deux temps : la feuille jaunit et cesse d'assimiler AVANT de tomber | 🟡 | `senescenceFoliaire` existe et se mesure ; elle ne commande pas encore la croissance ni la transpiration — voir ci-dessous |
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
| F13 | Les hauteurs à un âge donné tombent dans les tables de production | 🟡 | `hauteurs.test.ts` contre Jansen 1996 (hauteur dominante, classe médiane). Quatre essences à ±15 % à quarante ans — mais le hêtre y est CALÉ, donc l'essai le garde plus qu'il ne le valide ; pin, aulne et frêne, non touchés, sont une validation entière. La vérification tenue à l'écart est à vingt ans : −13 % à +10 %. Le bouleau reste hors table, faute de référence transposable |

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
| J3 | Les gros arbres et les arbres à cavités valent plusieurs jeunes | ✅ | gros sujets, trognes recoupées ET chandelles (`biodiversite.ts` ; `trogne.test.ts`, `chandelles.test.ts`) |
| J8 | Un arbre mort reste debout des années : c'est LE bois mort qui compte pour la faune | ✅ | `dureeChandelleSemaines` (densité du bois × 15 ans) ; `chandelles.test.ts` |
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

### Ce que l'essai a donné : planter autrement atténue, sans protéger

Profil « Saumos 2022 » — sable landais, nappe perchée, bassin entier logé à la
même enseigne — deux compositions plantées, et le moteur laissé libre de
déclencher ses propres incendies. Seize graines par composition, cinquante ans :

| composition | brûlé moyen | gros feux | peuplement tué | remontée de nappe |
|---|---|---|---|---|
| pinède pure | 1 928 m² | 12/16 | 86 % | **52 cm** |
| feuillus (bouleau, châtaignier) | 1 470 m² | 8/16 | 101 % | **32 cm** |
| chêne-liège dominant | 2 058 m² | 12/16 | 81 % | 47 cm |

Planter des feuillus réduit d'un tiers le nombre de gros incendies et de 38 %
la remontée de nappe qui suit. C'est la seule atténuation trouvée, et elle est
modeste. Le chêne-liège suit une autre stratégie : il ne réduit ni la surface
parcourue ni la remontée, il perd simplement moins d'arbres à chaque passage —
son écorce est faite pour ça — et c'est lui qui porte le peuplement le plus
haut à la fin. Survivre au feu et l'empêcher sont deux choses différentes.

**Une conclusion retirée.** On avait mesuré ici que replanter en aulne après le
feu raccourcissait d'un tiers la durée pendant laquelle la nappe reste haute,
et on l'avait écrit comme un résultat. C'en était un artefact : le feuillage
était alors commandé par un seul booléen — `tMean > 6 °C` — vrai presque tout
l'hiver dans les Landes, si bien que TOUS les caducs y transpiraient en
janvier. Un aulne sans feuilles ne rabat pas une nappe hivernale. Depuis que
chaque espèce a son calendrier (`phenologie.ts`), cette transpiration fantôme a
disparu, et l'avantage de l'aulne avec elle. Remesuré : aucune essence de
replantation ne se détache, les écarts sont du même ordre que le bruit d'un
incendie à l'autre.

**Une précision de vocabulaire** : « remontée de nappe » ne veut pas dire
inondation de surface. Sur ce sable, la part de parcelle réellement sous eau
reste nulle dans tous les essais ; ce que la remontée produit, c'est de
l'ENGORGEMENT (0,48 à 0,90 de la macroporosité noyée) et du RUISSELLEMENT en
plus — et c'est ce dernier qui inonde en aval, dans le canal des étangs.

**Et un résultat contre-intuitif** : mieux faire pousser n'est pas une
protection. Le peuplement qui transpire le plus tient la nappe le plus bas ;
quand il brûle, elle remonte d'autant. La productivité aggrave le rebond.

**La leçon de méthode compte autant que le résultat.** D'une graine à l'autre,
la même composition brûle de 0 à 4 500 m², et trois à cinq parties sur seize ne
connaissent aucun incendie. Le premier essai, fait sur un seul tirage par
composition, concluait « les feuillus ne brûlent jamais » — ce que seize
répétitions ont démenti. Un simulateur de ce genre ne se lit qu'en
répétitions.

**L'échelle de l'incendie compte, et elle se règle.** Le niveau régional est
exogène tant que la parcelle est seule à brûler. Mais quand tout un massif
part, les alentours cessent eux aussi de transpirer et le niveau régional monte
avec : un paramètre dit quelle part du bassin subit le même sort que la
parcelle. Mesuré sur l'aulnaie de vallée :

| bassin semblable | nappe, forêt intacte | après le feu | remontée |
|---|---|---|---|
| 0 % (parcelle isolée) | 0,75 m | 0,20 m | 55 cm |
| 100 % (tout le massif) | **1,62 m** | 0,35 m | **127 cm** |

À 100 %, la forêt tient la nappe régionale un mètre plus bas ; quand elle brûle
en entier, la nappe remonte de plus d'un mètre. C'est la différence entre
l'incendie d'une parcelle et celui d'un massif.

*Une « limite » qui n'en était pas.* On avait noté ici que le ruissellement d'un
fond de vallée saturé semblait surestimé — 8 700 mm par an, huit fois la pluie —
en soupçonnant des allers-retours entre nappe et surface. Instrumentation faite,
le bilan est exact et l'explication est ailleurs : l'essai faisait déverser les
**6 ha de bassin d'amont** de la station sur une parcelle d'essai réduite à
30 m, soit 0,09 ha. Deux cents millimètres par semaine arrivent alors du dehors
et repartent : c'est ce que reçoit réellement une parcelle placée sous un
bassin soixante fois plus grand qu'elle. À la taille réelle de la station
(100 m), le même bassin n'apporte que 18 mm par semaine.

La leçon porte sur les ESSAIS, pas sur le moteur : réduire `coteM` sans réduire
`bassinAmontHa` change la physique de la station. L'interface, elle, affiche
l'apport d'amont en clair au moment du réglage.


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

**Le sol s'amincit**, et c'est la conséquence longue — la plus grave, parce
qu'elle boucle sur elle-même : un horizon qui maigrit retient moins d'eau, donc
ruisselle davantage, donc s'érode plus vite. C'est ainsi que des versants
cultivés finissent sur la roche en un siècle ou deux. La réserve utile de
surface se calcule désormais sur l'épaisseur RESTANTE, avec un plancher de
trois centimètres — même décapé, il reste toujours un peu de terre.

Mesuré sur vingt-cinq ans à 30 % de pente : 0,14 cm perdus en moyenne sur un
sol laissé nu au départ, jusqu'à 0,33 cm en haut de versant, et 2,3 cm
d'accumulation en bas — le colluvium. C'est peu, et pour une bonne raison : sur
une parcelle abandonnée, l'herbe reprend en quelques années et l'érosion
s'arrête. Un versant labouré tous les ans, lui, ne referme jamais cette
fenêtre.

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

**Quatre essences de plus, prises dans l'atlas** — et choisies pour ce qu'elles
comblent, non pour faire nombre :

- le **charme**, sciaphile climacique : le hêtre était jusque-là la SEULE
  essence d'ombre du moteur, et une forêt n'a jamais un seul candidat au
  sous-étage. Sur limon en massif, la composition à cent cinquante ans devient
  une hêtraie-charmaie (hêtre 56 %, charme 29 %), ce qui est le climax du nord
  de la France ;
- le **houx**, sempervirent sciaphile : le seul couvert PERMANENT de sous-bois,
  celui qui abrite et nourrit en janvier sous une hêtraie nue ;
- le **saule blanc**, pionnier des bords d'eau, qui tolère l'engorgement à 0,95
  — avec l'aulne, c'est l'essence des ripisylves ;
- le **cornouiller mâle**, calcicole, qui fleurit en février sur bois nu : la
  première ressource de l'année pour les pollinisateurs.

*Le fusain et le troène ne figurent pas dans l'atlas* : on ne les a pas
inventés.

**Un bug que ces ajouts ont révélé.** La substitution des semenciers était
tout-ou-rien : on ne remplaçait la liste d'un paysage que si elle ressortait
ENTIÈREMENT vide sur la station. Il a suffi que le houx (pH 4-7) tolère le
podzol landais pour qu'un massif forestier y devienne une forêt de houx pur,
les autres essences étant écartées et le repli jamais déclenché. Le voisinage
sème maintenant autant quel que soit le sol — ce qui change, c'est QUI : on
garde les espèces qui tiennent et on complète avec celles qui poussent là.

## La phénologie : chaque espèce a son calendrier

Le feuillage était commandé par un booléen — `leavesOn = tMean > 6 °C` — et
toute la litière tombait en une semaine. Deux couperets, et le premier était de
surcroît identique pour toutes les espèces : un bouleau et un frêne
débourraient le même jour, ce qui est faux de six semaines. Or l'ordre de
débourrement décide de qui profite de la lumière d'avril sous un couvert encore
nu.

Le modèle combine les deux commandes que la littérature donne comme
indissociables : le **forçage**, un cumul de degrés-jours base 5 propre à chaque
espèce, et la **photopériode**, un seuil de durée du jour sous lequel rien ne
part. Le second n'est pas un raffinement — notre série le montre : au 12 avril,
la lande girondine a cumulé 341 °C·j quand le limon du Nord n'en a que 123. Un
seuil de forçage seul ferait débourrer les Landes six semaines avant le Nord, là
où l'écart réel est de deux à trois.

S'y ajoute le **besoin de froid** : un bourgeon ne sort de dormance qu'après des
semaines fraîches, et un hiver trop doux enfle le cumul de chaleur exigé. Hêtre
sur limon : onze semaines de froid à climat figé contre quatre sous SSP5-8.5 en
2090, ce qui porte son exigence de 315 à 420 °C·j. L'effet **amortit l'avance
sans la renverser** à nos latitudes.

**La croissance suit désormais le feuillage**, et plus seulement la température :
un caduc poussait en janvier quand l'hiver était doux, et transpirait sans avoir
une feuille. La transpiration hivernale d'un hêtre tombe à 3 mm par an quand le
pin, sempervirent, en garde 8. Le nombre de semaines de végétation est passé de
trente à vingt-six, ce qui n'est pas un rattrapage : la constante signifie « le
nombre de semaines sur lesquelles la pousse annuelle se répartit », et la
phénologie en donne le vrai compte.

**Ce que la correction a coûté** : une conclusion. L'avantage mesuré de l'aulne
en replantation d'après-feu n'était qu'un effet de la transpiration hivernale
fantôme qu'autorisait le booléen. Voir « une conclusion retirée » plus haut.

*Cette section laissait une limite ouverte* — « les hauteurs absolues sont
faibles, un hêtre de plaine plafonne autour de quatre mètres à quarante ans » —
et c'est le chantier suivant qui l'a levée.

## Les hauteurs absolues : le moteur se cale sur les tables de production

Le constat était juste ; la cause n'était pas là où on la cherchait. Un hêtre
planté sur la station confort faisait 2,1 m à dix ans, 3,0 m à vingt et 4,8 m à
quarante. Les rapports tenaient — le bouleau devant le hêtre, le limon riche
devant le limon pauvre — mais aucun niveau n'était présentable, et le rendu
visuel allait se calibrer là-dessus.

**La vérité terrain d'abord.** On a retenu les tables néerlandaises de
**Jansen, Sevenster & Faber (1996)**, *Opbrengsttabellen voor belangrijke
boomsoorten in Nederland* (IBN-DLO rapport 221, <https://edepot.wur.nl/174739>),
classe de croissance **médiane** de chaque essence. C'est la seule source du
corpus consulté qui donne directement la **hauteur dominante** — les cent plus
gros arbres à l'hectare — avec un âge compté depuis la germination et de
nombreuses classes de fertilité ; et le **CNPF (2025)**, *Faciliter
l'utilisation des tables de production forestières dans le cadre du Label Bas
Carbone*, la juge parmi les mieux adaptées au contexte français pour plusieurs
de ces essences.

| Essence (classe médiane) | 20 ans | 40 ans | 60 ans |
|---|---|---|---|
| Hêtre — *Beuk* GK 8 (gamme 4→12) | 7,7 m | **16,0 m** | 22,9 m |
| Pin sylvestre — *Groveden* GK 8 (4→12) | 8,1 m | **15,5 m** | 19,8 m |
| Bouleau — *Berk* GK 5 (3→6), Braastad 1967 | 8,6 m | **14,8 m** | 19,6 m |
| Aulne — *Zwarte els* GK 6 (4→8), Mitscherlich 1945 | 12,6 m | **18,0 m** | 21,3 m |
| Frêne — *Es* GK 6 (4→9), Volquardts 1958 | 9,0 m | **16,5 m** | 21,4 m |

*Deux pièges de lecture, signalés parce qu'ils changent les chiffres.* Les
tables allemandes classiques (Schober, Wiedemann, Jüttner) donnent la
*Mittelhöhe*, hauteur MOYENNE du peuplement, plus basse que la hauteur
dominante — le seul écart chiffré qu'on ait trouvé est de 0,8 m à 80 ans sur
l'épicéa, ce qui ne fait pas une règle de conversion *(à confirmer)*. Et l'âge
n'a pas la même origine partout : germination chez Jansen, hauteur de 0,30 m
chez Bontemps. Les valeurs à dix ans qu'on lit ici et là sont des
extrapolations sous le premier âge tabulé (quinze ans) : on ne s'y cale pas.

**La cause : un besoin d'azote quinze fois trop gros, qui s'affamait
lui-même.** Sur la station confort, le facteur limitant d'un hêtre était
l'azote 93 % des semaines de végétation, et sa satisfaction moyenne valait
**0,39** — toute sa vie. La loi du minimum multipliait donc la croissance par
0,4 en permanence. Le sol n'y était pour rien : ce limon minéralise 60 à
80 kg N/ha/an, ce qui est un chiffre de terrain honnête. C'est la DEMANDE qui
était fausse. Elle s'écrivait `60 × h^1,5` grammes par an : un hêtre de quinze
mètres y réclamait 3,5 kg d'azote **à lui seul**, quand un hectare de hêtraie
fermée en prélève 50 à 100.

Et le mécanisme se mordait la queue. Les arbres raflaient chaque semaine tout
l'azote minéral de leur zone racinaire ; le stock du sol restait donc collé à
zéro ; le frein de dilution — `nitrogenAvailabilityFactor`, saturé à 30 kg N/ha
— voyait ce stock nul et bridait l'extraction ; les arbres se retrouvaient
affamés par leur propre voracité. **Un sol pauvre en azote minéral n'est pas un
sol pauvre : c'est un sol où l'azote est consommé aussi vite qu'il apparaît.**

Le besoin est maintenant accroché à la seule grandeur qui le porte
physiquement, la **surface de houppier** : `AZOTE_HOUPPIER_G_M2_AN` = 8 g/m²/an
pour une essence d'exigence maximale. Le compte se refait à la main — un
couvert feuillu ferme porte 5 à 6 m² de feuilles par m² de sol, une feuille
titre 2 à 2,5 % d'azote, l'arbre en retransloque la moitié avant la chute — et
retombe sur 50 à 100 kg N/ha/an au houppier fermé, la fourchette des bilans de
peuplements tempérés. Un hêtre de trois mètres demande désormais une quinzaine
de grammes par an, pas deux cents. Sa satisfaction en azote est passée de
**0,39 à 0,86**, et le facteur maître a changé de nature : c'est maintenant
l'EAU qui prend la main, sept semaines de végétation sur dix.

**Ce qu'on a écarté en chemin**, parce qu'un diagnostic sans réfutation n'en est
pas un :

- **`GROWING_WEEKS`** (26) était soupçonné d'avoir été mal recalé après le
  passage à la phénologie. Mesure : le hêtre cumule **24,1** semaines-équivalentes
  de végétation par an sur cette station, le pin 32,6. L'écart au diviseur coûte
  7 %, pas 60 %. Hors de cause.
- **Lumière, pH, phosphore, potassium** : facteurs moyens à 1,00 sur la station
  confort. Ils ne bridaient rien.
- **L'eau**, en revanche, est bien limitante, mais en second : 0,83 en moyenne
  pour le hêtre. Elle est devenue le facteur maître une fois l'azote corrigé, et
  c'est elle qui explique le retard qui subsiste (voir plus bas).

**La deuxième cause : la courbe n'avait pas la bonne forme.** La croissance
s'écrivait `pousse × (1 − h/hmax)`. C'est la forme différentielle de
Chapman-Richards `H = A·(1 − e^(−kt))^c` avec **c = 1** — la seule valeur de la
famille qui ne soit pas sigmoïde : la pousse annuelle y est maximale à la
germination et ne fait que décroître. Aucune essence ne pousse comme ça. Un
hêtre fait quinze centimètres par an sous son couvert d'origine, accélère vers
vingt ans, et ne culmine qu'entre dix et vingt mètres.

`FORME_CROISSANCE` vaut maintenant **1,5**, ce qui déplace le maximum de pousse
à 19 % de la hauteur adulte. La valeur n'est pas inventée : **Bouchon & Trencia
(1990)**, « Sylviculture et production du Chêne », *Rev. For. Fr.* XLII-2,
publient pour le chêne sessile des `c` de **1,14 à 2,07** selon la classe de
fertilité ; **Patrício et al.** (iForest, châtaignier en futaie) un exposant de
**1,62**. Une normalisation garde à `pousseMaxMAn` son sens — « la pousse
annuelle maximale » — quel que soit l'exposant.

**Avant / après**, hauteur moyenne de douze sujets plantés au large sur le limon
riche, moyennée sur trois graines (la variabilité individuelle est de ±20 % :
un individu, une graine, ne prouvent rien) :

| Essence | 10 ans | 20 ans | 40 ans | Table à 40 ans |
|---|---|---|---|---|
| Hêtre | 2,1 → **2,6** | 3,0 → **5,3** | 4,8 → **10,6** | 16,0 |
| Pin sylvestre | 3,1 → **3,9** | 4,3 → **8,2** | 6,1 → **15,0** | 15,5 |
| Bouleau | 4,2 → **6,2** | 7,1 → **11,9** | 9,8 → **17,8** | 14,8 |
| Aulne | 5,0 → **5,0** | 8,9 → **10,1** | 14,5 → **17,2** | 18,0 |
| Frêne | 2,4 → **3,8** | 3,4 → **8,0** | 5,4 → **14,6** | 16,5 |
| Charme | 2,3 → **3,1** | 3,3 → **6,3** | 5,2 → **11,6** | pas de table |
| Chêne pubescent | 2,1 → **2,7** | 3,0 → **5,3** | 4,4 → **9,5** | pas de table |

*L'aulne bouge peu, et c'est cohérent : il FIXE son azote, donc il était le
seul à ne pas souffrir du besoin surdimensionné. C'est d'ailleurs ce contraste
qui a mis sur la piste — un aulne à 14,5 m à quarante ans quand le hêtre voisin
plafonnait à 4,8 m, sur la même station, ne pouvait pas venir de l'eau ni de la
lumière.*

`hauteurs.test.ts` fige la comparaison, aux deux âges réellement TABULÉS
(20 et 40 ans), avec une tolérance de ±45 % qui y est justifiée : les classes de
fertilité de la table s'étalent déjà de −18 % à +16 % autour de la médiane, nos
stations ne sont calées sur aucune classe, et chaque arbre porte ±20 % de
vigueur propre. La bande certifie « la bonne classe de fertilité, à une classe
près » — elle aurait hurlé sur le hêtre à 0,30 fois la table.

**Ce qui reste faux, et il en reste.**

- ~~**Le hêtre est encore un tiers trop bas**, et c'est l'eau.~~ **Faux, et
  vérifié** : de 750 à 1100 mm de pluie annuelle, le hêtre à quarante ans passe
  de 11,5 à 11,9 m. Quarante centimètres. L'eau ne le bridait pas — son
  `pousseMaxMAn` de 0,45 m/an le bridait, et la hauteur suit ce plafond presque
  linéairement (0,45 → 11,5 m ; 0,60 → 15,0 ; 0,75 → 18,0). Ce paramètre n'était
  d'ailleurs sourcé nulle part : **l'atlas de référence ne contient aucune
  donnée de croissance**, seulement des traits écologiques. Les vitesses ont été
  inventées pendant le développement.
- ~~**Le bouleau dépasse la meilleure classe publiée**, et il devance l'aulne à
  tort.~~ **Écarté après vérification de la source.** La seule table de bouleau
  du corpus est Braastad 1967, *Produksjonstabeller for bjørk* — **norvégienne**,
  donc boréale. La transposer à un bocage à 11,5 °C de moyenne serait une erreur
  de catégorie, et en tirer un rang contre un aulne calé sur une table allemande
  (Mitscherlich 1945) en serait une seconde : on comparerait deux climats, pas
  deux essences. Le bouleau reste donc à 0,9 m/an — une estimation, mais une
  estimation honnête, et il est sorti du tableau de calage. Ce n'est pas une
  décision de confort : ralentir le bouleau sur cette autorité-là cassait cinq
  conclusions écologiques du dépôt sans qu'aucune preuve ne l'exige. *(À
  confirmer : il manque une table française ou allemande de bouleau.)*
**Un calage n'est pas une validation, et le dire change la façon de tester.**
Le moteur n'a pas de notion d'indice de fertilité : caler une essence sur une
classe de table oblige donc à décréter qu'une station la représente — ici, le
limon riche VAUT la classe médiane. Une fois ce choix fait, un essai qui
compare à la table les espèces qu'on vient d'y caler ne prouve plus rien. D'où
le partage : **un seul paramètre par espèce ajusté, sur un seul âge (quarante
ans), et le second âge (vingt ans) laissé de côté**. Les hauteurs à vingt ans
ne sont donc pas un ajustement mais une prédiction de la forme de la courbe —
et elles tombent entre −13 % et +10 % des tables. C'est ce chiffre-là qui dit
quelque chose du moteur. Les trois essences non recalées (pin, aulne, frêne)
restent, elles, une validation à part entière aux deux âges.

### L'exposant de forme se déduit de la longévité

Les tables de production distinguent trois profils de croissance en hauteur —
démarrage rapide et plateau précoce (aulne, bouleau, merisier), démarrage lent
et croissance longue (hêtre, chênes, sapin), intermédiaire (frêne, pin,
douglas) — qu'un exposant unique ne savait pas rendre.

Plutôt qu'un exposant par fiche, qui serait un réglage libre de plus, on le
**déduit de la longévité**, déjà dans l'atlas. Et la correspondance n'est pas
une commodité : les trois profils des tables sont exactement les trois classes
de longévité. Un arbre qui vit un siècle ne peut pas se permettre d'attendre
pour occuper l'espace ; un chêne de quatre siècles le peut, et c'est la même
stratégie qui fait son bois dense et son ombre profonde. La courbe de
croissance et la durée de vie sont deux faces du même arbitrage.

**Ce que ça corrige** : le hêtre passe de +6 % à **+1 %** de la table à vingt
ans — et cette hauteur-là est tenue à l'écart du calage, donc c'est une
prédiction qui s'améliore, pas un ajustement.

**Ce que ça ne corrige pas, et je l'ai vérifié plutôt que supposé** : l'aulne
reste 13 % sous la table à vingt ans alors qu'il y est à quarante. En le
forçant au profil le plus front-chargé possible (exposant 1,05), il DESCEND à
10,2 m au lieu de 10,9. Son retard de jeunesse vient donc de son plafond de
pousse, qui n'est calé sur aucune table — comme vingt autres de l'atlas.

**Et ça a réveillé un défaut du feu, qui n'est PAS corrigé.** En changeant la
vitesse de l'ajonc, un essai de conservation du carbone s'est mis à ne plus
trouver d'incendie du tout : un ajonc plus vif referme le couvert plus tôt,
l'herbe ne s'installe plus, et c'est elle qui portait le feu sur les 88 % de
cellules sans houppier. En creusant, deux vrais défauts :

1. **La charge des houppiers s'ADDITIONNE à chaque recouvrement**, sans
   plafond. Un peuplement fermé finit par porter plusieurs fois la charge d'une
   lande, uniquement parce que ses couronnes se chevauchent.
2. **L'ombre amortit AUSSI la charge des houppiers**, ce qui rend le modèle
   circulaire : plus un peuplement porte de combustible, moins il peut brûler.
   Un fourré d'ajoncs finit par ne plus s'enflammer, le contraire de ce qu'on
   observe dans les landes.

Ensemble, les deux donnent une conclusion inversée : **le moteur fait porter à
une hêtraie fermée quatre fois plus de feu qu'à une lande d'ajoncs** (3,34
contre 0,83, à couvert égal). Les deux corrections ont été écrites, puis
RETIRÉES : elles changent l'échelle de la charge, sur laquelle la propagation
est calibrée, et un incendie d'essai a cessé de consumer quoi que ce soit. Le
feu mérite sa propre passe plutôt qu'un raccourci en fin de chantier — et le
défaut est consigné dans `feu.test.ts` sous la forme d'un essai qui énonce ce
qui devrait être vrai et **échoue exprès**, pour qu'on ne l'oublie pas.

- **L'exposant de forme est global.** Les tables distinguent trois profils —
  démarrage rapide et plateau précoce (aulne, bouleau, merisier, robinier),
  démarrage lent et croissance longue (hêtre, chênes, sapin), intermédiaire
  (frêne, pin, douglas) — qu'un paramètre unique ne sait pas rendre. C'est
  pourquoi l'aulne reste un peu lent en jeunesse et le bouleau un peu vif.
### Le frein d'azote : une rampe là où il fallait une saturation

C'était le dernier défaut physique connu et non traité, et il était double.

**L'échelle.** Le frein s'écrivait `min(1, stock / 3 g/m²)` : au-delà de 30 kg
N/ha, plus de bridage. Or un sol forestier ne porte jamais 30 kg N/ha de
minéral en même temps — le nôtre plafonne à 1,9 g/m² sur le limon riche et 0,5
sur la lande. **Le frein était donc actif en permanence, partout, sur toutes les
stations** : jamais une racine ne prélevait librement.

**La forme.** Un prélèvement racinaire sature, il ne monte pas linéairement
jusqu'à un couperet. Et la mesure de terrain dit mieux : dans neuf forêts
tempérées suivies sur une saison (Nadelhoffer et al., *Plant and Soil*), le
nitrate est prélevé à un rythme RÉGULIER alors que les stocks d'ammonium et la
minéralisation nette fluctuent fortement d'un mois sur l'autre. L'arbre vit du
FLUX qu'il intercepte ; le stock debout est petit parce que le prélèvement est
rapide. Brider le prélèvement à proportion du stock inverse la causalité.

Michaelis-Menten, donc, avec une demi-saturation à 0,5 g/m² — 5 kg N/ha, le bas
de la gamme observée. **Le changement a été soumis à une réfutation avant d'être
retenu** : les trois essences dont la vitesse n'est PAS calée sur les tables
(pin, aulne, frêne) auraient dû se mettre à les dépasser si le frein compensait
autre chose. Elles restent à +6 %, +1 % et +2 % à quarante ans. Le hêtre, seul
calé, voit son plafond redérivé de 0,65 à 0,57 — et sa hauteur à vingt ans,
tenue à l'écart du calage, s'AMÉLIORE au passage (8,2 m contre 8,5, pour 7,7
dans la table).

Le contraste entre stations, lui, tient : le frein vaut 0,76 sur limon riche
contre 0,51 sur limon pauvre, et un hêtre de trente ans y fait 12,3 m contre
8,0. L'azote n'est pas devenu décoratif.

**Cinq conclusions du dépôt ont changé, et une seule est une mauvaise
nouvelle.**

1. *La fertilisation par l'aulne est RETARDÉE, pas morte.* À seize ans — huit
   ans après la coupe — épandre vaut 0,99 fois vendre. Ce n'est pas une panne,
   c'est la **faim d'azote** du broyat : le bois raméal a un C/N élevé, les
   décomposeurs puisent d'abord l'azote du sol pour bâtir leur biomasse. À
   trente-cinq ans le gain est de **+9 %**, régulier sur quatre parties. Les
   mesures précédentes (+5 %, puis +2 %) lisaient le mécanisme pendant son
   creux. C'est la meilleure surprise de ce chantier.
2. *Le pin sylvestre perd un tiers de ses tiges sur la lande sèche, de SOIF.*
   Plus vigoureux, il transpire plus, et le sable ne suit pas. Une mortalité
   d'un tiers en trente ans sur une lande n'a rien d'anormal ; c'est le test
   qui exigeait zéro mort.
3. *L'effet nurse s'inverse une seconde fois.* Abrité à trois mètres bat
   maintenant collé à la nurse, même pour un sciaphile : quand l'azote cesse de
   décider de tout, la concurrence pour l'eau reprend la main. C'est
   l'optimum de distance de la littérature sur les plantes nurses. Ce qui
   survit aux trois versions du test : abrité à bonne distance bat toujours
   découvert.
4. *Le noisetier non protégé sort de la dent un peu plus tôt* — 1,59 m à douze
   ans pour une dent à 1,50.
5. *Le prélèvement de potasse monte à 70 kg/ha/an* sur limon riche. C'est le
   haut de ce qu'on lit en forêt tempérée feuillue, et **c'est le seul chiffre
   qui me gêne**. *(À confirmer : je n'ai pas trouvé de prélèvement annuel en
   potassium directement citable pour une hêtraie — les sources donnent le
   retour par litière, qui n'en est qu'une part.)*

- **Le vrai réglage du frein d'extraction est ailleurs.**
  `AVAILABILITY_SATURATION_G_M2` = 3 g/m², soit 30 kg N/ha, est le stock
  au-dessus duquel une racine prélève sans entrave. Un sol forestier n'en tient
  jamais autant : le nôtre plafonne à 1,9 g/m² sur le limon riche et 0,5 sur le
  limon pauvre. Ce seuil est donc trop haut, et il vit dans `nitrogen.ts` — hors
  du périmètre de ce chantier. On ne l'a pas touché.
- **Le lessivage reste énorme** — 55 à 75 kg N/ha/an — mais c'est un artefact du
  protocole d'essai : douze arbres sur un hectare ne couvrent que 2 % du sol de
  leurs racines, et tout le reste draine. Un peuplement fermé n'a pas ce
  comportement.
- **Deux essences sans référence** : le châtaignier meurt sur le limon riche
  (pH 7, il est acidiphile) et n'a de toute façon aucune table de futaie en
  France ; le chêne pubescent n'a **qu'une seule** table au monde (Giurgiu &
  Draghici 2004, Roumanie), et le CNPF écarte explicitement l'équivalence avec
  le chêne sessile, qui surestime.

**Ce que la correction a coûté**, c'est-à-dire les conclusions qu'elle a
changées :

- **L'effet nurse a changé de verdict.** On lisait « collé à la nurse, l'abri et
  l'ombre s'annulent » — 0,38 m collé contre 0,39 m à découvert. C'était
  l'égalité de deux zéros : l'azote bridait tout le monde à 0,4 et rien ne
  poussait, ni à l'abri ni au soleil. L'essai mesure maintenant ce qu'il
  prétendait mesurer, et il retrouve ce que son propre en-tête annonçait : le
  chêne-liège tolère l'ombre en jeunesse, donc **plus il est près de la nurse,
  mieux il pousse** (0,53 m collé, 0,44 m à trois mètres, 0,37 m à découvert).
  L'héliophile, lui, paie toujours l'ombre.
- **La fertilisation par l'aulne rapporte moins.** Le gain du hêtre voisin
  quand on épand les aulnes coupés au lieu de les vendre est passé de +5 % à
  +2 %. Le mécanisme tient ; c'est son ampleur qui était gonflée par un hêtre
  affamé en permanence.
- **Le creux mycorhizien de la première décennie a disparu.** Les bouleaux
  couvrent le sol en dix ans au lieu de vingt, et le réseau se tisse plus vite
  qu'il ne reflue. Ce n'était pas un fait de terrain, c'était la signature
  d'arbres trois fois trop lents.

## Les chandelles : un arbre mort ne disparaît pas

Un arbre tué par la sécheresse quittait la parcelle le tick même. Un tronc mort
sèche pourtant sur pied et tient des années, il occupe la place, et c'est le
bois mort **debout** qui compte pour la faune : les pics l'attaquent en premier,
et le trou qu'ils abandonnent sert ensuite à des dizaines d'espèces qui ne
savent pas creuser.

Une chandelle tient d'autant plus longtemps que son bois est dense — une
décennie pour un chêne, trois ans pour un sureau. Elle ne fait plus d'ombre,
compte comme arbre-habitat au-dessus de huit mètres, et charge le feu **×1,4**
par rapport au même arbre vivant : c'est du bois sec, et c'est pourquoi une
parcelle déjà passée au feu rebrûle mieux que celle d'à côté.

Le transfert de carbone a lieu à la MORT et une seule fois : la chandelle n'est
ensuite qu'un objet de jeu et d'habitat. C'est ce qui a permis d'ajouter le
mécanisme sans toucher aux bilans.

### Et quand elle tombe : le bois couché

La chandelle finissait par quitter la parcelle sans rien laisser, son bois
dissous dans un pool global indifférent à l'endroit où l'arbre avait vécu.
C'est deux fois faux. Un tronc s'abat **quelque part**, dans une direction ; et
ce qu'il devient — humus, abri, obstacle à l'eau, écrasement de ce qui poussait
dessous — se joue sur les quelques mètres carrés qu'il recouvre, pas sur la
parcelle entière.

Le bois mort **au sol** est désormais un stock par cellule, distinct du bois
debout, parce que ce sont deux objets différents :

| | debout | couché |
|---|---|---|
| décomposition | 5 %/an | **9 %/an** — il touche la terre et reste humide |
| humus | dilué sur la parcelle | **sur place**, sous le tronc |
| faune | pics, puis tout ce qui occupe leurs loges | carabes, salamandres, saproxyliques du sol |
| sol | rien | protège la terre sous lui comme un paillage — et **barre l'eau** s'il est en travers (voir plus bas) |

La direction de chute suit l'aval, d'autant plus franchement que la pente est
raide : au-delà de 30 %, la gravité tranche ; à plat, l'arbre tombe où son
défaut le porte. Une seule formule, resserrée par la pente, plutôt qu'un cas
« pente » et un cas « plat » — et le test compare deux nuages de deux cents
tirages, parce qu'une chute unique ne prouverait rien.

Ce qui poussait dessous casse selon une règle de masse : **ce qui reçoit plus
lourd que soi casse**. Un semis disparaît sous n'importe quel tronc, un arbre
fait encaisse, et aucun seuil par espèce n'est écrit nulle part — la masse des
deux protagonistes se lit déjà dans leur carbone.

*Approximation assumée* : le pool des morts debout ne sait pas quel bois
appartient à quel arbre. Ce qu'une chandelle dépose en tombant est donc
**estimé** par sa décroissance depuis sa mort, borné au pool restant. La borne
garantit qu'aucun carbone n'est créé ; en revanche, si le pool a été entamé
ailleurs, la chute dépose moins qu'elle ne le devrait. Le test de conservation
compte maintenant le bois couché parmi les stocks, sans quoi une chute aurait
fait apparaître du carbone venu de nulle part.

Le bois couché est enfin du **combustible**, et pas le même que l'herbe : le
gros bois s'allume mal et porte mal le front, il fait durer et chauffer plutôt
que courir. Il pèse donc moins par unité de masse et sature bien plus haut —
un tronc dépose des kilos de carbone sur son mètre carré là où la litière s'y
compte en centaines de grammes.

D'où une décision, plutôt qu'un réglage : **ramasser le bois mort**. Le joueur
y gagne du chauffage — décoté de moitié, un tronc piqué ne vaut pas une bille
fraîche — et un peu moins de gros combustible. Il y perd de l'humus en devenir,
un abri pour la faune du sol, et la protection que le tronc offrait à la terre
sous lui. Le moteur ne tranche pas à sa place ; il fait seulement que les deux
plateaux existent.

**Le flux aléatoire de la chute est séparé du flux principal**, et c'est une
leçon plus large que le bois mort. Le hasard du moteur est une suite unique et
séquentielle : un mécanisme qui y ajoute un seul tirage décale tous les
suivants. Le jour où les chandelles ont commencé à tirer un angle, trois
conclusions écologiques du dépôt ont basculé — l'aulnaie décimée par les
ravageurs, le hêtre qui meurt de soif, les feuillus qui brûlent moins. Aucune
n'avait changé de nature : elles lisaient un jet de dés particulier. La chute
tire donc désormais sur une graine dérivée de l'arbre et de la semaine, ce qui
la garde rejouable sans rebattre les cartes des autres. Et le test des
ravageurs, lui, moyenne sur trois graines au lieu d'en croire une.

### Le tronc en travers : il barre, ou il fait gouttière

Le tronc couché protégeait la terre **sous lui**, comme un paillage, et rien
de plus. Il manquait le mécanisme qui compte pour un versant : un tronc posé
en travers d'un thalweg **barre**. L'eau s'y met en flaque et a le temps de
rentrer dans la terre ; le sédiment se dépose derrière lui. C'est le principe
des *log erosion barriers* de la restauration après incendie, et c'est un des
rares leviers réels dont dispose un propriétaire contre le ruissellement de sa
parcelle.

Tout tient à l'**orientation**, et c'est pour ça qu'il a fallu ajouter un champ
plutôt qu'un coefficient : une masse de bois par cellule ne dit pas si le tronc
barre ou s'il fait gouttière.

**La grandeur retenue n'est pas de nous.** Adams, Dixon, Wilcox & McWethy
(2023, *Earth Surface Processes and Landforms* 48 : 1665-1678), reprenant
Myronidis et al. (2010), définissent la **longueur efficace** d'un tronc
Lₑ = sin φ × L, où φ est l'angle entre son axe et la direction de l'écoulement.
C'est exactement la projection du tronc sur la courbe de niveau. Et leurs
essais sur table basculante — dix-huit passages, six orientations, trois
inclinaisons — donnent le **seuil** : *aucune* accumulation derrière un tronc
orienté à moins de 30° du courant, rien du tout sous 15° de la ligne de plus
grande pente. Smith & Swanson (1987) disent la même chose sur le terrain, au
mont Saint Helens : plus de 90 % des troncs qui stockent quelque chose font au
moins 45° avec l'écoulement. Le sol retient donc, par cellule, la moyenne
pondérée par les masses de cette efficacité barrante — pas un simple sinus, un
sinus **seuillé tronc par tronc**, parce que deux troncs à 25° ne barrent rien
alors que leur moyenne, elle, ne serait pas nulle.

**Deux effets distincts, et il ne faut pas les confondre.**

| | ce qui se passe | où c'est branché |
|---|---|---|
| l'eau | une part du ruissellement qui traverse la cellule est mise en flaque, puis **offerte au sol** ; ce que le sol ne prend pas percole vers la **nappe** | avant le calcul d'érosion, donc moins de lame ⇒ moins d'arrachement |
| la terre | une part du sédiment en transit se **dépose derrière le tronc**, sur sa propre cellule, avec toute sa charge (humus, litière, N, P, K) | après l'arrachement, avant le passage à l'aval |

Le passage à la nappe n'est pas un artifice comptable, c'est le mécanisme même :
un tronc ne **supprime** pas l'eau, il la **retarde**. Ce qui courait en surface
et traversait la parcelle dans la semaine devient de l'eau de nappe, qui met des
mois à rejoindre l'aval. C'est cela, hydrauliquement, « lutter contre une
inondation ». À un pas de temps hebdomadaire on ne sait pas représenter le
décalage du pic lui-même — seulement le volume qui change de chemin.

**La capacité, et c'est elle qui empêche le mécanisme d'être une baguette
magique.** Le coin amont d'un tronc contient un volume fini, donné par
l'équation (3) d'Adams et al. :

    S = (d·Lₑ/2) · (d/tanθ − πd/4)

un coin triangulaire de hauteur *d* (le diamètre du tronc) qui remonte d/tanθ
vers l'amont, moins le demi-cylindre qu'occupe le tronc. On n'a rien choisi là
non plus, et deux conséquences en sortent seules : **plus la pente est raide,
moins le tronc retient**, et au-delà de 127 % de pente il ne retient plus rien
— le tronc surplombe son propre tas. Le volume obtenu, 0,065 m³ par mètre
efficace à 40 % de pente, est du bon ordre : Wagenbrenner, MacDonald & Rough
(2006) mesurent 0,049 m³ par mètre efficace sur 210 troncs du Colorado ;
Robichaud, Pierson, Brown & Wagenbrenner (2008) 0,020 m³ par mètre posé.

Ce coin géométrique est ensuite **ramené à 30 %**, parce que le terrain dit
qu'il ne sert jamais en entier. Robichaud et al. (2008) sont formels : « runoff
and sediment were observed going over the top and around the ends of the
barriers **even when the barriers were less than half filled** » — sur
vingt-neuf franchissements observés, trois seulement portaient sur un barrage
plein. Leur pluie simulée n'a mobilisé que 7 % de la capacité des troncs.
Enfin, le coin **s'ensevelit** : le colluvium accumulé sur la cellule se lit
déjà dans l'état (`epaisseurPerdueCm` négative), et quand il atteint le haut du
tronc, le tronc ne sert plus. Aucun champ nouveau pour cela.

**Ce que ça donne, mesuré.** Versant nu à 25 %, vallon, 0,5 ha d'amont, une
ligne continue de billes en bas de pente, cinq ans, moyenne de cinq graines :

| | eau de surface sortie | terre exportée |
|---|---|---|
| pas de bois | 1133 mm | 1,96 kg/m² |
| bois **dans le sens de la pente** | 1133 mm | 1,92 kg/m² |
| bois **en travers** | 1095 mm (**−3,4 %**) | 1,75 kg/m² (**−11 %**) |

La ligne du milieu est le résultat qui compte : à masse égale, à paillage égal,
le bois couché dans le sens de la pente ne détourne **pas une goutte** et ne
retient **pas un gramme**. Les 2 % qu'il gagne quand même sur la terre sont
l'ancien effet de paillage, qui lui se moque de l'orientation.

**Et le plafond fonctionne.** Sur la même parcelle, en faisant grossir le
bassin d'amont — donc la crue :

| bassin amont | terre exportée en moins |
|---|---|
| 0,5 ha | −11 % |
| 12 ha | −4 % |

C'est exactement ce que trouvent Robichaud et al. (2008, *International Journal
of Wildland Fire* 17 : 255-273) sur six paires de bassins suivis quatre à six
ans : un effet sur les petites pluies, **aucun effet au-delà du temps de retour
deux ans**. Trois troncs n'arrêtent pas une inondation, et le moteur le dit
maintenant tout seul.

**La conséquence gênante, et elle tient — moins fort qu'annoncé.** La chute
suit l'aval d'autant plus franchement que la pente est raide, donc **là où
l'érosion fait le plus de dégâts, le chablis naturel sert le moins**. Mais
l'ampleur a été corrigée à la baisse le jour même : le modèle affichait une
transversalité **nulle** au-delà de 30 % de pente, et ce zéro était un artefact
de forme — la contrainte de pente atteignait exactement 1 et alignait tous les
arbres au cordeau. Aucune forêt ne fait ça. Rentch et al. (*J. Torrey Bot.
Soc.* 137, huit peuplements de chênes anciens) concluent que « la forte
variation des directions de chute » empêche d'établir une relation constante
avec la pente ou le vent, l'asymétrie du houppier s'en mêlant ; côté ripisylve,
la tendance vers l'aval ne devient nettement plus marquée qu'**au-dessus de
40 %** de pente — d'où ce seuil, qui valait 30 sans source.

Avec une dispersion résiduelle de ±63°, la transversalité passe de 0,37 à plat
à 0,27 sur un versant à 60 % : **un quart de barrage en moins, pas la
disparition du barrage**. Le conseil de gestion ne change pas — abattre sur
courbe de niveau reste le geste qui arme un versant, et c'est celui de la
restauration post-incendie — mais un versant raide n'est plus décrit comme nu.
Sur un versant doux à 15 %, le bois mort d'un peuplement laissé à lui-même est
barrant à 37 % en moyenne et détourne 3,9 % de l'eau de surface.

Le TONNAGE piégé, lui, dépend d'abord de ce que le versant a à donner :
1,6 kg/m² sur soixante ans avant que les vitesses de croissance ne soient
calées sur les tables de production, 0,8 après. Ce n'est pas le mécanisme qui a
faibli, c'est la forêt qui, poussant à son rythme réel, couvre plus vite et
laisse moins partir. **Un piège ne retient que ce qui passe.**

**Un tronc qui ne touche pas le sol ne barre rien**, et c'est ce qui sépare
l'accident du geste. Un chablis tombe avec son houppier et repose dessus :
l'eau passe dessous. Un suivi boréal sur cinq saisons de végétation (Šamonil et
al., *PLoS ONE*, « Surface covering of downed logs ») mesure le contact
longitudinal à **4,4 points sur 7 pour un tronc sans branches contre 1,6 pour
un tronc qui en a gardé** — « structural support delays settling ». Presque
trois fois moins, et Adams et al. donnent d'ailleurs une capacité de stockage
NULLE en classe de décomposition I : le bois frais ne barre pas.

Le champ d'orientation compte donc maintenant deux choses et non une : la
direction du tronc ET son contact au sol. Conséquence, et elle change le sens
du mécanisme : **une forêt livrée à elle-même arme mal son versant**. Le bois
mort naturel d'un peuplement de soixante ans est barrant à 0,13 au lieu de 0,37,
et piège quatre fois moins de terre. Ce n'est pas une mauvaise nouvelle pour le
jeu, au contraire : c'est ce qui donne son sens au geste ci-dessous.

*(Simplification assumée : le contact est figé au dépôt alors qu'il croît avec
les années — le tronc s'enfonce, la mousse le recouvre. Les toutes premières
années d'un chablis sont donc surestimées, ce qui joue sur cinq ans dans une
partie qui en dure deux cents.)*

**Et le joueur peut enfin armer son versant.** Le mécanisme existait sans
qu'aucune action ne permette de s'en servir : couper un arbre, c'était le
vendre, le broyer ou l'épandre — dans les trois cas le fût quittait le sol. Or
la restauration post-incendie ne fait pas autre chose qu'abattre et **coucher
en travers**. D'où un quatrième devenir, `laisser` : le fût reste sur place,
posé perpendiculairement à la plus grande pente. Ça ne rapporte rien, ça coûte
un quart de travail en moins que d'aller chercher le bois (on abat, on ébranche
pour que le tronc porte au sol — sans ce contact il ne barre rien — et on
s'arrête là), et c'est le seul geste qui arme un versant. Le moteur suppose que
celui qui choisit de laisser le bois le pose correctement : on ne simule pas la
maladresse *(hypothèse assumée)*.

**Un bug attrapé au passage, et il valait le voyage.** `versLAval` indexait le
champ d'altitudes avec les coordonnées **flottantes** de l'arbre. L'index
tombait entre deux cases, le tableau rendait `undefined` pour les quatre
voisines, la pente sortait nulle — et la chute était donc **tirée au hasard sur
un versant à 60 % comme à plat**. Le mécanisme d'orientation existait sur le
papier et ne s'était jamais déclenché en partie. Le test unitaire ne pouvait
pas le voir : il appelait la fonction avec des entiers.

*Ce qui reste faux* :

- **Le contact au sol n'est pas modélisé.** Un chablis frais repose sur ses
  branches et surplombe la terre : Adams et al. décrivent une capacité de
  stockage nulle en classe de décomposition I, maximale en classe III quand le
  tronc s'est affaissé au ras du sol. Le moteur suppose le contact acquis dès
  la chute, donc il est **trop généreux les premières années**.
- **Le pic de crue n'est pas décalé, seulement réduit en volume.** C'est
  pourtant l'effet principal d'un obstacle sur une inondation. Un pas de temps
  hebdomadaire ne sait pas le porter.
- **Au-delà de 30 % de pente, la transversalité tombe à zéro exactement**,
  parce que `directionDeChute` aligne alors la chute sur l'aval sans dispersion
  résiduelle. La vraie forêt garde de la dispersion, et donc quelques troncs
  utiles même sur un versant raide *(à confirmer)*.
- **La part utile du coin (30 %) est la constante la plus fragile du lot** :
  elle décide à elle seule de la force du mécanisme, et elle est calée sur une
  seule campagne de mesure.
- **Aucune littérature ne donne de rugosité de Manning mesurée pour un tronc
  couché sur un versant.** C'est pourquoi le tronc est traité ici comme un
  réservoir fini à seuil de débordement, et non comme une rugosité — ce que
  fait aussi WEPP, qui note explicitement qu'il ne modélise pas la formation
  des barrages de débris.

## La variabilité individuelle : la fin des clones

Deux arbres de même essence étaient des clones parfaits : à conditions égales
ils poussaient exactement pareil. Ce n'est pas cosmétique — c'est cette
dispersion qui crée les dominants et les dominés, donc l'auto-éclaircie, donc
le sens même d'une éclaircie par le haut ou par le bas.

Chaque arbre porte sa **vigueur individuelle** (±20 %, tirée dans le générateur
de la partie, donc reproductible). Elle module uniquement ce que l'arbre TIRE de
conditions données : deux voisins ont la même eau et la même lumière, l'un en
fait plus que l'autre.

**Ce que ça a coûté en tests, et c'est la partie instructive.** Quatre essais ont
cassé, tous du même genre : ils comparaient un individu à un individu. Avec
±20 % de dispersion, c'est le tirage qui décide et non le mécanisme — le travers
des incendies, à l'échelle de l'arbre. L'effet nurse neutralise donc la vigueur
et moyenne sur trois graines ; et l'un de ses résultats s'est nuancé au passage :
collé à la nurse, le chêne-liège ne gagne plus rien (0,38 m contre 0,39 m à
découvert). Ce qu'on gagne sur le vent, on le perd sur la lumière — c'est
l'ombre portée qui fixe la bonne distance.

## Générateur de stations : ce qu'il reste à faire

La dérivation (A9) est en place : une station se décrit par un profil
d'horizons, tout le reste est calculé. Pour générer des stations quelconques,
il manque seulement le tirage cohérent des profils (une texture, une
profondeur et une MO plausibles ensemble, et cohérentes avec le climat et la
position topographique) — pas de nouveau mécanisme moteur.

## Le houppier doré produit encore

Ce chantier était intitulé « la saison de végétation est encore thermique ». Il
a été fait entre-temps, et cette entrée enregistre ce qui reste.

**Ce qui est fait.** La croissance et la transpiration ne passent plus par le
seul thermomètre : elles sont commandées par `partFoliaireActive` — le feuillage
vivant déployé, espèce par espèce — en produit avec un facteur thermique qui ne
porte plus que la vitesse du métabolisme. Et `GROWING_WEEKS` est passé de trente
à vingt-six, ce qui est la contrepartie indispensable : la constante veut dire
« sur combien de semaines la pousse annuelle se répartit », et c'est la
phénologie qui en donne le compte. Un caduc nu de janvier ne transpire donc plus
dans les Landes, et l'ordre de débourrement compte enfin dans le bilan annuel.

**Ce qui reste, et c'est un cran plus fin.** L'automne se joue en deux temps : la
feuille jaunit d'abord, elle tombe deux à trois semaines plus tard. Entre les
deux, elle est accrochée, vivante, et ne produit plus rien —
`partFoliaireAssimilante` mesure exactement cet écart. Elle n'est **pas** branchée
sur la croissance, donc un houppier entièrement doré d'octobre produit encore
pendant deux semaines par an.

**Pourquoi elle ne l'est pas.** Le premier essai, fait *avant* le recalibrage
ci-dessus, coûtait deux seuils écologiques calibrés :

| | avant | avec la sénescence |
|---|---|---|
| bouleau à 10 ans, limon riche (`lumiere.test.ts`) | 4,0 m | **3,8 m** |
| morts par ravageurs, climat figé vs SSP5-8.5 (`climat.test.ts`) | 2 → 4 | 3 → 5 |

Cette mesure ne vaut plus telle quelle : elle a été prise sur `GROWING_WEEKS =
30` et sur une croissance encore thermique. **À remesurer sur la calibration
actuelle**, et l'enjeu est petit — deux semaines par an sur une saison de
vingt-six, soit de l'ordre de 8 % de la production d'automne, pas de l'année.
C'est le genre de raffinement qu'on branche quand on recalibre pour une autre
raison, pas pour lui seul.

*Cette entrée fermait sur une limite* — les hauteurs absolues trop faibles, un
hêtre de plaine à quatre mètres à quarante ans — en disant qu'il faudrait la
reprendre sur des tables de production. C'est fait : voir « les hauteurs
absolues : le moteur se cale sur les tables de production » plus haut. Ce qui reste ici,
la sénescence hors de la boucle, est un raffinement à côté.

## Règle de travail

À chaque ajout au moteur, mettre ce document à jour : cocher, recompter, et
vérifier qu'aucun critère n'a été coché par un cas particulier. Le score n'est
pas une note — c'est une carte de ce qui reste à rendre vrai.
