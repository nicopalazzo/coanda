import { WORDS } from './words'
import type { Key } from './words'

// Language: which one the band speaks, and how a number or a date is written in it. Pure: the shell
// (register.tsx) finds the language and calls setLang once; everything else asks t().
//
// The language is picked, in this order, from: the Claude Code `language` setting; the language of the
// person's goals file; the system locale (LANG). English when none of them says.
export type Lang = 'en' | 'fr' | 'es' | 'zh'
export const LANGS: readonly Lang[] = ['en', 'fr', 'es', 'zh']

let current: Lang = 'en'

export function setLang(lang: Lang): void {
  current = lang
}

export const currentLang = (): Lang => current

export type Vars = Record<string, string | number>

const fill = (text: string, vars: Vars | undefined): string => (vars === undefined ? text : text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole)))

// A word of the band in the current language; English when the language lacks it.
export function t(key: Key, vars?: Vars): string {
  return fill(WORDS[current][key] ?? WORDS.en[key], vars)
}

// "one" or "other": French counts 0 and 1 as one, Spanish and English only 1, Chinese has no plural.
function formOf(lang: Lang, n: number): 'one' | 'other' {
  if (lang === 'zh') return 'other'
  if (lang === 'fr') return n >= 0 && n < 2 ? 'one' : 'other'

  return n === 1 ? 'one' : 'other'
}

type PluralBase = Key extends infer K ? (K extends `${infer B}.one` ? B : never) : never

// A word that changes with a number: tn('kpi.days', 3) reads `kpi.days.other`, with {n} filled.
export function tn(base: PluralBase, n: number, vars?: Vars): string {
  return t(`${base}.${formOf(current, n)}` as Key, { n, ...vars })
}

// The stamp on a line that is not a tool fact: "inferred", "agent", "stale".
export const stampOf = (source: 'inferred' | 'agent' | 'stale'): string => t(`src.${source}`)

// A language by its own name, as /coanda-language shows it.
export const nativeName = (lang: Lang): string => ({ en: 'English', fr: 'Français', es: 'Español', zh: '中文（简体）' })[lang]

// What the person chose with /coanda-language, as saved: `{ v: 1, lang }`; null for none or anything else.
export function toChosenLang(raw: unknown): Lang | null {
  const doc = raw as { v?: unknown; lang?: unknown } | null | undefined

  return doc?.v === 1 && typeof doc.lang === 'string' && (LANGS as readonly string[]).includes(doc.lang) ? (doc.lang as Lang) : null
}

// The name of the language, in English: what Coanda tells the model to write in.
export const languageName = (lang: Lang): string => ({ en: 'English', fr: 'French', es: 'Spanish', zh: 'Simplified Chinese' })[lang]

// ---------------------------------------------------------------------------------------------
// Finding the language
// ---------------------------------------------------------------------------------------------

// A language named by a person or a locale: "French", "fr", "Français", "es-MX", "zh_CN.UTF-8", "中文", "Mandarin".
// Null for a name that is none of the four.
export function langOfName(name: unknown): Lang | null {
  if (typeof name !== 'string') return null

  const n = name.trim().toLowerCase()
  if (n === '' || n === 'c' || n === 'posix') return null
  if (/^(?:english|en(?![a-z])|anglais|inglés|ingles)/.test(n)) return 'en'
  if (/^(?:french|fran[cç]ais|fr(?![a-z])|francés|frances)/.test(n)) return 'fr'
  if (/^(?:spanish|espa[nñ]ol|castellano|es(?![a-z])|español|espagnol)/.test(n)) return 'es'
  if (/^(?:chinese|mandarin|zh(?![a-z])|putonghua)|中文|汉语|漢語|普通话|普通話|简体|簡體|繁體|国语/u.test(n)) return 'zh'

  return null
}

// The system locale: the first of LC_ALL, LC_MESSAGES and LANG that is set and names a language.
export function langOfLocale(vars: readonly (string | undefined)[]): Lang | null {
  for (const one of vars) {
    if (one === undefined || one.trim() === '') continue

    const found = langOfName(one.split(/[.@]/)[0]!.replace(/_/g, '-'))
    if (found !== null) return found
  }

  return null
}

