const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, process, console,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : name.startsWith('@/') ? load(`src/${name.slice(2)}.tsx`, mocks) : require(name),
  }, { filename })
  return module.exports
}

const turma = { id: 'class-1', nome: 'Turma A', capacidade: 2, inscritos: 1, espera: 1, vagas: 1, project: null }
const aluno = (name) => ({ id: name, name, responsaveis: [] })
const records = [
  { id: 'enrollment-1', status: 'ATIVA', created_at: '2026-10-22', aluno: aluno('Aluno do link') },
  { id: 'enrollment-2', status: 'EM_ESPERA', created_at: '2026-10-22', aluno: aluno('Aluno em espera') },
]

function renderPage(page, enrollmentState, beneficiaryState) {
  const calls = []
  function useSWR(key, fetcher, options) {
    calls.push({ key, fetcher, options })
    const state = key === '/enrollment-admin/classes' ? { data: [turma] }
      : key === '/enrollment-admin/classes/class-1/enrollments' ? enrollmentState
      : Array.isArray(key) && key[0] === '/beneficiarios' ? beneficiaryState : {}
    return { ...state, mutate: async () => {} }
  }
  const mocks = {
    swr: { __esModule: true, default: useSWR, useSWRConfig: () => ({ mutate: async () => {} }) },
    'next/router': { useRouter: () => ({ query: { tenant: 'organizacao' } }) },
    'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
    '@/components/layout/DashboardLayout': { __esModule: true, default: ({ children }) => children },
    '@/components/ui/Modal': { Modal: () => null },
    '@/components/ui/Badge': { Badge: () => null },
    '@/components/ui/Spinner': { PageSpinner: () => React.createElement('p', null, 'Carregando cadastros...') },
    '@/services/beneficiarios': { beneficiariosService: {} },
    '@/services/projects': { projectsService: {} },
    '@/lib/api': { __esModule: true, default: {} },
  }
  const Component = load(`src/pages/[tenant]/${page}.tsx`, mocks).default
  return { html: renderToStaticMarkup(React.createElement(Component)), calls }
}

test('opens the first class and displays confirmed and waiting registrations', () => {
  const { html, calls } = renderPage('matriculas', { data: records })
  assert.match(html, /Aluno do link/)
  assert.match(html, /Aluno em espera/)
  const queries = calls.filter((call) => typeof call.key === 'string' && call.key.startsWith('/enrollment-admin/classes'))
  assert.equal(queries.length, 2)
  for (const query of queries) assert.equal(query.options.refreshInterval, 15000)
})

test('shows loading while registrations are being fetched instead of an empty class', () => {
  const { html } = renderPage('matriculas', { isLoading: true })
  assert.match(html, /Carregando inscrições/)
  assert.doesNotMatch(html, /Nenhum aluno matriculado|Sem alunos em espera/)
})

test('shows failed registration queries with a retry instead of an empty class', () => {
  const { html } = renderPage('matriculas', { error: new Error('API unavailable') })
  assert.match(html, /Não foi possível carregar as inscrições/)
  assert.match(html, /Tentar novamente/)
  assert.doesNotMatch(html, /Nenhum aluno matriculado|Sem alunos em espera/)
})

test('only shows an empty class after a successful empty response', () => {
  const { html } = renderPage('matriculas', { data: [] })
  assert.match(html, /Nenhum aluno matriculado/)
  assert.match(html, /Sem alunos em espera/)
})

test('beneficiary queries refresh and do not disguise API failures as missing records', () => {
  const { html, calls } = renderPage('beneficiarios', {}, { error: new Error('API unavailable') })
  assert.match(html, /Não foi possível atualizar os cadastros/)
  assert.doesNotMatch(html, /Nenhum beneficiário encontrado/)
  assert.equal(calls.find((call) => Array.isArray(call.key) && call.key[0] === '/beneficiarios').options.refreshInterval, 15000)
})

test('public requests ignore staff tokens and expired session cookies', async () => {
  let sessionReads = 0
  const { publicApi, setAccessToken } = load('src/lib/api.ts', {
    'js-cookie': { get: () => { sessionReads++; return 'expired-session' } },
  })
  setAccessToken('staff-token')
  let request
  await publicApi.post('/enrollment/organizacao/apply', {}, {
    adapter: async (config) => {
      request = config
      return { data: { status: 'ATIVA' }, status: 201, statusText: 'Created', headers: {}, config }
    },
  })
  assert.equal(sessionReads, 0)
  assert.equal(request.headers.Authorization, undefined)
})

test('public registration links are accessible while management pages require a session', () => {
  const { NextRequest } = require('next/server')
  const { middleware } = load('src/middleware.ts')
  for (const route of ['/organizacao/inscricao', '/organizacao/inscricao/']) {
    assert.equal(middleware(new NextRequest(`https://app.example.org${route}`)).status, 200)
  }
  for (const route of ['/organizacao/matriculas', '/organizacao/beneficiarios', '/organizacao/inscricao/privado']) {
    const response = middleware(new NextRequest(`https://app.example.org${route}`))
    assert.equal(response.status, 307)
    assert.match(response.headers.get('location'), /\/login$/)
  }
})
