import { chercherAdresses, LONGUEUR_MIN } from '../donnees/geocodage'
import type { Ami, Lieu, NouvelAmi, Transport } from '../types'
import { echapper } from './format'

const DELAI_FRAPPE_MS = 250

const TEXTE = {
  enregistrer: 'Enregistrer',
  enregistrement: 'Enregistrement…',
  supprimer: 'Supprimer',
  confirmer: 'Confirmer la suppression',
  suppression: 'Suppression…',
  aucuneAdresse: 'Aucune adresse trouvée. Ajoute le code postal.',
  choisirAdresse: 'Choisis une adresse dans la liste proposée.',
} as const

export interface ActionsFiche {
  enregistrer: (a: NouvelAmi) => Promise<void>
  supprimer?: () => Promise<void>
}

const gabarit = (titre: string, modifiable: boolean): string => `
  <form aria-labelledby="fiche-titre">
    <h2 id="fiche-titre">${titre}</h2>
    <label>Nom <input class="champ" name="nom" required maxlength="60" /></label>
    <label>Adresse <input class="champ" name="adresse" required autocomplete="off" /></label>
    <ul class="propositions"></ul>
    <p class="aide" role="status"></p>
    <fieldset>
      <legend>Se déplace en</legend>
      <label><span><input type="radio" name="transport" value="voiture" /> Voiture</span></label>
      <label><span><input type="radio" name="transport" value="tc" /> Transports en commun</span></label>
    </fieldset>
    <label><span><input type="checkbox" name="navigo" /> Abonné Navigo</span></label>
    <p class="erreur" role="alert"></p>
    <div class="rang">
      <button class="pastille" type="submit">${TEXTE.enregistrer}</button>
      <button class="pastille secondaire" type="button" data-action="annuler">Annuler</button>
      ${modifiable ? `<button class="pastille secondaire pousse" type="button" data-action="supprimer">${TEXTE.supprimer}</button>` : ''}
    </div>
  </form>`

interface ElementsRecherche {
  champ: HTMLInputElement
  liste: HTMLUListElement
  aide: HTMLElement
  erreur: HTMLElement
}

function brancherAutocompletion({ champ, liste, aide, erreur }: ElementsRecherche, choisir: (l: Lieu | null) => void): void {
  let minuterie = 0
  // Seule la dernière recherche lancée a le droit d'afficher son résultat.
  let derniere = 0
  champ.addEventListener('input', () => {
    choisir(null)
    aide.textContent = ''
    window.clearTimeout(minuterie)
    minuterie = window.setTimeout(async () => {
      const numero = ++derniere
      const texte = champ.value
      try {
        const lieux = await chercherAdresses(texte)
        if (numero !== derniere) return
        erreur.textContent = ''
        aide.textContent = lieux.length === 0 && texte.trim().length >= LONGUEUR_MIN ? TEXTE.aucuneAdresse : ''
        liste.innerHTML = lieux.map((l, i) => `<li><button type="button" data-i="${i}">${echapper(l.label)}</button></li>`).join('')
        liste.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
          b.addEventListener('click', () => {
            const lieu = lieux[Number(b.dataset.i)]!
            champ.value = lieu.label
            liste.innerHTML = ''
            choisir(lieu)
          }),
        )
      } catch (e) {
        if (numero === derniere) erreur.textContent = (e as Error).message
      }
    }, DELAI_FRAPPE_MS)
  })
}

export function ouvrirFicheAmi(ami: Ami | null, actions: ActionsFiche): void {
  const fond = document.createElement('div')
  fond.className = 'feuille'
  fond.innerHTML = gabarit(ami ? 'Modifier une personne' : 'Ajouter une personne', ami !== null && actions.supprimer !== undefined)
  document.body.append(fond)

  const form = fond.querySelector('form')!
  const champ = (n: string) => form.querySelector<HTMLInputElement>(`[name="${n}"]`)!
  const erreur = form.querySelector<HTMLParagraphElement>('.erreur')!
  const boutonEnregistrer = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
  const boutonSupprimer = form.querySelector<HTMLButtonElement>('[data-action="supprimer"]')
  let choisi: Lieu | null = ami ? { lat: ami.lat, lon: ami.lon, label: ami.adresse } : null
  let occupe = false

  champ('nom').value = ami?.nom ?? ''
  champ('adresse').value = ami?.adresse ?? ''
  champ('navigo').checked = ami?.navigo ?? false
  form.querySelector<HTMLInputElement>(`input[name="transport"][value="${ami?.transport ?? 'tc'}"]`)!.checked = true
  brancherAutocompletion(
    { champ: champ('adresse'), liste: form.querySelector('.propositions')!, aide: form.querySelector('.aide')!, erreur },
    (l) => { choisi = l },
  )

  const armerSuppression = (armee: boolean) => {
    if (!boutonSupprimer) return
    boutonSupprimer.textContent = armee ? TEXTE.confirmer : TEXTE.supprimer
    boutonSupprimer.classList.toggle('danger', armee)
    boutonSupprimer.classList.toggle('secondaire', !armee)
  }
  const fermer = () => fond.remove()

  /** Lance l'action, bloque les boutons pendant l'attente et les rend en cas d'erreur. */
  const tenter = async (bouton: HTMLButtonElement, texteAttente: string, action: () => Promise<void>) => {
    const texteInitial = bouton.textContent
    occupe = true
    erreur.textContent = ''
    bouton.textContent = texteAttente
    boutonEnregistrer.disabled = true
    if (boutonSupprimer) boutonSupprimer.disabled = true
    try {
      await action()
      fermer()
    } catch (e) {
      erreur.textContent = (e as Error).message
      bouton.textContent = texteInitial
      boutonEnregistrer.disabled = false
      if (boutonSupprimer) boutonSupprimer.disabled = false
      armerSuppression(false)
    } finally {
      occupe = false
    }
  }

  form.querySelector('[data-action="annuler"]')!.addEventListener('click', fermer)
  fond.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape' && !occupe) fermer()
  })
  boutonSupprimer?.addEventListener('click', () => {
    const supprimer = actions.supprimer
    if (occupe || !supprimer) return
    if (boutonSupprimer.textContent !== TEXTE.confirmer) {
      armerSuppression(true)
      return
    }
    void tenter(boutonSupprimer, TEXTE.suppression, supprimer)
  })
  form.addEventListener('submit', (evt) => {
    evt.preventDefault()
    if (occupe) return
    armerSuppression(false)
    if (!choisi) {
      erreur.textContent = TEXTE.choisirAdresse
      return
    }
    const lieu = choisi
    const transport = form.querySelector<HTMLInputElement>('input[name="transport"]:checked')!.value as Transport
    void tenter(boutonEnregistrer, TEXTE.enregistrement, () =>
      actions.enregistrer({
        nom: champ('nom').value,
        adresse: lieu.label,
        lat: lieu.lat,
        lon: lieu.lon,
        transport,
        navigo: champ('navigo').checked,
      }),
    )
  })
  champ('nom').focus()
}
