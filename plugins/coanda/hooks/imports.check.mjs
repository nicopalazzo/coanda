// Coanda's import rules: who may import and call what (pure core, one door to the model, only
// register submits, nothing from one person's machine, no old name or plugin id).
//
// Run it with node, from anywhere:  node <plugin folder>/hooks/imports.check.mjs
//
// It is a script and not a `claude plugin test` file because that runner gives a test no way to
// read a source file (no file access, code files only as imports; computed 12 Nov 2026).
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// Pure files: no host calls, no clock, no files.
const CORE = ['band', 'focus', 'idle', 'time', 'cards', 'plan', 'next', 'question', 'line', 'goals-ask', 'standup', 'shutdown', 'wins']
const SHELL = ['register', 'render', 'grid', 'lab', 'lab-client', 'light', 'stage', 'lamp', 'state', 'store', 'io', 'model', 'demo-run']

const sources = Object.fromEntries(
  readdirSync(here)
    .filter(name => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map(name => [name.replace(/\.tsx?$/, ''), readFileSync(join(here, name), 'utf8')]),
)

// Every import of a file: where from, and whether it brings a value (not `import type`).
const importsOf = text =>
  [...text.matchAll(/^import\s+(type\s+)?([\s\S]*?)\s+from\s+'([^']+)'/gm)].map(m => ({ isType: m[1] !== undefined, from: m[3] }))

const failures = []
const check = (name, problems) => {
  console.log(`${problems.length === 0 ? 'pass' : 'FAIL'}  ${name}`)
  for (const one of problems) console.log(`      ${one}`)
  failures.push(...problems)
}

check(
  'every file under hooks/ is listed as core or shell',
  Object.keys(sources)
    .filter(file => !CORE.includes(file) && !SHELL.includes(file))
    .map(file => `${file}: not listed in imports.check.mjs`),
)

// While the repository is being seeded (no register.tsx yet), a listed file that is not there yet
// is reported but does not fail; once register.tsx exists, every listed file must exist.
const missing = [...CORE, ...SHELL].filter(file => !(file in sources))
const isSeeding = !('register' in sources)
if (isSeeding) {
  console.log(`seed  not copied yet: ${missing.join(', ') || 'none'}`)
} else {
  check('every listed file exists', missing.map(file => `${file}: missing`))
}

check(
  'a core file imports no value from claude-code and no shell file, and never touches $',
  CORE.filter(file => file in sources).flatMap(file => [
    ...importsOf(sources[file]).flatMap(one => {
      if (one.from.startsWith('claude-code')) return one.isType ? [] : [`${file}: imports a value from '${one.from}'`]
      if (one.from === '../types') return []
      const target = one.from.replace(/^\.\//, '').replace(/\.tsx?$/, '')

      return CORE.includes(target) ? [] : [`${file}: imports '${one.from}', which is not a core file`]
    }),
    ...(/\$\s*\.\s*\w/.test(sources[file]) ? [`${file}: calls the host ($.…)`] : []),
  ]),
)

const callers = call => Object.keys(sources).filter(file => sources[file].includes(call))

check('only model.ts calls $.model.complete', callers('$.model.complete').filter(file => file !== 'model').map(file => `${file}: calls $.model.complete`))
if ('model' in sources) check('model.ts calls $.model.complete', callers('$.model.complete').includes('model') ? [] : ['model: the call is missing'])
check('only register.tsx calls $.prompt.submit', callers('$.prompt.submit').filter(file => file !== 'register').map(file => `${file}: calls $.prompt.submit`))

check(
  'only state.ts reads or writes an atom',
  Object.keys(sources)
    .filter(file => file !== 'state')
    .flatMap(file => importsOf(sources[file]).filter(one => one.from === 'claude-code' && !one.isType).map(() => `${file}: imports a value from 'claude-code'`)),
)

check('render.tsx reads no state, no file and no setting, and decides nothing', [
  ...importsOf(sources.render ?? '').flatMap(one => {
    if (one.from.startsWith('claude-code')) return one.isType ? [] : [`render: imports a value from '${one.from}'`]

    return one.from === '../types' || one.from === './line' ? [] : [`render: imports '${one.from}'`]
  }),
  ...(/\$\s*\.\s*\w/.test(sources.render ?? '') ? ['render: calls the host ($.…)'] : []),
])

// Nothing from one person's machine in the shipped code. Every file under
// hooks/ is scanned, tests and this script included, so the two words are built from parts. A path
// comes from setup, the Claude config directory, HOME or the plugin's own folder; a clock reads
// the machine's own time zone; and HOME and CLAUDE_CONFIG_DIR are the only environment names read.
const hooksFiles = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? hooksFiles(join(dir, entry.name)) : [join(dir, entry.name)]))
const MACHINE = [['', 'Users', ''].join('/'), ['Europe', ''].join('/')]
check(
  'no file under hooks/ names a home folder or a time zone',
  hooksFiles(here).flatMap(path => MACHINE.filter(word => readFileSync(path, 'utf8').includes(word)).map(word => `${relative(here, path)}: contains ${word}`)),
)
check(
  'only HOME and CLAUDE_CONFIG_DIR are read from the environment, each spelled out',
  Object.entries(sources).flatMap(([file, text]) => [
    ...[...text.matchAll(/\$\.env\.(?:get|set)\(\s*([^)]*?)\s*\)/g)]
      .map(m => m[1])
      .filter(arg => arg !== "'HOME'" && arg !== "'CLAUDE_CONFIG_DIR'")
      .map(arg => `${file}: reads the environment with ${arg}`),
    ...(/\$\.env\.set/.test(text) ? [`${file}: sets an environment variable`] : []),
  ]),
)

// No file of the plugin carries the old repository name or the old plugin id. The words are built
// from parts so this file does not contain them. The old id is only caught where it is an id (a
// quoted name, a tool prefix, a state key), so the plain word in prose stays allowed. The engine's
// own laid types (.claude-plugin/types) are not ours to check.
const OLD_NAME = ['mod', 'area'].join('-')
const OLD_ID = ['in', 'tent'].join('')
const OLD_ID_USE = new RegExp(`['"]${OLD_ID}(?:['"./:@]|-demo)|mcp__${OLD_ID}__|^\\s*${OLD_ID}\\s*:|${OLD_ID}@${OLD_ID}`, 'm')
const filesUnder = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' || path.endsWith(join('.claude-plugin', 'types')) ? [] : filesUnder(path)
    return [path]
  })
check(
  'no file of the plugin contains the old name or the old plugin id',
  filesUnder(join(here, '..')).flatMap(path => {
    const inPlugin = relative(join(here, '..'), path)
    const text = readFileSync(path, 'utf8')

    if (inPlugin.includes(OLD_NAME)) return [`${inPlugin}: the path has the old name`]
    if (text.includes(OLD_NAME)) return [`${inPlugin}: contains the old name`]

    return OLD_ID_USE.test(text) ? [`${inPlugin}: uses the old plugin id`] : []
  }),
)

console.log(failures.length === 0 ? '\nimports: all rules hold' : `\nimports: ${failures.length} problem(s)`)
process.exit(failures.length === 0 ? 0 : 1)
