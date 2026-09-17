import type { VilleClassee } from '../calcul/villes'
import type { Ami } from '../types'
import { echapper, km } from './format'

export interface DonneesVilles {
  villes: VilleClassee[]
  /** Personnes cochées, dans l'ordre de `parAmi`. */
  amis: Ami[]
  /** Nombre de personnes en base. */
  nbPersonnes: number
  max: number | null
}

export interface ActionsVilles {
  choisir: (v: VilleClassee) => void
  ajouter: () => void
}

export function detailParAmi(amis: Ami[], valeurs: number[]): string {
  const lignes = amis
    .map((a, i) => ({ nom: a.nom, v: valeurs[i]! }))
    .sort((x, y) => y.v - x.v)
    .map((l) => `<tr><td>${echapper(l.nom)}</td><td>${km(l.v)}</td></tr>`)
    .join('')
  return `<table class="detail"><tbody>${lignes}</tbody></table>`
}

const carteVille = (c: VilleClassee, i: number, amis: Ami[]): string => `
  <article class="ville-carte">
    <button type="button" class="ville-entete" data-i="${i}" aria-expanded="false" aria-controls="detail-ville-${i}">
      <span class="nom"><span class="titre-ville">${echapper(c.ville.nom)}</span> <span class="dep">${echapper(c.ville.dep)}</span></span>
      <span class="ligne">Pire trajet ${km(c.pire)} · <span class="valeur">Total ${km(c.total)}</span></span>
    </button>
    <div class="zone-detail" id="detail-ville-${i}" hidden>${detailParAmi(amis, c.parAmi)}</div>
  </article>`

function rendreVide(el: HTMLElement, d: DonneesVilles, a: ActionsVilles): void {
  if (d.nbPersonnes === 0) {
    el.innerHTML = `
      <div class="vide">
        <p>Ajoute la première personne pour commencer.</p>
        <button type="button" class="pastille" data-action="premiere">Ajouter une personne</button>
      </div>`
    el.querySelector('button')!.addEventListener('click', () => a.ajouter())
    return
  }
  const message =
    d.amis.length === 0
      ? 'Coche au moins une personne pour voir la carte.'
      : d.max !== null
        ? `Aucune ville à moins de ${km(d.max)} pour tout le monde. Choisis une distance plus grande.`
        : 'Aucune ville à afficher.'
  el.innerHTML = `<p class="vide">${message}</p>`
}

export function rendreVilles(el: HTMLElement, d: DonneesVilles, a: ActionsVilles): void {
  if (d.villes.length === 0) {
    rendreVide(el, d, a)
    return
  }
  el.innerHTML = d.villes.map((c, i) => carteVille(c, i, d.amis)).join('')
  el.querySelectorAll<HTMLButtonElement>('.ville-entete').forEach((b) =>
    b.addEventListener('click', () => {
      const ouvert = b.getAttribute('aria-expanded') === 'true'
      b.setAttribute('aria-expanded', String(!ouvert))
      b.parentElement!.querySelector<HTMLElement>('.zone-detail')!.hidden = ouvert
      a.choisir(d.villes[Number(b.dataset.i)]!)
    }),
  )
}
