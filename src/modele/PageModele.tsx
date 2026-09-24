/**
 * LE MODÈLE : ce que le simulateur prend en compte (#224).
 *
 * Trois choses, dans cet ordre, parce que c'est l'ordre des questions qu'on se
 * pose : **qu'est-ce que ça calcule** (une semaine simulée, étape par étape),
 * **jusqu'où** (les cent cinquante-trois critères de réalisme), et **où ça
 * s'arrête** (les partiels et l'absent, au même endroit et dans la même forme
 * que le reste).
 *
 * Ce troisième point n'est pas de la modestie. Une page qui annoncerait tout
 * couvert ne prouverait rien : c'est de voir ce qui manque qu'on croit au
 * reste.
 *
 * **Elle ne tient aucune liste.** Tout vient de `virtual:modele`, extrait à la
 * construction de `docs/realisme.md` et de `src/engine/tick.ts` — le
 * référentiel du dépôt et l'ordre réel du tick. Une ligne ajoutée au
 * référentiel paraît ici sans que personne n'y touche.
 *
 * **Pas de pourcentage, et c'est délibéré.** Le référentiel en calcule un
 * (`scripts/recompte-realisme.py`, un partiel comptant pour moitié) ; le
 * recopier ici en ferait une seconde règle, qui dériverait. Et les comptes
 * bruts disent mieux la même chose à qui découvre : « 134 critères prouvés par
 * un essai automatisé » ne demande pas à qui l'on doit la pondération.
 */

import { domaines, etapes } from "virtual:modele";
import { useMemo, useState } from "react";
import type { Critere, Etape } from "./extraction";

/** Ce que les trois états veulent dire, dans les mots du référentiel. */
const ETAT = {
  couvert: {
    signe: "✅",
    nom: "couvert",
    dit: "mécanisme présent ET prouvé par un test automatisé",
  },
  partiel: { signe: "🟡", nom: "partiel", dit: "mécanisme présent mais grossier, ou non testé" },
  absent: { signe: "❌", nom: "absent", dit: "le moteur ne sait pas faire" },
} as const;

const ORDRE: (keyof typeof ETAT)[] = ["couvert", "partiel", "absent"];

/** Le dépôt, pour que le lecteur puisse aller lire ce que la page résume. */
const DEPOT = "https://github.com/iribarnesy/canopee";

/**
 * Rend le référentiel tel qu'il est écrit : ses accents graves comme du code,
 * son gras comme du gras.
 *
 * Les cellules citent des noms de fichiers et de fonctions — `water.ts`,
 * `soilEvapFactor` — et insistent parfois en gras. Les afficher tels quels
 * ferait lire du markdown brut ; les dépouiller effacerait la distinction
 * entre une phrase et un identifiant, qui est justement ce qui rend la cellule
 * vérifiable.
 *
 * Les accents graves l'emportent : dans `a ** b`, les étoiles sont du code.
 */
function AvecDuCode({ texte }: { texte: string }) {
  const morceaux = texte.split("`");
  return (
    <>
      {morceaux.map((m, i) =>
        i % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: le rang EST l'identité d'un morceau de texte
          <code key={i} style={{ fontSize: "0.92em", color: "var(--terre)" }}>
            {m}
          </code>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: idem
          <AvecDuGras key={i} texte={m} />
        ),
      )}
    </>
  );
}

function AvecDuGras({ texte }: { texte: string }) {
  const morceaux = texte.split("**");
  return (
    <>
      {morceaux.map((m, i) =>
        i % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: le rang EST l'identité d'un morceau de texte
          <strong key={i}>{m}</strong>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: idem
          <span key={i}>{m}</span>
        ),
      )}
    </>
  );
}

/**
 * UNE ÉTAPE DE LA SEMAINE, dépliable.
 *
 * **Un bouton, et pas un survol.** La demande était « plus de détail au
 * survol » ; un survol ne marche ni au doigt ni au clavier, et une infobulle
 * native tronque quatre cents caractères. La carte porte donc ce qu'elle peut
 * montrer sans bouger — deux lignes — et le clic ouvre le reste en place.
 *
 * Le survol n'est pas perdu pour autant : la bordure s'allume, ce qui dit que
 * la carte se clique. Sans ce signe, un dépliant ne se découvre pas.
 *
 * Les quatre étapes dont le commentaire ne dit rien de plus que leur titre ne
 * sont pas cliquables : un bouton qui n'ouvre rien est pire qu'un bouton
 * absent.
 */
