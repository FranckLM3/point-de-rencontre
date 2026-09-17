import { expect, test } from 'vitest'
import { OPACITE_TRANCHE, opaciteCumulee } from '../../src/ui/rendu-zones'

test('la tranche la plus large ne porte qu’une couche', () => {
  expect(opaciteCumulee(7, 8)).toBeCloseTo(OPACITE_TRANCHE)
})

test('la tranche la plus étroite cumule toutes les couches sans devenir opaque', () => {
  const centre = opaciteCumulee(0, 8)
  expect(centre).toBeGreaterThan(opaciteCumulee(1, 8))
  expect(centre).toBeLessThan(0.6)
})

test('rang hors limites : aucune couche', () => {
  expect(opaciteCumulee(9, 8)).toBe(0)
})
