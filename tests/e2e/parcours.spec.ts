import { expect, test, type Page, type Route } from '@playwright/test'
import type { Ami, Groupe } from '../../src/types'
import { simulerHoraires } from './horaires-simules'

const MOT_DE_PASSE = 'secret'
const MARSEILLE = { geometry: { coordinates: [5.3698, 43.2965] }, properties: { label: '1 La Canebière 13001 Marseille' } }

const depart = (): Ami[] => [
  { id: 'a', nom: 'Léa', adresse: '10 Rue de Rivoli 75004 Paris', lat: 48.8555, lon: 2.36041, transport: 'tc', navigo: true },
  { id: 'b', nom: 'Tom', adresse: '1 Place Bellecour 69002 Lyon', lat: 45.7578, lon: 4.832, transport: 'voiture', navigo: false },
]

interface Simulation {
  amis: Ami[]
  groupes: Groupe[]
  /** Bascule la réponse de GET amis en erreur 500, modifiable en cours de test. */
  echouerAmis: boolean
}

function estUnique(route: Route): boolean {
  const accept = route.request().headers()['accept'] ?? ''
  return accept.includes('vnd.pgrst.object')
}

function idDeLaRequete(route: Route): string | null {
  const params = new URL(route.request().url()).searchParams.get('id')
  return params ? params.replace(/^eq\./, '') : null
}

async function routerAmis(route: Route, s: Simulation): Promise<void> {
  const methode = route.request().method()
  if (methode === 'GET') {
    if (s.echouerAmis) return route.fulfill({ status: 500, json: { message: 'erreur simulée' } })
    return route.fulfill({ json: s.amis })
  }
  if (methode === 'POST') {
    const nouveau = { id: `n${s.amis.length}`, ...(route.request().postDataJSON() as Omit<Ami, 'id'>) }
    s.amis.push(nouveau)
    return route.fulfill({ status: 201, json: estUnique(route) ? nouveau : [nouveau] })
  }
  if (methode === 'PATCH') {
    const id = idDeLaRequete(route)
    const index = s.amis.findIndex((a) => a.id === id)
    if (index === -1) return route.fulfill({ status: 404, json: { code: 'PGRST116', message: 'introuvable' } })
    const patch = route.request().postDataJSON() as Partial<Ami>
    const modifie = { ...s.amis[index]!, ...patch }
    s.amis = s.amis.map((a, i) => (i === index ? modifie : a))
    return route.fulfill({ json: estUnique(route) ? modifie : [modifie] })
  }
  if (methode === 'DELETE') {
    const id = idDeLaRequete(route)
    s.amis = s.amis.filter((a) => a.id !== id)
    return route.fulfill({ status: 204, body: '' })
  }
  return route.fulfill({ status: 405, json: { message: `méthode ${methode} non simulée` } })
}

async function routerGroupes(route: Route, s: Simulation): Promise<void> {
  const methode = route.request().method()
  if (methode === 'GET') return route.fulfill({ json: s.groupes })
  if (methode === 'POST') {
    const corps = route.request().postDataJSON() as { nom: string; amis: string[] }
    const existant = s.groupes.find((g) => g.nom === corps.nom)
    const groupe: Groupe = existant ? { ...existant, amis: corps.amis } : { id: `g${s.groupes.length}`, nom: corps.nom, amis: corps.amis }
    s.groupes = existant ? s.groupes.map((g) => (g.id === groupe.id ? groupe : g)) : [...s.groupes, groupe]
    return route.fulfill({ status: 201, json: estUnique(route) ? groupe : [groupe] })
  }
  return route.fulfill({ status: 405, json: { message: `méthode ${methode} non simulée` } })
}

