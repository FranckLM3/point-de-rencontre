import type { TrajetDetaille } from '../calcul/detail'
import type { ParametresPrix } from '../calcul/voiture'
import type { Ami, Lieu } from '../types'
import { etapesTrajet } from './etapes-trajet'
import { descriptionVoiture, duree, echapper, euros, km } from './format'
import { pictoTransport } from './icones'

export interface DonneesDetail {
  amis: Ami[]
  cible: Lieu | null
  choisis: Set<string>
  trajet: (a: Ami) => TrajetDetaille | null
  parametres: ParametresPrix | null
}

function trajetHtml(tr: TrajetDetaille, cible: Lieu, parametres: ParametresPrix | null): string {
  const vers = `Vers <b>${echapper(cible.label)}</b>`
  if (tr.moyen === 'oiseau') return `<p class="total">${vers} : ${km(tr.km)} à vol d’oiseau</p>`
  if (tr.moyen === 'voiture') {
    const texte = parametres ? descriptionVoiture(tr.valeur, parametres) : `${duree(tr.valeur.minutes)} de route · ${km(tr.valeur.km)}`
    return `<p class="total">${vers} en voiture</p><ol class="etapes"><li>${echapper(texte)}</li></ol>`
  }
  const etapes = etapesTrajet(tr.trajet, tr.via, cible.label).map((e) => `<li>${echapper(e)}</li>`).join('')
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
