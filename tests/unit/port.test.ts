import { describe, expect, it } from "vitest";
import type { Port } from "../../src/render/arbres/fiche";
import { contraindre, plongeeTerminale, rayonRelatif } from "../../src/render/arbres/port";
import { engendrer, rayonAtteintM, type Segment } from "../../src/render/arbres/squelette";

const TOUS: Port[] = ["conique", "boule", "gobelet", "etage", "fastigie", "retombant"];

const feuillu = {
  angleDeg: 42,
  divergenceDeg: 137,
  ratioLongueur: 0.72,
  dominance: 0.45,
  branchesParNoeud: 3,
  conicite: 0.82,
  tortuosite: 0.3,
};

/** Le squelette d'essai, et les bornes de son houppier. */
function ramure(): { segments: Segment[]; base: number; sommet: number } {
  const segments = engendrer({ id: 77, hauteurM: 18, houppierRatio: 0.35 }, feuillu);
  const houppier = segments.filter((s) => s.ordre >= 1);
  const base = Math.min(...houppier.map((s) => s.depart.y));
  const sommet = Math.max(...houppier.map((s) => s.arrivee.y));
  return { segments, base, sommet };
}

describe("l'enveloppe est un profil déclaré, pas un espoir", () => {
  it("rend un rayon fini et positif partout, pour les six ports", () => {
    for (const port of TOUS) {
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const r = rayonRelatif(port, t);
        expect(Number.isFinite(r)).toBe(true);
        expect(r).toBeGreaterThan(0);
        expect(r).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it("borne les entrées hors de [0,1] au lieu de partir en vrille", () => {
    for (const port of TOUS) {
      expect(rayonRelatif(port, -3)).toBeCloseTo(rayonRelatif(port, 0));
      expect(rayonRelatif(port, 9)).toBeCloseTo(rayonRelatif(port, 1));
    }
  });

  it("le cône se referme en montant, la boule est maximale au milieu", () => {
    expect(rayonRelatif("conique", 0)).toBeGreaterThan(rayonRelatif("conique", 0.9));
    const milieu = rayonRelatif("boule", 0.5);
    expect(milieu).toBeGreaterThan(rayonRelatif("boule", 0));
    expect(milieu).toBeGreaterThan(rayonRelatif("boule", 1));
  });

  it("le gobelet s'OUVRE en montant — c'est ce qui le sépare d'une boule", () => {
    expect(rayonRelatif("gobelet", 1)).toBeGreaterThan(rayonRelatif("gobelet", 0));
  });

  it("**l'étagé s'écourte au sommet, et par contrainte explicite**", () => {
    // Le résultat de L0 : « sans écourtement explicite des étages, ce pin fait
    // une boule ». Le plateau reste large presque jusqu'en haut, puis chute.
    expect(rayonRelatif("etage", 0.6)).toBeGreaterThan(0.85);
    expect(rayonRelatif("etage", 1)).toBeLessThan(0.5);
  });

  it("le fastigié est le plus étroit des six EN MOYENNE", () => {
    // « Partout » serait faux et c'est instructif : au sommet, un cône est plus
    // étroit qu'un peuplier. Ce qui distingue le fastigié n'est pas d'être
    // pointu mais d'être étroit SUR TOUTE SA HAUTEUR — donc c'est la moyenne
    // qu'il faut regarder, pas le maximum ponctuel.
    const moyenne = (port: Port) => {
      let somme = 0;
      let n = 0;
      for (let t = 0; t <= 1.0001; t += 0.05) {
        somme += rayonRelatif(port, t);
        n++;
      }
      return somme / n;
    };
    const fastigie = moyenne("fastigie");
    for (const port of TOUS) {
      if (port === "fastigie") continue;
      expect(fastigie).toBeLessThan(moyenne(port));
    }
  });
});

describe("la plongée des rameaux terminaux", () => {
  it("n'existe que pour les ports qui retombent", () => {
    expect(plongeeTerminale("retombant")).toBeGreaterThan(0);
    expect(plongeeTerminale("boule")).toBe(0);
    expect(plongeeTerminale("conique")).toBe(0);
  });

  it("**aucun réglage de branchement ne la donnerait**", () => {
    // Le branchement ne connaît que des angles d'INSERTION : une branche part
    // vers le haut et continue tout droit. Un rameau qui replonge après être
    // parti vers le haut n'est pas exprimable là-dedans, et c'est pour ça que
    // la plongée est ici. Ce test le constate sur les segments.
    const { segments, base, sommet } = ramure();
    const droit = contraindre(segments, "boule", base, sommet, 4);
    const pleureur = contraindre(segments, "retombant", base, sommet, 4);
    const hautDesBouts = (s: Segment[]) =>
      s.filter((x) => x.terminal).reduce((m, x) => m + x.arrivee.y, 0);
    expect(hautDesBouts(pleureur)).toBeLessThan(hautDesBouts(droit));
  });
});

describe("contraindre impose la forme, sans écrêter", () => {
  it("ramène la ramure dans le rayon voulu", () => {
    const { segments, base, sommet } = ramure();
    const rabattu = contraindre(segments, "boule", base, sommet, 2.5);
    // Le fût est laissé intact, donc on mesure le houppier seul.
    const houppier = rabattu.filter((s) => s.ordre >= 1);
    expect(rayonAtteintM(houppier)).toBeLessThan(2.6);
  });

  it("**élargit aussi**, et c'est ce qui manquait au premier jet", () => {
    // Une contrainte qui ne fait que resserrer ne sert à rien dans le cas qui
    // compte : la ramure d'un feuillu de dix-huit mètres fait 1,94 m de rayon
    // là où l'enveloppe en autorise 4, l'enveloppe ne mordait nulle part, et
    // les six ports rendaient le même arbre. Le profil doit s'IMPOSER.
    const { segments, base, sommet } = ramure();
    const naturel = rayonAtteintM(segments.filter((s) => s.ordre >= 1));
    const impose = rayonAtteintM(
      contraindre(segments, "boule", base, sommet, naturel * 2).filter((s) => s.ordre >= 1),
    );
    expect(impose).toBeGreaterThan(naturel * 1.4);
  });

  it("laisse le FÛT intact : un tronc n'est pas dans le houppier", () => {
    const { segments, base, sommet } = ramure();
    const rabattu = contraindre(segments, "conique", base, sommet, 0.5);
    const avant = segments.filter((s) => s.ordre === 0);
    const apres = rabattu.filter((s) => s.ordre === 0);
    expect(apres).toEqual(avant);
  });

  it("**ne tranche pas les branches** : aucun bout ne se retrouve collé au bord", () => {
    // Écrêter donnerait des branches coupées net à la surface de l'enveloppe,
    // toutes exactement au même rayon. La mise à l'échelle, elle, garde la
    // structure : les bouts se répartissent en profondeur.
    const { segments, base, sommet } = ramure();
    const rabattu = contraindre(segments, "boule", base, sommet, 2.5).filter((s) => s.terminal);
    const rayons = rabattu.map((s) => Math.hypot(s.arrivee.x, s.arrivee.z));
    const max = Math.max(...rayons);
    const auBord = rayons.filter((r) => r > max * 0.98).length;
    expect(auBord / rayons.length).toBeLessThan(0.5);
  });

  it("garde les proportions internes : une branche à mi-distance y reste", () => {
    // La mise à l'échelle ne doit pas défaire la structure. Deux branches dont
    // l'une est deux fois plus écartée que l'autre doivent le rester.
    const { segments, base, sommet } = ramure();
    const avant = segments.filter((s) => s.ordre >= 1);
    const apres = contraindre(segments, "boule", base, sommet, 3).filter((s) => s.ordre >= 1);
    // À hauteur comparable, le rapport des rayons est conservé.
    const memeTranche = avant
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => Math.abs(s.arrivee.y - (base + sommet) / 2) < 0.2)
      .slice(0, 20);
    expect(memeTranche.length).toBeGreaterThan(2);
    const rapport = memeTranche.map(({ s, i }) => {
      const r0 = Math.hypot(s.arrivee.x, s.arrivee.z);
      const a = apres[i];
      if (!a || r0 < 1e-6) return null;
      return Math.hypot(a.arrivee.x, a.arrivee.z) / r0;
    });
    const valides = rapport.filter((v): v is number => v !== null);
    for (const v of valides) expect(v).toBeCloseTo(valides[0] ?? 0, 1);
  });

  it("ne laisse rien dépasser du sommet", () => {
    const { segments, base, sommet } = ramure();
    for (const s of contraindre(segments, "conique", base, sommet, 3)) {
      expect(s.arrivee.y).toBeLessThanOrEqual(sommet + 1e-9);
    }
  });

  it("est déterministe", () => {
    const { segments, base, sommet } = ramure();
    expect(contraindre(segments, "etage", base, sommet, 3)).toEqual(
      contraindre(segments, "etage", base, sommet, 3),
    );
  });

  it("les six ports donnent six houppiers distincts", () => {
    // Le critère de fin de D4 : une essence n'est finie que si quelqu'un la
    // reconnaît. Ça commence par des ports qui ne se confondent pas.
    const { segments, base, sommet } = ramure();
    const signature = (port: Port) => {
      const h = contraindre(segments, port, base, sommet, 2).filter((s) => s.ordre >= 1);
      // Rayon moyen dans le tiers bas, au milieu, dans le tiers haut : trois
      // nombres qui décrivent une enveloppe.
      const tranche = (a: number, b: number) => {
        const dedans = h.filter(
          (s) =>
            s.arrivee.y >= base + (sommet - base) * a && s.arrivee.y < base + (sommet - base) * b,
        );
        if (dedans.length === 0) return 0;
        return dedans.reduce((m, s) => m + Math.hypot(s.arrivee.x, s.arrivee.z), 0) / dedans.length;
      };
      return [tranche(0, 0.33), tranche(0.33, 0.66), tranche(0.66, 1)]
        .map((v) => v.toFixed(2))
        .join("/");
    };
    const vues = new Set(TOUS.map(signature));
    expect(vues.size).toBe(TOUS.length);
  });
});