async function simuler(page: Page, echouerAmis = false): Promise<Simulation> {
  const s: Simulation = { amis: depart(), groupes: [], echouerAmis }
  await page.route(/tile\.openstreetmap\.org/, (r) => r.abort())
  await page.route('http://supabase.test/auth/v1/token**', async (route) => {
    const corps = route.request().postDataJSON() as { password: string }
    if (corps.password !== MOT_DE_PASSE) {
      return route.fulfill({ status: 400, json: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' } })
    }
    return route.fulfill({
      json: {
        access_token: 'jeton', token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r',
        user: { id: 'u', aud: 'authenticated', role: 'authenticated', email: 'groupe@test.local', app_metadata: {}, user_metadata: {}, created_at: '2026-09-17T00:00:00Z' },
      },
    })
  })
  await page.route('http://supabase.test/rest/v1/amis**', (route) => routerAmis(route, s))
  await page.route('http://supabase.test/rest/v1/groupes**', (route) => routerGroupes(route, s))
  await page.route('https://data.geopf.fr/**', (r) => r.fulfill({ json: { type: 'FeatureCollection', features: [MARSEILLE] } }))
  return s
}

/** Connexion sans attendre le rendu du panneau (utilisé quand le premier chargement doit échouer). */
async function connecter(page: Page): Promise<void> {
  await page.getByLabel('Mot de passe des Crocos').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Ouvrir la carte' }).click()
}

async function entrer(page: Page): Promise<void> {
  await connecter(page)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('entre 2')
}

/** D5 : sous 1024 px le panneau est un volet fermé (38dvh) sous la poignée ; il faut l'ouvrir
 * avant d'interagir avec le reste du panneau (invisible/masqué par la poignée sinon). Sur
 * ordinateur, la poignée est masquée par CSS (`display: none`) : `isVisible()` rend alors false. */
async function ouvrirVoletSiVisible(page: Page): Promise<void> {
  const poignee = page.locator('#poignee')
  if (await poignee.isVisible()) await poignee.click()
}

test('connexion, sélection, ajout d’une personne, test d’un lieu', async ({ page }) => {
  const erreurs: string[] = []
  page.on('pageerror', (e) => erreurs.push(e.message))

  await simuler(page)
  await page.goto('./')

  await page.getByLabel('Mot de passe des Crocos').fill('faux')
  await page.getByRole('button', { name: 'Ouvrir la carte' }).click()
  await expect(page.getByRole('alert')).toHaveText('Mot de passe incorrect.')
  await entrer(page)
  await ouvrirVoletSiVisible(page)

  await expect(page.locator('.cible')).toBeVisible()
  await expect(page.locator('.marqueur-personne')).toHaveCount(2)
  const nbCases = await page.locator('#legende .case').count()
  expect(nbCases).toBeGreaterThanOrEqual(1)
  expect(nbCases).toBeLessThanOrEqual(8)

  await expect(page.locator('#repaire')).toContainText('Le repaire')
  await page.getByRole('button', { name: 'Voir sur la carte' }).click()
  await expect(page.locator('.cible')).toBeVisible()
  // Voir sur la carte referme le volet sur mobile (D1) : on le rouvre pour continuer.
  await ouvrirVoletSiVisible(page)

  await page.getByLabel('Inclure Tom').uncheck()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('entre 1')
  await expect(page).toHaveURL(/sel=a/)
  await expect(page.locator('.marqueur-personne.inactif')).toHaveCount(1)

  await page.getByRole('button', { name: 'Tout le monde' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('entre 2')

  await page.locator('#amis').getByRole('button', { name: 'Ajouter un Croco' }).click()
  await page.getByLabel('Nom', { exact: true }).fill('Zoé')
  await page.getByLabel('Adresse').fill('canebiere')
  await page.getByRole('button', { name: MARSEILLE.properties.label }).click()
  await page.getByLabel('Voiture').check()
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByLabel('Inclure Zoé')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Modifier Zoé' })).toContainText('voiture')

  await page.getByLabel('Tester un lieu').fill('canebiere')
  await page.getByRole('button', { name: MARSEILLE.properties.label }).click()
  await expect(page.locator('#resultat-lieu')).toContainText('Léa')
  await page.getByRole('button', { name: 'Retirer le lieu' }).click()
  await expect(page.locator('#resultat-lieu')).toBeEmpty()

  await expect(page.locator('#villes .ville-carte').first()).toBeVisible()

  await page.screenshot({ path: `test-results/vue-${test.info().project.name}.png` })

  expect(erreurs, `erreurs JS non attendues : ${erreurs.join(', ')}`).toEqual([])
})

test('le focus reste sur la case cochée après le rafraîchissement au clavier', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ordinateur', 'ordinateur seulement (E3)')
  await simuler(page)
  await page.goto('./')
  await entrer(page)

  const caseTom = page.getByLabel('Inclure Tom')
  await caseTom.focus()
  await page.keyboard.press('Space')
  await expect(caseTom).toBeFocused()
})

test('suppression d’une personne, avec confirmation', async ({ page }) => {
  await simuler(page)
  await page.goto('./')
  await entrer(page)
  await ouvrirVoletSiVisible(page)

  await page.getByRole('button', { name: 'Modifier Tom' }).click()
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(page.getByLabel('Inclure Tom')).toBeVisible()

  await page.getByRole('button', { name: 'Confirmer la suppression' }).click()
  await expect(page.getByLabel('Inclure Tom')).toHaveCount(0)
})

test('enregistrer un groupe', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ordinateur', 'ordinateur seulement')
  await simuler(page)
  await page.goto('./')
  await entrer(page)

  await page.getByLabel('Inclure Tom').uncheck()
  await page.getByRole('button', { name: 'Enregistrer la sélection' }).click()
  await page.getByLabel('Nom du groupe').fill('Sud')
  await page.getByRole('button', { name: 'Enregistrer le groupe' }).click()
  await expect(page.getByLabel('Groupe enregistré')).toContainText('Sud')
})

test('états vide et erreur', async ({ page }) => {
  const s = await simuler(page, true)
  await page.goto('./')
  await connecter(page)

  await expect(page.locator('#message')).toBeVisible()
  const relancer = page.getByRole('button', { name: 'Réessayer' })
  await expect(relancer).toBeVisible()

  s.echouerAmis = false
  await relancer.click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('entre 2')
  await ouvrirVoletSiVisible(page)

  await page.getByRole('button', { name: 'Aucune' }).click()
  await expect(page.locator('#villes')).toContainText('Coche au moins un Croco pour voir la carte.')
  await expect(page.locator('#legende')).toBeHidden()
  await expect(page.locator('#repaire')).toBeEmpty()
})

test('sur mobile, la carte est visible en arrivant et le volet s’ouvre sans déborder', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile seulement (D5, D7)')
  await simuler(page)
  await page.goto('./')
  await entrer(page)

  await expect(page.locator('#carte')).toBeVisible()
  const poignee = page.locator('#poignee')
  await expect(poignee).toHaveText('Voir la liste')
  await expect(poignee).toHaveAttribute('aria-expanded', 'false')

  await poignee.click()
  await expect(poignee).toHaveAttribute('aria-expanded', 'true')
  await expect(poignee).toHaveText('Réduire')

  const sansDebordement = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(sansDebordement).toBe(true)
})

/** Le mode transports calcule de façon asynchrone : on attend la fin du chargement, pas un délai. */
async function passerEnTransports(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Transports' }).click()
  await expect(page.locator('#chargement')).toHaveText('Chargement des horaires…')
  await expect(page.locator('#chargement')).toBeEmpty()
  await expect(page.locator('.sous-titre')).toContainText('En transports')
}

test('mode transports : zones en heures, gares et liens de réservation', async ({ page }) => {
  await simuler(page)
  await simulerHoraires(page)
  await page.goto('./')
  await entrer(page)
  await ouvrirVoletSiVisible(page)

  await passerEnTransports(page)
  await expect(page).toHaveURL(/mode=tc/)
  await expect(page.locator('#legende .case').first()).toContainText('h')

  const premiere = page.locator('#villes .ville-carte').first()
  await expect(premiere).toBeVisible()
  await premiere.locator('.ville-entete').click()
  const detail = premiere.locator('.zone-detail')
  await expect(detail).toContainText('Paris Gare de Lyon')
  await expect(detail).toContainText('Lyon-Part-Dieu')
  // Les numéros de hall sont retirés des noms de gare.
  await expect(detail).not.toContainText('Hall')
  await expect(detail.getByRole('link', { name: 'SNCF Connect' })).toHaveAttribute('target', '_blank')
  await expect(detail.getByRole('link', { name: 'SNCF Connect' })).toHaveAttribute('rel', 'noopener')
  await expect(detail.getByRole('link', { name: 'Trainline' })).toBeVisible()
})

test('mode transports en prix : légende et menu en euros', async ({ page }) => {
  await simuler(page)
  await simulerHoraires(page)
  await page.goto('./')
  await entrer(page)
  await ouvrirVoletSiVisible(page)

  await passerEnTransports(page)
  await page.getByRole('button', { name: 'Prix', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Prix maximum' })).toBeVisible()
  await expect(page.locator('#legende .case').first()).toContainText('€')
  await expect(page).toHaveURL(/grandeur=prix/)
})

test('horaires indisponibles : bandeau, repli en vol d’oiseau, puis réessai', async ({ page }) => {
  await simuler(page)
  const horaires = await simulerHoraires(page)
  horaires.disponibles = false
  await page.goto('./')
  await entrer(page)
  await ouvrirVoletSiVisible(page)

  await page.getByRole('button', { name: 'Transports' }).click()
  await expect(page.locator('#message')).toContainText('Horaires des trains indisponibles pour le moment.')
  await expect(page.getByRole('button', { name: 'Vol d’oiseau' })).toHaveAttribute('aria-pressed', 'true')

  horaires.disponibles = true
  await page.getByRole('button', { name: 'Réessayer' }).click()
  await expect(page.locator('.sous-titre')).toContainText('En transports')
  await expect(page.locator('#legende .case').first()).toContainText('h')
  await expect(page.locator('#message')).toBeEmpty()
})
