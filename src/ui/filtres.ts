import { maximaProposes, uniteDe, type Unite } from '../calcul/unites'
import { PERSONNES_PAR_VOITURE_MAX } from '../calcul/voiture'
import { estParDefaut } from '../etat/url'
import type { Etat, Grandeur, Mode } from '../types'
import { sousTitre, titreCourt, valeur } from './format'

/** Le vol d'oiseau n'est plus qu'un repli interne (décision 1) : trois modes seulement dans l'interface. */
const MODES: { mode: Mode; libelle: string }[] = [
  { mode: 'tc', libelle: 'Transports' },
  { mode: 'voiture', libelle: 'Voiture' },
  { mode: 'mixte', libelle: 'Chacun son moyen' },
]

const GRANDEURS: { grandeur: Grandeur; libelle: string }[] = [
  { grandeur: 'temps', libelle: 'Temps' },
  { grandeur: 'prix', libelle: 'Prix' },
]

const LIBELLE_MAX: Record<Unite, string> = { km: 'Distance maximum', min: 'Durée maximum', eur: 'Prix maximum' }
const PERSONNES_PAR_VOITURE_OPTIONS = Array.from({ length: PERSONNES_PAR_VOITURE_MAX }, (_, i) => i + 1)

const presse = (vrai: boolean): string => `aria-pressed="${vrai}"`

/** Groupe d'interrupteurs connectés : bord partagé, segment actif rempli (styles .pastille). */
function interrupteur(libelle: string, boutons: string): string {
  return `
    <div class="filtre">
      <span class="etiquette-filtre">${libelle}</span>
      <div class="segmente" role="group" aria-label="${libelle}">${boutons}</div>
    </div>`
}

function boutonsModes(courant: Mode): string {
  return MODES.map((m) => `<button type="button" class="pastille" data-mode="${m.mode}" ${presse(m.mode === courant)}>${m.libelle}</button>`).join('')
}

function interrupteurMesure(e: Etat): string {
  if (e.mode === 'oiseau') return ''
  const boutons = GRANDEURS.map(
    (g) => `<button type="button" class="pastille" data-grandeur="${g.grandeur}" ${presse(e.grandeur === g.grandeur)}>${g.libelle}</button>`,
  ).join('')
  return interrupteur('Mesure', boutons)
}

/** Visible seulement en prix, en voiture ou en mixte (décision 5) : divise le prix affiché. */
function interrupteurPersonnesParVoiture(e: Etat): string {
  if (e.grandeur !== 'prix' || (e.mode !== 'voiture' && e.mode !== 'mixte')) return ''
  const boutons = PERSONNES_PAR_VOITURE_OPTIONS.map(
    (n) => `<button type="button" class="pastille" data-personnes="${n}" ${presse(e.personnesParVoiture === n)}>${n}</button>`,
  ).join('')
  return interrupteur('Personnes par voiture', boutons)
}

function menuMaximum(e: Etat, unite: Unite): string {
  const libelle = LIBELLE_MAX[unite]
  const options = maximaProposes(unite)
    .map((m) => `<option value="${m}" ${e.max === m ? 'selected' : ''}>${valeur(m, unite)} max</option>`)
    .join('')
  return `<select class="pastille${e.max !== null ? ' verte' : ''}" aria-label="${libelle}">
        <option value="">${libelle}</option>
        ${options}
      </select>`
}

export function rendreFiltres(
  el: HTMLElement,
  e: Etat,
  nombre: number,
  changer: (p: Partial<Etat>) => void,
  reinitialiser: () => void,
): void {
  const unite = uniteDe(e.mode, e.grandeur)
  const critere = `<button type="button" class="pastille" data-critere="pire" ${presse(e.critere === 'pire')}>Pire trajet</button>
      <button type="button" class="pastille" data-critere="moyenne" ${presse(e.critere === 'moyenne')}>Moyenne</button>`
  const boutonReinitialiser = estParDefaut(e)
    ? ''
    : '<button type="button" class="pastille secondaire" id="reinitialiser-filtres">Réinitialiser</button>'
  el.innerHTML = `
    ${interrupteur('Mode', boutonsModes(e.mode))}
    ${interrupteurMesure(e)}
    ${interrupteurPersonnesParVoiture(e)}
    <div class="filtre">
      <span class="etiquette-filtre">Critère</span>
      <div class="rang">
        <div class="segmente" role="group" aria-label="Critère">${critere}</div>
        ${menuMaximum(e, unite)}
        ${boutonReinitialiser}
      </div>
    </div>
    <h1>${titreCourt(nombre)}</h1>
    <p class="sous-titre">${sousTitre({ mode: e.mode, unite, critere: e.critere, max: e.max })}</p>`
  // Les unités diffèrent d'un mode ou d'une grandeur à l'autre : le maximum repart de zéro.
  el.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => changer({ mode: b.dataset.mode as Mode, max: null })),
  )
  el.querySelectorAll<HTMLButtonElement>('[data-grandeur]').forEach((b) =>
    b.addEventListener('click', () => changer({ grandeur: b.dataset.grandeur as Grandeur, max: null })),
  )
  el.querySelectorAll<HTMLButtonElement>('[data-personnes]').forEach((b) =>
    b.addEventListener('click', () => changer({ personnesParVoiture: Number(b.dataset.personnes) })),
  )
  el.querySelectorAll<HTMLButtonElement>('[data-critere]').forEach((b) =>
    b.addEventListener('click', () => changer({ critere: b.dataset.critere as Etat['critere'] })),
  )
  el.querySelector('select')!.addEventListener('change', (evt) => {
    const v = (evt.target as HTMLSelectElement).value
    changer({ max: v ? Number(v) : null })
  })
  el.querySelector('#reinitialiser-filtres')?.addEventListener('click', () => reinitialiser())
}
