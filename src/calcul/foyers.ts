import type { Ami } from '../types'

/**
 * Un trajet par foyer : les personnes qui partent de la même adresse avec le même moyen voyagent
 * ensemble, donc leur trajet ne doit compter qu'une fois dans la moyenne (sinon leur ville pèse
 * double). L'ordre d'origine est gardé ; les noms réunis servent aux détails affichés.
 */
export function compterParFoyer(amis: Ami[]): Ami[] {
  const foyers = new Map<string, Ami[]>()
  for (const a of amis) {
    const cle = `${a.lat},${a.lon},${a.transport}`
    foyers.set(cle, [...(foyers.get(cle) ?? []), a])
  }
  return [...foyers.values()].map((membres) => {
    const premier = membres[0]!
    if (membres.length === 1) return premier
    const noms = membres.map((a) => a.nom)
    return { ...premier, nom: `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}` }
  })
}
