// The words Coanda recognises in a person's own files and messages, per language (English, French,
// Spanish, Simplified Chinese). Pure: lists and the patterns built from them, no host calls.
// English is always recognised, whatever the language: a file may mix languages.
//
// Every pattern here is built with the `u` flag, so letters with accents ("août", "février") and
// Chinese characters are letters, not breaks between words.

const escape = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]")
const isCjk = (word: string): boolean => /[\u3400-\u9fff]/u.test(word)

// Latin words need a break on both sides ("Lane" is not "Planet"); Chinese words have no spaces, so none.
const LEFT = '(?<![\\p{L}\\p{N}])'
const RIGHT = '(?![\\p{L}])'

// One alternation of the words, the longest first, each with the breaks it needs. A group of its own.
export function anyOf(words: readonly string[]): string {
  return `(?:${[...words]
    .sort((a, b) => b.length - a.length)
    .map(word => (isCjk(word) ? escape(word) : `${LEFT}${escape(word)}${RIGHT}`))
    .join('|')})`
}

// ---------------------------------------------------------------------------------------------
// The goals file (the format Claude writes and the parser reads).
// ---------------------------------------------------------------------------------------------
export const TODAY_WORDS = ['Today', "Aujourd'hui", 'Hoy', '今天', '今日'] as const
export const PRIMARY_WORDS = ['Primary', 'Priorité', 'Priorite', 'Prioridad', 'Principal', '首要事项', '首要', '今日重点', '重点'] as const
export const LANE_WORDS = ['Lane', 'Axe', 'Voie', 'Piste', 'Frente', 'Eje', 'Línea', 'Linea', 'Carril', '主线', '赛道', '方向'] as const
// A closed Primary is marked in capitals (a Primary's own words may hold "cerrado").
export const CLOSED_WORDS = ['CLOSED', 'CLOS', 'CLÔTURÉ', 'CLOTURE', 'FERMÉ', 'CERRADO', 'CERRADA', '已关闭'] as const
// "by 18 Oct" in each language; a word counts only when a date follows it.
export const BY_WORDS = [
  'by',
  "d'ici le",
  "d'ici",
  'avant le',
  'pour le',
  "jusqu'au",
  'au plus tard le',
  'para el',
  'antes del',
  'antes de',
  'hasta el',
] as const

const WEEKDAYS = 'mon|tue|wed|thu|fri|sat|sun|lun|mar|mer|jeu|ven|sam|dim|mi[eé]|jue|vie|s[aá]b|dom'

export const TODAY = anyOf(TODAY_WORDS)
export const PRIMARY = anyOf(PRIMARY_WORDS)
export const LANE = anyOf(LANE_WORDS)
export const CLOSED = anyOf(CLOSED_WORDS)
const BY = anyOf(BY_WORDS)

// ---------------------------------------------------------------------------------------------
// Months: the full names without accents, per language, in calendar order.
// ---------------------------------------------------------------------------------------------
const FULL_MONTHS: Record<'en' | 'fr' | 'es', string[]> = {
  en: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
  fr: ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
}
// Short forms that are not the start of the full name.
const SHORT_MONTHS: Record<string, number> = { janv: 0, fevr: 1, juil: 6, sept: 8, sep: 8, setiembre: 8, set: 8 }

const plain = (word: string): string =>
  word
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\.$/, '')

// A month written out or abbreviated in any of the three languages ("Oct", "sept.", "déc", "octubre"), as 0 to 11;
// -1 for any other word. A word that could be two months ("jui") is not a month.
export function monthOfWord(word: string): number {
  const w = plain(word)
  if (w.length < 3) return -1

  const short = SHORT_MONTHS[w]
  if (short !== undefined) return short

  const found = new Set<number>()
  for (const names of Object.values(FULL_MONTHS)) names.forEach((name, i) => name.startsWith(w) && found.add(i))

  return found.size === 1 ? [...found][0]! : -1
}

// A date as a day of the month, a month (0 to 11) and a year or null, however a language writes it.
export type DateFound = { text: string; day: number; month: number; year: number | null }

