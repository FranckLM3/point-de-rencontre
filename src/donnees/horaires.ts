export interface Station {
  nom: string
  lat: number
  lon: number
  /** Au moins un train ou car s'y arrête le jour type. */
  desservie: boolean
  /** Au moins une connexion non-autocar (absent sur des données générées avant ce champ). */
  train?: boolean
}

export interface Ligne {
  minutes: Uint16Array
  km: Uint16Array
  grandeLigne: Uint8Array
  /** Nombre de changements de train, 0 à 15. */
  correspondances: Uint8Array
  /** Gare précédente sur le trajet le plus rapide vers chaque gare ; INJOIGNABLE pour la source et une gare injoignable. */
  precedente: Uint16Array
}

export interface Voisins {
  gares: Uint16Array
  hectometres: Uint16Array
}

export interface Horaires {
  stations: Station[]
  voisins: Voisins
  /** Charge (une fois) les lignes demandées. */
  lignes(indices: number[]): Promise<void>
  /** Ligne déjà chargée, sinon undefined. */
  ligne(indice: number): Ligne | undefined
}

export const INJOIGNABLE = 65535
export const NB_VOISINS = 3
const OCTETS_PAR_GARE = 7
/** Bit 0 du drapeau : une grande ligne est empruntée. */
const GRANDE_LIGNE = 1
/** Bits 1 à 4 du drapeau : nombre de correspondances. */
const CORRESPONDANCES = 15
const MESSAGE = 'Horaires des trains indisponibles pour le moment.'

export function decoderLigne(tampon: ArrayBuffer): Ligne {
  if (tampon.byteLength % OCTETS_PAR_GARE !== 0) throw new Error(`Fichier d’horaires invalide (${tampon.byteLength} octets).`)
  const n = tampon.byteLength / OCTETS_PAR_GARE
  const v = new DataView(tampon)
  const ligne: Ligne = {
    minutes: new Uint16Array(n), km: new Uint16Array(n),
    grandeLigne: new Uint8Array(n), correspondances: new Uint8Array(n),
    precedente: new Uint16Array(n),
  }
  for (let j = 0; j < n; j++) {
    ligne.minutes[j] = v.getUint16(j * OCTETS_PAR_GARE, true)
    ligne.km[j] = v.getUint16(j * OCTETS_PAR_GARE + 2, true)
    const drapeaux = v.getUint8(j * OCTETS_PAR_GARE + 4)
    ligne.grandeLigne[j] = drapeaux & GRANDE_LIGNE
    ligne.correspondances[j] = (drapeaux >> 1) & CORRESPONDANCES
    ligne.precedente[j] = v.getUint16(j * OCTETS_PAR_GARE + 5, true)
  }
  return ligne
}

export function decoderVoisins(tampon: ArrayBuffer): Voisins {
  const n = Math.floor(tampon.byteLength / 4)
  const v = new DataView(tampon)
  const gares = new Uint16Array(n)
  const hectometres = new Uint16Array(n)
  for (let i = 0; i < n; i++) {
    gares[i] = v.getUint16(i * 4, true)
    hectometres[i] = v.getUint16(i * 4 + 2, true)
  }
  return { gares, hectometres }
}

async function lire(chemin: string): Promise<Response> {
  let reponse: Response
  try {
    reponse = await fetch(`${import.meta.env.BASE_URL}data/tc/${chemin}`)
  } catch (e) {
    console.error('Horaires : réseau', e)
    throw new Error(MESSAGE)
  }
  if (!reponse.ok) {
    console.error(`Horaires : ${chemin} HTTP ${reponse.status}`)
    throw new Error(MESSAGE)
  }
  return reponse
}

export async function creerHoraires(): Promise<Horaires> {
  const [stations, voisins] = await Promise.all([
    lire('stations.json').then((r) => r.json() as Promise<Station[]>),
    lire('voisins-4km.bin').then((r) => r.arrayBuffer()).then(decoderVoisins),
  ])
  const chargees = new Map<number, Ligne>()
  const enCours = new Map<number, Promise<void>>()
  const charger = (i: number): Promise<void> => {
    if (chargees.has(i)) return Promise.resolve()
    const deja = enCours.get(i)
    if (deja) return deja
    const p = lire(`lignes/${i}.bin`)
      .then((r) => r.arrayBuffer())
      .then((b) => { chargees.set(i, decoderLigne(b)) })
      .finally(() => enCours.delete(i))
    enCours.set(i, p)
    return p
  }
  return {
    stations,
    voisins,
    lignes: async (indices) => { await Promise.all([...new Set(indices)].map(charger)) },
    ligne: (i) => chargees.get(i),
  }
}
