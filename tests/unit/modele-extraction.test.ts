/**
 * **Ce que la page** « **le modèle** » **lit du dépôt** (#224).
 *
 * L'essai a deux moitiés, et la seconde est la plus importante :
 *
 * 1. **sur du texte écrit à la main**, que l'extraction fait bien ce qu'on
 *    croit — y compris sur les pièges du vrai document (une barre dans un bloc
 *    de code, un titre qui déborde sur la ligne suivante) ;
 * 2. **sur les vrais fichiers du dépôt**, que ce qu'elle en tire concorde avec
 *    ce que le document dit de lui-même. Le référentiel porte son propre
 *    tableau de score ; si l'extraction comptait autrement, l'un des deux
 *    mentirait — et sur une page montrée à des tiers, c'est le genre de
 *    divergence qu'on ne voit jamais.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { criteresDuReferentiel, etapesDuTick } from "../../src/modele/extraction";

describe("les critères du référentiel", () => {
  it("lit un domaine et ses lignes", () => {
    const d = criteresDuReferentiel(`## A. Sol, eau, atmosphère

| # | Critère de réalité | État | Porté par / manque |
|---|---|---|---|
| A1 | L'eau du sol suit un bilan conservatif | ✅ | \`water.ts\` |
| A2 | Un sol engorgé asphyxie les racines | 🟡 | à faire |
| A3 | La foudre met le feu | ❌ | absent |
`);
    expect(d).toHaveLength(1);
    expect(d[0]?.nom).toBe("Sol, eau, atmosphère");
    expect(d[0]?.criteres.map((c) => c.etat)).toEqual(["couvert", "partiel", "absent"]);
    expect(d[0]?.criteres[0]?.porte).toBe("`water.ts`");
  });

  it("ne coupe pas sur une barre prise dans un bloc de code", () => {
    const d = criteresDuReferentiel(`## B. Lumière et structure

| B1 | Un couvert intercepte la lumière | ✅ | \`a | b\` ; \`light.test.ts\` |
`);
    expect(d[0]?.criteres[0]?.quoi).toBe("Un couvert intercepte la lumière");
    expect(d[0]?.criteres[0]?.porte).toBe("`a | b` ; `light.test.ts`");
  });

  it("ignore les lignes qui ne sont pas des critères du domaine ouvert", () => {
    const d = criteresDuReferentiel(`## C. Nutriments et cycles

| # | Critère | État | Porté par |
|---|---|---|---|
| A1 | une ligne d'un autre domaine | ✅ | rien |
| C1 | la vraie | ✅ | rien |
`);
    expect(d[0]?.criteres.map((c) => c.code)).toEqual(["C1"]);
  });

  it("laisse tomber un titre de section qui ne porte aucun critère", () => {
    expect(criteresDuReferentiel("## A. Un domaine vide\n\ndu texte\n")).toEqual([]);
  });
});

describe("les étapes du tick", () => {
  it("les rend dans l'ordre du FICHIER, pas dans celui des étiquettes", () => {
    // Le vrai tick porte « 7. Régénération » **avant** « 6 ter bis » : les
    // étiquettes écrites à la main ont dérivé, l'ordre du fichier non.
    const e = etapesDuTick(`
  // ── 5. Croissance ─────────────
  du code
  // ── 7. Régénération annuelle ──
  du code
  // ── 6 ter bis. La mémoire d'abri ──
`);
    expect(e.map((x) => x.titre)).toEqual([
      "Croissance",
      "Régénération annuelle",
      "La mémoire d'abri",
    ]);
    expect(e.map((x) => x.rang)).toEqual([1, 2, 3]);
  });

  it("sépare l'intitulé de son détail, et ramasse la suite du commentaire", () => {
    const e = etapesDuTick(`
  // ── 0. Lumière : au sol et par arbre
  //      **et** transpiration — l'effet nurse.
  const x = 1;
`);
    expect(e[0]?.titre).toBe("Lumière");
    expect(e[0]?.detail).toBe("au sol et par arbre **et** transpiration — l'effet nurse.");
  });

  it("retire les renvois internes, et garde les parenthèses qui disent quelque chose", () => {
    const e = etapesDuTick(`
  // ── 6 bis. Le feu (§7.4, ch5) ───
  // ── 3. Prélèvements, en deux passes (ordre-indépendant) ──
  // ── 9. La tempête (issue #55) ──
`);
    expect(e.map((x) => x.titre)).toEqual([
      "Le feu",
      "Prélèvements, en deux passes (ordre-indépendant)",
      "La tempête",
    ]);
  });
});

describe("sur les vrais fichiers du dépôt", () => {
  const md = readFileSync("docs/realisme.md", "utf8");
  const domaines = criteresDuReferentiel(md);
  const criteres = domaines.flatMap((d) => d.criteres);

  it("compte exactement ce que le référentiel dit de lui-même", () => {
    // La ligne « Total » du tableau de score, recomptée par
    // `scripts/recompte-realisme.py` à chaque vérification.
    const total =
      /\|\s*\*\*Total\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|/.exec(
        md,
      );
    expect(total, "le tableau de score du référentiel a changé de forme").not.toBeNull();
    const [pleins, partiels, absents, somme] = (total ?? []).slice(1).map(Number);
    expect(criteres.filter((c) => c.etat === "couvert")).toHaveLength(pleins ?? -1);
    expect(criteres.filter((c) => c.etat === "partiel")).toHaveLength(partiels ?? -1);
    expect(criteres.filter((c) => c.etat === "absent")).toHaveLength(absents ?? -1);
    expect(criteres).toHaveLength(somme ?? -1);
  });

  it("donne à chaque critère une phrase et un code", () => {
    for (const c of criteres) {
      expect(c.quoi.length, c.code).toBeGreaterThan(10);
      expect(c.code).toMatch(/^[A-J]\d+$/);
    }
  });

  it("tire du tick assez d'étapes pour qu'une page ait du sens", () => {
    const e = etapesDuTick(readFileSync("src/engine/tick.ts", "utf8"));
    // Le même plancher que celui du greffon de `vite.config.ts` : si la
    // convention de commentaire change, la page se viderait en silence.
    expect(e.length).toBeGreaterThanOrEqual(15);
    for (const x of e) expect(x.titre.length, `étape ${x.rang}`).toBeGreaterThan(3);
  });
});
