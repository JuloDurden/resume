// Détecteur de formulations à surveiller dans les annonces (« red flags »).
import type { FeedItem } from '../types'
import { salaryOf } from './salary'

export interface RedFlag {
  label: string
  /** extrait de l'annonce qui a déclenché l'alerte */
  quote?: string
  level: 1 | 2
}

const RULES: { label: string; re: RegExp; level: 1 | 2 }[] = [
  { label: 'Forte pression annoncée', re: /r[ée]sistance (au|à la) (stress|pression)|r[ée]sister (au stress|à la pression)|gestion du stress|travailler sous pression|forte pression|environnement (tr[èe]s )?exigeant/i, level: 2 },
  { label: 'Disponibilité très étendue', re: /24\s*h?\s*\/\s*(24|7)|7\s*j?\s*\/\s*7|disponibilit[ée] (totale|maximale|permanente|en dehors des horaires)|joignable (à tout moment|en permanence)|soirs? et (les )?week-?ends?|travail (le|les) week-?ends?/i, level: 2 },
  { label: 'Astreintes', re: /astreintes?/i, level: 1 },
  { label: 'Ne pas compter ses heures', re: /ne (pas )?compte[rz]? pas (vos|ses|les) heures|sans compter (vos|ses) heures|heures suppl[ée]mentaires (non|r[ée]guli[èe]res)|rythme (tr[èe]s )?soutenu|forte charge de travail|sens du sacrifice/i, level: 2 },
  { label: 'Salaire flou', re: /(salaire|r[ée]mun[ée]ration|package) (attracti[fv]e?|motivante?|comp[ée]titi[fv]e?|int[ée]ressante?|selon (profil|exp[ée]rience)|[àa] n[ée]gocier|n[ée]gociable)/i, level: 1 },
  { label: 'Statut ou rémunération précaire', re: /(r[ée]mun[ée]ration|pay[ée]e?) (sur|à la|uniquement [àa] la) commission|statut (d.)?(auto|micro).?entrepreneur|sans (salaire )?fixe|100\s*%\s*variable/i, level: 2 },
  { label: 'Poste fourre-tout', re: /mouton [àa] cinq pattes|couteau suisse|toutes les casquettes|multi.?casquettes|homme orchestre|polyvalence (extr[eê]me|totale|absolue)|touche.?[àa].?tout/i, level: 1 },
  { label: '« Esprit famille »', re: /(comme|une) (grande )?famille|esprit (de )?famille/i, level: 1 },
  { label: "Mention de l'âge", re: /[ée]quipe jeune|jeune et dynamique|jeunes? talents? de moins de|moins de \d\d ans/i, level: 2 },
  { label: 'Recrutement dans l’urgence', re: /prise de poste imm[ée]diate|poste [àa] pourvoir (en urgence|imm[ée]diatement)|\burgent\b|\basap\b/i, level: 1 },
]

const quote = (t: string, i: number, len: number) =>
  `…${t
    .slice(Math.max(0, i - 50), i + len + 50)
    .replace(/\s+/g, ' ')
    .trim()}…`

export function redFlags(i: FeedItem): RedFlag[] {
  const text = [i.title, i.fullText ?? '', i.description ?? ''].join('\n')
  const out: RedFlag[] = []
  for (const r of RULES) {
    const m = r.re.exec(text)
    if (m) out.push({ label: r.label, quote: quote(text, m.index, m[0].length), level: r.level })
  }
  // annonce détaillée, mais sans un mot de salaire
  if (i.fullText && i.fullText.length > 800 && !salaryOf(i) && !/salaire|r[ée]mun[ée]ration|k€|€/i.test(i.fullText)) out.push({ label: 'Salaire non mentionné', level: 1 })
  // annonce longue qui ne décrit jamais le poste : missions floues (un texte court ou absent n'est pas signalé,
  // il vient souvent d'un site qui ne livre qu'un résumé)
  if (i.fullText && i.fullText.length > 900 && !/missions?|responsabilit|vous (serez|aurez|devrez|prendrez|pilotez|piloterez|assurez|assurerez|g[ée]rez|g[ée]rerez|animez|animerez|participez|participerez|travaillez|travaillerez|interviendrez|accompagnez|accompagnerez|r[ée]digez|r[ée]digerez)|votre r[ôo]le|au quotidien|activit[ée]s principales|t[âa]ches/i.test(i.fullText))
    out.push({ label: 'Missions floues', level: 1 })
  return out
}
