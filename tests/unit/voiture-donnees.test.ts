import { afterEach, beforeEach, expect, test, vi } from 'vitest'

interface RequeteSimulee {
  select: (colonnes?: string) => RequeteSimulee
  eq: (colonne?: string, valeur?: unknown) => RequeteSimulee
  in: (colonne?: string, valeurs?: unknown) => Promise<{ data: unknown; error: unknown }>
}

function requeteSimulee(resultat: { data: unknown; error: unknown }): RequeteSimulee {
  const q: RequeteSimulee = {
    select: () => q,
    eq: () => q,
    in: () => Promise.resolve(resultat),
  }
  return q
}

const from = vi.fn<(table: string) => RequeteSimulee>()
const invoke = vi.fn<(nom: string, options?: unknown) => Promise<{ data: unknown; error: unknown }>>()
vi.mock('../../src/donnees/supabase', () => ({ supabase: () => ({ from, functions: { invoke } }) }))

const { decoderCouche, chargerCouches, creerFileCalculVoiture, creerItineraires } = await import('../../src/donnees/voiture')

beforeEach(() => {
  from.mockReset()
  invoke.mockReset()
  invoke.mockResolvedValue({ data: { etat: 'calcule' }, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('decoderCouche décode le bytea hexadécimal en petit-boutiste', () => {
  // 200 minutes = 0x00c8 ; 314 km = 0x013a.
  const couche = decoderCouche({ minutes: '\\xc800', km: '\\x3a01' })
  expect(Array.from(couche.minutes)).toEqual([200])
  expect(Array.from(couche.km)).toEqual([314])
})

test('decoderCouche décode plusieurs points', () => {
  const couche = decoderCouche({ minutes: '\\xc800ffff', km: '\\x3a010000' })
  expect(Array.from(couche.minutes)).toEqual([200, 65535])
  expect(Array.from(couche.km)).toEqual([314, 0])
})

test('decoderCouche refuse un bytea qui ne commence pas par \\x', () => {
  expect(() => decoderCouche({ minutes: 'c800', km: '3a01' })).toThrow('bytea')
})

test('chargerCouches rend une carte vide sans identifiant', async () => {
  expect(await chargerCouches([])).toEqual(new Map())
  expect(from).not.toHaveBeenCalled()
})

test('chargerCouches lit la couche voiture des personnes demandées', async () => {
  from.mockReturnValue(
    requeteSimulee({
      data: [{ ami_id: 'a', minutes: '\\xc800', km: '\\x3a01' }],
      error: null,
    }),
  )
  const couches = await chargerCouches(['a', 'b'])
  expect(from).toHaveBeenCalledWith('temps')
  expect(couches.size).toBe(1)
  expect(Array.from(couches.get('a')!.minutes)).toEqual([200])
})

test('chargerCouches signale une erreur Supabase par un message générique', async () => {
  from.mockReturnValue(requeteSimulee({ data: null, error: { message: 'boom' } }))
  await expect(chargerCouches(['a'])).rejects.toThrow('Impossible de charger les temps en voiture.')
})

test('la file appelle la fonction voiture pour chaque personne demandée', async () => {
  const file = creerFileCalculVoiture()
  await file.demander('a')
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('voiture', { body: { ami_id: 'a' } }))
})

test('la file ne redemande pas une personne déjà en cours ou en attente', async () => {
  let resoudre: (() => void) | null = null
  invoke.mockImplementation(
    () =>
      new Promise((resolve) => {
        resoudre = () => resolve({ data: { etat: 'calcule' }, error: null })
      }),
  )
  const file = creerFileCalculVoiture()
  void file.demander('a')
  await vi.waitFor(() => expect(file.enCours('a')).toBe(true))
  void file.demander('a')
  resoudre!()
  await vi.waitFor(() => expect(file.enCours('a')).toBe(false))
  expect(invoke).toHaveBeenCalledTimes(1)
})

test('la file traite les personnes une à la fois', async () => {
  const resolutions: (() => void)[] = []
  invoke.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolutions.push(() => resolve({ data: { etat: 'calcule' }, error: null }))
      }),
  )
  const file = creerFileCalculVoiture()
  void file.demander('a')
  void file.demander('b')
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))
  expect(file.enCours('b')).toBe(true) // en attente, pas encore appelée
  resolutions[0]!()
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2))
})

test('la file journalise une erreur de la fonction sans la relancer', async () => {
  invoke.mockResolvedValue({ data: null, error: { message: 'quota' } })
  const file = creerFileCalculVoiture()
  await file.demander('a')
  await vi.waitFor(() => expect(console.error).toHaveBeenCalled())
  await vi.waitFor(() => expect(file.enCours('a')).toBe(false))
})

