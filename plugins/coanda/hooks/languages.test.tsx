import { expect, test } from 'claude-code/testing'

import type { DayWins, GoalsProposal, Step } from '../types'
import { toCard } from './cards'
import { endLabel, parseFocus, parseFocusMd, primaryText, shortPrimary } from './focus'
import { goalsMessage, proposalMessage, proposalText } from './goals-ask'
import { LANGS, currentLang, formatDay, langOfLocale, langOfName, langOfText, pickLang, setLang, t, tn } from './i18n'
import type { Lang } from './i18n'
import { isCorrection } from './kpi'
import { findEndDate, monthOfWord } from './lexicon'
import { lastOutcomeStep } from './plan'
import { parseSuggestions } from './next'
import { chipsOf, headline, journalBlock, mergeJournal } from './wins'
import { WORDS } from './words'

// The band in French, Spanish and Simplified Chinese: the language picked, the person's own files read in it, the words
// the band says, the dates, the journal. Each test runs in one language and puts English back.
const inLang = <T,>(lang: Lang, body: () => T): T => {
  setLang(lang)
  try {
    return body()
  } finally {
    setLang('en')
  }
}

// Thu 12 Nov 2026, 12:00 local: the clock the dates are placed against.
const THEN = new Date(2026, 10, 12, 12, 0).getTime()

// ---- Which language -----------------------------------------------------------------------------

test('a language is found from the names people and systems use', () => {
  expect(['French', 'français', 'Francais', 'fr', 'fr-FR', 'fr_CA'].map(langOfName)).toEqual(Array(6).fill('fr'))
  expect(['Spanish', 'español', 'es', 'es-MX', 'Castellano'].map(langOfName)).toEqual(Array(5).fill('es'))
  expect(['Chinese', 'Mandarin', 'zh', 'zh-CN', '中文', '简体中文', '普通话'].map(langOfName)).toEqual(Array(7).fill('zh'))
  expect(['English', 'en', 'en-GB'].map(langOfName)).toEqual(Array(3).fill('en'))
  expect(['German', 'ja', 'C', 'POSIX', '', undefined, 4].map(langOfName)).toEqual(Array(7).fill(null))
})

test('the system locale: the first variable that names a language wins; C and unknown ones are passed over', () => {
  expect(langOfLocale([undefined, undefined, 'fr_FR.UTF-8'])).toBe('fr')
  expect(langOfLocale(['es_ES.UTF-8', undefined, 'fr_FR.UTF-8'])).toBe('es')
  expect(langOfLocale(['C', undefined, 'zh_CN.UTF-8'])).toBe('zh')
  expect(langOfLocale([undefined, undefined, 'de_DE.UTF-8'])).toBeNull()
  expect(langOfLocale([])).toBeNull()
})

test('a goals file is read for its language: by the words of the format, then characters, then small words', () => {
  expect(langOfText('## Aujourd’hui\n- **Priorité (N) : Finir.**')).toBe('fr')
  expect(langOfText('## Hoy\n- **Prioridad (N): Terminar.**')).toBe('es')
  expect(langOfText('## 今天\n- **首要事项（N）：完成。**')).toBe('zh')
  expect(langOfText('## Today\n- **Primary (N): Finish.**')).toBe('en')
  expect(langOfText('Terminer le rapport pour la semaine et le partager avec les autres')).toBe('fr')
  expect(langOfText('Terminar el informe para la semana y compartirlo con los demás')).toBe('es')
  expect(langOfText('完成报告并发给大家')).toBe('zh')
  expect(langOfText('Finish the report and share it with the team in the morning')).toBe('en')
  // Not enough to say: no language, so the next source decides.
  expect(langOfText('Coanda')).toBeNull()
  expect(langOfText('')).toBeNull()
  // A file in two languages: the one its heading names.
  expect(langOfText('## Hoy\n- **Primary (N): Terminar.**\n- **Frente 1 — x:** y.')).toBe('es')
})

test('the order: the Claude Code setting, then the goals file, then the system locale, then English', () => {
  const file = '## Aujourd’hui\n- **Priorité (N) : Finir.**'

  expect(pickLang({ setting: 'Spanish', text: file, locale: ['zh_CN.UTF-8'] })).toBe('es')
  expect(pickLang({ text: file, locale: ['zh_CN.UTF-8'] })).toBe('fr')
  expect(pickLang({ setting: 'Klingon', text: file, locale: ['zh_CN.UTF-8'] })).toBe('fr')
  expect(pickLang({ text: 'Coanda', locale: ['zh_CN.UTF-8'] })).toBe('zh')
  expect(pickLang({ locale: [] })).toBe('en')
  // An English goals file keeps English, whatever the system speaks.
  expect(pickLang({ text: '## Today\n- **Primary (N): Ship.**', locale: ['fr_FR.UTF-8'] })).toBe('en')
})

