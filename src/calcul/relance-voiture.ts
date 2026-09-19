import type { Ami } from '../types'

/**
 * Crocos en voiture dont la couche manque et qui n'ont pas encore été relancés pendant cette
 * session. Marque ceux qu'il rend comme tentés : un échec (quota, réseau) ne relance pas en boucle.
 */
export function aRelancer(amis: Ami[], couches: Set<string>, tentes: Set<string>): string[] {
  const ids = amis.filter((a) => a.transport === 'voiture' && !couches.has(a.id) && !tentes.has(a.id)).map((a) => a.id)
  for (const id of ids) tentes.add(id)
  return ids
}
