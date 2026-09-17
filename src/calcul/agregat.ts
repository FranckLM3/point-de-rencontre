import type { Critere } from '../types'
import { haversineKm } from './geo'
import { coordonnees, type Grille } from './grille'

export function distancesOiseau(g: Grille, lat: number, lon: number): Float32Array {
  const sortie = new Float32Array(g.nx * g.ny).fill(Number.NaN)
  for (let i = 0; i < sortie.length; i++) {
    if (g.dedans[i] !== 1) continue
    const [plon, plat] = coordonnees(g, i)
    sortie[i] = haversineKm(lat, lon, plat, plon)
  }
  return sortie
}

function agregerPoint(couches: Float32Array[], i: number, critere: Critere): number {
  let somme = 0
  let pire = -Infinity
  for (const couche of couches) {
    const v = couche[i]!
    if (Number.isNaN(v)) return Number.NaN
    somme += v
    if (v > pire) pire = v
  }
  return critere === 'moyenne' ? somme / couches.length : pire
}

/** Agrège des couches alignées ; `taille` sert quand la liste est vide. */
export function agreger(couches: Float32Array[], critere: Critere, taille = couches[0]?.length ?? 0): Float32Array {
  const sortie = new Float32Array(taille).fill(Number.NaN)
  if (couches.length === 0) return sortie
  for (let i = 0; i < taille; i++) sortie[i] = agregerPoint(couches, i, critere)
  return sortie
}

export function meilleurIndice(valeurs: Float32Array): number {
  let meilleur = -1
  let min = Infinity
  for (let i = 0; i < valeurs.length; i++) {
    const v = valeurs[i]!
    if (v < min) {
      min = v
      meilleur = i
    }
  }
  return meilleur
}
