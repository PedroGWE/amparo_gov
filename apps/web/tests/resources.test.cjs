const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function harness(states = {}, user = { id: 'user-A', tenantId: 'tenant-A', permissions: [] }) {
  const calls = []
  const mocks = {
    'next/router': { useRouter: () => ({ query: { tenant: 'tenant-a' } }) },
    swr: {
      __esModule: true,
      default: (key) => {
        calls.push(key)
        return { ...states[key?.[0]], mutate: async () => {} }
      },
    },
    '@/hooks/useAuth': { useAuth: () => ({ user }) },
    '@/components/layout/DashboardLayout': {
      __esModule: true,
      default: ({ children }) => children,
    },
    '@/components/ui/Modal': { Modal: () => null },
    '@/services/resources': { resourcesService: {} },
  }
  const file = path.resolve(__dirname, '../src/pages/[tenant]/recursos.tsx')
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(
    compiled + '\nexports.testComponents={RecordCard,RecordDetail,moneyLabel};',
    {
      module,
      exports: module.exports,
      console,
      process,
      require: (name) => (Object.hasOwn(mocks, name) ? mocks[name] : require(name)),
    },
    { filename: file },
  )
  return {
    calls,
    page: () => renderToStaticMarkup(React.createElement(module.exports.default)),
    components: module.exports.testComponents,
  }
}
const fixture = {
  id: 'test-only',
  title: 'Fixture fictícia de teste',
  kind: 'OPORTUNIDADE',
  calculated_status: 'INFORMACOES_INSUFICIENTES',
  eligible_profiles: [],
  source: { name: 'Fonte de teste' },
  amounts: [],
  dates: [],
  documents: [],
  requirements: [],
  last_success_at: null,
}
test('resource queries are scoped by both tenant and user, and wait for authentication', () => {
  const h = harness()
  h.page()
  for (const key of h.calls.filter(Boolean)) assert.equal(key[1], 'tenant-A:user-A')
  const unauthenticated = harness({}, null)
  unauthenticated.page()
  assert.ok(unauthenticated.calls.every((k) => k === null))
})
test('failed catalog requests show a failure rather than an empty successful result', () => {
  const h = harness({ 'resources-search': { error: new Error('unavailable') } })
  const html = h.page()
  assert.match(html, /Falha ao consultar os dados/)
  assert.doesNotMatch(html, /Nenhum registro encontrado para os filtros/)
})
test('cards preserve missing fields, provenance and absent application links', () => {
  const { components } = harness()
  const html = renderToStaticMarkup(
    React.createElement(components.RecordCard, {
      record: { ...fixture, source_url: 'https://www.gov.br/' },
      saved: false,
      onOpen() {},
      onSave() {},
      disabled: false,
    }),
  )
  assert.match(html, /Não informado/)
  assert.match(html, /Fonte de teste/)
  assert.match(html, /Informações insuficientes/)
  assert.match(html, /Consultar fonte oficial/)
  assert.doesNotMatch(html, /Inscrição oficial/)
  assert.match(html, /Adicionar favorito/)
})
test('financed records render as history and explicitly show stale data', () => {
  const { components } = harness()
  const html = renderToStaticMarkup(
    React.createElement(components.RecordCard, {
      record: {
        ...fixture,
        kind: 'PROJETO_FINANCIADO',
        calculated_status: 'HISTORICO',
        stale: true,
      },
      saved: true,
      onOpen() {},
      onSave() {},
      disabled: false,
    }),
  )
  assert.match(html, /Projeto já financiado/)
  assert.match(html, /Histórico de financiamento/)
  assert.match(html, /Dados desatualizados/)
  assert.doesNotMatch(html, /Inscrições abertas/)
})
test('details explain compatibility with evidence and actual profile values', () => {
  const { components } = harness()
  const html = renderToStaticMarkup(
    React.createElement(components.RecordDetail, {
      record: {
        ...fixture,
        compatibility: {
          status: 'INCOMPATIVEL',
          notice: 'Triagem sem promessa de aprovação.',
          checks: [
            {
              field: 'applicant_type',
              evidence: 'Somente OSC',
              used: 'EMPRESA',
              result: 'NAO_ATENDE',
            },
          ],
        },
      },
      canManage: false,
      onRemove() {},
    }),
  )
  assert.match(html, /Incompatível por requisito identificado/)
  assert.match(html, /Somente OSC/)
  assert.match(html, /Dado usado do perfil: EMPRESA/)
  assert.match(html, /Triagem sem promessa/)
  assert.doesNotMatch(html, /Remover registro manual/)
})
test('calendar deadlines render without an invented closing time and money preserves decimal precision', () => {
  const { components } = harness()
  const html = renderToStaticMarkup(
    React.createElement(components.RecordCard, {
      record: { ...fixture, ends_on: '2026-10-29' },
      saved: false,
      onOpen() {},
      onSave() {},
      disabled: false,
    }),
  )
  assert.match(html, /29\/10\/2026 \(data, sem horário informado\)/)
  assert.doesNotMatch(html, /23:59/)
  assert.equal(components.moneyLabel('123456789012345678.1234'), '123.456.789.012.345.678,1234')
  assert.equal(components.moneyLabel('0'), '0,00')
})