// ---- The dictionaries -----------------------------------------------------------------------------

test('every language has every key, with the same {placeholders} and no English left in a plural pair', () => {
  const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]!).sort().join(',')

  for (const lang of LANGS) {
    expect(Object.keys(WORDS[lang]).sort()).toEqual(Object.keys(WORDS.en).sort())
    for (const key of Object.keys(WORDS.en) as (keyof typeof WORDS.en)[]) {
      expect(`${lang} ${key} ${holes(WORDS[lang][key])}`).toBe(`${lang} ${key} ${holes(WORDS.en[key])}`)
      expect(WORDS[lang][key].trim()).not.toBe('')
    }
  }
})

test('t() fills the holes and falls back to English; tn() picks the plural of the language', () => {
  expect(inLang('fr', () => t('now.step', { text: 'Lire', n: 1, m: 3 }))).toBe('Lire · étape 1 sur 3')
  expect(inLang('es', () => t('now.step', { text: 'Leer', n: 1, m: 3 }))).toBe('Leer · paso 1 de 3')
  expect(inLang('zh', () => t('now.step', { text: '阅读', n: 1, m: 3 }))).toBe('阅读 · 第 1 步，共 3 步')
  expect(currentLang()).toBe('en')

  // English: one only for 1. French: 0 and 1 are singular. Spanish: only 1. Chinese: no plural.
  expect([0, 1, 2].map(n => inLang('en', () => tn('kpi.days', n)))).toEqual(['0 days', '1 day', '2 days'])
  expect([0, 1, 2].map(n => inLang('fr', () => tn('kpi.days', n)))).toEqual(['0 jour', '1 jour', '2 jours'])
  expect([0, 1, 2].map(n => inLang('es', () => tn('kpi.days', n)))).toEqual(['0 días', '1 día', '2 días'])
  expect([0, 1, 2].map(n => inLang('zh', () => tn('kpi.days', n)))).toEqual(['0 天', '1 天', '2 天'])
})

// ---- Dates ----------------------------------------------------------------------------------------

test('months are read in English, French and Spanish, with accents and short forms; other words are not months', () => {
  expect(['Oct', 'octobre', 'octubre', 'October'].map(monthOfWord)).toEqual([9, 9, 9, 9])
  expect(['déc.', 'dec', 'dic', 'diciembre', 'décembre'].map(monthOfWord)).toEqual([11, 11, 11, 11, 11])
  expect(['janv.', 'févr.', 'août', 'ago', 'juil', 'sept.', 'sep', 'mars', 'mayo'].map(monthOfWord)).toEqual([0, 1, 7, 7, 6, 8, 8, 2, 4])
  expect(['weeks', 'jui', 'de', 'marketing', 'lunes'].map(monthOfWord)).toEqual([-1, -1, -1, -1, -1])
})

test('an end date is found in each language and taken out of the text', () => {
  const day = (clause: string) => {
    const f = findEndDate(clause)

    return f === null ? null : { day: f.day, month: f.month, year: f.year, rest: clause.replace(f.text, '') }
  }

  expect(day('portfolio live by Sun 18 Oct')).toEqual({ day: 18, month: 9, year: null, rest: 'portfolio live' })
  expect(day('portfolio en ligne d’ici le 14 déc.')).toEqual({ day: 14, month: 11, year: null, rest: 'portfolio en ligne' })
  expect(day('portfolio en ligne avant le 1er janvier 2027')).toEqual({ day: 1, month: 0, year: 2027, rest: 'portfolio en ligne' })
  expect(day('portafolio en línea para el 14 de diciembre de 2026')).toEqual({ day: 14, month: 11, year: 2026, rest: 'portafolio en línea' })
  expect(day('portafolio hasta el 3 mar')).toEqual({ day: 3, month: 2, year: null, rest: 'portafolio' })
  expect(day('作品集在12月14日前上线')).toEqual({ day: 14, month: 11, year: null, rest: '作品集上线' })
  expect(day('作品集 截止2027年1月5日')).toEqual({ day: 5, month: 0, year: 2027, rest: '作品集' })
  expect(day('21 sept → 14 déc.')).toEqual({ day: 14, month: 11, year: null, rest: '' })
  expect(day('9月21日至12月14日')).toEqual({ day: 14, month: 11, year: null, rest: '' })
  // Not a date: a duration, a number that is no month, a date with no mark that it is an end.
  expect(day('ready by 3 weeks')).toBeNull()
  expect(day('pour le client')).toBeNull()
  expect(day('11月15日会议')).toBeNull()
})

