import { expect, test } from 'vitest'
import { haversineKm } from '../../src/calcul/geo'

test('Paris vers Marseille fait environ 660 km', () => {
  const d = haversineKm(48.8566, 2.3522, 43.2965, 5.3698)
  expect(d).toBeGreaterThan(655)
  expect(d).toBeLessThan(665)
})

test('un point est à 0 km de lui-même', () => {
  expect(haversineKm(45, 3, 45, 3)).toBe(0)
})