const LATIN_DAY = String.raw`(\d{1,2})(?:er|º)?\s+(?:de\s+)?(\p{L}{3,10})\.?(?:\s+(?:de\s+)?(\d{4}))?`
const ARROW = String.raw`(?:→|->|–|—|\s(?:au|al)\s)`
const LATIN_RANGE = new RegExp(String.raw`[,，]?\s*(\d{1,2})(?:er|º)?\s+(?:de\s+)?(\p{L}{3,10})\.?(?:\s+(?:de\s+)?\d{4})?\s*${ARROW}\s*(\d{1,2})(?:er|º)?\s+(?:de\s+)?(\p{L}{3,10})\.?(?:\s+(?:de\s+)?(\d{4}))?`, 'giu')
const LATIN_BY = new RegExp(String.raw`[,，]?\s*${BY}\s+(?:(?:${WEEKDAYS})\p{L}*\.?,?\s+)?${LATIN_DAY}`, 'giu')

// Chinese writes the year, the month and the day in that order, each with its own mark: 2026年12月14日.
const ZH_DATE = String.raw`(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号號]`
const ZH_BEFORE = '(?:截止(?:到|于)?|最迟|不晚于)'
const ZH_AFTER = '(?:之前|为止|前|止)'
const ZH_RANGE = new RegExp(String.raw`[,，]?\s*${ZH_DATE}\s*(?:→|->|–|—|至|到|~|～|-)\s*${ZH_DATE}`, 'gu')
const ZH_BY = new RegExp(String.raw`[,，]?\s*(?:${ZH_BEFORE}\s*${ZH_DATE}\s*${ZH_AFTER}?|[于在到]?\s*${ZH_DATE}\s*${ZH_AFTER})`, 'gu')

const yearOf = (raw: string | undefined): number | null => (raw === undefined || raw === '' ? null : Number(raw))

// The end date of a clause, or null: "21 Sep → 14 Dec", "by Sun 18 Oct", "d'ici le 14 déc.", "para el 14 de diciembre",
// "12月14日前". A date with a word that is not a month ("by 3 weeks") is not a date.
export function findEndDate(clause: string): DateFound | null {
  for (const found of clause.matchAll(LATIN_RANGE)) {
    const month = monthOfWord(found[4]!)
    if (month < 0 || monthOfWord(found[2]!) < 0) continue

    return { text: found[0], day: Number(found[3]), month, year: yearOf(found[5]) }
  }

  for (const found of clause.matchAll(ZH_RANGE)) {
    return { text: found[0], day: Number(found[6]), month: Number(found[5]) - 1, year: yearOf(found[4]) }
  }

  for (const found of clause.matchAll(LATIN_BY)) {
    const month = monthOfWord(found[2]!)
    if (month < 0) continue

    return { text: found[0], day: Number(found[1]), month, year: yearOf(found[3]) }
  }

  for (const found of clause.matchAll(ZH_BY)) {
    const [year, month, day] = found[2] !== undefined ? [found[1], found[2], found[3]] : [found[4], found[5], found[6]]

    return { text: found[0], day: Number(day), month: Number(month) - 1, year: yearOf(year) }
  }

  return null
}

// A "by …" tail that is not a day but still reads as a date: "by Q1", "by end of March", "by 2027", "by 3/12",
// "d'ici fin mars", "a finales de marzo", "2027年底前". Kept as the file wrote it.
export const DATE_LIKE = new RegExp(
  String.raw`^(?:[qt][1-4](?:\s+\d{4})?|(?:end|start|mid)[ -]of\s+.+|(?:fin|d[ée]but|mi|finales|inicios|principios|mediados)(?:\s+(?:de|du|del|d['’]))?[\s-]+\S.*|\d{4}|\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?|第[一二三四1-4]季度|\d{4}年(?:底|初|中)?|[上下]半年|年底|月底|季度末|月[初底])$`,
  'iu',
)
export const BY_TEXT = new RegExp(String.raw`[,，]?\s*${BY}\s+([^,;，；]+)$`, 'iu')
export const BY_TEXT_ZH = new RegExp(String.raw`[,，]?\s*${ZH_BEFORE}?\s*([^,;，；]{1,20}?)${ZH_AFTER}\s*$`, 'u')

