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

export const pasTranches = (u: Unite): number => PAS[u]
export const maximaProposes = (u: Unite): number[] => MAXIMA[u]