// The words a goals file of each language uses, and the small words of its prose.
const FILE_HINTS: Record<Lang, RegExp> = {
  en: /^\s*(?:##\s*Today\b|[-*\s]*\*\*(?:Primary|Lane)\b)/im,
  fr: /^\s*(?:##\s*Aujourd['’]hui|[-*\s]*\*\*(?:Priorité|Axe|Voie|Piste)\b)/imu,
  es: /^\s*(?:##\s*Hoy\b|[-*\s]*\*\*(?:Prioridad|Frente|Eje|Línea|Carril)\b)/imu,
  zh: /^\s*(?:##\s*(?:今天|今日)|[-*\s]*\*\*(?:首要事项|首要|今日重点|主线|赛道))/mu,
}
const SMALL_WORDS: Record<Exclude<Lang, 'zh'>, string[]> = {
  en: ['the', 'and', 'to', 'of', 'for', 'is', 'in', 'with', 'my', 'on'],
  fr: ['le', 'la', 'les', 'des', 'une', 'et', 'pour', 'est', 'que', 'du', 'mon', 'dans'],
  es: ['el', 'los', 'las', 'una', 'y', 'para', 'que', 'es', 'del', 'mi', 'con', 'en'],
}

// The language a goals file is written in: by the words of its format (## Aujourd'hui, **Prioridad, **主线), else by
// Chinese characters, else by the small words of its prose. Null when the text does not say.
export function langOfText(text: string): Lang | null {
  const hints = LANGS.filter(lang => FILE_HINTS[lang].test(text))
  // A file in several languages: the one its heading names first is the one it is written in.
  if (hints.length > 0) return hints.length === 1 ? hints[0]! : hints.map(lang => ({ lang, at: text.search(FILE_HINTS[lang]) })).sort((a, b) => a.at - b.at)[0]!.lang

  const sample = text.slice(0, 600)
  if (/[぀-ヿ]/u.test(sample)) return null
  if ((sample.match(/[㐀-鿿]/gu) ?? []).length >= 2) return 'zh'

  const words = sample.toLowerCase().match(/[\p{L}']+/gu) ?? []
  const score = (lang: Exclude<Lang, 'zh'>): number => words.filter(w => SMALL_WORDS[lang].includes(w)).length
  const ranked = (['en', 'fr', 'es'] as const).map(lang => ({ lang, n: score(lang) })).sort((a, b) => b.n - a.n)

  // Two small words at least, and a clear lead over the next language.
  return ranked[0]!.n >= 2 && ranked[0]!.n > ranked[1]!.n ? ranked[0]!.lang : null
}

export type LangSources = { chosen?: Lang | null; setting?: unknown; text?: string; locale?: readonly (string | undefined)[] }

// The person's own choice (/coanda-language) first, then the Claude Code setting, then the goals file, then the system
// locale; English when none says.
export function pickLang(from: LangSources): Lang {
  return from.chosen ?? langOfName(from.setting) ?? (from.text === undefined ? null : langOfText(from.text)) ?? langOfLocale(from.locale ?? []) ?? 'en'
}

// ---------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------
const MONTHS: Record<'en' | 'fr' | 'es', string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
}
const WEEKDAYS: Record<'en' | 'fr' | 'es', string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  fr: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
}
const WEEKDAYS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// A day as the language writes it: "14 Dec", "14 déc.", "14 dic", "12月14日"; with a year "14 Dec 2026", "2026年12月14日".
// `month` is 0 to 11.
export function formatDay(day: number, month: number, year: number | null, lang: Lang = current): string {
  if (lang === 'zh') return `${year === null ? '' : `${year}年`}${month + 1}月${day}日`

  const shown = lang === 'fr' && day === 1 ? '1er' : String(day)

  return `${shown} ${MONTHS[lang][month]}${year === null ? '' : ` ${year}`}`
}

// The heading of a journal day: "Thu 12 Nov", "jeu. 12 nov.", "jue 12 nov", "11月12日 周四".
export function dayHeading(date: Date, lang: Lang = current): string {
  const weekday = date.getDay()
  const day = formatDay(date.getDate(), date.getMonth(), null, lang)

  return lang === 'zh' ? `${day} ${WEEKDAYS_ZH[weekday]}` : `${WEEKDAYS[lang][weekday]} ${day}`
}

// A list of parts in words: ["Goal", "2 Lanes"] is "Goal and 2 Lanes".
export const joinAnd = (parts: string[]): string => parts.join(t('saved.and'))