// ---------------------------------------------------------------------------------------------
// Words that name what Claude or the person says (filters on what they write).
// ---------------------------------------------------------------------------------------------
const tailRe = (words: readonly string[], trail = '[.!。！]?'): RegExp => new RegExp(`^(?:${words.map(w => escape(w)).join('|')})\\s*${trail}$`, 'iu')

// An option that only closes the question ("later") is the band's own quiet exit, not a choice.
const QUIET_WORDS = [
  'later', 'skip', 'not now', 'not for me',
  'plus tard', 'passer', 'ignorer', 'pas maintenant', 'pas pour moi',
  'más tarde', 'mas tarde', 'luego', 'omitir', 'saltar', 'ahora no', 'no para mí', 'no para mi',
  '稍后', '稍后再说', '以后再说', '跳过', '暂时不', '现在不', '不适合我',
]
// An option that only says "go" names no choice.
const GO_WORDS = [
  'go', 'go ahead', 'ok', 'okay', 'yes', 'proceed', 'proceed as proposed', 'continue', 'do it', 'approve',
  'oui', "d'accord", 'allez-y', 'vas-y', 'continuer', 'continue', 'procéder', 'approuver', 'fais-le', 'faites-le', "c'est parti",
  'sí', 'si', 'vale', 'adelante', 'continuar', 'continúa', 'procede', 'proceder', 'aprobar', 'hazlo', 'de acuerdo',
  '好', '好的', '是', '是的', '可以', '行', '继续', '同意', '批准', '确认', '开始', '执行', '没问题',
]
// Answers the band already offers (typing, "Later") or that approve without naming anything.
const OWN_WORDS = [
  'something else', 'other', 'later', 'skip', 'go', 'ok', 'okay', 'yes', 'done',
  'autre chose', 'autre', 'plus tard', 'passer', 'oui', 'fait', 'terminé',
  'otra cosa', 'otro', 'más tarde', 'omitir', 'sí', 'vale', 'hecho',
  '其他', '别的', '稍后', '跳过', '好', '好的', '是', '完成', '已完成',
]

export const QUIET_EXIT = tailRe(QUIET_WORDS)
export const BARE_GO = tailRe(GO_WORDS)
export const OWN = tailRe(OWN_WORDS)

// A step that is bookkeeping (saving notes, running checks) says nothing about what got done.
const BOOKKEEPING_LATIN = [
  'save', 'saved', 'saving', 'status\\.md', 'index\\.md', 'validate', 'type-?check', 'tests?',
  'enregistr\\p{L}*', 'sauvegard\\p{L}*', 'valid\\p{L}*', 'v[ée]rifi\\p{L}*', 'tests?',
  'guard\\p{L}*', 'verific\\p{L}*', 'prueba\\p{L}*', 'comprob\\p{L}*',
]
const BOOKKEEPING_ZH = ['保存', '存档', '验证', '校验', '检查', '测试', '类型检查']
export const BOOKKEEPING = new RegExp(`${LEFT}(?:${BOOKKEEPING_LATIN.join('|')})${RIGHT}|${BOOKKEEPING_ZH.join('|')}`, 'iu')

// A correction: the message starts with a word that redirects Claude (KPI test).
const REDIRECT_WORDS = [
  'no', 'nope', 'stop', 'wrong', 'not that', 'undo', 'revert', 'actually', 'instead',
  'non', 'arrête', 'arrete', 'faux', 'pas ça', 'pas ca', 'annule', 'annuler', 'en fait', 'plutôt', 'plutot', 'finalement',
  'detente', 'mal', 'incorrecto', 'eso no', 'deshaz', 'deshacer', 'revertir', 'en realidad', 'mejor', 'más bien',
]
const REDIRECT_ZH = ['不是', '不对', '不要', '别', '停', '错了', '撤销', '撤回', '回退', '其实', '改成']
export const REDIRECT = new RegExp(`^\\s*(?:${anyOf(REDIRECT_WORDS)}|${REDIRECT_ZH.join('|')})`, 'iu')
