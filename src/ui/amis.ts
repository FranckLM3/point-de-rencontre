import type { Ami, Groupe } from '../types'
import { echapper } from './format'
import { pictoTransport } from './icones'

export interface DonneesAmis {
  amis: Ami[]
  groupes: Groupe[]
  selection: Set<string>
}

export interface ActionsAmis {
  changerSelection: (ids: string[]) => void
  editer: (ami: Ami) => void
  ajouter: () => void
  /** Rejette avec un message lisible en cas d'échec. */
  enregistrerGroupe: (nom: string, ids: string[]) => Promise<void>
}

const TEXTE = { enregistrer: 'Enregistrer le groupe', enregistrement: 'Enregistrement…' } as const

/** "10 Rue de Rivoli 75004 Paris" donne "Paris". */
const ville = (adresse: string): string => adresse.replace(/^.*\d{5}\s*/, '') || adresse

const pastille = (x: Ami, coche: boolean): string => `
  <span class="pastille ami">
    <input type="checkbox" data-id="${echapper(x.id)}" aria-label="Inclure ${echapper(x.nom)}" ${coche ? 'checked' : ''} />
    <button type="button" class="editer" data-edit="${echapper(x.id)}" aria-label="Modifier ${echapper(x.nom)}">
      ${echapper(x.nom)} <span class="ville">${echapper(ville(x.adresse))}</span>
      <span class="moyen">${pictoTransport(x.transport)}</span>
    </button>
  </span>`

const gabarit = (d: DonneesAmis): string => `
  <div class="rang">
    <button type="button" class="pastille secondaire" data-action="tous">Tout le monde</button>
    <button type="button" class="pastille secondaire" data-action="aucun">Aucune</button>
    <select class="pastille" aria-label="Groupe enregistré" ${d.groupes.length === 0 ? 'disabled' : ''}>
      <option value="">Groupes</option>
      ${d.groupes.map((g) => `<option value="${echapper(g.id)}">${echapper(g.nom)}</option>`).join('')}
    </select>
    <button type="button" class="pastille secondaire" data-action="groupe" aria-expanded="false" aria-controls="form-groupe">Enregistrer la sélection</button>
  </div>
  <form class="groupe" id="form-groupe" hidden>
    <label for="nom-groupe">Nom du groupe</label>
    <div class="rang">
      <input class="champ" id="nom-groupe" name="nom-groupe" required maxlength="40" autocomplete="off" />
      <button type="submit" class="pastille">${TEXTE.enregistrer}</button>
      <button type="button" class="pastille secondaire" data-action="annuler-groupe">Annuler</button>
    </div>
    <p class="erreur" role="alert"></p>
  </form>
  <div class="rang amis">
    ${d.amis.map((x) => pastille(x, d.selection.has(x.id))).join('')}
    <button type="button" class="pastille" data-action="ajouter">Ajouter un Croco</button>
  </div>`

function brancherGroupe(el: HTMLElement, a: ActionsAmis, coches: () => string[]): void {
  const form = el.querySelector<HTMLFormElement>('form.groupe')!
  const ouvrir = el.querySelector<HTMLButtonElement>('[data-action="groupe"]')!
  const champ = form.querySelector<HTMLInputElement>('input')!
  const bouton = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
  const erreur = form.querySelector<HTMLParagraphElement>('.erreur')!
  const afficher = (visible: boolean) => {
    form.hidden = !visible
    ouvrir.setAttribute('aria-expanded', String(visible))
    erreur.textContent = ''
    if (visible) champ.focus()
  }
  ouvrir.addEventListener('click', () => afficher(form.hidden !== false))
  form.querySelector('[data-action="annuler-groupe"]')!.addEventListener('click', () => {
    afficher(false)
    ouvrir.focus()
  })
  form.addEventListener('submit', async (evt) => {
    evt.preventDefault()
    if (bouton.disabled) return
    erreur.textContent = ''
    bouton.disabled = true
    bouton.textContent = TEXTE.enregistrement
    try {
      await a.enregistrerGroupe(champ.value, coches())
      afficher(false)
    } catch (e) {
      erreur.textContent = (e as Error).message
    } finally {
      bouton.disabled = false
      bouton.textContent = TEXTE.enregistrer
    }
  })
}

export function rendreAmis(el: HTMLElement, d: DonneesAmis, a: ActionsAmis): void {
  el.innerHTML = gabarit(d)
  const coches = () => [...el.querySelectorAll<HTMLInputElement>('input[data-id]')].filter((c) => c.checked).map((c) => c.dataset.id!)
  el.querySelectorAll<HTMLInputElement>('input[data-id]').forEach((c) => c.addEventListener('change', () => a.changerSelection(coches())))
  el.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => {
      const ami = d.amis.find((x) => x.id === b.dataset.edit)
      if (ami) a.editer(ami)
    }),
  )
  el.querySelector('[data-action="tous"]')!.addEventListener('click', () => a.changerSelection(d.amis.map((x) => x.id)))
  el.querySelector('[data-action="aucun"]')!.addEventListener('click', () => a.changerSelection([]))
  el.querySelector('[data-action="ajouter"]')!.addEventListener('click', () => a.ajouter())
  el.querySelector('select')!.addEventListener('change', (evt) => {
    const g = d.groupes.find((x) => x.id === (evt.target as HTMLSelectElement).value)
    if (g) a.changerSelection(g.amis.filter((id) => d.amis.some((x) => x.id === id)))
  })
  brancherGroupe(el, a, coches)
}
