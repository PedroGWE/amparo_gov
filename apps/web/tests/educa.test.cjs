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
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(compiled, { module, exports: module.exports, console, process, URL, require: name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('.')) {
      const target = path.resolve(path.dirname(filename), name)
      return load(path.relative(path.resolve(__dirname, '..'), target + (fs.existsSync(target + '.tsx') ? '.tsx' : '.ts')), mocks)
    }
    return require(name)
  } }, { filename })
  return module.exports
}

test('legacy education links preserve their section and class and require a session', async () => {
  const { educationRedirect } = load('src/components/educa/educa-route.ts')
  const redirect = educationRedirect('professor', 'chamada')
  const context = { req: { cookies: { refresh_token: 'session' } }, params: { tenant: 'instituto' }, query: { turma: 'class/a' } }
  assert.equal((await redirect(context)).redirect.destination, '/instituto/professor?aba=chamada&turma=class%2Fa')
  context.req.cookies = {}
  assert.equal((await redirect(context)).redirect.destination, '/educa')
})

test('Educa serves its own favicon and sends expired sessions to the education login', () => {
  const response = kind => url => ({ kind, url: url?.toString() })
  const { middleware } = load('middleware.ts', { 'next/server': { NextResponse: { rewrite: response('rewrite'), redirect: response('redirect'), next: response('next') } } })
  function request(host, pathname) {
    const url = new URL(`https://${host}${pathname}`)
    url.clone = () => new URL(url)
    return { nextUrl: url, headers: { get: () => host }, cookies: { get: () => undefined } }
  }
  for (const name of ['favicon.ico', 'apple-touch-icon.png', 'site.webmanifest']) {
    const result = middleware(request('educa.amparogov.org', '/' + name))
    assert.equal(result.kind, 'rewrite')
    assert.equal(result.url, `https://educa.amparogov.org/brand/educa/${name}`)
  }
  assert.equal(middleware(request('app.amparogov.org', '/favicon.ico')).kind, 'next')
  assert.equal(middleware(request('educa.amparogov.org', '/instituto/professor')).url, 'https://educa.amparogov.org/educa')
  assert.equal(middleware(request('app.amparogov.org', '/instituto/dashboard')).url, 'https://app.amparogov.org/login')
})

test('student and teacher navigation expose the appropriate workflows', () => {
  const { EducaLayout } = load('src/components/educa/EducaLayout.tsx', {
    'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
    'next/image': { __esModule: true, default: ({ unoptimized, ...props }) => React.createElement('img', props) },
    '@/components/ui/Modal': { Modal: () => null },
  })
  const props = { manager: false, section: 'inicio', navigate: () => {}, userName: 'Pessoa', institute: 'Instituto', tenant: 'org', search: '', setSearch: () => {}, logout: async () => {} }
  const student = renderToStaticMarkup(React.createElement(EducaLayout, { ...props, teacher: false }))
  assert.match(student, /Minhas atividades|Minha frequência/)
  assert.doesNotMatch(student, />Chamada<|>Planejamento<|>Acessos</)
  const teacher = renderToStaticMarkup(React.createElement(EducaLayout, { ...props, teacher: true }))
  assert.match(teacher, />Planejamento</)
  assert.match(teacher, />Chamada</)
  assert.doesNotMatch(teacher, />Minha frequência<|>Acessos</)
})

test('an evaluated activity keeps its result visible even after the deadline', () => {
  const { studentActivityStatus, safeMeetUrl } = load('src/components/educa/educa-utils.ts')
  assert.equal(studentActivityStatus([{ status: 'AVALIADA' }], '2020-01-01').label, 'Avaliada')
  assert.equal(studentActivityStatus([{ status: 'ENTREGUE' }], '2020-01-01').label, 'Entregue')
  assert.equal(studentActivityStatus([], '2020-01-01').label, 'Prazo encerrado')
  assert.equal(safeMeetUrl('https://meet.google.com.evil.test/abc-defg-hij'), undefined)
  assert.equal(safeMeetUrl('javascript:alert(1)'), undefined)
  assert.equal(safeMeetUrl('https://meet.google.com/abc-defg-hij'), 'https://meet.google.com/abc-defg-hij')
})
