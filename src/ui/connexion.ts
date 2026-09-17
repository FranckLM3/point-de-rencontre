const LIBELLE_BOUTON = 'Ouvrir la carte'

export function afficherConnexion(
  racine: HTMLElement,
  connecter: (mdp: string) => Promise<string | null>,
  succes: () => void,
): void {
  racine.innerHTML = `
    <main class="connexion">
      <form>
        <h1>Point de rencontre</h1>
        <label for="mdp">Mot de passe du groupe</label>
        <input id="mdp" class="champ" type="password" autocomplete="current-password" required />
        <p class="erreur" role="alert"></p>
        <button class="pastille" type="submit">${LIBELLE_BOUTON}</button>
      </form>
    </main>`
  const form = racine.querySelector('form')!
  const champ = racine.querySelector<HTMLInputElement>('#mdp')!
  const erreur = racine.querySelector<HTMLParagraphElement>('.erreur')!
  const bouton = racine.querySelector<HTMLButtonElement>('button[type="submit"]')!
  form.addEventListener('submit', async (evt) => {
    evt.preventDefault()
    if (bouton.disabled) return
    erreur.textContent = ''
    bouton.disabled = true
    let message: string | null
    try {
      message = await connecter(champ.value)
    } catch (e) {
      message = (e as Error).message
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
