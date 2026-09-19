// En-têtes CORS de la fonction `voiture` : le navigateur envoie d'abord une requête
// OPTIONS de contrôle ; sans ces en-têtes, il bloque l'appel réel et la fonction ne
// reçoit jamais rien. Module pur (ni Deno ni navigateur) pour être testé avec Vitest.

/** Le site publié en premier : c'est la valeur renvoyée à une origine inconnue. */
export const ORIGINES_AUTORISEES = [
  'https://francklm3.github.io',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
] as const

export function enTetesCors(origine: string | null): Record<string, string> {
  const autorisee = origine && (ORIGINES_AUTORISEES as readonly string[]).includes(origine) ? origine : ORIGINES_AUTORISEES[0]
  return {
    'Access-Control-Allow-Origin': autorisee,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}