function CarteDEtape({
  etape,
  ouverte,
  surOuvrir,
}: {
  etape: Etape;
  ouverte: boolean;
  surOuvrir: () => void;
}) {
  const [survolee, setSurvolee] = useState(false);
  const depliable = etape.detail.length > 0;
  return (
    <li style={{ listStyle: "none" }}>
      <button
        type="button"
        disabled={!depliable}
        onClick={surOuvrir}
        onMouseEnter={() => setSurvolee(true)}
        onMouseLeave={() => setSurvolee(false)}
        aria-expanded={depliable ? ouverte : undefined}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          textAlign: "left",
          font: "inherit",
          // **La couleur ne dit pas l'importance.** `disabled` grise le bouton,
          // et les quatre étapes sans commentaire se mettaient à paraître
          // secondaires — dont « Croissance de chaque arbre », qui est le cœur
          // du tick. Ce qui n'ouvre rien n'a pas de « + » et pas de curseur de
          // main ; ça suffit à le dire, et ça ne ment pas sur le fond.
          color: "var(--encre)",
          opacity: 1,
          border: "1px solid",
          borderColor: survolee && depliable ? "var(--foret)" : "var(--trait)",
          borderLeft: "3px solid var(--foret)",
          borderRadius: 6,
          padding: "6px 10px",
          background: ouverte ? "var(--foret-pale)" : "var(--carte)",
          cursor: depliable ? "pointer" : "default",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--encre-douce)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>{etape.rang}</span>
          {depliable && <span aria-hidden="true">{ouverte ? "−" : "+"}</span>}
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.3 }}>{etape.titre}</div>
        {etape.detail && (
          <div
            style={{
              fontSize: 12,
              color: "var(--encre-douce)",
              marginTop: 3,
              ...(ouverte
                ? {}
                : {
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as const,
                    overflow: "hidden",
                  }),
            }}
          >
            <AvecDuCode texte={etape.detail} />
          </div>
        )}
        {ouverte && (
          <a
            href={`${DEPOT}/blob/main/src/engine/tick.ts#L${etape.ligne}`}
            onClick={(ev) => ev.stopPropagation()}
            style={{ fontSize: 12, color: "var(--foret)", display: "inline-block", marginTop: 6 }}
          >
            voir le code — tick.ts ligne {etape.ligne} ↗
          </a>
        )}
      </button>
    </li>
  );
}

function Compteur({ nombre, quoi }: { nombre: number; quoi: string }) {
  return (
    <div>
      <div style={{ fontSize: "2.1rem", fontWeight: 700, lineHeight: 1.05 }}>{nombre}</div>
      <div style={{ fontSize: 13, color: "var(--encre-douce)", maxWidth: 190 }}>{quoi}</div>
    </div>
  );
}

