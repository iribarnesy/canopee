/**
 * Le volet **sol** : le diagnostic que la vue isométrique ne peut pas donner.
 *
 * La carte à plat pour ce qui se répartit — l'eau, le pH, l'azote — et sous
 * elle les grandeurs qui n'ont pas de place où se poser : ce que le sol porte,
 * où est la nappe, ce que l'érosion emporte.
 *
 * **Elle est maintenant chiffrée (#144) et orientée comme la vue (#145).** Six
 * dégradés sans échelle ne répondaient pas à la seule question qu'on leur
 * posait — « le pH est-il bon maintenant ? » — et un carré nord-en-haut devant
 * une vue en losange qui tourne obligeait à faire la rotation de tête. Les
 * deux corrections se tiennent : le losange rend au volet la moitié de sa
 * hauteur, et c'est cette place-là que la légende occupe.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ESPECES_V0 } from "../../engine/especes";
import type { Orientation } from "../../render/projection";
import type { Snapshot, StationInfo } from "../protocol";
import {
  CALQUES,
  type Calque,
  couleurDeLaCellule,
  enCss,
  etendueDuCalque,
  type FicheDeCalque,
  ficheDuCalque,
  partDuDegrade,
  TEINTE_EAU_LIBRE,
  valeurDuDegrade,
} from "./calquesDuSol";
import {
  capDuNord,
  celluleSousLaCarte,
  LARGEUR_DU_LOSANGE,
  transformeDeLaCarte,
} from "./carteOrientee";
import { btn } from "./styles";

/**
 * Côté du canvas de la carte, px.
 *
 * C'est la résolution du dessin et non sa taille à l'écran : la présentation
 * l'étire au volet. À 360 px, une parcelle de 40 m a neuf pixels par cellule,
 * assez pour que le losange ne bave pas une fois tourné.
 */
const CARTE_PX = 360;

/** Nombre d'arrêts du dégradé de la légende. Assez pour qu'aucune bande ne se voie. */
const ARRETS_DE_LEGENDE = 16;

/**
 * La **carte du sol** : une vue de dessus, un pixel par cellule, qui montre ce que
 * la parcelle cache.
 *
 * **Elle ne dessine pas les arbres**, et c'est ce qui lui reste à faire. La
 * parcelle elle-même se voit en isométrique (`VueParcelle`), où le peuplement
 * se lit comme un peuplement. Ce que la vue isométrique ne peut **pas** montrer,
 * c'est le pH, la nappe ou l'azote : ce sont des grandeurs d'un sol qu'on ne
 * voit pas, et une carte à plat reste la bonne forme pour elles.
 *
 * **Le dessin reste nord en haut**, cellule par cellule, et c'est voulu : la
 * présentation en losange est une transformation de ce canvas-là
 * (`carteOrientee.ts`). Le redessiner en losange aurait mis une seconde copie
 * de la projection en face de la vraie.
 */
function dessinerCarteDuSol(
  canvas: HTMLCanvasElement,
  snapshot: Snapshot,
  station: StationInfo,
  fiche: FicheDeCalque,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const coteM = station.coteM;
  const scale = canvas.width / coteM;
  for (let y = 0; y < coteM; y++) {
    for (let x = 0; x < coteM; x++) {
      const i = y * coteM + x;
      ctx.fillStyle = enCss(couleurDeLaCellule(fiche, snapshot, station, i));
      ctx.fillRect(x * scale, (coteM - 1 - y) * scale, Math.ceil(scale), Math.ceil(scale));
    }
  }
  // La clôture : on ne peint pas l'intérieur — ce serait un aplat de plus sur
  // une carte qui en a déjà — on trace le **grillage**, c'est-à-dire les côtés de
  // cellules qui séparent le clos du dehors.
  ctx.strokeStyle = "#8a6d3b";
  ctx.lineWidth = Math.max(1.5, scale * 0.22);
  ctx.beginPath();
  for (let y = 0; y < coteM; y++) {
    for (let x = 0; x < coteM; x++) {
      if (!snapshot.soilCloture[y * coteM + x]) continue;
      const gauche = x > 0 ? snapshot.soilCloture[y * coteM + x - 1] : 0;
      const droite = x < coteM - 1 ? snapshot.soilCloture[y * coteM + x + 1] : 0;
      const dessous = y > 0 ? snapshot.soilCloture[(y - 1) * coteM + x] : 0;
      const dessus = y < coteM - 1 ? snapshot.soilCloture[(y + 1) * coteM + x] : 0;
      const px = x * scale;
      const py = (coteM - 1 - y) * scale;
      if (!gauche) {
        ctx.moveTo(px, py);
        ctx.lineTo(px, py + scale);
      }
      if (!droite) {
        ctx.moveTo(px + scale, py);
        ctx.lineTo(px + scale, py + scale);
      }
      if (!dessus) {
        ctx.moveTo(px, py);
        ctx.lineTo(px + scale, py);
      }
      if (!dessous) {
        ctx.moveTo(px, py + scale);
        ctx.lineTo(px + scale, py + scale);
      }
    }
  }
  ctx.stroke();
}

