import { expect, test } from 'vitest'
import { maximaProposes, pasTranches, uniteDe } from '../../src/calcul/unites'

test('unité selon le mode et la grandeur', () => {
  expect(uniteDe('oiseau', 'prix')).toBe('km')
  expect(uniteDe('tc', 'temps')).toBe('min')
  expect(uniteDe('tc', 'prix')).toBe('eur')
})

test('pas des tranches par unité', () => {
  expect(pasTranches('km')).toBe(100)
  expect(pasTranches('min')).toBe(60)
  expect(pasTranches('eur')).toBe(20)
})

test('maxima proposés par unité', () => {
  expect(maximaProposes('min')).toEqual([60, 120, 180, 240, 300, 360])
  expect(maximaProposes('eur')).toEqual([20, 40, 60, 80, 100, 150])
})
