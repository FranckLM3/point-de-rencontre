import { INJOIGNABLE } from '../donnees/horaires'
import type { Grandeur } from '../types'
import { coordonnees, type Grille } from './grille'

/** Couche voiture décodée : un point par point « en France » de la grille de 8 km, même ordre que `indexPointsFrance`. */
export interface Couche {
  minutes: Uint16Array
  km: Uint16Array
}

export interface ParametresPrix {
  /** Litres aux 100 km. */
  consommationL100: number
  /** Prix du litre (gazole, sp95 ou e10 selon le carburant choisi). */
  prixLitre: number
  /** Divise le prix affiché (réglage « personnes par voiture »). */
  personnesParVoiture: number
}

export const CONSOMMATION_DEFAUT = 6.5
export const PERSONNES_PAR_VOITURE_DEFAUT = 1

const SEUIL_PEAGE_KM = 80
const TAUX_PEAGE_EUR_KM = 0.09
const PART_DISTANCE_PEAGE = 0.7

/** Prix = carburant + péage estimé (0,09 €/km sur 70 % de la distance au-delà de 80 km), divisé par voiture. */
export function prixVoiture(km: number, p: ParametresPrix): number {
  const carburant = ((km * p.consommationL100) / 100) * p.prixLitre
  const distancePeage = Math.max(0, km - SEUIL_PEAGE_KM) * PART_DISTANCE_PEAGE
  const peage = distancePeage * TAUX_PEAGE_EUR_KM
  return (carburant + peage) / Math.max(1, p.personnesParVoiture)
}

/** Indice « compact » (place dans la couche stockée) de chaque point de la grille, -1 hors de France. */
export function indexPointsFrance(g: Grille): Int32Array {
  const index = new Int32Array(g.nx * g.ny).fill(-1)
  let compte = 0
  for (let i = 0; i < g.dedans.length; i++) {
    if (g.dedans[i] === 1) index[i] = compte++
  }
  return index
}

interface Voisin {
  indiceCompact: number
  poids: number
}

/** Les 4 points de la grille de 8 km encadrant (lon, lat), avec leur poids bilinéaire ; ceux hors de France sont omis. */
function voisins(g: Grille, index: Int32Array, lon: number, lat: number): Voisin[] {
  const colFloat = (lon - g.lon0) / g.pasLon
  const ligFloat = (lat - g.lat0) / g.pasLat
  const c0 = Math.floor(colFloat)
  const l0 = Math.floor(ligFloat)
  const fc = colFloat - c0
  const fl = ligFloat - l0
  const coins: [number, number, number][] = [
    [0, 0, (1 - fc) * (1 - fl)],
    [1, 0, fc * (1 - fl)],
    [0, 1, (1 - fc) * fl],
    [1, 1, fc * fl],
  ]
  const sortie: Voisin[] = []
  for (const [dc, dl, poids] of coins) {
    const c = c0 + dc
    const l = l0 + dl
    if (c < 0 || l < 0 || c >= g.nx || l >= g.ny) continue
    const indiceCompact = index[l * g.nx + c]!
    if (indiceCompact < 0) continue
    sortie.push({ indiceCompact, poids })
  }
  return sortie
}

export interface ValeurVoiture {
  minutes: number
  km: number
}

/**
 * Valeur en un point quelconque : interpolation bilinéaire des 4 points de 8 km voisins,
 * points injoignables ignorés, pondération renormalisée. `null` si aucun voisin n'est utilisable.
 */
export function valeurVoiture(g: Grille, index: Int32Array, couche: Couche, lon: number, lat: number): ValeurVoiture | null {
  let sommeMinutes = 0
  let sommeKm = 0
  let sommePoids = 0
  for (const v of voisins(g, index, lon, lat)) {
    const minutes = couche.minutes[v.indiceCompact]!
    if (minutes === INJOIGNABLE) continue
    sommeMinutes += minutes * v.poids
    sommeKm += couche.km[v.indiceCompact]! * v.poids
    sommePoids += v.poids
  }
  if (sommePoids === 0) return null
  return { minutes: sommeMinutes / sommePoids, km: sommeKm / sommePoids }
}

/** Couche pleine (grille de 4 km, NaN hors de France) : même forme que `coucheTc` et `distancesOiseau`. */
export function coucheVoiture(
  grille4: Grille,
  grille8: Grille,
  index8: Int32Array,
  couche: Couche,
  grandeur: Grandeur,
  parametres: ParametresPrix,
): Float32Array {
  const sortie = new Float32Array(grille4.nx * grille4.ny).fill(Number.NaN)
  for (let k = 0; k < sortie.length; k++) {
    if (grille4.dedans[k] !== 1) continue
    const [lon, lat] = coordonnees(grille4, k)
    const v = valeurVoiture(grille8, index8, couche, lon, lat)
    if (v === null) continue
    sortie[k] = grandeur === 'temps' ? v.minutes : prixVoiture(v.km, parametres)
  }
  return sortie
}
