const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function render(relative, query, states) {
  const calls = []
  const filename = path.resolve(__dirname, '..', relative)
  const useSWR = (key, fetcher, options) => { calls.push({ key, fetcher, options }); return { ...states[key], mutate: async () => {} } }
  const mocks = {
    swr: { __esModule: true, default: useSWR },
    'next/router': { useRouter: () => ({ query: { tenant: 'osc', ...query } }) },
    'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
    'next/image': { __esModule: true, default: ({ priority, ...props }) => React.createElement('img', props) },
    '@/components/layout/DashboardLayout': { __esModule: true, default: ({ children }) => children },
    '@/components/ui/Modal': { Modal: () => null },
    '@/lib/api': { __esModule: true, default: {}, publicApi: {} },
  }
  function load(filename) {
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    const module = { exports: {} }
    vm.runInNewContext(compiled, { module, exports: module.exports, process, console, require: name => Object.hasOwn(mocks, name) ? mocks[name] : name.startsWith('@/') ? load(path.resolve(__dirname, '..', 'src', `${name.slice(2)}.tsx`)) : require(name) }, { filename })
    return module.exports
  }
  return { html: renderToStaticMarkup(React.createElement(load(filename).default)), calls }
}

const course = { id: 'judo', nome: 'Judô', tipo: 'MODALIDADE', ativo: true, inscricoes_abertas: true, descricao: '', projetos: [], emendas: [], editais: [], turmas: [{ id: 'a', nome: 'Turma A', capacidade: 20, inscritos: 20, espera: 3, vagas: 0 }] }

test('shows a course enrollment link, capacity and reserve together', () => {
  const { html } = render('src/pages/[tenant]/cursos.tsx', {}, { '/enrollment-admin/courses': { data: [course] } })
  assert.match(html, /\/osc\/inscricao\?curso=judo/)
  assert.match(html, /20\/20 matriculados/)
  assert.match(html, /3 na reserva/)
  assert.match(html, /Copiar link desta turma/)
  assert.match(html, /\/osc\/matriculas\?turma=a/)
})

test('deduplicates inherited and directly linked resources', () => {
  const amendment = { id: 'e1', number: '123', year: 2025, parlamentar_name: 'Parlamentar', value: '200000' }
  const notice = { id: 'n1', titulo: 'Edital vinculado', valor_total: '10000', link_oficial: 'https://example.org/document.pdf' }
  const { html } = render('src/pages/[tenant]/cursos.tsx', {}, { '/enrollment-admin/courses': { data: [{ ...course, emendas: [amendment], editais: [notice], projetos: [{ id: 'p1', name: 'Projeto', total_budget: '200000', emendas: [amendment], editais: [notice] }] }] } })
  assert.match(html, /Emendas vinculadas \(1\)/)
  assert.match(html, /Licitações e editais vinculados \(1\)/)
  assert.equal(html.split('Edital vinculado').length - 1, 1)
  assert.match(html, /não são somados/)
})

test('opens the course selected from a project link', () => {
  const { html } = render('src/pages/[tenant]/cursos.tsx', { curso: 'dance' }, { '/enrollment-admin/courses': { data: [course, { ...course, id: 'dance', nome: 'Dança', turmas: [] }] } })
  assert.match(html, /\/osc\/inscricao\?curso=dance/)
  assert.match(html, /Crie as turmas e defina as vagas/)
})

test('public form requests only the course specified in its link', () => {
  const { html, calls } = render('src/pages/[tenant]/inscricao.tsx', { curso: 'judo' }, { '/enrollment/osc/classes?curso=judo': { data: { organization: 'OSC', course: { id: 'judo', nome: 'Judô' }, classes: [] } } })
  assert.equal(calls[0].key, '/enrollment/osc/classes?curso=judo')
  assert.match(html, /Matrícula · Judô/)
  assert.equal(calls[0].options.refreshInterval, 15000)
})

test('public form does not silently fall back when the course is unavailable', () => {
  const { html } = render('src/pages/[tenant]/inscricao.tsx', { curso: 'closed' }, { '/enrollment/osc/classes?curso=closed': { error: new Error('not found') } })
  assert.match(html, /inscrições encerradas/)
})

test('shows existing activity students even when no class has been assigned', () => {
  const { html } = render('src/pages/[tenant]/cursos.tsx', {}, {
    '/enrollment-admin/courses': { data: [{ ...course, total_alunos: 2, turmas: [] }] },
    '/enrollment-admin/courses/judo/students': { data: [
      { id: 'b1', name: 'Aluno já cadastrado', status: 'ATIVO', matriculas: [] },
      { id: 'b2', name: 'Aluna de duas modalidades', status: 'ATIVO', matriculas: [] },
    ] },
  })
  assert.match(html, /Alunos vinculados \(2\)/)
  assert.match(html, /Aluno já cadastrado/)
  assert.match(html, /Aluna de duas modalidades/)
  assert.match(html, /Sem turma definida nesta atividade/)
  assert.match(html, /\/osc\/beneficiarios\?aluno=b1/)
  assert.match(html, /\/osc\/beneficiarios\?curso=judo/)
})

test('a failed course roster is shown as an error instead of an empty activity', () => {
  const { html } = render('src/pages/[tenant]/cursos.tsx', {}, {
    '/enrollment-admin/courses': { data: [course] },
    '/enrollment-admin/courses/judo/students': { error: new Error('unavailable') },
  })
  assert.match(html, /Não foi possível carregar os alunos/)
  assert.doesNotMatch(html, /Nenhum aluno vinculado a esta atividade/)
})
