import { expect, test } from 'vitest'
import type { VilleClassee } from '../../src/calcul/villes'
import type { Ville } from '../../src/types'
import {
  eviterCollisions,
  placerEtiquette,
  prixEtiquette,
  selectionEtiquettes,
  valeurEtiquette,
  type BoiteEtiquette,
  type CercleEcran,
} from '../../src/ui/etiquettes'

const ville = (nom: string, population = 1): Ville => ({ nom, dep: '00', lat: 0, lon: 0, population })

const classee = (nom: string, pire: number, population = 1): VilleClassee => ({
  ville: ville(nom, population),
  parAmi: [{ valeur: pire }],
  total: pire,
  moyenne: pire,
  pire,
})

test('selectionEtiquettes : les villes classées passent en premier, dans leur ordre', () => {
  const classees = [classee('Dijon', 100), classee('Lyon', 150), classee('Nantes', 200)]
  const r = selectionEtiquettes(classees, [], 10)
  expect(r.map((e) => e.ville.ville.nom)).toEqual(['Dijon', 'Lyon', 'Nantes'])
})

test('selectionEtiquettes : la première ville classée est marquée « meilleure »', () => {
  const classees = [classee('Dijon', 100), classee('Lyon', 150)]
  const r = selectionEtiquettes(classees, [], 10)
  expect(r[0]!.meilleure).toBe(true)
  expect(r[1]!.meilleure).toBe(false)
})

test('selectionEtiquettes : comble avec les grandes villes, dans l’ordre fourni, sans doublon', () => {
  const classees = [classee('Dijon', 100)]
  const grandes = [classee('Paris', 300, 2_000_000), classee('Dijon', 100, 150_000), classee('Lyon', 250, 500_000)]
  const r = selectionEtiquettes(classees, grandes, 10)
  expect(r.map((e) => e.ville.ville.nom)).toEqual(['Dijon', 'Paris', 'Lyon'])
})

test('selectionEtiquettes : respecte la limite maximale', () => {
  const classees = Array.from({ length: 5 }, (_, i) => classee(`V${i}`, i))
  const r = selectionEtiquettes(classees, [], 3)
  expect(r).toHaveLength(3)
})

test('selectionEtiquettes : les grandes villes ne comptent pas comme « meilleure »', () => {
  const classees = [classee('Dijon', 100)]
  const grandes = [classee('Paris', 300, 2_000_000)]
  const r = selectionEtiquettes(classees, grandes, 10)
  expect(r.find((e) => e.ville.ville.nom === 'Paris')!.meilleure).toBe(false)
})

test('selectionEtiquettes : liste vide', () => {
  expect(selectionEtiquettes([], [], 10)).toEqual([])
})

test('valeurEtiquette : suit le critère actif (pire ou moyenne) et l’unité', () => {
  const c = { ville: ville('Dijon'), parAmi: [], total: 0, moyenne: 194, pire: 220 }
  expect(valeurEtiquette(c, 'pire', 'min')).toBe('3 h 40')
  expect(valeurEtiquette(c, 'moyenne', 'min')).toBe('3 h 14')
  expect(valeurEtiquette(c, 'pire', 'km')).toBe('220 km')
})

test('prixEtiquette : ligne approchée avec le symbole ≈', () => {
  const c = { ville: ville('Dijon'), parAmi: [], total: 0, moyenne: 38, pire: 40 }
  expect(prixEtiquette(c, 'pire')).toBe('≈ 40 €')
})

const boite = (id: string, x: number, y: number, largeur = 40, hauteur = 16): BoiteEtiquette => ({ id, x, y, largeur, hauteur })

test('eviterCollisions : garde tout quand rien ne se chevauche', () => {
  const boites = [boite('a', 0, 0), boite('b', 100, 0), boite('c', 200, 0)]
  expect(eviterCollisions(boites).map((b) => b.id)).toEqual(['a', 'b', 'c'])
})

test('eviterCollisions : la première boîte gagne, la suivante qui chevauche est écartée', () => {
  const boites = [boite('a', 0, 0, 50, 20), boite('b', 20, 5, 50, 20), boite('c', 200, 0, 50, 20)]
  expect(eviterCollisions(boites).map((b) => b.id)).toEqual(['a', 'c'])
})

test('eviterCollisions : deux boîtes qui se touchent tout juste (bords) ne sont pas en collision', () => {
  const boites = [boite('a', 0, 0, 50, 20), boite('b', 50, 0, 50, 20)]
  expect(eviterCollisions(boites).map((b) => b.id)).toEqual(['a', 'b'])
})

test('eviterCollisions : liste vide', () => {
  expect(eviterCollisions([])).toEqual([])
})

const marqueur = (x: number, y: number, rayon = 14): CercleEcran => ({ x, y, rayon })

test('placerEtiquette : sans marqueur à proximité, la pointe reste sur le point', () => {
  const p = placerEtiquette('a', 100, 100, 60, 40, [])!
  expect(p).not.toBeNull()
  expect(p.x).toBe(100)
  expect(p.y).toBe(100)
  expect(p.boite).toEqual({ id: 'a', x: 70, y: 50, largeur: 60, hauteur: 40 })
})

test('placerEtiquette : un marqueur loin de la carte ne change rien', () => {
  const p = placerEtiquette('a', 100, 100, 60, 40, [marqueur(500, 500)])!
  expect(p.y).toBe(100)
})

test('placerEtiquette : un marqueur sous la carte la décale vers le haut', () => {
  // La carte occupe environ [70,50]..[130,100+10] au-dessus du point (100,100) ; un marqueur juste
  // sous la pointe, dans cette zone, force un décalage.
  const p = placerEtiquette('a', 100, 100, 60, 40, [marqueur(100, 95)])!
  expect(p).not.toBeNull()
  expect(p.y).toBeLessThan(100)
})

test('placerEtiquette : toujours en collision au bout du décalage maximal, l’étiquette est omise', () => {
  // Un marqueur qui couvre toute la colonne verticale au-dessus du point, sur toute la hauteur possible.
  const colonne: CercleEcran[] = Array.from({ length: 20 }, (_, i) => marqueur(100, 100 - i * 8, 20))
  expect(placerEtiquette('a', 100, 100, 60, 40, colonne)).toBeNull()
})
