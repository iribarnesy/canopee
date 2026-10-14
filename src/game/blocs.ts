/**
 * **Où dort le bloc de reprise de chaque partie** (#338) : dans IndexedDB, à
 * côté de la liste des parties que `localStorage` garde (`sauvegardes.ts`).
 *
 * Le bloc pèse des mégaoctets là où la sauvegarde pèse des kilo-octets
 * (`reprise.ts`) : il n'a pas sa place dans les cinq mégaoctets que
 * `localStorage` accorde au site entier. Il est rangé sous l'identifiant de
 * l'entrée de la liste, celui-là même où l'autosave écrit, et **compressé** :
 * les cellules d'une parcelle se ressemblent, et gzip divise le bloc par trois
 * ou quatre (mesures dans `docs/agents/moteur-evolution.md`).
 *
 * **La compression se fait ici, sur le fil principal, et pas dans le worker.**
 * La faire dans le worker rendait la sauvegarde asynchrone : la réponse à
 * `requestSave` attendait la compression, et tout ce qui compte sur cette
 * réponse — quitter, les essais — avec elle. Ici, elle se fait par morceaux
 * (le flux lit le bloc par tranches), une fois par semaine de jeu au plus.
 *
 * **Rien ici ne doit pouvoir casser une partie.** Une base indisponible
 * (navigation privée, quota, navigateur sans IndexedDB), une écriture qui
 * échoue, un flux tronqué : chaque fonction avale l'erreur et rend `undefined`.
 * Le pire qui puisse arriver est une reprise par le journal, c'est-à-dire la
 * reprise d'avant ce lot.
 */

const BASE = "canopee";
const MAGASIN = "blocsDeReprise";

/** Les deux premiers octets de tout flux gzip (RFC 1952, §2.3.1). */
const GZIP = [0x1f, 0x8b] as const;

/**
 * Compresse un bloc. Sans `CompressionStream` — un navigateur trop ancien —, il
 * est rangé tel quel, et `decompresser` le reconnaît à son premier octet.
 */
export async function compresser(octets: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") return octets;
  const flux = new Blob([octets as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

/** Rend le bloc d'origine, ou `undefined` si le flux est tronqué ou illisible. */
export async function decompresser(octets: Uint8Array): Promise<Uint8Array | undefined> {
  if (octets[0] !== GZIP[0] || octets[1] !== GZIP[1]) return octets;
  if (typeof DecompressionStream === "undefined") return undefined;
  try {
    const flux = new Blob([octets as Uint8Array<ArrayBuffer>])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(flux).arrayBuffer());
  } catch {
    return undefined;
  }
}

let ouverture: Promise<IDBDatabase | undefined> | undefined;

/** Une seule connexion pour toute la page. */
function base(): Promise<IDBDatabase | undefined> {
  if (ouverture) return ouverture;
  ouverture = new Promise((resoudre) => {
    try {
      if (typeof indexedDB === "undefined") return resoudre(undefined);
      const demande = indexedDB.open(BASE, 1);
      demande.onupgradeneeded = () => {
        if (!demande.result.objectStoreNames.contains(MAGASIN))
          demande.result.createObjectStore(MAGASIN);
      };
      demande.onsuccess = () => resoudre(demande.result);
      demande.onerror = () => resoudre(undefined);
      demande.onblocked = () => resoudre(undefined);
    } catch {
      resoudre(undefined);
    }
  });
  return ouverture;
}

/**
 * **Une file, et une seule** : les blocs s'écrivent dans l'ordre où ils sont
 * arrivés, et une lecture attend les écritures demandées avant elle. Deux
 * compressions menées de front pourraient finir dans l'autre ordre, et le bloc
 * d'une semaine plus ancienne écraser le dernier ; une reprise lancée sitôt
 * après avoir quitté lirait le bloc d'avant.
 */
let file: Promise<unknown> = Promise.resolve();
function enFile<T>(travail: () => Promise<T>): Promise<T> {
  const suite = file.then(travail, travail);
  file = suite.catch(() => undefined);
  return suite;
}

/**
 * Range le bloc d'une partie, et oublie ceux des parties qui ne sont plus dans
 * la liste — elle en garde huit (`PARTIES_GARDEES`), et un bloc orphelin
 * pèserait des mégaoctets pour rien.
 */
export function rangerLeBloc(
  id: string,
  octets: Uint8Array,
  idsGardes: readonly string[],
): Promise<void> {
  return enFile(async () => {
    try {
      const db = await base();
      if (!db) return;
      const comprime = await compresser(octets);
      const tx = db.transaction(MAGASIN, "readwrite");
      const magasin = tx.objectStore(MAGASIN);
      magasin.put(comprime, id);
      const gardes = new Set([...idsGardes, id]);
      const cles = magasin.getAllKeys();
      cles.onsuccess = () => {
        for (const cle of cles.result) {
          if (typeof cle === "string" && !gardes.has(cle)) magasin.delete(cle);
        }
      };
      await new Promise<void>((resoudre) => {
        tx.oncomplete = () => resoudre();
        tx.onerror = () => resoudre();
        tx.onabort = () => resoudre();
      });
    } catch {
      /* quota, base fermée : la reprise rejouera le journal */
    }
  });
}

/** Le bloc rangé pour cette partie, décompressé, s'il y en a un. */
export function lireLeBloc(id: string): Promise<Uint8Array | undefined> {
  return enFile(async () => {
    try {
      const db = await base();
      if (!db) return undefined;
      const lecture = db.transaction(MAGASIN, "readonly").objectStore(MAGASIN).get(id);
      const comprime = await new Promise<unknown>((resoudre) => {
        lecture.onsuccess = () => resoudre(lecture.result);
        lecture.onerror = () => resoudre(undefined);
      });
      return comprime instanceof Uint8Array ? await decompresser(comprime) : undefined;
    } catch {
      return undefined;
    }
  });
}
