import { haversineKm } from '../calcul/geo'
import { chercherAdresses, LONGUEUR_MIN } from '../donnees/geocodage'
import type { Ami, Lieu } from '../types'
import { echapper, km } from './format'
import { detailParAmi } from './liste-villes'

const DELAI_FRAPPE_MS = 250
const AUCUNE_ADRESSE = 'Aucune adresse trouvée. Ajoute le code postal.'

export interface RechercheLieu {
  /** Remplit le champ sans relancer de recherche (clic sur la carte, lieu retiré). */
  definir(lieu: Lieu | null): void
}

/** Appelé une seule fois : un rafraîchissement ne doit pas effacer la saisie en cours. */
export function rendreRechercheLieu(el: HTMLElement, lieu: Lieu | null, choisir: (l: Lieu | null) => void): RechercheLieu {
  el.innerHTML = `
    <label class="etiquette" for="champ-lieu">Tester un lieu</label>
    <input id="champ-lieu" class="champ" type="search" autocomplete="off" placeholder="Tape une adresse ou touche la carte" />
    <ul class="propositions"></ul>
    <p class="aide" role="status"></p>
    <p class="erreur" role="alert"></p>`
  const champ = el.querySelector('input')!
  const liste = el.querySelector('ul')!
  const aide = el.querySelector<HTMLParagraphElement>('.aide')!
  const erreur = el.querySelector<HTMLParagraphElement>('.erreur')!
  champ.value = lieu?.label ?? ''
  let minuterie = 0
  // Seule la dernière recherche lancée peut afficher son résultat.
  let derniere = 0
  const effacer = () => {
    derniere++
    window.clearTimeout(minuterie)
    liste.innerHTML = ''
    aide.textContent = ''
    erreur.textContent = ''
  }
  const afficher = (lieux: Lieu[]) => {
    liste.innerHTML = lieux.map((l, i) => `<li><button type="button" data-i="${i}">${echapper(l.label)}</button></li>`).join('')
    liste.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        const choix = lieux[Number(b.dataset.i)]!
        effacer()
        champ.value = choix.label
        choisir(choix)
      }),
    )
  }
  champ.addEventListener('input', () => {
    effacer()
    if (champ.value.trim() === '') {
      choisir(null)
      return
    }
    minuterie = window.setTimeout(async () => {
      const numero = ++derniere
      const texte = champ.value
      try {
        const lieux = await chercherAdresses(texte)
        if (numero !== derniere) return
        aide.textContent = lieux.length === 0 && texte.trim().length >= LONGUEUR_MIN ? AUCUNE_ADRESSE : ''
        afficher(lieux)
      } catch (e) {
        if (numero !== derniere) return
        liste.innerHTML = ''
        erreur.textContent = (e as Error).message
      }
    }, DELAI_FRAPPE_MS)
  })
  return {
    definir(l) {
      effacer()
      champ.value = l?.label ?? ''
    },
  }
}

export function rendreResultatLieu(el: HTMLElement, lieu: Lieu | null, amis: Ami[], retirer: () => void): void {
  if (!lieu) {
    el.innerHTML = ''
    return
  }
  const valeurs = amis.map((a) => haversineKm(a.lat, a.lon, lieu.lat, lieu.lon))
  const total = valeurs.reduce((s, v) => s + v, 0)
  const resume = amis.length > 0
    ? `<span class="ligne">Pire trajet ${km(Math.max(...valeurs))} · <span class="valeur">Total ${km(total)}</span></span>${detailParAmi(amis, valeurs)}`
    : ''
  el.innerHTML = `
    <article class="ville-carte lieu">
      <span class="sur-titre">Lieu testé</span>
      <h2>${echapper(lieu.label)}</h2>
      ${resume}
      <button type="button" class="pastille secondaire" data-action="retirer-lieu">Retirer le lieu</button>
    </article>`
  el.querySelector('button')!.addEventListener('click', () => retirer())
}
