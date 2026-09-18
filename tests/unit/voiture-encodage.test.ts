import { expect, test } from 'vitest'
import {
  INJOIGNABLE,
  TAILLE_PAQUET,
  arrondir5,
  assemblerResultats,
  calculerCle,
  corpsMatrice,
  decouperEnPaquets,
  encoderCouche,
  versBytea,
  versKm,
  versMinutes,
  type Point,
} from '../../supabase/functions/voiture/encodage'

test('arrondir5 arrondit à 5 décimales', () => {
  expect(arrondir5(48.855512345)).toBe(48.85551)
  expect(arrondir5(2.36041999)).toBe(2.36042)
})

test('calculerCle combine lat, lon arrondis et la version de grille', () => {
  expect(calculerCle(48.855512345, 2.36041999, 'grille-8km-v1')).toBe('48.85551,2.36042,grille-8km-v1')
})

test('calculerCle change si la version de grille change', () => {
  expect(calculerCle(48.85551, 2.36042, 'v1')).not.toBe(calculerCle(48.85551, 2.36042, 'v2'))
})

test('decouperEnPaquets ne dépasse jamais la taille maximale', () => {
  const paquets = decouperEnPaquets(9405)
  expect(paquets.every((p) => p.fin - p.debut <= TAILLE_PAQUET)).toBe(true)
})

test('decouperEnPaquets couvre exactement 0..n sans trou ni recouvrement', () => {
  const paquets = decouperEnPaquets(9405)
  expect(paquets[0]!.debut).toBe(0)
  expect(paquets.at(-1)!.fin).toBe(9405)
  for (let i = 1; i < paquets.length; i++) expect(paquets[i]!.debut).toBe(paquets[i - 1]!.fin)
})

test('decouperEnPaquets rend un seul paquet sous la limite', () => {
  expect(decouperEnPaquets(10)).toEqual([{ debut: 0, fin: 10 }])
})

test('decouperEnPaquets rend un tableau vide pour 0 point', () => {
  expect(decouperEnPaquets(0)).toEqual([])
})

test('decouperEnPaquets 3500 points tient dans un seul paquet (limite ORS)', () => {
  expect(decouperEnPaquets(3499)).toHaveLength(1)
  expect(decouperEnPaquets(3500)).toHaveLength(2)
})

test('corpsMatrice place la personne en source 0 et numérote les destinations à partir de 1', () => {
  const personne: Point = { lon: 5.39, lat: 43.3 }
  const points: Point[] = [{ lon: 1, lat: 41 }, { lon: 2, lat: 42 }, { lon: 3, lat: 43 }]
  const corps = corpsMatrice(personne, points, { debut: 1, fin: 3 }) as {
    locations: [number, number][]
    sources: number[]
    destinations: number[]
    metrics: string[]
    units: string
  }
  expect(corps.locations).toEqual([[5.39, 43.3], [2, 42], [3, 43]])
  expect(corps.sources).toEqual([0])
  expect(corps.destinations).toEqual([1, 2])
  expect(corps.metrics).toEqual(['duration', 'distance'])
  expect(corps.units).toBe('km')
})

test('versMinutes arrondit les secondes en minutes', () => {
  expect(versMinutes(11984)).toBe(200)
})

test('versMinutes rend INJOIGNABLE pour null', () => {
  expect(versMinutes(null)).toBe(INJOIGNABLE)
})

test('versMinutes rend INJOIGNABLE pour une valeur non finie', () => {
  expect(versMinutes(Number.POSITIVE_INFINITY)).toBe(INJOIGNABLE)
  expect(versMinutes(Number.NaN)).toBe(INJOIGNABLE)
})

test('versKm arrondit et gère l’injoignable', () => {
  expect(versKm(314.17)).toBe(314)
  expect(versKm(null)).toBe(INJOIGNABLE)
})

test('encoderCouche encode en petit-boutiste sur 2 octets', () => {
  const { minutes, km } = encoderCouche([200, INJOIGNABLE], [314, 0])
  expect(Array.from(minutes)).toEqual([200 & 0xff, 200 >> 8, 0xff, 0xff])
  expect(Array.from(km)).toEqual([314 & 0xff, 314 >> 8, 0, 0])
})

test('encoderCouche refuse des tableaux de longueurs différentes', () => {
  expect(() => encoderCouche([1], [1, 2])).toThrow()
})

test('versBytea rend une chaîne hexadécimale préfixée \\x', () => {
  expect(versBytea(new Uint8Array([0, 255, 16]))).toBe('\\x00ff10')
})

test('assemblerResultats replace chaque paquet à sa place, dans l’ordre des points', () => {
  const n = 5
  const resultats = [
    { paquet: { debut: 0, fin: 2 }, durations: [60, 120], distances: [1, 2] },
    { paquet: { debut: 2, fin: 5 }, durations: [null, 600, 900], distances: [null, 10, 15] },
  ]
  const { minutes, km } = assemblerResultats(n, resultats)
  expect(minutes).toEqual([1, 2, INJOIGNABLE, 10, 15])
  expect(km).toEqual([1, 2, INJOIGNABLE, 10, 15])
})

test('assemblerResultats rend tout injoignable si aucun paquet ne couvre un point', () => {
  const { minutes, km } = assemblerResultats(3, [])
  expect(minutes).toEqual([INJOIGNABLE, INJOIGNABLE, INJOIGNABLE])
  expect(km).toEqual([INJOIGNABLE, INJOIGNABLE, INJOIGNABLE])
})
