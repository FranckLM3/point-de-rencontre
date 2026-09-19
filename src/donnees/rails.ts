// Tracés réels des voies ferrées entre gares consécutives (public/data/tc/rails.bin), écrits
// par horaires/rails.py : MAGIC "RAB1" (4 octets), nb de tracés (uint32 petit-boutiste), puis
// pour chaque tracé : gare de départ, gare d'arrivée, nombre de points (uint16 chacun), premier
// point en degrés * 1e5 (int32 lon, int32 lat), points suivants en delta int32 depuis le
// précédent (même ordre). Chargé paresseusement (creerChargeurRails) au premier trajet dessiné.

const MAGIC = 'RAB1'
const E5 = 100_000
const MESSAGE = 'Tracé des voies ferrées indisponible pour le moment.'

export interface Rails {
  /**
   * Points [lat, lon] du tracé réel entre deux gares consécutives d'un même trajet, dans le sens
   * demandé (`de` -> `vers`, réutilisé à l'envers si stocké dans l'autre sens) ; `null` si aucun
   * tracé n'existe pour cette paire (segment droit en repli, décidé par l'appelant).
   */
  segment(de: number, vers: number): [number, number][] | null
}

function decoder(tampon: ArrayBuffer): Rails {
  if (tampon.byteLength < 8) throw new Error('Fichier de rails invalide (trop court).')
  const v = new DataView(tampon)
  const magic = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))
  if (magic !== MAGIC) throw new Error('Fichier de rails invalide (en-tête).')
  const nb = v.getUint32(4, true)
  const table = new Map<string, [number, number][]>()
  let o = 8
  for (let i = 0; i < nb; i++) {
    const de = v.getUint16(o, true)
    const vers = v.getUint16(o + 2, true)
    const n = v.getUint16(o + 4, true)
    o += 6
    if (n === 0) continue
    const points: [number, number][] = new Array(n)
    let lon = v.getInt32(o, true)
    let lat = v.getInt32(o + 4, true)
    o += 8
    points[0] = [lat / E5, lon / E5]
    for (let k = 1; k < n; k++) {
      lon += v.getInt32(o, true)
      lat += v.getInt32(o + 4, true)
      o += 8
      points[k] = [lat / E5, lon / E5]
    }
    table.set(`${de}-${vers}`, points)
  }
  return {
    segment: (de, vers) => {
      const direct = table.get(`${de}-${vers}`)
      if (direct) return direct
      const inverse = table.get(`${vers}-${de}`)
      return inverse ? [...inverse].reverse() : null
    },
  }
}

export async function creerRails(): Promise<Rails> {
  let reponse: Response
  try {
    reponse = await fetch(`${import.meta.env.BASE_URL}data/tc/rails.bin`)
  } catch (e) {
    console.error('Rails : réseau', e)
    throw new Error(MESSAGE)
  }
  if (!reponse.ok) {
    console.error(`Rails : HTTP ${reponse.status}`)
    throw new Error(MESSAGE)
  }
  return decoder(await reponse.arrayBuffer())
}

/** Charge les rails une seule fois, à la demande (pas au démarrage : seulement quand un premier
 * trajet ferroviaire est dessiné) ; un échec n'empêche pas le tracé (repli en ligne droite),
 * même forme que creerChargeurTc (couches.ts). */
export interface ChargeurRails {
  /** Rails déjà chargés, sinon null (chargement pas commencé, en cours, ou en échec). */
  pret(): Rails | null
  /** Charge une seule fois ; après un échec, l'appel suivant réessaie. */
  obtenir(): Promise<Rails>
}

export function creerChargeurRails(creer: () => Promise<Rails> = creerRails): ChargeurRails {
  let rails: Rails | null = null
  let enCours: Promise<Rails> | null = null
  return {
    pret: () => rails,
    obtenir: () => {
      if (rails) return Promise.resolve(rails)
      enCours ??= creer().then(
        (r) => { rails = r; return r },
        (e: unknown) => { enCours = null; throw e },
      )
      return enCours
    },
  }
}
