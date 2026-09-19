import { mascotteCroco } from './mascotte'

const LIBELLE_BOUTON = 'Ouvrir la carte'
const NB_DENTS = 15
const MESSAGE_ECHEC = 'Connexion impossible.'
const TAILLE_MASCOTTE = 96

export function afficherConnexion(
  racine: HTMLElement,
  connecter: (mdp: string) => Promise<string | null>,
  succes: () => void,
  messageInitial = '',
): void {
  racine.innerHTML = `
    <main class="connexion">
      <form>
        <div class="dents" aria-hidden="true">${'<span></span>'.repeat(NB_DENTS)}</div>
        ${mascotteCroco('mascotte', TAILLE_MASCOTTE)}
        <h1>Les Crocos</h1>
        <p class="accroche">La carte pour savoir où se retrouver entre Crocos.</p>
        <label for="mdp">Mot de passe des Crocos</label>
        <input id="mdp" class="champ" type="password" autocomplete="current-password" required />
        <p class="erreur" role="alert"></p>
        <button class="pastille" type="submit">${LIBELLE_BOUTON}</button>
      </form>
    </main>`
  const form = racine.querySelector('form')!
  const champ = racine.querySelector<HTMLInputElement>('#mdp')!
  const erreur = racine.querySelector<HTMLParagraphElement>('.erreur')!
  const bouton = racine.querySelector<HTMLButtonElement>('button[type="submit"]')!
  erreur.textContent = messageInitial
  form.addEventListener('submit', async (evt) => {
    evt.preventDefault()
    if (bouton.disabled) return
    erreur.textContent = ''
    bouton.disabled = true
    let message: string | null
    try {
      message = await connecter(champ.value)
    } catch (e) {
      message = e instanceof Error && e.message ? e.message : MESSAGE_ECHEC
    }
    bouton.disabled = false
    if (message) {
      erreur.textContent = message
      champ.select()
      return
    }
    succes()
  })
}

const LONGUEUR_MIN = 8

/** Après le lien « mot de passe oublié » : choisir le nouveau mot de passe du groupe, deux fois. */
export function afficherNouveauMotDePasse(
  racine: HTMLElement,
  changer: (mdp: string) => Promise<string | null>,
  succes: () => void,
): void {
  racine.innerHTML = `
    <main class="connexion">
      <form>
        <div class="dents" aria-hidden="true">${'<span></span>'.repeat(NB_DENTS)}</div>
        ${mascotteCroco('mascotte', TAILLE_MASCOTTE)}
        <h1>Les Crocos</h1>
        <p class="accroche">Choisis le nouveau mot de passe, puis donne-le aux Crocos.</p>
        <label for="nouveau">Nouveau mot de passe des Crocos</label>
        <input id="nouveau" class="champ" type="password" autocomplete="new-password" minlength="${LONGUEUR_MIN}" required />
        <label for="confirmation">Encore une fois</label>
        <input id="confirmation" class="champ" type="password" autocomplete="new-password" required />
        <p class="erreur" role="alert"></p>
        <button class="pastille" type="submit">Enregistrer et ouvrir la carte</button>
      </form>
    </main>`
  const form = racine.querySelector('form')!
  const nouveau = racine.querySelector<HTMLInputElement>('#nouveau')!
  const confirmation = racine.querySelector<HTMLInputElement>('#confirmation')!
  const erreur = racine.querySelector<HTMLParagraphElement>('.erreur')!
  const bouton = racine.querySelector<HTMLButtonElement>('button[type="submit"]')!
  form.addEventListener('submit', async (evt) => {
    evt.preventDefault()
    if (bouton.disabled) return
    erreur.textContent = ''
    if (nouveau.value.length < LONGUEUR_MIN) {
      erreur.textContent = `${LONGUEUR_MIN} caractères au moins.`
      nouveau.focus()
      return
    }
    if (nouveau.value !== confirmation.value) {
      erreur.textContent = 'Les deux mots de passe sont différents.'
      confirmation.select()
      return
    }
    bouton.disabled = true
    let message: string | null
    try {
      message = await changer(nouveau.value)
    } catch (e) {
      message = e instanceof Error && e.message ? e.message : MESSAGE_ECHEC
    }
    bouton.disabled = false
    if (message) {
      erreur.textContent = message
      return
    }
    succes()
  })
}
