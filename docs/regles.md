# Canopée — Règles du simulateur d'agroforesterie

> Document de game design, v0.1 (2026-08-31). Nom de code « Canopée » (à changer si tu veux).
> Sources principales : `Notes/Agroforesterie - auto cours.md` (ch. 1–8) et `Notes/atlas-especes/` (~70 ligneux, ~100 herbacées, faune). Les valeurs chiffrées données ici sont des ordres de grandeur **à calibrer** ; celles marquées *(à confirmer)* sont des inférences non sourcées.

---

## 0. Vision et principes de conception

1. **Scientifique d'abord** : chaque mécanisme du jeu correspond à un mécanisme réel documenté dans le cours (le doc cite le chapitre). Pas de règle « gamey » sans justification écologique.
2. **Déterministe en v1** : mêmes conditions → même croissance, toujours. La météo est une **série scriptée** rejouée à l'identique (voir §3) — déterministe ne veut pas dire constant : il y a des années sèches, des gels tardifs, mais toujours les mêmes aux mêmes dates. La variabilité inter-individus (v2) viendra s'ajouter par-dessus sans casser ce socle.
3. **Loi du minimum (Liebig)** comme moteur central : la croissance est bridée par la ressource la plus rare (cours ch1-C, atlas : « c'est le facteur le plus défavorable qui décide »).
4. **Le système vit sans le joueur** : si on ne fait rien, la succession écologique se déroule (friche → fruticée → boisement pionnier → forêt, ch1-A). Le joueur infléchit une dynamique, il ne « pose » pas des objets inertes.
5. **Simulation séparée du rendu** : le moteur est une fonction pure `état(t) + actions → état(t+1)`, testable sans navigateur. L'UI n'est qu'une vue.
6. **Pédagogique** : chaque info-bulle peut renvoyer à la notion du cours (réutilisation directe de tes notes et du glossaire).

---

## 1. Temps et espace

### 1.1 Pas de temps
- **Tick de simulation : 1 semaine** (52/an). Justification : assez fin pour la phénologie (gel tardif d'avril sur fleurs de fruitiers, pic de sécheresse d'août), assez gros pour simuler des décennies sans exploser les calculs.
- **Horizon de jeu : 30–60 ans** minimum. Un chêne ne se joue pas en 5 ans ; c'est un choix fort de gameplay (vitesse ×1 → ×512, pause).
- Chaque tick : météo → bilan hydrique → cycle N → lumière → croissance/phénologie de chaque individu → interactions biotiques → économie.

### 1.2 Espace
- **Parcelle = grille de cellules de 1 m²**, taille par défaut **1 ha** (100×100). Assez pour un vrai design (lignes agroforestières, îlots-guildes, lisières) sans être ingérable.
- Un **ligneux** occupe une cellule (son pied) et projette :
  - une **couronne** (disque de rayon `r_houppier(âge)`) qui intercepte la lumière,
  - une **zone racinaire** (disque de rayon ~1–1,5× la couronne *(à confirmer)*, sur `profondeur_racinaire(âge)`) qui prélève eau et nutriments.
- Les **herbacées** se gèrent par cellule (une culture/couvert par cellule), pas par individu.
- La parcelle a un **contexte hors-carte** non jouable (§8) : occupations voisines sur les 4 bords (forêt, prairie, grande culture, route…).

---

## 2. La station (« biome ») — paramètres fixes au démarrage

C'est le concept central du cours (ch3-C : « le tempérament est en toi, la station est le lieu »). Une station = un jeu de paramètres **immuables** + un état initial du sol + une série météo + un contexte paysager. Chaque station correspond à un terrain réel de France.

### 2.1 Paramètres statiques
| Paramètre | Rôle dans le moteur |
|---|---|
| Latitude | durée du jour par semaine (photopériode → photosynthèse, phénologie) |
| Altitude | correction de température (−0,6 °C / 100 m) |
| Pente (°) et exposition (N/S/E/O) | rayonnement reçu (adret/ubac), ruissellement/érosion, drainage |
| Profondeur jusqu'à la roche mère | plafond du volume prospectable par les racines |
| Horizons du sol (2–3 couches) | pour chacun : épaisseur, texture (% sable/limon/argile), pierrosité, pH, % CaCO₃, % MO initiale |
| Profondeur de nappe (si présente) et battement saisonnier | engorgement (aulne/saule OK, hêtre KO), réserve d'eau bonus |
| Occupation initiale | prairie / grande culture / friche / taillis / pinède… → stock initial de C, banque de graines, structure du sol |
| Contexte paysager | ce qui entoure la parcelle (§8) |

De la texture et de la profondeur on **dérive** (pas de saisie redondante) : réserve utile (RU, mm), CEC, sensibilité à la battance, vitesse de drainage. Ordres de grandeur RU : sable ~0,8 mm/cm, limon ~1,8 mm/cm, argile ~1,6 mm/cm de sol *(à calibrer sur références agro)*.

### 2.2 Stations proposées pour la v1 (terrains français réels)
1. **Lande du Sud-Gironde** — reprend l'étude de cas du cours (ch5) : sable podzolique acide (pH ~4,5), nappe hivernale, RU faible, climat océanique aquitain, contexte = pinède de pin maritime en monoculture. Difficulté : pauvreté, feu, acidité.
2. **Plateau limoneux picard** — limon profond (>1,5 m), pH ~7, ancienne grande culture : sol riche mais MO effondrée (~1,5 %), vie du sol à reconstruire, vent, pas de nappe. Le « bon élève » apparent.
3. **Coteau calcaire bourguignon** — rendzine de 30–40 cm sur calcaire, pH 8, pente 15°, exposition sud, sécheresse estivale marquée. Pour les calcicoles thermophiles (chêne pubescent, cormier, amandier…).
4. **Bocage breton** — limon sablo-argileux acide (pH 5,5), climat doux et humide, haies existantes en bordure, engorgement ponctuel. Confort hydrique, mais lumière limitante et pression limaces/campagnols.
5. **Moyenne montagne (Massif central, ~900 m)** — sol sur granite, saison courte, gels tardifs fréquents, forte RU. Pour sorbier, myrtille, mélèze ; les fruitiers exigeants y échouent.
6. **Vallée alluviale ligérienne** — sol profond eutrophe, nappe accessible, risque de crue hivernale scriptée. Peupliers, noyers, frênes ; engorgement à gérer.

Chaque station embarque ses **normales climatiques mensuelles réelles** (Météo-France, à collecter en phase données) et une option **scénario +2 °C** (ch8) qui décale les normales — c'est déjà un mode de jeu.

---

## 3. Climat et météo (déterministe)

- Par station : une **série météo hebdomadaire scriptée sur 60 ans**, construite à partir des normales mensuelles + événements datés (canicule de l'an 12, gel tardif semaine 16 de l'an 4, tempête de l'an 27…). Rejouable à l'identique → même partie, mêmes résultats.
- Variables par semaine : T° moyenne/min/max, précipitations (mm), rayonnement (dérivé latitude + nébulosité), vent (événements).
- **ETP** (évapotranspiration potentielle) calculée par Hargreaves : `ETP = 0,0023 × Ra × (Tmoy + 17,8) × √(Tmax − Tmin)` — simple et suffisant *(à confirmer vs Penman simplifié)*.
- Dérivés phénologiques : **degrés-jours** (base 5 °C ou 10 °C selon espèce), **heures de froid** hivernales (besoin de vernalisation des fruitiers), **dates de gel** (dernier gel de printemps = risque pour fleurs précoces type abricotier — atlas : « gel des fleurs = risque »).
- Le **microclimat** modifie la météo localement (ch4-A) : sous couvert, ETP réduite (−20 à −40 %), extrêmes thermiques amortis (moins de gel au sol), vent cassé par les haies (effet sur ~10× leur hauteur) *(coefficients à calibrer)*.

---

## 4. Le sol — état dynamique

État **par cellule** (mutualisé par zones homogènes pour la perf), sur 2–3 horizons.

### 4.1 Variables d'état
| Variable | Unité | Commentaire |
|---|---|---|
| Eau du sol | mm (par horizon) | entre point de flétrissement et capacité au champ (= RU) |
| N minéral (NH₄⁺ + NO₃⁻) | kg/ha équiv. | le nitrate est lessivable, l'ammonium retenu par le CAH (ch1-C) |
| P et K disponibles | index 0–100 | modèle simplifié : stock lentement renouvelé par altération + MO |
| Bases échangeables / pH | pH | dérive lente : acidification sous résineux/exports, chaulage possible |
| Matière organique / C du sol | t C/ha (par horizon) | LE stock central (carbone §12, fertilité, RU bonus) |
| Litière | t MS/ha, avec son C/N | pool d'attente avant humification/minéralisation |
| Structure / compaction | index 0–1 | dégradée par engins & labour répété, restaurée par racines, vers, MO |
| Activité biologique | index 0–1 | proxy de biomasse microbienne + vers (ch2-B) ; module toutes les vitesses |
| Réseau mycorhizien | ECTO / AM / éricoïde, index 0–1 par type | se construit avec les plantes hôtes présentes (ch2-B) |
| Couverture du sol | % | sol nu = érosion, évaporation, battance (« zéro sol nu », ch7) |

### 4.2 Processus par tick
- **Bilan hydrique en cascade** : pluie → interception par les couronnes (~15–30 % *(à calibrer)*) → infiltration (limitée si battance/compaction → ruissellement, majoré par la pente) → remplissage horizon par horizon → drainage profond (qui **lessive les nitrates**) ; prélèvements = transpiration des plantes (chacune puise dans les horizons qu'atteignent ses racines) + évaporation du sol nu.
- **Minéralisation** de la litière et de la MO : vitesse = f(T°, humidité, activité biologique, **C/N de la litière**) — feuilles d'aulne (C/N ~15) rendent l'azote vite, aiguilles de pin (C/N ~60) lentement et en acidifiant (ch2-B, voies bactérienne vs fongique).
- **Immobilisation** : enfouir un BRF ou une paille à C/N élevé « emprunte » du N minéral pendant sa décomposition (faim d'azote) — vrai piège de gameplay, documenté ch2.
- **Fixation biologique de N** : légumineuses (*Rhizobium*) et actinorhiziennes (*Frankia* : aulne, argousier, chalef — atlas). Flux ∝ biomasse du fixateur, restitué au sol via litière/racines mortes ou **à la coupe si épandu** (ta règle : épandre vs vendre). Ordre de grandeur : aulne 50–100 kg N/ha/an en peuplement dense *(à calibrer)*. La fixation coûte au fixateur (~10 % de croissance en moins vs N abondant, « la légumineuse paie deux fois », ch1-C).
- **Érosion** : t/ha = f(pente, couverture, agrégation) ; emporte MO et argiles → dégâts permanents sur les cellules en pente nues.
- **pH dynamique lent** : litières acidifiantes (résineux, éricacées), exports de bois, pluie ; remontée par chaulage ou litières riches en bases (tilleul, frêne) *(effet litières à confirmer)*.

---

## 5. Lumière et strates

- Modèle par **strates verticales** (les 7 strates de la forêt-jardin, ch6-A : canopée, arbres bas, arbustes, herbacées, couvre-sol, rhizosphère, lianes).
- Chaque semaine, par cellule : rayonnement incident (saison, latitude, pente/exposition) traverse les couronnes de haut en bas ; chaque couronne intercepte selon sa densité de feuillage (LAI espèce, ×0 si caduc en hiver — important : les bulbes de sous-bois type ail des ours font leur saison **avant** le débourrement, ch6).
- **Ombre portée latérale** : au minimum un décalage de l'ombre vers le nord selon la hauteur (soleil au sud en France) — c'est ce qui rend le **design spatial** intéressant (lignes est-ouest vs nord-sud, ch5-B).
- Chaque espèce a une **courbe de réponse à la lumière** dérivée de son tempérament (atlas : ☀ / ◐ / ☾) : les héliophiles plafonnent haut mais s'effondrent à l'ombre ; les sciaphiles ont un **point de compensation** bas (ch3-B) — un semis de hêtre survit à 5 % de lumière, un bouleau non.

---

## 6. La fiche espèce (base de données)

Le contenu vient de l'atlas, complété par la *Flore forestière française* et des bases publiques (à sourcer champ par champ dans le JSON — champ `sources`). ~40 ligneux + ~20 herbacées en v1, extensible.

```jsonc
{
  "id": "alnus_glutinosa",
  "nom": "Aulne glutineux",            // + nom latin, famille, type (arbre/arbuste/liane/…)
  "strate_adulte": 1,                   // 1 canopée … 7 liane
  "temperament": {                      // les 5 axes du cours (ch3-C) + atlas
    "lumiere": "heliophile",            // courbe de réponse
    "eau": [7, 10],                     // gamme tolérée sur gradient xéro(0)→hygro(10), engorgement OK
    "ph": [4.5, 7.5],
    "trophie": "eutrophe",              // besoins N-P-K
    "chaleur": { "rusticite_min": -30, "besoin_degres_jours": 900, "besoin_froid_h": null }
  },
  "croissance": {
    "hauteur_max_m": 25, "longevite_ans": 100,
    "vitesse": "rapide",                // paramètre k d'une courbe de Chapman-Richards
    "houppier_ratio": 0.35,             // rayon houppier / hauteur
    "racines": { "strategie": "tracant", "profondeur_max_m": 1.5 }
  },
  "phenologie": { "debourrement_dj": 150, "floraison": "s8-s12", "fructification": "s36-s40", "caduc": true },
  "ecologie": {
    "mycorhize": "dual",                // ECTO / AM / éricoïde / dual / non
    "fixation_n": "frankia",            // rhizobium / frankia / non
    "allelopathie": null,               // ex. noyer: { "molecule": "juglone", "rayon_x_houppier": 1.5, "sensibles": ["rosacees", …] }
    "succession": "pionniere",          // pionnière / intermédiaire / climacique (ch1-A)
    "rejette_de_souche": true, "drageonne": false, "bouture": true,
    "dissemination": "vent",            // vent / oiseaux / mammifères / gravité (ch4-C)
    "pollinisation": { "mode": "vent", "autofertile": true }
  },
  "produits": {
    "bois": { "densite": 0.5, "usages": ["chauffage", "oeuvre_humide"], "prix_m3": {} },
    "fruits": null                      // sinon { age_premiere_recolte, rendement_kg_max, prix_kg, périssable }
  },
  "sensibilites": ["engorgement_ok", "phytophthora_aulne"],   // ravageurs/maladies §7.4, gibier, feu
  "inflammabilite": "faible",
  "cout_plant": { "jeune": 3, "fort": 15 },
  "sources": ["atlas", "flore_forestiere_fr", "..."]
}
```

Point important tiré du cours (ch3-C, méthode « pousse / s'épanouit / survit ») : chaque axe du tempérament donne une **fonction de réponse trapézoïdale** — zone optimale (facteur 1), zones de tolérance (facteur dégressif), zones létales (mortalité). Pas de seuil binaire.

---

## 7. Le modèle de croissance individuel (cœur du moteur)

### 7.1 Croissance
Chaque individu ligneux a : âge, hauteur, diamètre, biomasse (aérienne/racinaire), réserves carbonées, état de stress.

```
croissance_semaine = potentiel(espèce, âge, saison)
                   × f_lumière(lumière_reçue)
                   × min( f_eau, f_N, f_P/K, f_T° )     ← loi du minimum
                   × f_santé (ravageurs, blessures)
```
- `potentiel` = dérivée d'une courbe de Chapman-Richards vers `hauteur_max` : les pionnières démarrent vite et plafonnent tôt, les climaciques l'inverse (ch1-A, « deux stratégies de vie »).
- **Allocation source → puits** (ch3-B) : le sucre produit va en priorité 1) respiration d'entretien, 2) racines si stress hydrique/nutritif, 3) fruits si mature et conditions OK, 4) bois. Conséquence émergente : un arbre stressé fructifie peu et grossit peu, un arbre taillé réalloue.
- **Réserves** : chaque automne, une part part en réserves ; elles paient le débourrement du printemps et la survie aux crises. Réserves à zéro = mort (déterministe, pas de dé).

### 7.2 Phénologie (calendrier annuel par individu)
Dormance → débourrement (cumul de degrés-jours) → floraison → nouaison (si pollinisation OK **et** pas de gel cette semaine-là) → croissance des fruits (puits de carbone) → récolte possible → chute des feuilles (→ litière, avec le C/N de l'espèce). Le **gel tardif** de la série météo détruit les fleurs ouvertes cette semaine-là : planter un abricotier en Massif central est légal mais perdant — le jeu l'enseigne tout seul.

### 7.3 Mortalité et stress (déterministes)
- Chaque facteur sous le seuil de tolérance génère des **points de stress** ; le stress consomme les réserves ; réserves épuisées = mort. Un stress chronique (ombre pour un héliophile) tue lentement, un extrême (engorgement 8 semaines pour un chêne pubescent) tue vite.
- La **sénescence** : passé `longevite`, le potentiel décroît, l'arbre devient sensible, puis meurt → **bois mort** debout puis au sol (habitat + pool de carbone, ch4-A « le grand oublié »).

### 7.4 Ravageurs et maladies (v1 : déclencheurs déterministes)
Pas de tirage aléatoire : des **règles à seuil**, lisibles et apprenables :
- Pucerons chaque printemps ; dégâts ∝ absence d'auxiliaires (l'index auxiliaires monte avec haies, fleurs de soudure — calendrier de floraison de l'atlas —, mare, gîtes).
- Carpocapse si >N pommiers/poiriers groupés sans haie diversifiée à proximité.
- Scolytes si épicéas **et** stress hydrique 2 années de suite (ch4-C, lien climat-ravageur).
- Processionnaire si pins >X % du couvert et hiver doux (série météo).
- Campagnols si herbe haute non fauchée au pied des jeunes arbres (protection : fauche, anneau de bulbes ch6, buses via perchoirs).
- Chalarose du frêne : arrive à l'année scriptée A+12 quoi qu'il arrive (réalité française) — enjeu de diversification.
- **Gibier** (chevreuil/lapin) : pression fixée par le contexte paysager ; abroutissement des plants <1,5 m non protégés (ch4-C). Contre-mesures : clôture, protections individuelles, ronces/épineux nurses (aubépine, prunellier = « nurses » de l'atlas).

### 7.5 Interactions positives (le cœur agroforestier)
- **Facilitation / effet nurse** (ch1-A) : sous une nurse, un semis subit moins d'ETP, moins de gel, pas de gibier — mais moins de lumière. Le joueur rejoue le moteur de la succession.
- **Mycorhizes** (ch2-B) : un individu connecté au réseau compatible (ECTO avec ECTO…) gagne en efficacité d'absorption eau/P (+X %) et en résistance au stress hydrique. Le réseau se construit dans le temps et est détruit par le labour.
- **Allélopathie** : la juglone du noyer pénalise les sensibles dans un rayon donné (atlas).
- **Pollinisation** : espèces non autofertiles (la plupart des pommiers, kiwaï dioïque, argousier dioïque — atlas) exigent un partenaire compatible à distance de butinage **et** un index pollinisateurs suffisant (fleurs étalées sur l'année, périodes de soudure fin d'hiver/automne de l'atlas).
- **LER affiché** (ch5-B) : le jeu calcule le Land Equivalent Ratio des assolements mixtes vs monoculture — c'est un indicateur de score, et un outil pédagogique.

---

## 8. Le hors-parcelle (paysage, non contrôlable)

Chaque bord de carte a une occupation qui produit des **flux entrants** :
- **Forêt voisine** → pluie de graines (selon les modes de dissémination : vent = partout dégressif, geai = glands posés jusqu'à 500 m par « paquets », ch4-C), colonisation mycorhizienne plus rapide, auxiliaires et pollinisateurs de base, mais aussi gibier.
- **Prairie** → graminées et banque de graines de friche, campagnols.
- **Grande culture intensive** → quasi rien de vivant, dérive de pression ravageurs (pucerons), pas d'auxiliaires.
- **Régénération naturelle** : chaque année, des semis spontanés apparaissent (espèces = f(voisinage + banque de graines de la station + arbres de la parcelle en âge de grainer)). Le joueur peut les garder (gratuit, adapté, mais placé au hasard du disperseur) ou les faucher — c'est l'arbitrage régénération vs plantation du ch4-B.

---

## 9. Actions du joueur

Chaque action coûte **de l'argent et/ou du temps de travail** (§10). Liste v1 :

**Sol** : observer/analyser (bêche gratuite = infos partielles, analyse labo payante = valeurs exactes), labour initial (gain N à court terme, casse mycorhizes + déstocke C — le piège classique), paillage, BRF, compost/fumier, chaulage, engrais organique ou minéral (avec pertes par lessivage si mal daté, ch1-C), semis d'engrais verts, faux-semis/fauche.

**Végétal** : acheter et planter (plant jeune pas cher/fragile vs plant fort cher/robuste ; **provenance MFR** adaptée ou non à la station *(mécanique à confirmer)*), semer, tailler/élaguer (bois d'œuvre), **éclaircir** (ch5-A : desserrer pour la résilience), recéper (taillis), trogner, couper, **choisir le devenir de chaque coupe** : vendre (bois d'œuvre / chauffage) · brûler sur place · broyer/épandre · laisser en bois mort. Récolter les fruits (fenêtre de fraîcheur), greffer *(v2 ?)*.

**Aménagements** : clôture, protections individuelles, haie brise-vent, mare (débloque crapauds/libellules), nichoirs/gîtes/perchoirs, ruches (pollinisation + miel), irrigation (réseau ou cuve de récupération — ressource eau limitée et payante, ch7-B), chemin d'accès (réduit le temps de travail des interventions lointaines *(idée à confirmer)*).

**Animaux d'élevage (v1 minimale, v2 complète)** : poules (désherbage/insectes sous verger), moutons en sylvopastoralisme (ch5-B : pâturage = entretien gratuit mais abroutissement si arbres non protégés).

---

## 10. Ressources et économie

- **Argent (€)** : capital de départ selon scénario. Dépenses = plants, matériel, intrants, main-d'œuvre saisonnière. Recettes = fruits (prix dégressifs si monoproduit qui sature le marché local *(à confirmer)*), bois d'œuvre (∝ qualité : droit, élagué, gros diamètre), bois de chauffage, petits fruits/plants, miel. **Aides publiques** scriptées (le cours ch5 les mentionne : aides plantation haies/agroforesterie) et éventuel **paiement pour services (label bas-carbone)** lié au §12.
- **Temps de travail (h/semaine)** : LE régulateur du rythme. Le joueur a ~40 h/semaine ; chaque action a un coût horaire réaliste (planter un arbre ~15 min, récolter 100 kg de pommes ~3 h *(à calibrer)*). Récolte non faite = perdue (ou tombée = litière). Embauche possible (€ ↔ h). C'est ce qui rend une forêt-jardin mature intéressante : peu d'heures, du rendement (ch6, « le pari des vivaces »).
- **Carbone** : pas une monnaie dépensable, un **score-bilan** (§12), éventuellement monétisé via label.

---

## 11. Succession écologique « moteur de fond »

Sans intervention, chaque cellule suit la trajectoire du ch1-A : sol nu → annuelles → vivaces/graminées → fruticée épineuse (ronce, prunellier, aubépine = nurses) → pionniers (bouleau, saule, genêt) → intermédiaires → climaciques (hêtre, chêne) via **facilitation** (les pionniers créent l'ombre et le sol qui permettent aux suivants de s'installer, et sont ensuite éliminés par cette même ombre). Le stade est émergent (résultat des règles lumière/sol/dissémination), pas une variable codée en dur — mais on **teste** que la trajectoire émerge bien. Objectif de design du ch6 : le joueur apprend à viser la **jeune forêt** productive, pas le climax sombre.

---

## 12. Comptabilité carbone

Réponse à ta question : oui — **brûler = réémettre immédiatement** ; les vrais stockages sont 1) la **biomasse vivante** tant qu'elle est sur pied, 2) le **sol** (humus stable — c'est le plus gros stock en tempéré), 3) le **bois d'œuvre** vendu pour fabrication (charpente, meuble), qui stocke pendant la durée de vie du produit. Le bois-énergie n'est « pas pire » que la décomposition à terme, mais ne stocke rien.

**Pools suivis** (t C) : biomasse aérienne · biomasse racinaire · bois mort · litière · MO du sol (par horizon) · produits bois exportés (avec **durée de vie** : œuvre ~50 ans, palette ~10, chauffage 0).

**Flux** : photosynthèse (entrée) ; respiration ; décomposition (litière → CO₂ + humus, coefficient d'humification ~10–30 % selon C/N *(à calibrer)*) ; labour (déstockage accéléré de la MO : une prairie retournée perd massivement — ta remarque, et ch1-C « le sol nu ») ; exports (récoltes, bois) ; combustion (retour immédiat).

**Règles clés** :
- Occupation initiale = stock initial : prairie permanente ~80 t C/ha dans le sol, grande culture ~45 *(à calibrer sur refs INRAE)*. Planter une forêt sur prairie **en labourant** peut être négatif pendant des années — vérité contre-intuitive que le jeu doit montrer.
- Biomasse : C ≈ 47–50 % de la matière sèche ; racines ≈ 25–30 % de l'aérien *(à calibrer par type)*.
- L'affichage montre le **bilan net cumulé** et sa décomposition par pool — l'un des écrans pédagogiques les plus importants.

---

## 13. Objectifs, score, modes de jeu

Pas de « victoire » unique : des **scénarios** avec objectifs, sur le modèle de l'étude de cas du cours :
1. **Diversifier la pinède** (Sud-Gironde) : réduire la part du pin sous 50 % sans jamais être déficitaire, en 20 ans.
2. **Sortir de la grande culture** (plateau picard) : atteindre un revenu stable + MO du sol ×2 en 25 ans.
3. **Forêt-jardin vivrière** (bocage breton) : X kg de nourriture/an étalés sur ≥ 9 mois, en < 10 h/semaine au régime de croisière (ch7-B, ordres de grandeur de surface).
4. **Bas carbone** : maximiser le C net stocké à 40 ans, trésorerie ≥ 0.
5. **Bac à sable** : tous curseurs libres, y compris +2 °C / +4 °C (ch8).

**Indicateurs permanents** : trésorerie · h de travail · bilan C · **index biodiversité** (richesse spécifique pondérée × diversité des strates × habitats : bois mort, mare, haies, fleurs 12 mois — proxy honnête, à afficher comme tel) · LER · autonomie alimentaire.

---

## 14. Hors périmètre v1 (assumé, pour te répondre « et après ? »)

Variabilité individuelle (ta v2 : tirage d'un « génotype » par individu autour des moyennes d'espèce — le socle déterministe reste, on tire juste les paramètres à la plantation avec une graine aléatoire fixée par partie) · météo stochastique · feu comme système complet (v1 : juste l'inflammabilité et un événement scripté en station 1) · greffe et variétés fruitières détaillées · multijoueur/multi-parcelles · marché dynamique · réglementation (défrichement, PLU) · maraîchage annuel complet (v1 : couverts et quelques vivaces potagères de l'atlas herbacées, le potager annuel du ch7 viendra après).

---

## 15. Ce que tu n'avais pas abordé — points à trancher

1. **Pas de temps & durée** : OK pour semaine + parties de 30–60 ans avec accélération ? (Alternative : tick mensuel, plus simple, phénologie plus grossière.)
2. **Spatialisation** : grille 1 m² / 1 ha te va ? C'est structurant pour tout le reste (ombres, racines, design de lignes).
3. **« Déterministe » précisé** : je propose série météo scriptée (années sèches incluses) plutôt que climat constant — sinon pas de gel tardif ni de sécheresse, et le jeu perd son intérêt. Valide ?
4. **Le temps de travail comme ressource** : tu avais dit « argent, temps, carbone » — je propose que le « temps » soit des **heures de travail hebdomadaires** (pas juste le temps qui passe). C'est le meilleur frein réaliste au micro-management.
5. **Échec possible ?** Faillite = fin de partie, ou découvert autorisé ? Je propose faillite possible hors bac à sable.
6. **La récolte d'infos comme gameplay** : sait-on tout du sol dès le départ, ou faut-il payer des analyses / observer des bio-indicatrices (callune = acide, cornouiller = calcaire — atlas) ? Je pousse pour l'observation, très pédagogique.
7. **Pollinisation variétale** : gérer l'auto-stérilité (2 variétés de pommiers) dès la v1 ou simplifier à l'espèce ?
8. **Point de vue graphique** : vue de dessus 2D (la plus honnête pour ombres/racines), isométrique, ou coupe de profil pour le sol ? (Je proposerai une maquette après validation des règles.)
9. **Nom du jeu** : « Canopée » est un placeholder.
10. **Stack technique** (à discuter au prochain pas) : je pense TypeScript + Vite, moteur pur sans framework + rendu Canvas/PixiJS, données espèces/stations en JSON versionnés — et des tests unitaires sur le moteur dès le début (bilan d'eau, Liebig, succession émergente).

---

## 16. Feuille de route proposée

- **V0 « le sol et l'eau »** : 1 station, météo scriptée, bilan hydrique + N, 5 espèces, croissance Liebig, plantation/coupe, argent. → valider que « ça pousse juste ».
- **V0.5 « la lumière »** : strates, ombres, tempéraments, succession émergente, régénération naturelle.
- **V1 « le jeu »** : 3 stations, ~40 ligneux + 20 herbacées, phénologie/gel/récoltes, ravageurs à seuils, auxiliaires, carbone complet, temps de travail, scénarios 1 et 3.
- **V2** : variabilité individuelle, greffes/variétés, feu, animaux d'élevage complets, +2 °C généralisé.
