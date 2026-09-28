import { expect, test } from 'vitest'
import { ecartEquivalent } from '../../src/calcul/unites'
import { meilleuresVilles } from '../../src/calcul/repaires'
import type { VilleClassee } from '../../src/calcul/villes'

const ville = (nom: string, lat: number, lon: number): { nom: string; dep: string; lat: number; lon: number; population: number } => ({
  nom, dep: '00', lat, lon, population: 50000,
})
const classee = (nom: string, lat: number, lon: number, pire: number, moyenne = pire): VilleClassee => ({
  ville: ville(nom, lat, lon), parAmi: [], total: moyenne * 2, moyenne, pire,
})

// Mâcon et Villefranche sont à 35 km ; Lyon est à 60 km de Mâcon ; Dijon à 120 km.
const macon = classee('Mâcon', 46.3, 4.83, 140)
const villefranche = classee('Villefranche', 45.99, 4.72, 145)
const lyon = classee('Lyon', 45.76, 4.84, 148)
const dijon = classee('Dijon', 47.32, 5.04, 175)

test('trois villes au plus, écartées d’au moins 50 km, dans l’ordre du classement', () => {
  const r = meilleuresVilles([macon, villefranche, lyon, dijon], 'pire', 10)
  expect(r.map((x) => x.classee.ville.nom)).toEqual(['Mâcon', 'Lyon', 'Dijon'])
})

test('une ville à moins de 10 min de la meilleure est marquée équivalente', () => {
  const r = meilleuresVilles([macon, villefranche, lyon, dijon], 'pire', 10)
  expect(r.map((x) => x.equivalente)).toEqual([true, true, false])
})

test('classement à la moyenne : c’est la moyenne qui décide et qui sert à l’égalité', () => {
  const proche = classee('Proche', 46.3, 4.83, 200, 100)
  const loin = classee('Loin', 43.3, 5.4, 120, 118)
  const r = meilleuresVilles([proche, loin], 'moyenne', 10)
  expect(r.map((x) => x.classee.ville.nom)).toEqual(['Proche', 'Loin'])
  expect(r.map((x) => x.equivalente)).toEqual([true, false])
})

test('liste vide, et écart d’équivalence selon l’unité', () => {
  expect(meilleuresVilles([], 'pire', 10)).toEqual([])
  expect(ecartEquivalent('min')).toBe(10)
  expect(ecartEquivalent('eur')).toBe(5)
  expect(ecartEquivalent('km')).toBe(20)
})
