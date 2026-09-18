import type { Ami } from '../types'

export interface PointEcran {
  id: string
  x: number
  y: number
}

export interface GrappeEcran {
  x: number
  y: number
  membres: string[]
}

/**
 * Regroupement glouton en espace écran : un point rejoint la première grappe assez proche
 * (distance au centre ≤ `rayon` px), sinon il fonde sa propre grappe. Le centre d'une grappe
 * est la moyenne de ses membres, recalculée à chaque ajout.
 */
export function grouperEcran(points: PointEcran[], rayon: number): GrappeEcran[] {
  const grappes: GrappeEcran[] = []
  for (const p of points) {
    const proche = grappes.find((g) => Math.hypot(g.x - p.x, g.y - p.y) <= rayon)
    if (proche) {
      const n = proche.membres.length
      proche.x = (proche.x * n + p.x) / (n + 1)
      proche.y = (proche.y * n + p.y) / (n + 1)
      proche.membres.push(p.id)
    } else {
      grappes.push({ x: p.x, y: p.y, membres: [p.id] })
    }
  }
  return grappes
}

const MAX_NOMS = 8

/** Liste de noms pour l'infobulle d'une grappe : au plus 8, puis « et N autres ». */
export function listeNoms(amis: Ami[]): string {
  const noms = amis.map((a) => a.nom)
  if (noms.length <= MAX_NOMS) return noms.join(', ')
  return `${noms.slice(0, MAX_NOMS).join(', ')} et ${noms.length - MAX_NOMS} autres`
}