/**
 * L'aiguille du nord.
 *
 * Une carte qui tourne avec la vue ne dit plus où est le nord : sans ce
 * repère, on aurait troqué une rotation de tête contre une désorientation.
 */
function AiguilleDuNord({ orientation }: { orientation: Orientation }) {
  const cap = capDuNord(orientation);
  const rad = (cap * Math.PI) / 180;
  // La lettre suit la pointe mais ne **tourne pas** : un « N » couché se lit comme
  // un « Z », et on aurait rendu la boussole moins lisible que l'absence de
  // boussole.
  const lettreX = Math.sin(rad) * 13;
  const lettreY = -Math.cos(rad) * 13;
  return (
    <svg
      width={40}
      height={40}
      viewBox="-20 -20 40 40"
      aria-label={`Le nord est à ${cap.toFixed(0)}°`}
      role="img"
      style={{ position: "absolute", top: 0, right: 0 }}
    >
      <circle r={18} fill="rgba(255, 253, 247, 0.82)" stroke="var(--trait)" />
      <path
        d="M 0 -9 L 3.5 5 L 0 2.5 L -3.5 5 Z"
        fill="var(--encre)"
        transform={`rotate(${cap})`}
      />
      <text
        x={lettreX}
        y={lettreY + 3}
        textAnchor="middle"
        fontSize={9}
        fontWeight="bold"
        fill="var(--encre)"
      >
        N
      </text>
    </svg>
  );
}

/**
 * La barre du dégradé, avec ses bornes chiffrées, ce que la parcelle occupe
 * vraiment, et — sur le pH — la plage que l'essence choisie tolère.
 *
 * C'est la réponse à « le pH est-il bon maintenant ? » : la plage de l'essence
 * et l'étendue de la parcelle sont sur la même règle, et il suffit de voir si
 * l'une couvre l'autre.
 */
