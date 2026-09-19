import { expect, test, type Page, type Route } from '@playwright/test'
import type { Ami, Groupe } from '../../src/types'
import { simulerHoraires, type HorairesSimules } from './horaires-simules'
import { simulerVoiture } from './voiture-simulee'

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
  /** Mode par défaut (chacun son moyen) : Léa a besoin des horaires même sans passer par « Transports ». */
  horaires: HorairesSimules
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

/**
 * Le mode par défaut (chacun son moyen, décision 2) a besoin des horaires dès le premier chargement
 * (Léa est en transports) : les horaires sont donc simulées ici pour tous les tests, pas seulement
 * ceux qui testent le mode Transports explicitement.
 */
async function simuler(page: Page, echouerAmis = false): Promise<Simulation> {
  const s: Simulation = { amis: depart(), groupes: [], echouerAmis, horaires: { disponibles: true } }
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
  // Grille voiture publiée pas encore en ligne (Task 7) : la table temps et la fonction sont
  // simulées ici, avec des couches vides par défaut (`simulerVoiture` peut ensuite les enrichir).
  await page.route('http://supabase.test/rest/v1/temps**', (r) => r.fulfill({ json: [] }))
  await page.route('http://supabase.test/functions/v1/voiture', (r) => r.fulfill({ json: { etat: 'calcule' } }))
  s.horaires = await simulerHoraires(page)
  return s
}

/** Connexion sans attendre le rendu du panneau (utilisé quand le premier chargement doit échouer). */
async function connecter(page: Page): Promise<void> {
  await page.getByLabel('Mot de passe des Crocos').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Ouvrir la carte' }).click()
}

/** Attend la fin du premier calcul (horaires et/ou grille voiture, asynchrones en mode par défaut). */
async function entrer(page: Page): Promise<void> {
  await connecter(page)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('entre 2')
  await expect(page.locator('#chargement')).toBeEmpty()
}

/** D5 : sous 1024 px le panneau est un volet fermé (38dvh) sous la poignée ; il faut l'ouvrir
 * avant d'interagir avec le reste du panneau (invisible/masqué par la poignée sinon). Sur
 * ordinateur, la poignée est masquée par CSS (`display: none`) : `isVisible()` rend alors false. */
async function ouvrirVoletSiVisible(page: Page): Promise<void> {
  const poignee = page.locator('#poignee')
  if (await poignee.isVisible()) await poignee.click()
}

async function fermerVoletSiVisible(page: Page): Promise<void> {
  const poignee = page.locator('#poignee')
  if ((await poignee.isVisible()) && (await poignee.getAttribute('aria-expanded')) === 'true') await poignee.click()
}

/** Bascule l'interrupteur « Inclure X » (D1) jusqu'à l'état voulu, sans dépendre de l'état de départ. */
async function definirInclusion(page: Page, nom: string, inclure: boolean): Promise<void> {
  const interrupteur = page.getByRole('switch', { name: `Inclure ${nom}` })
  if ((await interrupteur.getAttribute('aria-checked')) !== String(inclure)) await interrupteur.click()
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

  // Mode par défaut (chacun son moyen, décision 2) : Tom est en voiture, sa couche n'est pas encore
  // calculée (aucune simulation de la table temps ici) → indicateur dans la liste et bandeau discret.
  await expect(page.locator('.ligne-ami', { hasText: 'Tom' }).locator('.calcul-en-cours')).toContainText('calcul en cours')
  await expect(page.locator('#avis-voiture')).toContainText('Tom')

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

  await definirInclusion(page, 'Tom', false)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('entre 1')
  await expect(page.locator('#copier-lien')).toHaveAttribute('data-lien', /sel=a/)
  await expect(page.locator('.marqueur-personne.inactif')).toHaveCount(1)

  await page.locator('[data-action="tous"]').click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('entre 2')

  await page.locator('#amis').getByRole('button', { name: '+ Ajouter un Croco' }).click()
  await page.getByLabel('Prénom ou surnom', { exact: true }).fill('Zoé')
  await page.getByLabel('Adresse').fill('canebiere')
  await page.getByRole('button', { name: MARSEILLE.properties.label }).click()
  await page.getByLabel('Voiture').check()
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Inclure Zoé' })).toBeVisible()
  await expect(page.locator('.ligne-ami', { hasText: 'Zoé' })).toContainText('voiture')

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

  const interrupteurTom = page.getByRole('switch', { name: 'Inclure Tom' })
  await interrupteurTom.focus()
  await page.keyboard.press('Space')
  await expect(interrupteurTom).toBeFocused()
})