test('une erreur de la fonction est signalée par onErreur, avec son message français', async () => {
  invoke.mockResolvedValue({ data: null, error: { message: 'Quota dépassé, réessaie plus tard.' } })
  const onErreur = vi.fn()
  const file = creerFileCalculVoiture({ onErreur })
  await file.demander('a')
  await vi.waitFor(() => expect(onErreur).toHaveBeenCalledWith('Quota dépassé, réessaie plus tard.'))
})

test('une erreur sans message rend un message générique', async () => {
  invoke.mockResolvedValue({ data: null, error: {} })
  const onErreur = vi.fn()
  const file = creerFileCalculVoiture({ onErreur })
  await file.demander('a')
  await vi.waitFor(() => expect(onErreur).toHaveBeenCalledWith('Impossible de calculer ce trajet en voiture pour le moment.'))
})

test('onTermine est appelé à la fin de chaque calcul, succès ou échec', async () => {
  invoke.mockResolvedValueOnce({ data: { etat: 'calcule' }, error: null }).mockResolvedValueOnce({ data: null, error: { message: 'x' } })
  const onTermine = vi.fn()
  const file = creerFileCalculVoiture({ onTermine })
  await file.demander('a')
  await vi.waitFor(() => expect(onTermine).toHaveBeenCalledWith('a'))
  await file.demander('b')
  await vi.waitFor(() => expect(onTermine).toHaveBeenCalledWith('b'))
})

const paris = { lat: 48.85, lon: 2.35 }
const lyon = { lat: 45.76, lon: 4.83 }
const itineraireBrut = { coordonnees: [[2.35, 48.85], [3.5, 47.3], [4.83, 45.76]], minutes: 280, km: 465 }

test('itineraires : rien en cache avant toute demande', () => {
  const it = creerItineraires()
  expect(it.regarder(paris, lyon)).toBeNull()
  expect(invoke).not.toHaveBeenCalled()
})

test('itineraires : demander appelle la fonction avec action itineraire, départ et arrivée en [lon, lat]', async () => {
  invoke.mockResolvedValue({ data: itineraireBrut, error: null })
  const it = creerItineraires()
  it.demander(paris, lyon, () => {})
  await vi.waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('voiture', { body: { action: 'itineraire', depart: [2.35, 48.85], arrivee: [4.83, 45.76] } }),
  )
})

test('itineraires : une fois en cache, regarder rend le résultat sans nouvel appel', async () => {
  invoke.mockResolvedValue({ data: itineraireBrut, error: null })
  const it = creerItineraires()
  const surTermine = vi.fn()
  it.demander(paris, lyon, surTermine)
  await vi.waitFor(() => expect(surTermine).toHaveBeenCalled())
  // La fonction rend [lon, lat] (convention ORS) ; Leaflet attend [lat, lon] : l'ordre est inversé.
  expect(it.regarder(paris, lyon)).toEqual({ coordonnees: [[48.85, 2.35], [47.3, 3.5], [45.76, 4.83]], minutes: 280, km: 465 })
  it.demander(paris, lyon, () => {})
  expect(invoke).toHaveBeenCalledTimes(1)
})

test('itineraires : deux demandes concurrentes pour le même trajet ne déclenchent qu’un appel', async () => {
  invoke.mockResolvedValue({ data: itineraireBrut, error: null })
  const it = creerItineraires()
  it.demander(paris, lyon, () => {})
  it.demander(paris, lyon, () => {})
  await vi.waitFor(() => expect(it.regarder(paris, lyon)).not.toBeNull())
  expect(invoke).toHaveBeenCalledTimes(1)
})

test('itineraires : une erreur laisse le cache à null (repli sur la ligne droite)', async () => {
  invoke.mockResolvedValue({ data: null, error: { message: '429' } })
  const it = creerItineraires()
  const surTermine = vi.fn()
  it.demander(paris, lyon, surTermine)
  await vi.waitFor(() => expect(surTermine).toHaveBeenCalled())
  expect(it.regarder(paris, lyon)).toBeNull()
})

test('itineraires : deux trajets distincts sont mis en cache séparément', async () => {
  invoke.mockResolvedValue({ data: itineraireBrut, error: null })
  const it = creerItineraires()
  it.demander(paris, lyon, () => {})
  it.demander(lyon, paris, () => {})
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2))
  expect(it.regarder(paris, lyon)).not.toBeNull()
  expect(it.regarder(lyon, paris)).not.toBeNull()
})
