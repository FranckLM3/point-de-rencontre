// Fonctions pures : aucune dépendance à Deno ni au navigateur, pour être testées
// à la fois par `deno test` (CI de la fonction Edge) et par Vitest (Node), utile
// tant que Deno n'est pas installé en local.

/** 65535 = injoignable (même convention que les horaires, src/donnees/horaires.ts). */
export const INJOIGNABLE = 65535

/** Destinations par appel à la matrice ORS : la limite est 3500 couples (1 seule source), une marge de 1 est gardée. */
export const TAILLE_PAQUET = 3499

export interface Point {
  lon: number
  lat: number
}

export interface Paquet {
  debut: number
  fin: number
}

/** Arrondit à 5 décimales (environ 1 m) : assez pour détecter un vrai changement d'adresse. */
export function arrondir5(x: number): number {
  return Math.round(x * 1e5) / 1e5
}

/** Clé de version d'une couche : recalcul seulement si l'adresse (à 5 décimales) ou la grille change. */
export function calculerCle(lat: number, lon: number, versionGrille: string): string {
  return `${arrondir5(lat)},${arrondir5(lon)},${versionGrille}`
}

/** Découpe `n` destinations en paquets d'au plus `taille` (limite de la matrice ORS). */
export function decouperEnPaquets(n: number, taille = TAILLE_PAQUET): Paquet[] {
  if (n <= 0) return []
  const paquets: Paquet[] = []
  for (let debut = 0; debut < n; debut += taille) paquets.push({ debut, fin: Math.min(debut + taille, n) })
  return paquets
}

/** Corps de la requête matrice ORS pour un paquet : la personne en source (indice 0), un point par destination. */
export function corpsMatrice(personne: Point, points: Point[], paquet: Paquet): unknown {
  const sous = points.slice(paquet.debut, paquet.fin)
  return {
    locations: [[personne.lon, personne.lat], ...sous.map((p): [number, number] => [p.lon, p.lat])],
    sources: [0],
    destinations: sous.map((_, i) => i + 1),
    metrics: ['duration', 'distance'],
    units: 'km',
  }
}

/** Minutes arrondies, plafonnées juste sous la valeur réservée à l'injoignable. */
export function versMinutes(secondes: number | null): number {
  if (secondes === null || !Number.isFinite(secondes)) return INJOIGNABLE
  return Math.min(Math.round(secondes / 60), INJOIGNABLE - 1)
}

/** Kilomètres arrondis (la matrice ORS rend déjà des km avec `units: 'km'`). */
export function versKm(km: number | null): number {
  if (km === null || !Number.isFinite(km)) return INJOIGNABLE
  return Math.min(Math.round(km), INJOIGNABLE - 1)
}

/** Encode minutes et km en petit-boutiste sur 2 octets (même convention que decoderLigne, src/donnees/horaires.ts). */
export function encoderCouche(minutes: number[], km: number[]): { minutes: Uint8Array; km: Uint8Array } {
  if (minutes.length !== km.length) throw new Error('minutes et km doivent avoir la même longueur.')
  const n = minutes.length
  const octetsMinutes = new Uint8Array(n * 2)
  const octetsKm = new Uint8Array(n * 2)
  const vMinutes = new DataView(octetsMinutes.buffer)
  const vKm = new DataView(octetsKm.buffer)
  for (let i = 0; i < n; i++) {
    vMinutes.setUint16(i * 2, minutes[i]!, true)
    vKm.setUint16(i * 2, km[i]!, true)
  }
  return { minutes: octetsMinutes, km: octetsKm }
}

/** Représentation textuelle `bytea` acceptée par Postgres (format hexadécimal en entrée PostgREST). */
export function versBytea(octets: Uint8Array): string {
  let hex = ''
  for (const o of octets) hex += o.toString(16).padStart(2, '0')
  return `\\x${hex}`
}

export interface ResultatPaquet {
  paquet: Paquet
  durations: (number | null)[]
  distances: (number | null)[]
}

/** Assemble les résultats des paquets de matrice dans l'ordre des points ; un point non couvert reste injoignable. */
export function assemblerResultats(n: number, resultats: ResultatPaquet[]): { minutes: number[]; km: number[] } {
  const minutes = new Array<number>(n).fill(INJOIGNABLE)
  const km = new Array<number>(n).fill(INJOIGNABLE)
  for (const { paquet, durations, distances } of resultats) {
    for (let i = 0; i < paquet.fin - paquet.debut; i++) {
      minutes[paquet.debut + i] = versMinutes(durations[i] ?? null)
      km[paquet.debut + i] = versKm(distances[i] ?? null)
    }
  }
  return { minutes, km }
}
