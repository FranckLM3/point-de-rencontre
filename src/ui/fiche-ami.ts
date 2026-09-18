import { chercherAdresses, LONGUEUR_MIN } from '../donnees/geocodage'
import type { Ami, Lieu, NouvelAmi, Transport } from '../types'
import { echapper } from './format'
import { ICONE_COCHE, svgTransport } from './icones'
import { initiales } from './marqueurs'
import { navigoDisponible } from './personnes'
import { afficherToast } from './toast'

const DELAI_FRAPPE_MS = 250

const TEXTE = {
  enregistrer: 'Enregistrer',
  enregistrement: 'Enregistrement…',
  retirer: 'Retirer ce Croco',
  confirmerRetrait: 'Confirmer le retrait',
  retrait: 'Retrait…',
  aucuneAdresse: 'Aucune adresse trouvée. Ajoute le code postal.',
  choisirAdresse: 'Choisis une adresse dans la liste proposée.',
} as const

export interface ActionsFiche {
  enregistrer: (a: NouvelAmi) => Promise<void>
  supprimer?: () => Promise<void>
}

const SEGMENTS_TRANSPORT: { valeur: Transport; libelle: string }[] = [
  { valeur: 'tc', libelle: 'Transports' },
  { valeur: 'voiture', libelle: 'Voiture' },
]

const segmentTransport = (t: { valeur: Transport; libelle: string }, coche: Transport): string => `
  <label class="segment">
    <input type="radio" name="transport" value="${t.valeur}" ${t.valeur === coche ? 'checked' : ''} />
    ${svgTransport(t.valeur)}<span>${t.libelle}</span>
  </label>`

const gabarit = (titre: string, modifiable: boolean, transportCoche: Transport): string => `
  <form method="dialog">
    <header class="fiche-entete">
      <span class="avatar-ami apercu" aria-hidden="true"></span>
      <h2 id="fiche-titre">${titre}</h2>
    </header>
    <label>Prénom ou surnom <input class="champ" name="nom" required maxlength="60" /></label>
    <label>Adresse <input class="champ" name="adresse" required autocomplete="off" /></label>
    <ul class="propositions"></ul>
    <p class="aide" role="status"></p>
    <p class="adresse-retenue"></p>
    <fieldset class="segmente transport-segmente" role="radiogroup" aria-label="Se déplace en">
      ${SEGMENTS_TRANSPORT.map((t) => segmentTransport(t, transportCoche)).join('')}
    </fieldset>
    <label class="option navigo" hidden><input type="checkbox" name="navigo" /> Abonné Navigo</label>
    <p class="erreur" role="alert"></p>
    <div class="pied-fiche">
      <div class="rang actions-principales">
        <button class="pastille" type="submit">${TEXTE.enregistrer}</button>
        <button class="pastille secondaire" type="button" data-action="annuler">Annuler</button>
      </div>
      ${modifiable ? `<button class="lien-discret" type="button" data-action="supprimer">${TEXTE.retirer}</button>` : ''}
    </div>
  </form>`

const transportConnu = (t: unknown): Transport => (t === 'voiture' ? 'voiture' : 'tc')

interface ElementsRecherche {
  champ: HTMLInputElement
  liste: HTMLUListElement
  aide: HTMLElement
  erreur: HTMLElement
}

function brancherAutocompletion({ champ, liste, aide, erreur }: ElementsRecherche, choisir: (l: Lieu | null) => void): void {
  let minuterie = 0
  // Seule la dernière recherche lancée a le droit d'afficher son résultat ;
  // un choix dans la liste périme aussi les recherches encore en vol.
  let derniere = 0
  const afficher = (lieux: Lieu[]) => {
    liste.innerHTML = lieux.map((l, i) => `<li><button type="button" data-i="${i}">${echapper(l.label)}</button></li>`).join('')
    liste.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        derniere++
        const lieu = lieux[Number(b.dataset.i)]!
        champ.value = lieu.label
        liste.innerHTML = ''
        aide.textContent = ''
        choisir(lieu)
      }),
    )
  }
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
        afficher(lieux)
      } catch (e) {
        if (numero !== derniere) return
        liste.innerHTML = ''
        erreur.textContent = (e as Error).message
      }
    }, DELAI_FRAPPE_MS)
  })
}