test('a Lane end date reads in the language, in the band', () => {
  const lane = { id: 'a', outcome: 'x', endDay: '2026-12-14' }

  expect(endLabel(lane, THEN)).toBe('by 14 Dec')
  expect(inLang('fr', () => endLabel(lane, THEN))).toBe('d’ici le 14 déc.')
  expect(inLang('es', () => endLabel(lane, THEN))).toBe('para el 14 dic')
  expect(inLang('zh', () => endLabel(lane, THEN))).toBe('12月14日前')
  expect(inLang('fr', () => endLabel({ ...lane, endDay: '2026-11-01' }, THEN))).toBe('d’ici le 1er nov. · dépassé')
  expect(inLang('zh', () => endLabel({ ...lane, endDay: '2027-03-01' }, THEN))).toBe('2027年3月1日前')
  expect(inLang('es', () => endLabel({ id: 'b', outcome: 'x', endText: 'finales de marzo' }, THEN))).toBe('para finales de marzo')
  expect(formatDay(9, 0, 2027, 'fr')).toBe('9 janv. 2027')
})

// ---- The person's own files -----------------------------------------------------------------------

test('a goals file in French is read: Primary, Lane, end date', () => {
  const found = parseFocus(
    '## Aujourd’hui\n- **Priorité (15 nov., 14:02) : Terminer Coanda (Axe 2).**\n- **Axe 2 — Preuve :** portfolio en ligne d’ici le 14 déc. Le reste suit.\n- **Axe 3 — Visible :** poster deux fois, d’ici fin mars.\n',
    THEN,
  )

  expect(found).toMatchObject({ status: 'ok', primary: 'Terminer Coanda', laneId: 'lane-2' })
  expect(found.lanes[0]).toEqual({ id: 'lane-2', outcome: 'Preuve: portfolio en ligne', endDay: '2026-12-14' })
  expect(found.lanes[1]).toEqual({ id: 'lane-3', outcome: 'Visible: poster deux fois', endText: 'fin mars' })
  expect(primaryText(found)).toBe('Terminer Coanda')
})

test('a goals file in Spanish is read: Primary, Lane, end date', () => {
  const found = parseFocus(
    '## Hoy\n- **Prioridad (15 nov, 14:02): Terminar Coanda (Frente 2).**\n- **Frente 2 — Prueba:** portafolio en línea para el 14 de diciembre. Lo demás sigue.\n',
    THEN,
  )

  expect(found).toMatchObject({ status: 'ok', primary: 'Terminar Coanda', laneId: 'lane-2' })
  expect(found.lanes[0]).toEqual({ id: 'lane-2', outcome: 'Prueba: portafolio en línea', endDay: '2026-12-14' })
})

test('a goals file in Simplified Chinese is read, with full-width brackets and colons', () => {
  const found = parseFocus(
    '## 今天\n- **首要事项（11月15日 14:02）：完成 Coanda（主线 2）。**\n- **主线 2 — 验证：** 作品集在12月14日前上线。其余随后。\n- **主线 3 — 曝光：** 发两篇文章，2027年底前。\n',
    THEN,
  )

  expect(found).toMatchObject({ status: 'ok', primary: '完成 Coanda', laneId: 'lane-2' })
  expect(found.lanes[0]).toEqual({ id: 'lane-2', outcome: '验证: 作品集上线', endDay: '2026-12-14' })
  expect(found.lanes[1]).toEqual({ id: 'lane-3', outcome: '曝光: 发两篇文章', endText: '2027年底' })
  // A long Chinese head is cut at half the length: Chinese characters are twice as wide.
  expect(shortPrimary('完成'.repeat(30))).toBe(`${'完成'.repeat(15)}…`)
})

