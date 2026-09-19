import { expect, test } from 'vitest'
import { analyserCoordonnee, analyserReponseItineraire, corpsItineraire } from '../../supabase/functions/voiture/itineraire'

test('analyserCoordonnee accepte un couple [lon, lat] valide', () => {
  expect(analyserCoordonnee([2.36042, 48.85551])).toEqual({ lon: 2.36042, lat: 48.85551 })
})

test('analyserCoordonnee refuse une forme incorrecte', () => {
  expect(analyserCoordonnee(null)).toBeNull()
  expect(analyserCoordonnee([1])).toBeNull()
  expect(analyserCoordonnee([1, 2, 3])).toBeNull()
  expect(analyserCoordonnee(['a', 'b'])).toBeNull()
  expect(analyserCoordonnee({ lon: 1, lat: 2 })).toBeNull()
})

test('analyserCoordonnee refuse des valeurs hors bornes', () => {
  expect(analyserCoordonnee([200, 45])).toBeNull()
  expect(analyserCoordonnee([2, 95])).toBeNull()
  expect(analyserCoordonnee([Number.NaN, 45])).toBeNull()
})

test('corpsItineraire place départ puis arrivée, sans instructions, géométrie simplifiée', () => {
  const corps = corpsItineraire({ lon: 2.35, lat: 48.85 }, { lon: 4.83, lat: 45.76 }) as {
    coordinates: [number, number][]
    instructions: boolean
    geometry_simplify: boolean
  }
  expect(corps.coordinates).toEqual([[2.35, 48.85], [4.83, 45.76]])
  expect(corps.instructions).toBe(false)
  expect(corps.geometry_simplify).toBe(true)
})

const reponseValide = {
  features: [
    {
      geometry: { coordinates: [[2.35, 48.85], [3.5, 47.3], [4.83, 45.76]] },
      properties: { summary: { distance: 465123.4, duration: 12345.6 } },
    },
  ],
}

test('analyserReponseItineraire extrait coordonnées, minutes et km', () => {
  const r = analyserReponseItineraire(reponseValide)
  expect(r).not.toBeNull()
  expect(r!.coordonnees).toEqual([[2.35, 48.85], [3.5, 47.3], [4.83, 45.76]])
  expect(r!.minutes).toBe(206) // 12345.6 / 60 arrondi
  expect(r!.km).toBe(465.1) // 465123.4 / 1000 arrondi à 0,1 km
})

test('analyserReponseItineraire arrondit les coordonnées à 5 décimales', () => {
  const r = analyserReponseItineraire({
    features: [
      {
        geometry: { coordinates: [[2.360419999, 48.855512345]] },
        properties: { summary: { distance: 1, duration: 1 } },
      },
    ],
  })
  expect(r!.coordonnees).toEqual([[2.36042, 48.85551]])
})

test('analyserReponseItineraire rend null sans feature exploitable', () => {
  expect(analyserReponseItineraire({})).toBeNull()
  expect(analyserReponseItineraire({ features: [] })).toBeNull()
  expect(analyserReponseItineraire({ features: [{ geometry: { coordinates: [] }, properties: { summary: { distance: 1, duration: 1 } } }] })).toBeNull()
  expect(analyserReponseItineraire({ features: [{ geometry: { coordinates: [[1, 2]] }, properties: {} }] })).toBeNull()
})

test('analyserReponseItineraire rend null sur des coordonnées corrompues', () => {
  expect(
    analyserReponseItineraire({
      features: [{ geometry: { coordinates: [['x', 'y']] }, properties: { summary: { distance: 1, duration: 1 } } }],
    }),
  ).toBeNull()
})
