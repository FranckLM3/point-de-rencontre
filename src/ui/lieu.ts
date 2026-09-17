import type { Unite } from '../calcul/unites'
import type { Detail } from '../calcul/villes'
import { chercherAdresses, LONGUEUR_MIN } from '../donnees/geocodage'
import type { Ami, Lieu } from '../types'
import { echapper, valeur } from './format'
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

function resumeLieu(amis: Ami[], details: (Detail | null)[], unite: Unite): string {
  if (amis.length === 0) return ''
  const valeurs = details.flatMap((d) => (d ? [d.valeur] : []))
  const ligne = valeurs.length < amis.length
    ? 'Pas de trajet pour tout le monde'
    : `Pire trajet ${valeur(Math.max(...valeurs), unite)} · <span class="valeur">Total ${valeur(valeurs.reduce((s, v) => s + v, 0), unite)}</span>`
  return `<span class="ligne">${ligne}</span>${detailParAmi(amis, details, unite)}`
}

/** `details` : trajet de chaque personne (même ordre que `amis`), null si elle ne peut pas venir. */
export function rendreResultatLieu(
  el: HTMLElement,
  lieu: Lieu | null,
  amis: Ami[],
  details: (Detail | null)[],
  unite: Unite,
  retirer: () => void,
): void {
  if (!lieu) {
    el.innerHTML = ''
    return
  }
  el.innerHTML = `
    <article class="ville-carte lieu">
      <span class="sur-titre">Lieu testé</span>
      <h2>${echapper(lieu.label)}</h2>
      ${resumeLieu(amis, details, unite)}
      <button type="button" class="pastille secondaire" data-action="retirer-lieu">Retirer le lieu</button>
    </article>`
  el.querySelector('button')!.addEventListener('click', () => retirer())
}
