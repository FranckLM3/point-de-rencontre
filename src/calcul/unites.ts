import type { Grandeur, Mode } from '../types'

export type Unite = 'km' | 'min' | 'eur'

export function uniteDe(mode: Mode, grandeur: Grandeur): Unite {
  if (mode === 'oiseau') return 'km'
  return grandeur === 'temps' ? 'min' : 'eur'
}

const PAS: Record<Unite, number> = { km: 100, min: 60, eur: 20 }
const MAXIMA: Record<Unite, number[]> = {
  km: [100, 200, 300, 400, 500, 700],
  min: [60, 120, 180, 240, 300, 360],
  eur: [20, 40, 60, 80, 100, 150],
}

/** En deçà, deux lieux se valent : nos temps et nos prix sont des estimations, pas des horaires exacts. */
const ECART_EQUIVALENT: Record<Unite, number> = { km: 20, min: 10, eur: 5 }

export const ecartEquivalent = (u: Unite): number => ECART_EQUIVALENT[u]

export const pasTranches = (u: Unite): number => PAS[u]
export const maximaProposes = (u: Unite): number[] => MAXIMA[u]