function Legende({
  fiche,
  station,
  etendue,
  survolee,
  plage,
}: {
  fiche: FicheDeCalque;
  station: StationInfo;
  etendue: { bas: number; haut: number; moyenne: number } | undefined;
  survolee: number | undefined;
  plage: { bas: number; haut: number; libelle: string } | undefined;
}) {
  const arrets = Array.from({ length: ARRETS_DE_LEGENDE + 1 }, (_, k) =>
    enCss(fiche.teinte(k / ARRETS_DE_LEGENDE)),
  ).join(", ");
  const pourcent = (v: number) => `${(partDuDegrade(v, fiche, station) * 100).toFixed(2)}%`;
  const graduations = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ position: "relative", height: 16 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 3,
            border: "1px solid var(--trait)",
            background: `linear-gradient(to right, ${arrets})`,
          }}
        />
        {/* Ce que la parcelle occupe du dégradé : le reste est hors sujet ici. */}
        {etendue && (
          <div
            style={{
              position: "absolute",
              top: -3,
              bottom: -3,
              left: pourcent(etendue.bas),
              right: `calc(100% - ${pourcent(etendue.haut)})`,
              minWidth: 2,
              border: "2px solid var(--encre)",
              borderRadius: 3,
              pointerEvents: "none",
            }}
          />
        )}
        {/* La valeur sous le curseur, sur la même règle que tout le reste. */}
        {survolee !== undefined && Number.isFinite(survolee) && (
          <div
            style={{
              position: "absolute",
              top: -6,
              bottom: -6,
              left: pourcent(survolee),
              width: 2,
              marginLeft: -1,
              background: "var(--foret)",
              boxShadow: "0 0 0 1px rgba(255, 253, 247, 0.9)",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
      {/* La plage tolérée par l'essence : posée sous la barre, sur la même échelle. */}
      {plage && (
        <div style={{ position: "relative", height: 12, marginTop: 3 }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              height: 5,
              left: pourcent(plage.bas),
              right: `calc(100% - ${pourcent(plage.haut)})`,
              background:
                "repeating-linear-gradient(45deg, var(--foret) 0 3px, transparent 3px 6px)",
              borderTop: "1px solid var(--foret)",
              borderBottom: "1px solid var(--foret)",
            }}
          />
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--encre-douce)",
          fontVariantNumeric: "tabular-nums",
          marginTop: 2,
        }}
      >
        {graduations.map((g) => (
          <span key={g}>
            {g === 1 && fiche.borneHauteOuverte ? "≥ " : ""}
            {fiche.format(valeurDuDegrade(g, fiche, station))}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CarteDuSol({
  snapshot,
  station,
  especeId,
  orientation,
}: {
  snapshot: Snapshot;
  station: StationInfo;
  /** L'essence choisie au volet des gestes : sa plage de pH est un repère. */
  especeId: string;
  /** L'orientation de la **vue**, pour présenter la carte comme elle (#145). */
  orientation: Orientation;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [calqueId, setCalqueId] = useState<Calque>("eau");
  const [survol, setSurvol] = useState<{ x: number; y: number } | undefined>();
  const fiche = ficheDuCalque(calqueId);
  const cellules = station.coteM * station.coteM;

  useEffect(() => {
    if (canvasRef.current) dessinerCarteDuSol(canvasRef.current, snapshot, station, fiche);
  }, [snapshot, station, fiche]);

  const etendue = useMemo(
    () => etendueDuCalque(fiche, snapshot, station, cellules),
    [fiche, snapshot, station, cellules],
  );

  // La plage de pH de l'essence choisie vient du catalogue du moteur ; on ne
  // la reconstitue pas, on la lit (docs/agents/jeu.md).
  const espece = ESPECES_V0.find((e) => e.id === especeId);
  const plage =
    calqueId === "ph" && espece
      ? { bas: espece.ph[0], haut: espece.ph[1], libelle: espece.nom }
      : undefined;

  const iSurvolee = survol ? survol.y * station.coteM + survol.x : undefined;
  const surEau = iSurvolee !== undefined && station.enEau?.[iSurvolee] === true;
  const valeurSurvolee =
    iSurvolee !== undefined ? fiche.lire(snapshot, station, iSurvolee) : undefined;

  function surPointeur(e: React.PointerEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;
    const cadre = e.currentTarget.getBoundingClientRect();
    if (!canvas || canvas.offsetWidth === 0) return;
    // Le centre du cadre est invariant par la transformation ; le côté du
    // canvas est sa taille de **mise en page**, que la transformation ne change pas.
    const dx = e.clientX - (cadre.left + cadre.width / 2);
    const dy = e.clientY - (cadre.top + cadre.height / 2);
    setSurvol(celluleSousLaCarte(dx, dy, canvas.offsetWidth, station.coteM, orientation));
  }

  return (
    <>
      {/*
        La carte du sol montre ce que la vue ne peut pas montrer : le pH, la
        nappe, l'azote. Ce sont des grandeurs d'un sol qu'on ne voit pas, et
        une vue jolie ne remplace pas un diagnostic.
      */}
      <div
        style={{ position: "relative", width: "100%", aspectRatio: "2 / 1" }}
        onPointerMove={surPointeur}
        onPointerLeave={() => setSurvol(undefined)}
      >
        <canvas
          ref={canvasRef}
          width={CARTE_PX}
          height={CARTE_PX}
          style={{
            position: "absolute",
            inset: 0,
            margin: "auto",
            // La rotation étire la boîte : le canvas doit être √2 fois plus
            // étroit que le volet pour que le losange y tienne pile.
            width: `${100 / LARGEUR_DU_LOSANGE}%`,
            aspectRatio: "1",
            height: "auto",
            display: "block",
            transform: transformeDeLaCarte(orientation),
          }}
        />
        <AiguilleDuNord orientation={orientation} />
      </div>

      <p style={{ margin: "6px 0 0" }}>
        {CALQUES.map((c) => (
          <button
            key={c.id}
            type="button"
            style={btn(calqueId === c.id)}
            onClick={() => setCalqueId(c.id)}
          >
            {c.libelle}
          </button>
        ))}
      </p>

      <div style={{ fontSize: 13 }}>
        <strong>{fiche.titre}</strong>
        {fiche.unite && <span style={{ color: "var(--encre-douce)" }}> · {fiche.unite}</span>}
        <span style={{ color: "var(--encre-douce)" }}> — {fiche.sens}</span>
      </div>

      <Legende
        fiche={fiche}
        station={station}
        etendue={etendue}
        survolee={valeurSurvolee}
        plage={plage}
      />

      <p
        style={{
          margin: "8px 0 0",
          fontSize: 13,
          minHeight: 38,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {survol && valeurSurvolee !== undefined ? (
          <>
            {surEau ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    marginRight: 5,
                    background: enCss(TEINTE_EAU_LIBRE),
                  }}
                />
                eau libre
              </>
            ) : (
              <strong>
                {fiche.format(valeurSurvolee)} {fiche.unite}
              </strong>
            )}
            <span style={{ color: "var(--encre-douce)" }}>
              {" "}
              · cellule {survol.x}, {survol.y}
            </span>
          </>
        ) : (
          etendue && (
            <span style={{ color: "var(--encre-douce)" }}>
              Sur la parcelle : de <strong>{fiche.format(etendue.bas)}</strong> à{" "}
              <strong>{fiche.format(etendue.haut)}</strong> {fiche.unite} · moyenne{" "}
              {fiche.format(etendue.moyenne)} — survolez la carte pour lire une cellule
            </span>
          )
        )}
        {plage && (
          <>
            <br />
            <span style={{ color: "var(--encre-douce)" }}>
              {plage.libelle} tient de {plage.bas.toFixed(1)} à {plage.haut.toFixed(1)}
            </span>
          </>
        )}
      </p>

      <dl className="stats" style={{ marginTop: 12 }}>
        <dt>Sol</dt>
        <dd>
          P {(snapshot.fluxes.phosphoreMoyenGM2 * 10).toFixed(1)} · K{" "}
          {(snapshot.fluxes.potassiumMoyenGM2 * 10).toFixed(0)} kg/ha assimilables · mycorhizes{" "}
          {(snapshot.fluxes.mycorhizesMoyen * 100).toFixed(0)} %
        </dd>
        <dt>Nappe</dt>
        <dd>
          à {(snapshot.fluxes.nappeProfondeurCm / 100).toFixed(2)} m sous la surface
          <span className="detail">
            {" "}
            · équilibre régional {(station.nappeEquilibreCm / 100).toFixed(1)} m — la forêt la fait
            descendre en transpirant, un incendie la fait remonter
          </span>
        </dd>
        {snapshot.fluxes.erosionArracheeKgM2 > 0 && (
          <>
            <dt>Érosion</dt>
            <dd>
              {(snapshot.fluxes.erosionArracheeKgM2 * 520).toFixed(1)} t/ha/an arrachées ·{" "}
              <strong>{(snapshot.fluxes.erosionSortieKgM2 * 520).toFixed(1)}</strong> sorties de la
              parcelle
              <span className="detail">
                {" "}
                · avec {(snapshot.fluxes.erosionNKgHa * 52).toFixed(1)} N ·{" "}
                {(snapshot.fluxes.erosionPKgHa * 52).toFixed(2)} P ·{" "}
                {(snapshot.fluxes.erosionKKgHa * 52).toFixed(1)} K kg/ha/an
              </span>
            </dd>
          </>
        )}
        {(snapshot.fluxes.boisSedimentPiegeKgM2 > 0 || snapshot.fluxes.boisRetenueMm > 0) && (
          <>
            <dt>Bois en travers</dt>
            <dd>
              retient <strong>{(snapshot.fluxes.boisRetenueMm * 52).toFixed(0)} mm/an</strong> d'eau
              et{" "}
              {/* En kg et non en tonnes : le bois mort NATUREL barre peu (un
                      chablis repose sur ses branches), et « 0,0 t/ha » ne dirait
                      rien de ce qui se passe. */}
              <strong>
                {(snapshot.fluxes.boisSedimentPiegeKgM2 * 520_000).toFixed(0)} kg/ha/an
              </strong>{" "}
              de terre
              <span className="detail">
                {" "}
                · un tronc couché en travers de la pente met l'eau en flaque, le temps qu'elle
                rentre, et fait déposer derrière lui ce que le ruissellement emportait
              </span>
            </dd>
          </>
        )}
        {snapshot.fluxes.partInondee > 0 && (
          <>
            <dt>Crue</dt>
            <dd>
              la nappe affleure sur {(snapshot.fluxes.partInondee * 100).toFixed(0)} % de la
              parcelle
            </dd>
          </>
        )}
      </dl>
    </>
  );
}
