import type { Critere, Etat, Lieu, Mode } from '../types'

/** Plan 1 : seul le vol d'oiseau est calculé, d'où ce mode par défaut. */
export const ETAT_DEFAUT: Etat = { mode: 'oiseau', critere: 'pire', max: null, selection: null, lieu: null }

const MODES: Mode[] = ['mixte', 'voiture', 'tc', 'oiseau']
const CRITERES: Critere[] = ['moyenne', 'pire']

function lireLieu(brut: string | null): Lieu | null {
  if (!brut) return null
  const [lat, lon, ...reste] = brut.split(',')
  const la = Number(lat)
  const lo = Number(lon)
  if (!Number.isFinite(la) || !Number.isFinite(lo) || reste.length === 0) return null
  return { lat: la, lon: lo, label: reste.join(',') }
}

export function lireEtat(recherche: string): Etat {
  const p = new URLSearchParams(recherche)
  const mode = p.get('mode') as Mode
  const critere = p.get('critere') as Critere
  const max = Number(p.get('max'))
  const sel = p.get('sel')
  return {
    mode: MODES.includes(mode) ? mode : ETAT_DEFAUT.mode,
    critere: CRITERES.includes(critere) ? critere : ETAT_DEFAUT.critere,
    max: p.has('max') && Number.isFinite(max) && max > 0 ? max : null,
    selection: sel === null ? null : sel.split(',').filter(Boolean),
    lieu: lireLieu(p.get('lieu')),
  }
}

export function ecrireEtat(e: Etat): string {
  const p = new URLSearchParams()
  p.set('mode', e.mode)
  p.set('critere', e.critere)
  if (e.max !== null) p.set('max', String(e.max))
  if (e.selection !== null) p.set('sel', e.selection.join(','))
  if (e.lieu) p.set('lieu', `${e.lieu.lat.toFixed(5)},${e.lieu.lon.toFixed(5)},${e.lieu.label}`)
  return `?${p.toString()}`
}
