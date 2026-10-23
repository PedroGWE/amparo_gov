const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function render(relative, query, states, props = {}) {
  const calls = []
  const filename = path.resolve(__dirname, '..', relative)
  const useSWR = (key, fetcher, options) => { calls.push({ key, fetcher, options }); return { ...states[key], mutate: async () => {} } }
  const mocks = {
    swr: { __esModule: true, default: useSWR },
    'next/router': { useRouter: () => ({ query: { tenant: 'osc', ...query } }) },
    'next/link': { __esModule: true, default: ({ children, shallow, scroll, ...props }) => React.createElement('a', props, children) },
    'next/image': { __esModule: true, default: ({ priority, fill, ...props }) => React.createElement('img', props) },
    'next/head': { __esModule: true, default: () => null },
    '@/components/layout/DashboardLayout': { __esModule: true, default: ({ children }) => children },
    '@/components/ui/Modal': { Modal: () => null },
    '@/lib/api': { __esModule: true, default: {}, publicApi: {} },
  }
  function load(filename) {
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    const module = { exports: {} }
    vm.runInNewContext(compiled, { module, exports: module.exports, process, console, require: name => {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? path.resolve(__dirname, '..', 'src', name.slice(2)) : path.resolve(path.dirname(filename), name)
        const target = ['.tsx', '.ts', '.js'].map(ext => base + ext).find(file => fs.existsSync(file))
        return load(target)
      }
      return require(name)
    } }, { filename })
    return module.exports
  }
  return { html: renderToStaticMarkup(React.createElement(load(filename).default, props)), calls, exports: load(filename) }
}

const course = { id: 'judo', nome: 'Judô', tipo: 'MODALIDADE', ativo: true, inscricoes_abertas: true, descricao: '', projetos: [], emendas: [], editais: [], turmas: [{ id: 'a', nome: 'Turma A', capacidade: 20, inscritos: 20, espera: 3, vagas: 0 }] }

test('shows the course class capacity and links inside its management page', () => {
  const { html } = render('src/pages/[tenant]/cursos/[courseId].tsx', { aba: 'turmas' }, { '/enrollment-admin/courses/judo': { data: course } }, { courseId: 'judo' })
  assert.match(html, /20\/20 matriculados/)
  assert.match(html, /3 na reserva/)
  assert.match(html, /Copiar link desta turma/)
  assert.match(html, /\/osc\/cursos\/judo\?aba=matriculas&amp;turma=a/)
})

test('deduplicates inherited and directly linked resources', () => {
  const amendment = { id: 'e1', number: '123', year: 2025, parlamentar_name: 'Parlamentar', value: '200000' }
  const notice = { id: 'n1', titulo: 'Edital vinculado', valor_total: '10000', link_oficial: 'https://example.org/document.pdf' }
  const { html } = render('src/pages/[tenant]/cursos/[courseId].tsx', { aba: 'recursos' }, { '/enrollment-admin/courses/judo': { data: { ...course, emendas: [amendment], editais: [notice], projetos: [{ id: 'p1', name: 'Projeto', total_budget: '200000', emendas: [amendment], editais: [notice] }] } } }, { courseId: 'judo' })
  assert.match(html, /Emendas vinculadas \(1\)/)
  assert.match(html, /Licitações e editais vinculados \(1\)/)
  assert.equal(html.split('Edital vinculado').length - 1, 1)
  assert.match(html, /não são somados/)
})