test('a closed Primary is read in each language, with the time', () => {
  expect(parseFocusMd('## Today\n- **Primary (x): CLOSED 15 Nov 12:44**\n')).toMatchObject({ status: 'closed', closedAt: '12:44' })
  expect(parseFocusMd('## Aujourd’hui\n- **Priorité (x) : CLÔTURÉ 15 nov. 12:44**\n')).toMatchObject({ status: 'closed', closedAt: '12:44' })
  expect(parseFocusMd('## Hoy\n- **Prioridad (x): CERRADO 15 nov 12:44**\n')).toMatchObject({ status: 'closed', closedAt: '12:44' })
  expect(parseFocusMd('## 今天\n- **首要事项（x）：已关闭 11月15日 12:44**\n')).toMatchObject({ status: 'closed', closedAt: '12:44' })
  // The word in lower case, inside a Primary, is no closing mark.
  expect(parseFocusMd('## Hoy\n- **Prioridad (x): Enviar el contrato cerrado.**\n')).toMatchObject({ status: 'ok', primary: 'Enviar el contrato cerrado.' })
})

test('English keeps working in a file that is not in English, and a plain file is still a plain Primary', () => {
  expect(parseFocus('## Today\n- **Primary (N): Ship it (Lane 1).**\n- **Lane 1 — Go:** live by 14 Dec.\n', THEN)).toMatchObject({ status: 'ok', primary: 'Ship it', laneId: 'lane-1' })
  expect(parseFocus('Terminer le rapport\nle reste', THEN)).toMatchObject({ status: 'ok', primary: 'Terminer le rapport', lanes: [] })
})

// ---- What Coanda asks Claude to write: the file reads back --------------------------------------

test('the goals Claude is asked to write read back in every language', () => {
  const proposal = (by: string): GoalsProposal => ({
    goal: 'Ship the install',
    lanes: [
      { name: 'Visible', outcome: 'portfolio live', by },
      { name: 'Page', outcome: 'product page shipped', by: '' },
    ],
  })

  for (const [lang, by] of [['en', '14 Dec'], ['fr', '14 déc.'], ['es', '14 de diciembre'], ['zh', '12月14日']] as const) {
    const back = inLang(lang, () => parseFocusMd(proposalText(proposal(by)), THEN))

    expect(`${lang} ${back.status} ${back.primary} ${back.laneId}`).toBe(`${lang} ok Ship the install lane-1`)
    expect(back.lanes.map(l => l.outcome)).toEqual(['Visible: portfolio live', 'Page: product page shipped'])
    expect(back.lanes[0]).toMatchObject({ endDay: '2026-12-14' })
    expect(back.lanes[1]).not.toHaveProperty('endDay')
  }
})

test('what Setup sends Claude is in the person\'s language, names the file and shows the format with that language\'s words', () => {
  const ask = (lang: Lang) => inLang(lang, () => goalsMessage('setup', '/g/goals.md'))

  expect(ask('fr')).toContain('Configure mes objectifs et mes Axes')
  expect(ask('fr')).toContain('## Aujourd’hui\n- **Priorité (N) : <l’objectif> (Axe 1).**\n- **Axe 1 — <nom> :** <le résultat> d’ici le <jour mois>.')
  expect(ask('es')).toContain('Configura mis objetivos y Frentes')
  expect(ask('es')).toContain('## Hoy\n- **Prioridad (N): <el objetivo> (Frente 1).**')
  expect(ask('zh')).toContain('为 Coanda 设置我的目标和主线')
  expect(ask('zh')).toContain('## 今天\n- **首要事项（N）：<目标>（主线 1）。**\n- **主线 1 — <名称>：** <成果>，<月日>前。')
  for (const lang of LANGS) expect(ask(lang)).toContain('/g/goals.md')

  // "Find them" names the band's own button in the language, and the demo folder alone.
  expect(inLang('fr', () => goalsMessage('find', '/g/goals.md'))).toContain('« Enregistrer ceux-ci »')
  expect(inLang('es', () => goalsMessage('find', '/d/goals.md', '/d'))).toContain('la carpeta /d y en ningún otro sitio')
  expect(inLang('zh', () => proposalMessage('save', '/g/goals.md', { goal: '完成', lanes: [] }))).toContain('## 今天\n- **首要事项（N）：完成。**')
})

// ---- What people and Claude write: the filters ---------------------------------------------------

