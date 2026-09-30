/**
 * **Le mixeur** : les couches de la parcelle, jouées au niveau que
 * `niveaux.ts` dit (#129, lot L9).
 *
 * Il ne décide de rien. Il charge les sons une fois, fait boucler les
 * ambiances, glisse leur volume vers la cible — jamais d'à-coup, un gain qui
 * saute s'entend comme un clic — et lance les cris des oiseaux à la cadence
 * demandée, à intervalles irréguliers pour qu'on n'entende pas une horloge.
 *
 * **Il démarre au premier geste du joueur**, pas avant : les navigateurs
 * refusent qu'une page se mette à jouer d'elle-même, et un contexte audio créé
 * trop tôt reste suspendu. Le son est allumé par défaut ; c'est l'interface qui
 * le coupe, et le réglage se garde.
 *
 * Le contexte est **injecté** : le jeu donne un `AudioContext`, l'essai de
 * navigateur un `OfflineAudioContext`, qui rend le mélange dans un tampon
 * qu'on peut mesurer au lieu de l'écouter.
 */

import { hacher } from "../../render/hachage";
import { AMBIANCES, type Ambiance, type Niveaux, VOIX, type Voix } from "./niveaux";

/** Temps de glissement d'un volume vers sa cible, s. */
export const GLISSEMENT_S = 0.8;
/** Niveau maximal de chaque couche dans le mélange : le vent ne couvre pas les oiseaux. */
export const POIDS: Record<Ambiance | Voix, number> = {
  vent: 0.55,
  pluie: 0.6,
  ruisseau: 0.45,
  feu: 0.8,
  tronconneuse: 0.5,
  mesange_bleue: 0.5,
  mesange_charbonniere: 0.5,
  pic_epeiche: 0.45,
  buse_variable: 0.4,
  geai: 0.45,
};

export type UrlsDesSons = Readonly<Record<Ambiance | Voix, string>>;

interface Couche {
  gain: GainNode;
  source?: AudioBufferSourceNode;
}

export class MixeurDuSon {
  private maitre?: GainNode;
  private readonly tampons = new Map<string, AudioBuffer>();
  private readonly couches = new Map<Ambiance, Couche>();
  private readonly prochainCri = new Map<Voix, number>();
  private cris = 0;
  private volume = 0.7;
  private coupe = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly urls: UrlsDesSons,
    private readonly charger: (url: string) => Promise<ArrayBuffer> = async (url) =>
      (await fetch(url)).arrayBuffer(),
  ) {}

  /** Charge les sons et pose les couches, au volume nul. */
  async preparer(): Promise<void> {
    this.maitre = this.ctx.createGain();
    this.maitre.gain.value = this.coupe ? 0 : this.volume;
    this.maitre.connect(this.ctx.destination);
    await Promise.all(
      [...AMBIANCES, ...VOIX].map(async (nom) => {
        try {
          const brut = await this.charger(this.urls[nom]);
          this.tampons.set(nom, await this.ctx.decodeAudioData(brut));
        } catch {
          // Un son qui ne se charge pas — un navigateur qui ne lit pas l'Ogg —
          // se tait. Le reste joue.
        }
      }),
    );
    for (const nom of AMBIANCES) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.maitre);
      const tampon = this.tampons.get(nom);
      const couche: Couche = { gain };
      if (tampon) {
        const source = this.ctx.createBufferSource();
        source.buffer = tampon;
        source.loop = true;
        source.connect(gain);
        // Chaque boucle part d'un point à elle : deux couches de même durée ne
        // repassent pas ensemble par leur début.
        source.start(0, hacher(AMBIANCES.indexOf(nom), 0, 0x50e1) * tampon.duration);
        couche.source = source;
      }
      this.couches.set(nom, couche);
    }
  }

  /** Volume général ∈ [0,1], et coupure. Glisse, comme le reste. */
  regler(volume: number, coupe: boolean): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.coupe = coupe;
    this.maitre?.gain.setTargetAtTime(coupe ? 0 : this.volume, this.ctx.currentTime, 0.1);
  }

  /**
   * Suivre les niveaux de cet instant. Appelé quelques fois par seconde ; les
   * volumes glissent, les cris se lancent quand leur heure est venue.
   */
  suivre(niveaux: Niveaux): void {
    if (!this.maitre) return;
    const t = this.ctx.currentTime;
    for (const nom of AMBIANCES) {
      const couche = this.couches.get(nom);
      if (!couche) continue;
      couche.gain.gain.setTargetAtTime(niveaux.ambiances[nom] * POIDS[nom], t, GLISSEMENT_S / 3);
    }
    for (const voix of VOIX) {
      const cadence = niveaux.cadences[voix];
      if (!(cadence > 0)) {
        this.prochainCri.delete(voix);
        continue;
      }
      const moyenS = 60 / cadence;
      const prochain = this.prochainCri.get(voix);
      if (prochain === undefined) {
        // Le premier cri ne tombe pas à l'instant même où l'oiseau arrive.
        this.prochainCri.set(voix, t + moyenS * hacher(VOIX.indexOf(voix), this.cris, 0x50e2));
        continue;
      }
      if (t < prochain) continue;
      this.crier(voix);
      // Irrégulier : entre la moitié et une fois et demie l'intervalle moyen.
      this.prochainCri.set(
        voix,
        t + moyenS * (0.5 + hacher(VOIX.indexOf(voix), this.cris, 0x50e3)),
      );
    }
  }

  private crier(voix: Voix): void {
    const tampon = this.tampons.get(voix);
    if (!tampon || !this.maitre) return;
    this.cris++;
    const source = this.ctx.createBufferSource();
    source.buffer = tampon;
    // Un rien plus haut ou plus bas d'un cri à l'autre : deux oiseaux ne
    // chantent pas à la même hauteur.
    source.playbackRate.value = 0.94 + 0.12 * hacher(this.cris, VOIX.indexOf(voix), 0x50e4);
    const gain = this.ctx.createGain();
    gain.gain.value = POIDS[voix] * (0.6 + 0.4 * hacher(this.cris, 1, 0x50e5));
    source.connect(gain);
    gain.connect(this.maitre);
    source.start();
  }

  /** Nombre de cris lancés depuis le début : ce que l'essai compte. */
  get crisLances(): number {
    return this.cris;
  }
}
