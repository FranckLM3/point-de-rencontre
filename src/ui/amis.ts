import type { Ami, Groupe } from '../types'
import { echapper } from './format'
import { ICONE_CRAYON, ICONE_RECHERCHE, pictoTransport } from './icones'
import { initiales } from './marqueurs'
import { correspond, regrouperParVille, villeCourte } from './personnes'

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
/** Recherche affichée à partir de ce nombre de personnes. */
const SEUIL_RECHERCHE = 8

const idsGroupe = (g: Groupe, amis: Ami[]): string[] => {
  const connus = new Set(amis.map((a) => a.id))
  return g.amis.filter((id) => connus.has(id))
}

const memesIds = (a: string[], b: Set<string>): boolean => a.length === b.size && a.every((id) => b.has(id))

function puceGroupe(nom: string, active: boolean, action: string): string {
  return `<button type="button" class="puce-groupe" data-groupe="${echapper(action)}" aria-pressed="${active}">${echapper(nom)}</button>`
}

function entete(d: DonneesAmis): string {
  const coches = d.amis.filter((a) => d.selection.has(a.id)).length
  const puces = [
    puceGroupe('Tous', memesIds(d.amis.map((a) => a.id), d.selection), ''),
    ...d.groupes.map((g) => puceGroupe(g.nom, memesIds(idsGroupe(g, d.amis), d.selection), g.id)),
  ]
  return `
    <div class="rang entete-liste-amis">
      <strong>Les Crocos</strong>
      <span class="compte-amis">${coches}/${d.amis.length}</span>
      <div class="segmente pousse" role="group" aria-label="Sélection rapide">
        <button type="button" data-action="tous">Tous</button>
        <button type="button" data-action="aucun">Aucun</button>
      </div>
    </div>
    <div class="rang puces-groupes">
      ${puces.join('')}
      <button type="button" class="lien-discret" data-action="groupe" aria-expanded="false" aria-controls="form-groupe">+ groupe</button>
    </div>
    ${
      d.amis.length > SEUIL_RECHERCHE
        ? `<label class="champ-recherche">
            ${ICONE_RECHERCHE}
            <input type="search" id="recherche-amis" aria-label="Chercher un Croco" placeholder="Chercher un Croco" autocomplete="off" />
          </label>`
        : ''
    }
    <form class="groupe" id="form-groupe" hidden>
      <label for="nom-groupe">Nom du groupe</label>
      <div class="rang">
        <input class="champ" id="nom-groupe" name="nom-groupe" required maxlength="40" autocomplete="off" />
        <button type="submit" class="pastille">${TEXTE.enregistrer}</button>
        <button type="button" class="pastille secondaire" data-action="annuler-groupe">Annuler</button>
      </div>
      <p class="erreur" role="alert"></p>
    </form>`
}

const ligneAmi = (a: Ami, coche: boolean): string => `
  <li class="ligne-ami${coche ? '' : ' exclu'}" data-personne="${echapper(a.id)}">
    <span class="avatar-ami${coche ? '' : ' inactif'}" aria-hidden="true">${echapper(initiales(a.nom))}</span>
    <span class="info-ami">
      <span class="nom-ami">${echapper(a.nom)}</span>
      <span class="ville-ami">${echapper(villeCourte(a.adresse))}</span>
    </span>
    ${pictoTransport(a.transport)}
    <button type="button" class="crayon" data-edit="${echapper(a.id)}" aria-label="Modifier ${echapper(a.nom)}">${ICONE_CRAYON}</button>
    <button type="button" class="interrupteur" role="switch" data-id="${echapper(a.id)}" aria-checked="${coche}" aria-label="Inclure ${echapper(a.nom)}"></button>
  </li>`

function ligneVille(ville: string, amis: Ami[], selection: Set<string>): string {
  const coches = amis.filter((a) => selection.has(a.id)).length
  return `
    <li class="entete-ville" role="presentation">
      <button type="button" class="bouton-ville" data-ville="${echapper(ville)}" aria-label="Basculer ${echapper(ville)}">
        <span>${echapper(ville)}</span><span class="compte-ville">${coches}/${amis.length}</span>
      </button>
    </li>
    ${amis.map((a) => ligneAmi(a, selection.has(a.id))).join('')}`
}

