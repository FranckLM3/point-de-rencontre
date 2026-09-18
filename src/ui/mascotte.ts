/**
 * Tête de crocodile de la marque : un seul dessin (mêmes tracés), réutilisé à toutes les tailles
 * (glyphe d'en-tête 28 px, mascotte de connexion ~96 px, favicon `public/croco.svg`). Couleurs des
 * jetons palette uniquement (--accent, --accent-fond) ; si `public/croco.svg` doit changer, ce
 * fichier fait foi et le SVG statique doit être mis à jour pour rester identique (favicon, chargé
 * hors page, ne peut pas lire les variables CSS).
 */
export function mascotteCroco(classe: string, taille: number): string {
  return `<svg class="${classe}" viewBox="0 0 32 28" width="${taille}" height="${taille}" aria-hidden="true" focusable="false">
    <circle cx="10" cy="9" r="5" fill="var(--accent)" />
    <circle cx="22" cy="9" r="5" fill="var(--accent)" />
    <circle cx="10" cy="8.5" r="2" fill="var(--accent-fond)" />
    <circle cx="22" cy="8.5" r="2" fill="var(--accent-fond)" />
    <rect x="4" y="13" width="24" height="15" rx="6" fill="var(--accent)" />
    <circle cx="12" cy="16.5" r="1" fill="var(--accent-fond)" />
    <circle cx="20" cy="16.5" r="1" fill="var(--accent-fond)" />
    <path d="M4 24h24l-3 4-3-4-3 4-3-4-3 4-3-4-3 4-3-4Z" fill="var(--accent-fond)" />
  </svg>`
}
