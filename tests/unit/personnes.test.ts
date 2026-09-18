import { expect, test } from 'vitest'
import type { Ami } from '../../src/types'
import { correspond, regrouperParVille, villeCourte, villeDeGroupe } from '../../src/ui/personnes'

const ami = (nom: string, adresse: string): Ami => ({
  id: nom, nom, adresse, lat: 0, lon: 0, transport: 'tc', navigo: false,
})

test('ville courte : arrondissement parisien reconnu', () => {
  expect(villeCourte('4 Rue Armand Carrel 75019 Paris')).toBe('Paris 19e')
})

test('ville courte : premier arrondissement en "1er"', () => {
  expect(villeCourte('1 Rue de Rivoli 75001 Paris')).toBe('Paris 1er')
})

test('ville courte : arrondissement lyonnais et marseillais reconnus', () => {
  expect(villeCourte('6 Rue Omer Louis 69003 Lyon')).toBe('Lyon 3e')
  expect(villeCourte('89 Boulevard Chave 13005 Marseille')).toBe('Marseille 5e')
})

test('ville courte : ville normale, pas d’arrondissement', () => {
  expect(villeCourte('2 rue Y 69001 Lyon')).toBe('Lyon 1er')
  expect(villeCourte('10 Rue de Rivoli 44000 Nantes')).toBe('Nantes')
})

test('ville courte : adresse sans code postal reconnaissable', () => {
  expect(villeCourte('adresse libre')).toBe('adresse libre')
})

test('ville de groupe : les arrondissements se regroupent sous le nom de la ville', () => {
  expect(villeDeGroupe('4 Rue Armand Carrel 75019 Paris')).toBe('Paris')
  expect(villeDeGroupe('1 Rue de Rivoli 75001 Paris')).toBe('Paris')
  expect(villeDeGroupe('10 Rue de Rivoli 44000 Nantes')).toBe('Nantes')
})

test('regrouperParVille : trie par ville puis par nom, arrondissements regroupés', () => {
  const amis = [
    ami('Zoé', '4 Rue Armand Carrel 75019 Paris'),
    ami('Franck', '89 Boulevard Chave 13005 Marseille'),
    ami('Eline', '1 Rue de Rivoli 75001 Paris'),
    ami('Yanis', '6 Rue Omer Louis 69003 Lyon'),
  ]
  const groupes = regrouperParVille(amis)
  expect(groupes.map((g) => g.ville)).toEqual(['Lyon', 'Marseille', 'Paris'])
  const paris = groupes.find((g) => g.ville === 'Paris')!
  expect(paris.amis.map((a) => a.nom)).toEqual(['Eline', 'Zoé'])
})

test('regrouperParVille : liste vide', () => {
  expect(regrouperParVille([])).toEqual([])
})

test('correspond : recherche sur le nom, insensible aux accents et à la casse', () => {
  const zoe = ami('Zoé', '4 Rue Armand Carrel 75019 Paris')
  expect(correspond(zoe, 'zoe')).toBe(true)
  expect(correspond(zoe, 'ZOÉ')).toBe(true)
  expect(correspond(zoe, 'tom')).toBe(false)
})

test('correspond : recherche sur la ville (avec ou sans arrondissement) et texte vide', () => {
  const zoe = ami('Zoé', '4 Rue Armand Carrel 75019 Paris')
  expect(correspond(zoe, 'paris')).toBe(true)
  expect(correspond(zoe, '19e')).toBe(true)
  expect(correspond(zoe, '')).toBe(true)
  expect(correspond(zoe, '  ')).toBe(true)
})