function LigneDeCritere({ critere }: { critere: Critere }) {
  return (
    <li
      style={{
        listStyle: "none",
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: "2px 10px",
        padding: "8px 0",
        borderTop: "1px solid var(--trait)",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.05em",
          color: "var(--encre-douce)",
          paddingTop: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {critere.code}
      </span>
      <span>
        <span aria-hidden="true" title={ETAT[critere.etat].nom}>
          {ETAT[critere.etat].signe}
        </span>{" "}
        <AvecDuCode texte={critere.quoi} />
      </span>
      <span />
      {critere.porte && (
        <span
          style={{
            fontSize: 12.5,
            color: "var(--encre-douce)",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          <AvecDuCode texte={critere.porte} />
        </span>
      )}
    </li>
  );
}

export function PageModele() {
  const [etapeOuverte, setEtapeOuverte] = useState<number>();
  const [domaineVu, setDomaineVu] = useState<string>();
  const [etatVu, setEtatVu] = useState<keyof typeof ETAT>();

  const tous = useMemo(() => domaines.flatMap((d) => d.criteres), []);
  const compte = (etat: keyof typeof ETAT) => tous.filter((c) => c.etat === etat).length;

  const vus = useMemo(
    () =>
      domaines
        .filter((d) => !domaineVu || d.lettre === domaineVu)
        .map((d) => ({ ...d, criteres: d.criteres.filter((c) => !etatVu || c.etat === etatVu) }))
        .filter((d) => d.criteres.length > 0),
    [domaineVu, etatVu],
  );

  const bouton = (actif: boolean): React.CSSProperties => ({
    padding: "3px 10px",
    border: "1px solid",
    borderColor: actif ? "var(--foret)" : "var(--trait)",
    borderRadius: 6,
    background: actif ? "var(--foret)" : "#fff",
    color: actif ? "#fff" : "var(--encre)",
    cursor: "pointer",
    fontSize: 13,
  });

  return (
    <div className="modele">
      <h2 style={{ margin: "0 0 4px" }}>Le modèle</h2>
      <p className="accroche" style={{ maxWidth: 760 }}>
        Canopée simule une parcelle d'agroforesterie tempérée semaine par semaine : l'eau dans
        chaque horizon du sol, la lumière que chaque arbre intercepte, l'azote qu'il prélève, le
        gibier qui le broute, le feu qui passe. Cette page dit tout ce que le moteur prend en compte
        — et ce qu'il ne sait pas encore faire.
      </p>

      <section className="carte">
        <h3>Une semaine simulée</h3>
        <p className="sous">
          Les {etapes.length} étapes d'un pas de temps, dans l'ordre où elles s'exécutent. Les trois
          dernières ne tournent qu'une fois l'an. Cliquez une étape pour lire ce qu'elle fait, et
          aller voir le code qui la fait.
        </p>
        <ol
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
            // Sans ça, déplier une carte étire toute sa rangée : les trois
            // voisines gagnent un fond vide de la hauteur du texte ouvert.
            alignItems: "start",
            gap: 8,
            margin: 0,
            padding: 0,
          }}
        >
          {etapes.map((e) => (
            <CarteDEtape
              key={e.rang}
              etape={e}
              ouverte={etapeOuverte === e.rang}
              surOuvrir={() => setEtapeOuverte(etapeOuverte === e.rang ? undefined : e.rang)}
            />
          ))}
        </ol>
      </section>

      <section className="carte">
        <h3>Le référentiel de réalisme</h3>
        <p className="sous">
          Chaque critère décrit un comportement du monde réel que le moteur doit reproduire pour
          n'importe quelle combinaison de sol, de climat, d'espèces et de voisinage — y compris sur
          des stations générées, jamais écrites à la main.
        </p>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", margin: "14px 0 6px" }}>
          <Compteur nombre={tous.length} quoi="critères de réalisme" />
          <Compteur nombre={compte("couvert")} quoi="prouvés par un essai automatisé" />
          <Compteur nombre={compte("partiel")} quoi="présents mais grossiers, ou non testés" />
          <Compteur nombre={compte("absent")} quoi="que le moteur ne sait pas faire" />
        </div>
        <p className="glose" style={{ minHeight: 0 }}>
          {ORDRE.map((e) => `${ETAT[e].signe} ${ETAT[e].nom} — ${ETAT[e].dit}`).join(" · ")}
        </p>
      </section>

      <section className="carte">
        <h3>Les domaines</h3>
        <div className="seg" style={{ marginBottom: 8 }}>
          <button type="button" style={bouton(!domaineVu)} onClick={() => setDomaineVu(undefined)}>
            Tous ({tous.length})
          </button>
          {domaines.map((d) => (
            <button
              key={d.lettre}
              type="button"
              style={bouton(domaineVu === d.lettre)}
              onClick={() => setDomaineVu(domaineVu === d.lettre ? undefined : d.lettre)}
            >
              {d.nom} ({d.criteres.length})
            </button>
          ))}
        </div>
        <div className="seg">
          <button type="button" style={bouton(!etatVu)} onClick={() => setEtatVu(undefined)}>
            Tous les états
          </button>
          {ORDRE.map((e) => (
            <button
              key={e}
              type="button"
              style={bouton(etatVu === e)}
              onClick={() => setEtatVu(etatVu === e ? undefined : e)}
            >
              {ETAT[e].signe} {ETAT[e].nom} ({compte(e)})
            </button>
          ))}
        </div>
      </section>

      {vus.map((d) => (
        <section className="carte" key={d.lettre}>
          <h3>
            {d.lettre}. {d.nom}
          </h3>
          <ul style={{ margin: 0, padding: 0 }}>
            {d.criteres.map((c) => (
              <LigneDeCritere key={c.code} critere={c} />
            ))}
          </ul>
        </section>
      ))}

      {/*
        DE QUOI ALLER VÉRIFIER, et c'est le point le plus utile de la page pour
        qui la lit sans confiance préalable. Le référentiel cite ses sources —
        tables de production, littérature agronomique — critère par critère ;
        les recopier ici en ferait une liste à tenir, et une liste à tenir
        dérive. Un lien vers le document, lui, ne dérive pas.
      */}
      <p className="glose" style={{ minHeight: 0, maxWidth: 760 }}>
        Cette page est extraite du dépôt à chaque construction : les critères viennent de{" "}
        <a href={`${DEPOT}/blob/main/docs/realisme.md`} style={{ color: "var(--foret)" }}>
          <code>docs/realisme.md</code>
        </a>
        , les étapes de la semaine de l'ordre réel des sections de{" "}
        <a href={`${DEPOT}/blob/main/src/engine/tick.ts`} style={{ color: "var(--foret)" }}>
          <code>src/engine/tick.ts</code>
        </a>
        . Rien n'y est tenu à la main, donc rien ne peut y dériver. Le référentiel dit aussi d'où
        viennent les chiffres — tables de production, littérature agronomique — critère par critère,
        et les essais qui les tiennent sont dans le même dépôt.
      </p>
    </div>
  );
}
