import type { Critere, Etat, Grandeur, Lieu, Mode } from '../types'
import { PERSONNES_PAR_VOITURE_DEFAUT } from '../calcul/voiture'

/** Plan 3 : chacun son moyen par défaut, moyenne, 4 h sans que personne ne dépasse ce maximum. */
export const ETAT_DEFAUT: Etat = {
  mode: 'mixte', critere: 'moyenne', grandeur: 'temps', max: 240, selection: null, lieu: null,
  personnesParVoiture: PERSONNES_PAR_VOITURE_DEFAUT,
}

/** Modes proposés dans l'URL : le vol d'oiseau n'est plus qu'un repli interne (D1), une ancienne
 * URL avec mode=oiseau retombe donc sur le mode par défaut plutôt que de le garder. */
const MODES: Mode[] = ['mixte', 'voiture', 'tc']
const CRITERES: Critere[] = ['moyenne', 'pire']
const GRANDEURS: Grandeur[] = ['temps', 'prix']
const PERSONNES_PAR_VOITURE_MIN = 1
const PERSONNES_PAR_VOITURE_MAX = 4

function lireLieu(brut: string | null): Lieu | null {
  if (!brut) return null
  const [lat, lon, ...reste] = brut.split(',')
  if (!lat || !lon) return null
  const la = Number(lat)
  const lo = Number(lon)
  if (!Number.isFinite(la) || !Number.isFinite(lo) || reste.length === 0) return null
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null
  return { lat: la, lon: lo, label: reste.join(',') }
}

/** 4 h par défaut en temps, aucun maximum en prix (décision 4) : sert quand le paramètre est absent. */
const maxParDefaut = (grandeur: Grandeur): number | null => (grandeur === 'temps' ? ETAT_DEFAUT.max : null)

/** `max=0` marque un maximum explicitement retiré, distinct de l'absence du paramètre (repli par défaut). */
function lireMax(p: URLSearchParams, grandeur: Grandeur): number | null {
  if (!p.has('max')) return maxParDefaut(grandeur)
  const brut = p.get('max')
  if (brut === '0' || brut === '') return null
  const max = Number(brut)
  return Number.isFinite(max) && max > 0 ? max : maxParDefaut(grandeur)
}

function lierPersonnesParVoiture(p: URLSearchParams): number {
  const n = Number(p.get('parvoiture'))
  return p.has('parvoiture') && Number.isInteger(n) && n >= PERSONNES_PAR_VOITURE_MIN && n <= PERSONNES_PAR_VOITURE_MAX
    ? n
    : ETAT_DEFAUT.personnesParVoiture
}

export function lireEtat(recherche: string): Etat {
  const p = new URLSearchParams(recherche)
  const mode = p.get('mode') as Mode
  const critere = p.get('critere') as Critere
  const grandeur = p.get('grandeur') as Grandeur
  const sel = p.get('sel')
  const grandeurLue = GRANDEURS.includes(grandeur) ? grandeur : ETAT_DEFAUT.grandeur
  return {
    mode: MODES.includes(mode) ? mode : ETAT_DEFAUT.mode,
    critere: CRITERES.includes(critere) ? critere : ETAT_DEFAUT.critere,
    grandeur: grandeurLue,
    max: lireMax(p, grandeurLue),
    selection: sel === null ? null : sel.split(',').filter(Boolean),
    lieu: lireLieu(p.get('lieu')),
    personnesParVoiture: lierPersonnesParVoiture(p),
  }
}

export function ecrireEtat(e: Etat): string {
  const p = new URLSearchParams()
  p.set('mode', e.mode)
  p.set('critere', e.critere)
  if (e.mode !== 'oiseau') p.set('grandeur', e.grandeur)
  if (e.max !== null) p.set('max', String(e.max))
  else if (maxParDefaut(e.grandeur) !== null) p.set('max', '0')
  if (e.selection !== null) p.set('sel', e.selection.join(','))
  if (e.lieu) p.set('lieu', `${e.lieu.lat.toFixed(5)},${e.lieu.lon.toFixed(5)},${e.lieu.label}`)
  if (e.personnesParVoiture !== ETAT_DEFAUT.personnesParVoiture) p.set('parvoiture', String(e.personnesParVoiture))
  return `?${p.toString()}`
}