function listeAmis(amis: Ami[], selection: Set<string>): string {
  const groupes = regrouperParVille(amis)
  return `<ul class="liste-amis">${groupes.map((g) => ligneVille(g.ville, g.amis, selection)).join('')}</ul>`
}

const gabarit = (d: DonneesAmis): string => `
  <div class="conteneur-liste-amis">
    <div class="entete-fixe">${entete(d)}</div>
    ${listeAmis(d.amis, d.selection)}
  </div>
  <button type="button" class="pastille ajouter-croco" data-action="ajouter">+ Ajouter un Croco</button>`

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

/** Personnes d'une ville affichées (respecte le filtre de recherche courant). */
function idsVisiblesVille(el: HTMLElement, ville: string): string[] {
  const entete = [...el.querySelectorAll<HTMLButtonElement>('.bouton-ville')].find((b) => b.dataset.ville === ville)
  const suite: string[] = []
  let n = entete?.closest('li')?.nextElementSibling ?? null
  while (n && n.classList.contains('ligne-ami')) {
    suite.push((n as HTMLElement).dataset.personne!)
    n = n.nextElementSibling
  }
  return suite
}

function appliquerFiltre(el: HTMLElement, d: DonneesAmis, filtre: string): void {
  const actuelle = el.querySelector<HTMLElement>('.conteneur-liste-amis .liste-amis, .conteneur-liste-amis .vide')!
  const visibles = filtre.trim() === '' ? d.amis : d.amis.filter((a) => correspond(a, filtre))
  actuelle.outerHTML =
    visibles.length === 0
      ? `<p class="vide">Aucun Croco ne correspond à « ${echapper(filtre.trim())} ».</p>`
      : listeAmis(visibles, d.selection)
}

export function rendreAmis(el: HTMLElement, d: DonneesAmis, a: ActionsAmis): void {
  el.innerHTML = gabarit(d)
  const coches = () => d.amis.filter((x) => d.selection.has(x.id)).map((x) => x.id)

  const liste = el.querySelector<HTMLElement>('.conteneur-liste-amis')!
  liste.addEventListener('click', (evt) => {
    const cible = evt.target as HTMLElement
    const crayon = cible.closest<HTMLButtonElement>('[data-edit]')
    if (crayon) {
      const ami = d.amis.find((x) => x.id === crayon.dataset.edit)
      if (ami) a.editer(ami)
      return
    }
    const boutonVille = cible.closest<HTMLButtonElement>('.bouton-ville')
    if (boutonVille) {
      const ville = boutonVille.dataset.ville!
      const membres = idsVisiblesVille(el, ville)
      const toutCoche = membres.every((id) => d.selection.has(id))
      const suivante = toutCoche
        ? new Set([...d.selection].filter((id) => !membres.includes(id)))
        : new Set([...d.selection, ...membres])
      a.changerSelection(d.amis.filter((x) => suivante.has(x.id)).map((x) => x.id))
      return
    }
    const ligne = cible.closest<HTMLElement>('.ligne-ami')
    if (ligne) {
      const id = ligne.dataset.personne!
      const suivante = new Set(d.selection)
      if (suivante.has(id)) suivante.delete(id)
      else suivante.add(id)
      a.changerSelection(d.amis.filter((x) => suivante.has(x.id)).map((x) => x.id))
    }
  })

  el.querySelector('[data-action="tous"]')!.addEventListener('click', () => a.changerSelection(d.amis.map((x) => x.id)))
  el.querySelector('[data-action="aucun"]')!.addEventListener('click', () => a.changerSelection([]))
  el.querySelector('[data-action="ajouter"]')!.addEventListener('click', () => a.ajouter())
  el.querySelectorAll<HTMLButtonElement>('[data-groupe]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.groupe === '') return a.changerSelection(d.amis.map((x) => x.id))
      const g = d.groupes.find((x) => x.id === b.dataset.groupe)
      if (g) a.changerSelection(idsGroupe(g, d.amis))
    }),
  )
  const recherche = el.querySelector<HTMLInputElement>('#recherche-amis')
  recherche?.addEventListener('input', () => appliquerFiltre(el, d, recherche.value))
  brancherGroupe(el, a, coches)
}