test('suppression d’une personne, avec confirmation', async ({ page }) => {
  await simuler(page)
  await page.goto('./')
  await entrer(page)
  await ouvrirVoletSiVisible(page)

  await page.getByRole('button', { name: 'Modifier Tom' }).click()
  await page.getByRole('button', { name: 'Retirer ce Croco', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Inclure Tom' })).toBeVisible()

  await page.getByRole('button', { name: 'Confirmer le retrait' }).click()
  await expect(page.getByRole('switch', { name: 'Inclure Tom' })).toHaveCount(0)
})

test('enregistrer un groupe', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ordinateur', 'ordinateur seulement')
  await simuler(page)
  await page.goto('./')
  await entrer(page)

  await definirInclusion(page, 'Tom', false)
  await page.locator('[data-action="groupe"]').click()
  await page.getByLabel('Nom du groupe').fill('Sud')
  await page.getByRole('button', { name: 'Enregistrer le groupe' }).click()
  await expect(page.getByRole('button', { name: 'Sud' })).toBeVisible()
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

  await page.locator('[data-action="aucun"]').click()
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
  await expect(page.locator('#chargement')).toBeEmpty()
  await expect(page.locator('.sous-titre')).toContainText('En transports')
}

test('mode transports : zones en heures, gares et liens de réservation', async ({ page }) => {
  await simuler(page)
  await page.goto('./')
  await entrer(page)
  await ouvrirVoletSiVisible(page)

  await passerEnTransports(page)
  await expect(page.locator('#copier-lien')).toHaveAttribute('data-lien', /mode=tc/)
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
  await page.goto('./')
  await entrer(page)
  await ouvrirVoletSiVisible(page)

  await passerEnTransports(page)
  await page.getByRole('button', { name: 'Prix', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Prix maximum' })).toBeVisible()
  await expect(page.locator('#legende .case').first()).toContainText('€')
  await expect(page.locator('#copier-lien')).toHaveAttribute('data-lien', /grandeur=prix/)
})

test('bouton Réinitialiser : remet mode, critère et lien partagé aux valeurs par défaut, puis disparaît', async ({ page }) => {
  await simuler(page)
  await page.goto('./')
  await entrer(page)
  await ouvrirVoletSiVisible(page)

  await expect(page.locator('#reinitialiser-filtres')).toHaveCount(0)

  await passerEnTransports(page)
  await page.getByRole('button', { name: 'Pire trajet', exact: true }).click()
  await expect(page.locator('#copier-lien')).toHaveAttribute('data-lien', /mode=tc/)
  await expect(page.locator('#copier-lien')).toHaveAttribute('data-lien', /critere=pire/)

  const reinitialiser = page.getByRole('button', { name: 'Réinitialiser' })
  await expect(reinitialiser).toBeVisible()
  await reinitialiser.click()

  await expect(page.locator('#copier-lien')).toHaveAttribute('data-lien', /mode=mixte/)
  await expect(page.locator('#copier-lien')).toHaveAttribute('data-lien', /critere=moyenne/)
  await expect(page.locator('[data-mode="mixte"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-critere="moyenne"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#reinitialiser-filtres')).toHaveCount(0)
})

test('actualiser ramène au début ; un lien partagé ouvre sa vue une fois puis l’adresse est nettoyée', async ({ page }) => {
  await simuler(page)
  await page.goto('./')
  await entrer(page)
  await ouvrirVoletSiVisible(page)
  await passerEnTransports(page)
  await page.getByRole('button', { name: 'Pire trajet', exact: true }).click()
  await expect(page.locator('[data-critere="pire"]')).toHaveAttribute('aria-pressed', 'true')
  // L'adresse de la page ne garde pas les réglages.
  expect(new URL(page.url()).search).toBe('')

  await page.reload()
  await page.getByRole('heading', { level: 1 }).waitFor()
  await ouvrirVoletSiVisible(page)
  await expect(page.locator('[data-mode="mixte"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-critere="moyenne"]')).toHaveAttribute('aria-pressed', 'true')

  // Un lien partagé : la vue s'ouvre, puis l'adresse redevient nue.
  await page.goto('./?mode=tc&critere=pire')
  await page.getByRole('heading', { level: 1 }).waitFor()
  await ouvrirVoletSiVisible(page)
  await expect(page.locator('[data-mode="tc"]')).toHaveAttribute('aria-pressed', 'true')
  expect(new URL(page.url()).search).toBe('')
})

/**
 * Ces deux tests utilisent « Tester un lieu » plutôt qu'une carte de ville : la cible est ainsi
 * connue à l'avance (gares déterministes), et le chemin passe par le même appel unique
 * (`carte.trajets`, D8) qu'une carte de ville ou une étiquette cliquée sur la carte.
 */
async function testerUnLieu(page: Page, recherche: string, libelle: string): Promise<void> {
  await page.getByLabel('Tester un lieu').fill(recherche)
  await page.getByRole('button', { name: libelle }).click()
}

test('mode transports : le trajet en train suit les gares réelles, pas une ligne directe', async ({ page }) => {
  await simuler(page)
  const lyon = { geometry: { coordinates: [4.86, 45.76] }, properties: { label: 'Près de Lyon' } }
  await page.route('https://data.geopf.fr/**', (route) => route.fulfill({ json: { type: 'FeatureCollection', features: [lyon] } }))
  await page.goto('./')
  await entrer(page)
  await ouvrirVoletSiVisible(page)
  await passerEnTransports(page)

  await testerUnLieu(page, 'lyon', lyon.properties.label)
  // Depuis Paris (Léa), le trajet vers Lyon passe par Dijon : au moins 3 points, pas une ligne à 2 points.
  const points = await page.locator('svg path.trace-train').evaluateAll((paths) =>
    paths.map((p) => (p.getAttribute('d')?.match(/[ML]/g) ?? []).length),
  )
  expect(points.some((n) => n > 2)).toBe(true)
  // Léa rejoint la Gare de Lyon en métro : tracé par les stations (Hôtel de Ville, Gare de Lyon).
  await expect(page.locator('svg path.trace-metro')).toHaveCount(1)
})

test('lien « mot de passe oublié » : choisir le nouveau mot de passe puis ouvrir la carte', async ({ page }) => {
  await simuler(page)
  const utilisateur = { id: 'u', aud: 'authenticated', role: 'authenticated', email: 'groupe@test.local', app_metadata: {}, user_metadata: {}, created_at: '2026-09-17T00:00:00Z' }
  let nouveau = ''
  await page.route('http://supabase.test/auth/v1/user**', async (route) => {
    if (route.request().method() === 'PUT') nouveau = (route.request().postDataJSON() as { password: string }).password
    return route.fulfill({ json: utilisateur })
  })
  const expire = Math.floor(Date.now() / 1000) + 3600
  await page.goto(`./#access_token=jeton&expires_at=${expire}&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery`)
  await page.getByLabel('Nouveau mot de passe des Crocos').fill('Crocodiles-2026')
  await page.getByLabel('Encore une fois').fill('Crocodiles-2026')
  await page.getByRole('button', { name: 'Enregistrer et ouvrir la carte' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('entre 2')
  expect(nouveau).toBe('Crocodiles-2026')
  expect(page.url()).not.toContain('access_token')
})

test('lien expiré : retour à la connexion avec un message clair', async ({ page }) => {
  await simuler(page)
  await page.goto('./#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
  await expect(page.getByRole('alert')).toContainText('Ce lien a expiré ou a déjà servi')
  await expect(page.getByLabel('Mot de passe des Crocos')).toBeVisible()
})

test('le « ? » du repaire déplie l’explication du calcul', async ({ page }) => {
  await simuler(page)
  await page.goto('./')
  await entrer(page)
  await ouvrirVoletSiVisible(page)
  const aide = page.locator('#repaire details.aide')
  await aide.locator('summary').click()
  await expect(aide.locator('.aide-texte')).toContainText('le repaire est l’endroit où')
})

test('clic sur une personne de la carte : fiche avec les étapes de son trajet vers le lieu', async ({ page }) => {
  await simuler(page)
  const lyon = { geometry: { coordinates: [4.86, 45.76] }, properties: { label: 'Près de Lyon' } }
  await page.route('https://data.geopf.fr/**', (route) => route.fulfill({ json: { type: 'FeatureCollection', features: [lyon] } }))
  await page.goto('./')
  await entrer(page)
  await ouvrirVoletSiVisible(page)
  await passerEnTransports(page)
  await testerUnLieu(page, 'lyon', lyon.properties.label)
  await fermerVoletSiVisible(page)

  await page.locator('.leaflet-marker-icon[title="Léa"]').click()
  const fiche = page.locator('.leaflet-popup .detail-personne')
  await expect(fiche.locator('h3')).toContainText('Léa')
  await expect(fiche.locator('.total')).toContainText('Vers Près de Lyon')
  await expect(fiche.locator('.etapes li').filter({ hasText: / de train : / })).toHaveCount(1)
})

test('mode transports : sélectionner une cible plusieurs fois ne double jamais les tracés (D8)', async ({ page }) => {
  await simuler(page)
  // Près de Dijon : à plus de 30 km de Paris et de Lyon pour les deux Crocos (le trajet direct,
  // pointillé, ne l'emporte jamais), mais à moins de 50 km d'une gare (Dijon-Ville elle-même).
  const dijon = { geometry: { coordinates: [5.0415, 47.322] }, properties: { label: 'Vers Dijon' } }
  const presDeDijon = { geometry: { coordinates: [5.1, 47.35] }, properties: { label: 'Près de Dijon' } }
  await page.route('https://data.geopf.fr/**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? ''
    const feature = q.includes('autre') ? presDeDijon : dijon
    return route.fulfill({ json: { type: 'FeatureCollection', features: [feature] } })
  })
  await page.goto('./')
  await entrer(page)
  await ouvrirVoletSiVisible(page)
  await passerEnTransports(page)

  const traces = page.locator('svg path.trace-train')
  await testerUnLieu(page, 'dijon', dijon.properties.label)
  // Un tracé par point de départ distinct : Léa (Paris) et Tom (Lyon).
  await expect(traces).toHaveCount(2)

  // Sélectionner la même cible une deuxième fois : toujours deux tracés, jamais quatre.
  await testerUnLieu(page, 'dijon', dijon.properties.label)
  await expect(traces).toHaveCount(2)

  // Une cible différente : la couche précédente est bien effacée, toujours deux tracés.
  await testerUnLieu(page, 'autre', presDeDijon.properties.label)
  await expect(traces).toHaveCount(2)
})

test('horaires indisponibles dès le chargement (mode par défaut chacun son moyen) : repli à vol d’oiseau, bandeau, puis réessai', async ({ page }) => {
  const s = await simuler(page)
  s.horaires.disponibles = false
  await page.goto('./')
  await entrer(page)
  await ouvrirVoletSiVisible(page)

  await expect(page.locator('#message')).toContainText('Estimation à vol d’oiseau')
  await expect(page.locator('#message')).toContainText('Horaires des trains indisponibles pour le moment.')
  // Le vol d'oiseau n'a plus de bouton (décision 1) : aucun mode n'apparaît enfoncé.
  await expect(page.locator('[data-mode][aria-pressed="true"]')).toHaveCount(0)

  s.horaires.disponibles = true
  await page.getByRole('button', { name: 'Réessayer' }).click()
  await expect(page.locator('.sous-titre')).toContainText('Chacun avec son moyen')
  await expect(page.locator('#message')).toBeEmpty()
})

test('mode voiture : détail du trajet en voiture, prix divisé par personnes par voiture', async ({ page }) => {
  const s = await simuler(page)
  await simulerVoiture(page, s.amis, ['b'])
  await page.goto('./')
  await entrer(page)
  await ouvrirVoletSiVisible(page)

  await page.getByRole('button', { name: 'Voiture', exact: true }).click()
  await expect(page.locator('#chargement')).toBeEmpty()
  await expect(page.locator('.sous-titre')).toContainText('En voiture')
  // Tom (seul Croco en voiture) a sa couche prête : plus d'indicateur « calcul en cours ».
  await expect(page.locator('.calcul-en-cours')).toHaveCount(0)

  const premiere = page.locator('#villes .ville-carte').first()
  await expect(premiere).toBeVisible()
  await premiere.locator('.ville-entete').click()
  await expect(premiere.locator('.zone-detail')).toContainText('de route')
  await expect(premiere.locator('.zone-detail')).toContainText('km')
  // Léa (transports, jamais de couche voiture) est exclue du calcul en mode voiture pur : sa ligne
  // ne doit pas apparaître (et surtout pas porter, décalée, le trajet réel de Tom, D#).
  await expect(premiere.locator('.detail')).toContainText('Tom')
  await expect(premiere.locator('.detail')).not.toContainText('Pas de trajet')
  await expect(premiere.locator('.detail')).not.toContainText('Léa')

  await page.getByRole('button', { name: 'Prix', exact: true }).click()
  await expect(page.locator('#copier-lien')).toHaveAttribute('data-lien', /grandeur=prix/)
  const reglage = page.getByRole('group', { name: 'Personnes par voiture' })
  await expect(reglage).toBeVisible()
  const detailAvant = await premiere.locator('.zone-detail').textContent()

  await reglage.getByRole('button', { name: '4', exact: true }).click()
  await expect(page.locator('#copier-lien')).toHaveAttribute('data-lien', /parvoiture=4/)
  await expect.poll(() => premiere.locator('.zone-detail').textContent()).not.toBe(detailAvant)
})
