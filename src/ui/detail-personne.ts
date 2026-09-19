import type { TrajetDetaille } from '../calcul/detail'
import type { Segment, TronconUrbain } from '../calcul/etapes'
import type { TrajetTc } from '../calcul/tc'
import type { ParametresPrix } from '../calcul/voiture'
import type { Ami, Lieu } from '../types'
import { correspondances, descriptionTrajet, descriptionVoiture, duree, echapper, euros, km, nomCourt, SUITE } from './format'
import { pictoTransport } from './icones'

export interface DonneesDetail {
  amis: Ami[]
  cible: Lieu | null
  choisis: Set<string>
  trajet: (a: Ami) => TrajetDetaille | null
  parametres: ParametresPrix | null
}

/** Stations de montée et de descente d'une partie en métro, RER ou tram. */
const nomStation = (u: TronconUrbain, i: number): string => u.reseau.stations[i]!.nom
const montee = (s: Segment): string => (s.urbain ? `, montée à ${nomStation(s.urbain, s.urbain.de)}` : '')
const descente = (s: Segment): string => (s.urbain ? `, descente à ${nomStation(s.urbain, s.urbain.vers)}` : '')

function etapesTc(t: TrajetTc, via: string[], cible: Lieu): string[] {
  if (t.depart === null) {
    const u = t.acces.urbain
    return [u ? `${SUITE.transports(duree(t.acces.minutes))}, de ${nomStation(u, u.de)} à ${nomStation(u, u.vers)}` : descriptionTrajet(t)]
  }
  const etapes: string[] = []
  if (Math.round(t.acces.minutes) > 0) etapes.push(`${SUITE[t.acces.mode](duree(t.acces.minutes))} jusqu'à ${nomCourt(t.depart)}${montee(t.acces)}`)
  const par = via.length > 0 ? `, via ${via.map(nomCourt).join(', ')}` : ''
  const changements = t.correspondances > 0 ? ` · ${correspondances(t.correspondances)}` : ''
  etapes.push(`Train ${nomCourt(t.depart)} → ${nomCourt(t.arrivee ?? '')}${par}${changements}`)
  if (t.sortie && Math.round(t.sortie.minutes) > 0) etapes.push(`${SUITE[t.sortie.mode](duree(t.sortie.minutes))} jusqu'à ${cible.label}${descente(t.sortie)}`)
  return etapes
}

function trajetHtml(tr: TrajetDetaille, cible: Lieu, parametres: ParametresPrix | null): string {
  const vers = `Vers <b>${echapper(cible.label)}</b>`
  if (tr.moyen === 'oiseau') return `<p class="total">${vers} : ${km(tr.km)} à vol d’oiseau</p>`
  if (tr.moyen === 'voiture') {
    const texte = parametres ? descriptionVoiture(tr.valeur, parametres) : `${duree(tr.valeur.minutes)} de route · ${km(tr.valeur.km)}`
    return `<p class="total">${vers} en voiture</p><ol class="etapes"><li>${echapper(texte)}</li></ol>`
  }
  const etapes = etapesTc(tr.trajet, tr.via, cible).map((e) => `<li>${echapper(e)}</li>`).join('')
  return `<p class="total">${vers} : <b>${duree(tr.trajet.minutes)}</b> · <span class="prix">≈ ${euros(tr.trajet.euros)}</span></p><ol class="etapes">${etapes}</ol>`
}

function fichePersonne(a: Ami, d: DonneesDetail): string {
  const entete = `<h3>${echapper(a.nom)} ${pictoTransport(a.transport)}</h3>`
  const adresse = a.adresse ? `<p class="adresse">${echapper(a.adresse)}</p>` : ''
  let corps: string
  if (!d.choisis.has(a.id)) corps = '<p class="note">Pas compté dans le calcul : coche ce Croco dans la liste.</p>'
  else if (!d.cible) corps = '<p class="note">Choisis une ville, ou touche la carte, pour voir son trajet.</p>'
  else {
    const tr = d.trajet(a)
    corps = tr ? trajetHtml(tr, d.cible, d.parametres) : `<p class="note">Pas de trajet trouvé vers ${echapper(d.cible.label)}.</p>`
  }
  return `<section class="detail-personne">${entete}${adresse}${corps}</section>`
}

/** HTML sûr du détail du trajet de chaque personne d'un marqueur (plusieurs à la même adresse). */
export function detailPersonnes(d: DonneesDetail): string {
  return d.amis.map((a) => fichePersonne(a, d)).join('')
}
