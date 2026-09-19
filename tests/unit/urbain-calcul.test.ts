import { expect, test } from 'vitest'
import { arretsProches, dureeUrbaine, reseauDe } from '../../src/calcul/urbain'
import type { ReseauUrbain } from '../../src/donnees/urbain'

// Trois stations d'est en ouest sur le parallèle 48,85 (0,01° de longitude = 0,73 km) :
// Est -> Centre 6 min, Centre -> Ouest 7 min, Est -> Ouest 12 min ; Ouest -> Est injoignable.
const paris: ReseauUrbain = {
  id: 'idf', nom: 'Île-de-France', gares: [],
  stations: [
    { nom: 'Est', lat: 48.85, lon: 2.40 },
    { nom: 'Centre', lat: 48.85, lon: 2.35 },
    { nom: 'Ouest', lat: 48.85, lon: 2.30 },
  ],
  minutes: Uint8Array.from([0, 6, 12, 5, 0, 7, 255, 255, 0]),
}
const lyon: ReseauUrbain = { id: 'lyon', nom: 'Lyon', gares: [], stations: [{ nom: 'Bellecour', lat: 45.7578, lon: 4.832 }], minutes: Uint8Array.from([0]) }

test('réseau d’un point : une station à 5 km au plus', () => {
  expect(reseauDe([lyon, paris], 48.86, 2.35)?.id).toBe('idf')
  expect(reseauDe([lyon, paris], 45.76, 4.84)?.id).toBe('lyon')
  expect(reseauDe([lyon, paris], 43.3, 5.38)).toBeNull()
  expect(reseauDe(undefined, 48.86, 2.35)).toBeNull()
})

test('stations proches : à pied jusqu’à 1,5 km, sinon en transports jusqu’à 5 km', () => {
  const aPied = arretsProches(paris, 48.85, 2.351)
  expect(aPied.map((a) => a.station)).toEqual([1])
  expect(aPied[0]!.minutes).toBeCloseTo((0.0733 * 1.3 / 4.5) * 60, 0)
  // 3 km au nord du Centre : trop loin à pied, en transports à 20 km/h.
  const loin = arretsProches(paris, 48.877, 2.35)
  expect(loin[0]!.station).toBe(1)
  expect(loin[0]!.minutes).toBeCloseTo((3 * 1.3 / 20) * 60, 0)
})

test('durée urbaine : meilleure combinaison, trajets injoignables ignorés', () => {
  expect(dureeUrbaine(paris, [{ station: 0, minutes: 2 }], [{ station: 2, minutes: 3 }, { station: 1, minutes: 20 }])).toBe(17)
  expect(dureeUrbaine(paris, [{ station: 2, minutes: 0 }], [{ station: 0, minutes: 0 }])).toBe(Number.POSITIVE_INFINITY)
})
