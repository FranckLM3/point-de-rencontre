import type { Unite } from '../calcul/unites'
import type { Ami, Critere } from '../types'
import { echapper, valeur } from './format'
import { pictoTransport } from './icones'

export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean)
  const lettres = mots.length > 1 ? mots[0]![0]! + mots[mots.length - 1]![0]! : (mots[0] ?? '?').slice(0, 2)
  return lettres.toUpperCase()
}

export interface Point {
  lat: number
  lon: number
  amis: Ami[]
}

/** Regroupe les personnes à la même adresse (coordonnées identiques à 5 décimales). */
export function grouperParPosition(amis: Ami[]): Point[] {
  const points = new Map<string, Point>()
  for (const a of amis) {
    const cle = `${a.lat.toFixed(5)},${a.lon.toFixed(5)}`
    const point = points.get(cle) ?? { lat: a.lat, lon: a.lon, amis: [] }
    points.set(cle, { ...point, amis: [...point.amis, a] })
  }
  return [...points.values()]
}

export const etiquette = (p: Point): string => (p.amis.length > 1 ? String(p.amis.length) : initiales(p.amis[0]!.nom))

/** HTML sûr : un nom et son moyen de transport (pictogramme) par ligne. */
export const infobulleMarqueur = (p: Point): string =>
  p.amis.map((a) => `${echapper(a.nom)} ${pictoTransport(a.transport)}`).join('<br>')

export const infobulleCentre = (v: number, critere: Critere, unite: Unite = 'km'): string =>
  `Le repaire : ${valeur(v, unite)} ${critere === 'pire' ? 'au pire' : 'en moyenne'}`