/** Ouvre la fiche en dialogue modal ; rend false si une fiche est déjà ouverte. */
export function ouvrirFicheAmi(ami: Ami | null, actions: ActionsFiche): boolean {
  if (document.querySelector('dialog.feuille')) return false
  const precedent = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const dialogue = document.createElement('dialog')
  dialogue.className = 'feuille'
  dialogue.setAttribute('aria-labelledby', 'fiche-titre')
  dialogue.innerHTML = gabarit(ami ? `Modifier ${ami.nom}` : 'Nouveau Croco', ami !== null && actions.supprimer !== undefined, transportConnu(ami?.transport))
  document.body.append(dialogue)
  // jsdom n'implémente pas showModal : l'attribut open suffit alors.
  if (typeof dialogue.showModal === 'function') dialogue.showModal()
  else dialogue.setAttribute('open', '')

  const form = dialogue.querySelector('form')!
  const champ = (n: string) => form.querySelector<HTMLInputElement>(`[name="${n}"]`)!
  const erreur = form.querySelector<HTMLParagraphElement>('.erreur')!
  const avatar = form.querySelector<HTMLElement>('.avatar-ami.apercu')!
  const adresseRetenue = form.querySelector<HTMLParagraphElement>('.adresse-retenue')!
  const champNavigo = form.querySelector<HTMLLabelElement>('label.navigo')!
  const boutonEnregistrer = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
  const boutonSupprimer = form.querySelector<HTMLButtonElement>('[data-action="supprimer"]')
  let choisi: Lieu | null = ami ? { lat: ami.lat, lon: ami.lon, label: ami.adresse } : null
  let occupe = false
  let arme = false

  const majAvatar = () => { avatar.textContent = initiales(champ('nom').value || '?') }
  const majAdresseRetenue = () => {
    adresseRetenue.innerHTML = choisi ? `${ICONE_COCHE}Adresse retenue : ${echapper(choisi.label)}` : ''
    const eligible = choisi ? navigoDisponible(choisi.label) : false
    champNavigo.hidden = !eligible
    if (!eligible) champ('navigo').checked = false
  }

  champ('nom').value = ami?.nom ?? ''
  champ('adresse').value = ami?.adresse ?? ''
  champ('navigo').checked = ami?.navigo ?? false
  majAvatar()
  majAdresseRetenue()
  champ('nom').addEventListener('input', majAvatar)
  brancherAutocompletion(
    { champ: champ('adresse'), liste: form.querySelector('.propositions')!, aide: form.querySelector('.aide')!, erreur },
    (l) => { choisi = l; majAdresseRetenue() },
  )

  const armerSuppression = (valeur: boolean) => {
    arme = valeur
    if (!boutonSupprimer) return
    boutonSupprimer.textContent = valeur ? TEXTE.confirmerRetrait : TEXTE.retirer
    boutonSupprimer.classList.toggle('danger-texte', valeur)
  }
  const bloquer = (valeur: boolean) => {
    occupe = valeur
    boutonEnregistrer.disabled = valeur
    if (boutonSupprimer) boutonSupprimer.disabled = valeur
  }
  const fermer = () => {
    if (!dialogue.isConnected) return
    dialogue.remove()
    if (precedent?.isConnected) precedent.focus()
  }
  const fermerSiLibre = (evt?: Event) => {
    evt?.preventDefault()
    if (!occupe) fermer()
  }

  /** Lance l'action, bloque les boutons pendant l'attente et les rend en cas d'erreur. */
  const tenter = async (bouton: HTMLButtonElement, texteAttente: string, action: () => Promise<void>, apresSucces?: () => void) => {
    const texteInitial = bouton.textContent
    erreur.textContent = ''
    bouton.textContent = texteAttente
    bloquer(true)
    try {
      await action()
      bloquer(false)
      fermer()
      apresSucces?.()
    } catch (e) {
      erreur.textContent = (e as Error).message
      bouton.textContent = texteInitial
      bloquer(false)
      armerSuppression(false)
    }
  }

  form.querySelector('[data-action="annuler"]')!.addEventListener('click', () => fermerSiLibre())
  dialogue.addEventListener('cancel', fermerSiLibre)
  dialogue.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') fermerSiLibre(evt)
  })
  boutonSupprimer?.addEventListener('click', () => {
    const supprimer = actions.supprimer
    if (occupe || !supprimer) return
    if (!arme) {
      armerSuppression(true)
      return
    }
    void tenter(boutonSupprimer, TEXTE.retrait, supprimer)
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
    const nom = champ('nom').value.trim()
    const transport = transportConnu(form.querySelector<HTMLInputElement>('input[name="transport"]:checked')?.value)
    void tenter(
      boutonEnregistrer,
      TEXTE.enregistrement,
      () =>
        actions.enregistrer({
          nom: champ('nom').value,
          adresse: lieu.label,
          lat: lieu.lat,
          lon: lieu.lon,
          transport,
          navigo: champ('navigo').checked,
        }),
      () => afficherToast(`${nom} ${ami ? 'modifiée' : 'ajoutée'}`),
    )
  })
  champ('nom').focus()
  return true
}
