import { afterEach, expect, test, vi } from 'vitest'
import { chargerReseaux, rattacherGares } from '../../src/donnees/urbain'
import type { Station } from '../../src/donnees/horaires'

afterEach(() => vi.unstubAllGlobals())

const stations = [
  { nom: 'Gare de Lyon', lat: 48.8443, lon: 2.3743 },
  { nom: 'Nation', lat: 48.8483, lon: 2.3959 },
]
const sncf: Station[] = [
  { nom: 'Paris Gare de Lyon', lat: 48.8448, lon: 2.3735, desservie: true },
  { nom: 'Marseille Saint-Charles', lat: 43.3027, lon: 5.3806, desservie: true },
  { nom: 'Fermée', lat: 48.8483, lon: 2.3959, desservie: false },
]

test('une gare SNCF à moins de 400 m d’une station urbaine lui est rattachée', () => {
  expect(rattacherGares(stations, sncf)).toEqual([{ gare: 0, station: 0 }])
})

test('chargement : stations, matrice et gares rattachées', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('reseaux.json')) {
      return new Response(JSON.stringify({ reseaux: [{ id: 'idf', nom: 'Île-de-France', stations: stations.map((s) => [s.nom, s.lat, s.lon]) }] }))
    }
    return new Response(Uint8Array.from([0, 6, 7, 0]).buffer)
  }))
  const [r] = await chargerReseaux(sncf)
  expect(r!.id).toBe('idf')
  expect(r!.minutes[1]).toBe(6)
  expect(r!.gares).toEqual([{ gare: 0, station: 0 }])
})

test('données absentes ou abîmées : aucun réseau, sans erreur', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
  expect(await chargerReseaux(sncf)).toEqual([])
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    url.endsWith('reseaux.json')
      ? new Response(JSON.stringify({ reseaux: [{ id: 'x', nom: 'X', stations: [['A', 48, 2]] }] }))
      : new Response(new ArrayBuffer(3)),
  ))
  expect(await chargerReseaux(sncf)).toEqual([])
})

test('remonterChemin : stations traversées dans l’ordre, repli sur les deux bouts si la chaîne casse', async () => {
  const { remonterChemin, SANS_PRECEDENTE } = await import('../../src/donnees/urbain')
  const p = Uint16Array.from([SANS_PRECEDENTE, 0, 1, SANS_PRECEDENTE])
  expect(remonterChemin(p, 0, 2)).toEqual([0, 1, 2])
  expect(remonterChemin(p, 0, 0)).toEqual([0])
  expect(remonterChemin(p, 0, 3)).toEqual([0, 3])
})
