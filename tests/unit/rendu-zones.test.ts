import { expect, test } from 'vitest'
import { COULEUR_CONTOUR_ZONE, EPAISSEUR_CONTOUR_ZONE, OPACITE_CONTOUR_ZONE, OPACITE_ZONE } from '../../src/ui/rendu-zones'

test('opacité des zones : translucide, le fond de carte reste visible sous la bande la plus proche', () => {
  expect(OPACITE_ZONE).toBeGreaterThan(0.4)
  expect(OPACITE_ZONE).toBeLessThan(0.8)
})

test('contour de tranche : fin et discret', () => {
  expect(EPAISSEUR_CONTOUR_ZONE).toBe(1)
  expect(OPACITE_CONTOUR_ZONE).toBeGreaterThan(0)
  expect(OPACITE_CONTOUR_ZONE).toBeLessThan(0.5)
  expect(COULEUR_CONTOUR_ZONE).toMatch(/^#[0-9a-f]{6}$/)
})