test('opens the course overview using its own address', () => {
  const { html } = render('src/pages/[tenant]/cursos/[courseId].tsx', {}, { '/enrollment-admin/courses/dance': { data: { ...course, id: 'dance', nome: 'Dança', turmas: [] } } }, { courseId: 'dance' })
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

test('each invitation uses the activity image and a saved visual can override automatic selection', () => {
  for (const [name, image, preset] of [['Jiu-jítsu','jiu-jitsu',null],['Karatê','karate',null],['Judô','judo',null],['Oficina especial','pilates','PILATES']]) {
    const { html } = render('src/pages/[tenant]/inscricao.tsx', { curso: 'activity' }, { '/enrollment/osc/classes?curso=activity': { data: { organization: 'OSC', course: { id: 'activity', nome: name, tema_visual: preset }, classes: [] } } })
    assert.ok(html.includes(`src="/courses/${image}.png"`))
    assert.ok(html.includes(`Matrícula · ${name}`))
  }
})

test('a teacher invitation clearly identifies registration on behalf of a student', () => {
  const { html } = render('src/pages/[tenant]/inscricao.tsx', { curso: 'judo', perfil: 'professor' }, { '/enrollment/osc/classes?curso=judo': { data: { organization: 'OSC', course: { id: 'judo', nome: 'Judô' }, classes: [{ id: 'class-a', nome: 'A', vagas: 2 }] } } })
  assert.match(html, /Professor: preencha a inscrição do aluno nesta atividade/)
  assert.match(html, /aria-pressed="true"[^>]*>.*?Professor/s)
})

test('a direct invitation to an unrelated class does not collect student details', () => {
  const { html } = render('src/pages/[tenant]/inscricao.tsx', { curso: 'judo', turma: 'karate-class' }, { '/enrollment/osc/classes?curso=judo': { data: { organization: 'OSC', course: { id: 'judo', nome: 'Judô' }, classes: [{ id: 'judo-class', nome: 'Judô A', vagas: 2 }] } } })
  assert.match(html, /Esta turma não está disponível neste link/)
  assert.doesNotMatch(html, /Como podemos chamar você/)
})

test('the invitations workspace provides directed links for the course and its own classes', () => {
  const { html } = render('src/pages/[tenant]/cursos/[courseId].tsx', { aba: 'convites' }, { '/enrollment-admin/courses/judo': { data: course } }, { courseId: 'judo' })
  for (const role of ['aluno','responsavel','professor']) assert.ok(html.includes(`/osc/inscricao?curso=judo&amp;perfil=${role}`))
  assert.match(html, /\/osc\/inscricao\?curso=judo&amp;turma=a/)
  assert.match(html, /Imagem e cores do convite/)
  assert.match(html, /src="\/courses\/judo.png"/)
})

test('shows existing activity students even when no class has been assigned', () => {
  const { html } = render('src/pages/[tenant]/cursos/[courseId].tsx', { aba: 'alunos' }, {
    '/enrollment-admin/courses/judo': { data: { ...course, total_alunos: 2, turmas: [] } },
    '/enrollment-admin/courses/judo/students': { data: [
      { id: 'b1', name: 'Aluno já cadastrado', status: 'ATIVO', matriculas: [] },
      { id: 'b2', name: 'Aluna de duas modalidades', status: 'ATIVO', matriculas: [] },
    ] },
  }, { courseId: 'judo' })
  assert.match(html, /Alunos vinculados \(2\)/)
  assert.match(html, /Aluno já cadastrado/)
  assert.match(html, /Aluna de duas modalidades/)
  assert.match(html, /Sem turma definida nesta atividade/)
  assert.match(html, /\/osc\/beneficiarios\?aluno=b1/)
  assert.match(html, /\/osc\/beneficiarios\?curso=judo/)
})

test('a failed course roster is shown as an error instead of an empty activity', () => {
  const { html } = render('src/pages/[tenant]/cursos/[courseId].tsx', { aba: 'alunos' }, {
    '/enrollment-admin/courses/judo': { data: course },
    '/enrollment-admin/courses/judo/students': { error: new Error('unavailable') },
  }, { courseId: 'judo' })
  assert.match(html, /Não foi possível carregar os alunos/)
  assert.doesNotMatch(html, /Nenhum aluno vinculado a esta atividade/)
})

test('course cards open a separate management page without an automatic selection', () => {
  const { html } = render('src/pages/[tenant]/cursos.tsx', {}, { '/enrollment-admin/courses': { data: [course] } })
  assert.match(html, /href="\/osc\/cursos\/judo"/)
  assert.match(html, /Abrir gestão/)
  assert.doesNotMatch(html, /Seções da atividade|Alunos vinculados \(/)
})

test('workspace tabs link to its own address and preserve the selected section', () => {
  const { html } = render('src/pages/[tenant]/cursos/[courseId].tsx', { aba: 'alunos' }, { '/enrollment-admin/courses/judo': { data: course } }, { courseId: 'judo' })
  for (const section of ['resumo', 'alunos', 'turmas', 'matriculas', 'recursos', 'dados']) assert.match(html, new RegExp(`href="/osc/cursos/judo\\?aba=${section}"`))
  assert.match(html, /href="\/osc\/cursos\/judo\?aba=alunos" aria-current="page"/)
  assert.doesNotMatch(html, /Projetos vinculados \(/)
})

test('workspace enrollment management only shows classes and students from its course', () => {
  const { html, calls } = render('src/pages/[tenant]/cursos/[courseId].tsx', { aba: 'matriculas' }, {
    '/enrollment-admin/courses/judo': { data: course },
    '/enrollment-admin/classes': { data: [
      { id: 'foreign-class', curso_id: 'other', nome: 'Outra modalidade', capacidade: 10, inscritos: 1, espera: 0 },
      { id: 'class-judo', curso_id: 'judo', nome: 'Judô manhã', capacidade: 20, inscritos: 1, espera: 0, vagas: 19 },
    ] },
    '/enrollment-admin/classes/class-judo/enrollments': { data: [{ id: 'e1', status: 'ATIVA', aluno: { id: 'a1', name: 'Aluno do Judô', responsaveis: [] } }] },
  }, { courseId: 'judo' })
  assert.match(html, /Aluno do Judô/)
  assert.match(html, /Matricular aluno existente/)
  assert.match(html, /\/osc\/inscricao\?curso=judo/)
  assert.doesNotMatch(html, /Outra modalidade/)
  assert.ok(calls.some(call => call.key === '/enrollment-admin/classes/class-judo/enrollments'))
  assert.ok(!calls.some(call => call.key === '/enrollment-admin/classes/foreign-class/enrollments'))
})

test('missing workspace data reports an error and never falls back to another course', () => {
  const { html } = render('src/pages/[tenant]/cursos/[courseId].tsx', {}, { '/enrollment-admin/courses/missing': { error: { isAxiosError: true, response: { status: 404 } } } }, { courseId: 'missing' })
  assert.match(html, /Curso ou modalidade não encontrado/)
  assert.doesNotMatch(html, /Seções da atividade/)
})

test('old course links redirect to the management page while both routes require login', async () => {
  const { exports } = render('src/pages/[tenant]/cursos.tsx', {}, {})
  const context = { req: { cookies: { refresh_token: 'session' } }, params: { tenant: 'osc' }, query: { curso: 'judo', aba: 'alunos' } }
  const result = await exports.getServerSideProps(context)
  assert.equal(result.redirect.destination, '/osc/cursos/judo?aba=alunos')
  const denied = await exports.getServerSideProps({ ...context, req: { cookies: {} } })
  assert.equal(denied.redirect.destination, '/login')
  const detail = render('src/pages/[tenant]/cursos/[courseId].tsx', {}, {}, { courseId: 'judo' }).exports
  assert.equal((await detail.getServerSideProps({ ...context, req: { cookies: {} } })).redirect.destination, '/login')
  assert.equal((await detail.getServerSideProps({ ...context, params: { tenant: 'osc', courseId: 'judo' } })).props.courseId, 'judo')
})
