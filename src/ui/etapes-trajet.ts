import type { Segment, TronconUrbain } from '../calcul/etapes'
import type { TrajetTc } from '../calcul/tc'
import { correspondances, descriptionTrajet, duree, nomCourt, SUITE } from './format'

/** Stations de montée et de descente d'une partie en métro, RER ou tram. */
const nomStation = (u: TronconUrbain, i: number): string => u.reseau.stations[i]!.nom
const montee = (s: Segment): string => (s.urbain ? `, montée à ${nomStation(s.urbain, s.urbain.de)}` : '')
const descente = (s: Segment): string => (s.urbain ? `, descente à ${nomStation(s.urbain, s.urbain.vers)}` : '')

/**
 * Étapes d'un trajet en transports, une phrase chacune : rejoindre la gare (et la station de
 * métro où l'on monte), le train (durée, gares de correspondance), puis la fin du trajet jusqu'à
 * `arrivee`. `via` : gares intermédiaires du chemin (`garesVia`), vide si inconnues.
 */
export function etapesTrajet(t: TrajetTc, via: string[], arrivee: string): string[] {
  if (t.depart === null) {
    const u = t.acces.urbain
    return [u ? `${SUITE.transports(duree(t.acces.minutes))}, de ${nomStation(u, u.de)} à ${nomStation(u, u.vers)}` : descriptionTrajet(t)]
  }
  const etapes: string[] = []
  if (Math.round(t.acces.minutes) > 0) etapes.push(`${SUITE[t.acces.mode](duree(t.acces.minutes))} jusqu'à ${nomCourt(t.depart)}${montee(t.acces)}`)
  const enTrain = t.minutes - t.acces.minutes - (t.sortie?.minutes ?? 0)
  const par = via.length > 0 ? `, via ${via.map(nomCourt).join(', ')}` : ''
  const changements = t.correspondances > 0 ? ` · ${correspondances(t.correspondances)}` : ''
  etapes.push(`${duree(enTrain)} de train : ${nomCourt(t.depart)} → ${nomCourt(t.arrivee ?? '')}${par}${changements}`)
  if (t.sortie && Math.round(t.sortie.minutes) > 0) etapes.push(`${SUITE[t.sortie.mode](duree(t.sortie.minutes))} jusqu'à ${arrivee}${descente(t.sortie)}`)
  return etapes
}
