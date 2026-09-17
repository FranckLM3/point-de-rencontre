import type { Ami, Etat } from '../types'

/** E4 : tout ce qui change les zones, et rien d'autre (le lieu testé n'y figure pas). */
export function cleZones(e: Etat, ids: string[], version: number): string {
  return [e.mode, e.critere, e.grandeur, e.max ?? '', [...ids].sort().join(','), version].join('|')
}

/** `null` = tout le monde ; les identifiants inconnus sont ignorés. */
export function amisChoisis(amis: Ami[], selection: string[] | null): Ami[] {
  if (selection === null) return amis
  const voulus = new Set(selection)
  return amis.filter((a) => voulus.has(a.id))
}

const ATTRIBUTS_FOCUS = ['data-id', 'data-edit', 'data-action', 'data-critere', 'data-mode', 'data-grandeur', 'id', 'aria-label'] as const

const guillemets = (v: string): string => `"${v.replace(/["\\]/g, '\\$&')}"`

/** E3 : sélecteur qui retrouve l'élément équivalent après reconstruction du panneau. */
export function cleFocus(el: Element | null): string | null {
  if (!el) return null
  for (const nom of ATTRIBUTS_FOCUS) {
    const valeur = el.getAttribute(nom)
    if (valeur) return `${el.tagName.toLowerCase()}[${nom}=${guillemets(valeur)}]`
  }
  return null
}

export const libelleClic = (lat: number, lon: number): string => `Point ${lat.toFixed(3)}, ${lon.toFixed(3)}`
