const DUREE_MS = 3000

/** Petite confirmation temporaire, en bas de l'écran. `role="status"` : lue sans interrompre. */
export function afficherToast(message: string): void {
  const el = document.createElement('p')
  el.className = 'toast'
  el.setAttribute('role', 'status')
  el.textContent = message
  document.body.append(el)
  window.setTimeout(() => el.remove(), DUREE_MS)
}