test('a decision option that only says "go" or "later" is refused or left out in every language', () => {
  const card = (options: { label: string; consequence: string }[]) => toCard({ question: '¿Dónde?', options }, 1, 's')

  for (const bare of ['Oui', 'Adelante', '好的', 'Continuer', 'vale']) {
    expect(card([{ label: bare, consequence: 'x' }, { label: 'Otro', consequence: 'y' }])).toContain('names no choice')
  }
  // The band's own quiet exit is left out of the options, so one option is too few.
  for (const quiet of ['Plus tard', 'Más tarde', '稍后', 'Pas maintenant', 'Ahora no']) {
    expect(card([{ label: quiet, consequence: 'x' }, { label: 'Garder', consequence: 'y' }])).toContain('give 2 or 3 options')
  }
  expect(typeof card([{ label: 'Garder le fichier', consequence: 'aucun changement' }, { label: 'Déplacer', consequence: '2 fichiers' }])).toBe('object')

  expect(parseSuggestions('[{"label":"Autre chose"},{"label":"Garder"},{"label":"好的"},{"label":"保留文件"},{"label":"Otra cosa"}]').map(s => s.label)).toEqual(['Garder', '保留文件'])
})

test('bookkeeping steps in each language say nothing about what got done', () => {
  const step = (content: string): Step => ({ content, status: 'completed', files: [], calls: 0 })

  for (const bookkeeping of ['Enregistrer les notes', 'Sauvegarder STATUS.md', 'Guardar el estado', 'Verificar los tipos', 'Exécuter les tests', '保存状态', '运行测试', '类型检查']) {
    expect(lastOutcomeStep([step('Le formulaire est publié'), step(bookkeeping)])).toBe('Le formulaire est publié')
  }
  expect(lastOutcomeStep([step('Revisar el informe')])).toBe('Revisar el informe')
  // A word that only contains one is not bookkeeping.
  expect(lastOutcomeStep([step('Contester la décision'), step('Valider')])).toBe('Contester la décision')
})

test('a correction starts with a redirecting word in each language', () => {
  for (const yes of ['no, not that', 'Non, pas ça', 'Arrête', 'En fait, plutôt le fichier', 'Eso no', 'Deshaz el cambio', 'En realidad, mejor otro', '不是这个', '撤销', '其实改成另一个']) expect(isCorrection(yes)).toBe(true)
  for (const no of ['Nothing to fix', 'Nonobstant', 'Bonjour', 'Para el cliente, por favor', '请继续', 'normal']) expect(isCorrection(no)).toBe(false)
})

// ---- The journal -----------------------------------------------------------------------------------

const DAY: DayWins = {
  v: 1,
  day: '2026-11-12',
  items: [{ text: 'Formulaire corrigé', kind: 'step', at: 1 }, { text: 'fix(band): couvre le swap', kind: 'commit', at: 2 }],
  answered: false,
  open: false,
}

test('the journal is written in the language, and a day written in one language is replaced by the same day in another', () => {
  expect(inLang('fr', () => journalBlock(DAY))).toBe('## jeu. 12 nov.\n- Date : 2026-11-12\n- 2 choses ont avancé aujourd’hui\n- Formulaire corrigé\n- Commit : fix(band): couvre le swap\n')
  expect(inLang('es', () => journalBlock(DAY))).toBe('## jue 12 nov\n- Fecha: 2026-11-12\n- 2 cosas avanzaron hoy\n- Formulaire corrigé\n- Commit: fix(band): couvre le swap\n')
  expect(inLang('zh', () => journalBlock(DAY))).toBe('## 11月12日 周四\n- 日期：2026-11-12\n- 今天推进了 2 件事\n- Formulaire corrigé\n- 提交：fix(band): couvre le swap\n')

  const first = inLang('fr', () => mergeJournal('', DAY))
  expect(first.startsWith('# Réussites 2026-11\n\n## jeu. 12 nov.')).toBe(true)
  // The same day saved again in Chinese replaces the French block, and the file keeps its French title.
  const again = inLang('zh', () => mergeJournal(first, { ...DAY, items: [...DAY.items, { text: '另一件', kind: 'step', at: 3 }] }))
  expect(again.match(/2026-11-12/g)).toHaveLength(1)
  expect(again).toContain('今天推进了 3 件事')
  expect(again).not.toContain('2 choses')
  expect(again.startsWith('# Réussites 2026-11')).toBe(true)

  expect(inLang('fr', () => [headline(0), headline(1), headline(2)])).toEqual(['0 chose a avancé aujourd’hui', '1 chose a avancé aujourd’hui', '2 choses ont avancé aujourd’hui'])
  expect(inLang('zh', () => chipsOf6())).toEqual(['a', 'b', 'c', 'd', 'e', '另外 1 项'])
})

const chipsOf6 = () => chipsOf(['a', 'b', 'c', 'd', 'e', 'f'].map((text, at) => ({ text, kind: 'step' as const, at })))
