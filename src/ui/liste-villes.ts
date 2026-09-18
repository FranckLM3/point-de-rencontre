import type { Unite } from '../calcul/unites'
import type { Detail, VilleClassee } from '../calcul/villes'
import type { Ami, Critere, Mode } from '../types'
import { echapper, valeur } from './format'

export interface DonneesVilles {
  villes: VilleClassee[]
  /** Personnes cochées, dans l'ordre de `parAmi`. */
  amis: Ami[]
  /** Nombre de personnes en base. */
  nbPersonnes: number
  max: number | null
  unite: Unite
  mode: Mode
  /** Critère actif : sa valeur est mise en avant sur chaque carte. */
  critere: Critere
}

export interface ActionsVilles {
  choisir: (v: VilleClassee) => void
  ajouter: () => void
}

/** Adresses constantes : aucune donnée de l'utilisateur n'y est ajoutée. */
const RESERVATION = [
  { libelle: 'SNCF Connect', url: 'https://www.sncf-connect.com/' },
  { libelle: 'Trainline', url: 'https://www.thetrainline.com/fr' },
]
const PAS_DE_TRAJET = 'Pas de trajet'

const PLUS_GRAND: Record<Unite, string> = {
  km: 'une distance plus grande',
  min: 'une durée plus longue',
  eur: 'un prix plus élevé',
}

/** Une ligne par personne, la plus éloignée d'abord ; null = pas de trajet. */
export function detailParAmi(amis: Ami[], details: (Detail | null)[], unite: Unite): string {
  const lignes = amis
    .map((a, i) => ({ nom: a.nom, d: details[i] ?? null }))
    .sort((x, y) => (y.d?.valeur ?? Number.POSITIVE_INFINITY) - (x.d?.valeur ?? Number.POSITIVE_INFINITY))
    .map(({ nom, d }) => {
      const precision = d?.precision ? `<small class="precision">${echapper(d.precision)}</small>` : ''
      const texte = d ? valeur(d.valeur, unite) : PAS_DE_TRAJET
      return `<tr><td>${echapper(nom)}${precision}</td><td>${texte}</td></tr>`
    })
    .join('')
  return `<table class="detail"><tbody>${lignes}</tbody></table>`
}

const liensReservation = (): string =>
  `<p class="reservation">${RESERVATION.map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.libelle}</a>`).join(' ')}</p>`

/** Pire trajet toujours affiché ; le second nombre suit le critère actif (Total au pire, Moyenne sinon). */
function ligneCritere(c: VilleClassee, unite: Unite, critere: Critere): string {
  const pire = `Pire trajet ${valeur(c.pire, unite)}`
  if (critere === 'pire') return `<span class="valeur">${pire}</span> · Total ${valeur(c.total, unite)}`
  return `${pire} · <span class="valeur">Moyenne ${valeur(c.moyenne, unite)}</span>`
}

function carteVille(c: VilleClassee, i: number, d: DonneesVilles): string {
  const liens = d.mode === 'tc' ? liensReservation() : ''
  return `
  <article class="ville-carte">
    <button type="button" class="ville-entete" data-i="${i}" aria-expanded="false" aria-controls="detail-ville-${i}">
      <span class="nom"><span class="titre-ville">${echapper(c.ville.nom)}</span> <span class="dep">${echapper(c.ville.dep)}</span></span>
      <span class="ligne">${ligneCritere(c, d.unite, d.critere)}</span>
    </button>
    <div class="zone-detail" id="detail-ville-${i}" hidden>${detailParAmi(d.amis, c.parAmi, d.unite)}${liens}</div>
  </article>`
}

function rendreVide(el: HTMLElement, d: DonneesVilles, a: ActionsVilles): void {
  if (d.nbPersonnes === 0) {
    el.innerHTML = `
      <div class="vide">
        <p>Ajoute le premier Croco pour commencer.</p>
        <button type="button" class="pastille" data-action="premiere">Ajouter un Croco</button>
      </div>`
    el.querySelector('button')!.addEventListener('click', () => a.ajouter())
    return
  }
  const message =
    d.amis.length === 0
      ? 'Coche au moins un Croco pour voir la carte.'
      : d.max !== null
        ? `Aucune ville à moins de ${valeur(d.max, d.unite)} pour tout le monde. Choisis ${PLUS_GRAND[d.unite]}.`
        : 'Aucune ville à afficher.'
  el.innerHTML = `<p class="vide">${message}</p>`
}

export function rendreVilles(el: HTMLElement, d: DonneesVilles, a: ActionsVilles): void {
  if (d.villes.length === 0) {
    rendreVide(el, d, a)
    return
  }
  el.innerHTML = d.villes.map((c, i) => carteVille(c, i, d)).join('')
  el.querySelectorAll<HTMLButtonElement>('.ville-entete').forEach((b) =>
    b.addEventListener('click', () => {
      const ouvert = b.getAttribute('aria-expanded') === 'true'
      b.setAttribute('aria-expanded', String(!ouvert))
      b.parentElement!.querySelector<HTMLElement>('.zone-detail')!.hidden = ouvert
      a.choisir(d.villes[Number(b.dataset.i)]!)
    }),
  )
}
