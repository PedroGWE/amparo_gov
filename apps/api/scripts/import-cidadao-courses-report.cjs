/* Report supplied by the organization, researched on 2026-10-22.
 * Dry run: node scripts/import-cidadao-courses-report.cjs
 * Apply:   node scripts/import-cidadao-courses-report.cjs --apply
 * Keeps student profiles, existing enrollment capacity and official source fields.
 */
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const line = fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).find(line => /^DATABASE_URL\s*=/.test(line))
if (!line) throw new Error('DATABASE_URL is required')
process.env.DATABASE_URL = line.slice(line.indexOf('=') + 1).trim().replace(/^(["'])(.*)\1$/, '$2')
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
const SOURCE = 'RELATORIO_CIDADAOS_20261022'
const site = 'https://cidadaosdofuturo.org/wp-content/uploads/'
const date = value => new Date(`${value}T00:00:00.000Z`)
const projects = [
  { id: 'cmuynhwg3000h5buoq9cmfqf2', instrument: '909685/2021', name: 'Cidadão do Futuro: jiu-jítsu e karatê', type: 'ESPORTIVO', amount: 100000, start: '2021-10-25', end: '2023-02-16', status: 'CONCLUIDO', official_status: 'Prestação de contas enviada para análise', proposal: '018656/2021', process: '71000.033234/2021-14', match: '909685', titleMatch: 'Desenvolvimento do Projeto Cidadão do Futuro nas modalidades', documents: [{ title: 'Termo de fomento 909685/2021', url: site + '2025/01/5-TERMO-DE-FOMENTO-909685-2021-MINISTERIO-DA-CIDADANIA.pdf' }] },
  { id: 'cmuynhwfy000d5buor5cihhms', instrument: '962820/2024', name: 'Cidadãos Campeões', type: 'ESPORTIVO', amount: 200000, start: '2024-12-27', end: '2026-06-11', status: 'CONCLUIDO', official_status: 'Aguardando prestação de contas', proposal: '017786/2024', process: '71000.011286/2024-82', match: '962820', titleMatch: 'Cidadãos Campeões', documents: [{ title: 'Termo de fomento 962820/2024', url: site + '2025/01/TERMO-DE-FOMENTO-PROJETO-No-9628202024-CIDADAOS-CAMPEOES-MINISTERIO-DO-ESPORTE-MESP.pdf' }, { title: 'Homologação 001/2025', url: site + '2025/06/TERMO-DE-HOMOLOGACAO-DO-EDITAL-001-2025-CIDADAOS-DO-FUTURO-02.06.pdf' }, { title: 'Homologação 002/2025', url: site + '2025/06/TERMO-DE-HOMOLOGACAO-DO-EDITAL-002-2025-10.06.pdf' }] },
  { id: 'cmuynhwfq00095buou9g96d1w', instrument: '976810/2025', name: 'Jovem Protagonista', type: 'ESPORTIVO', amount: 294000, start: '2025-10-31', end: '2026-11-04', status: 'EM_EXECUCAO', official_status: 'Em execução', proposal: '028272/2025', process: '71000.059483/2025-63', match: '976810', titleMatch: 'Jovem Protagonista', documents: [{ title: 'Homologação 003/2025', url: site + '2026/01/TERMO_DE_HOMOLOGACAO_-_TERMO_DE_FOMENTO_9768102C_assinado.pdf' }] },
  { id: 'cmuym1g0d0019xxzslnezicun', instrument: '994898/2026', name: 'Movimento Cidadão', type: 'CULTURAL', amount: 294000, start: '2026-06-10', end: '2027-06-15', status: 'EM_EXECUCAO', official_status: 'Em execução', proposal: '002134/2026', process: '71000.012557/2026-89', match: '994898', titleMatch: 'Movimento Cidadão', documents: [{ title: 'Homologação 001/2026', url: site + '2026/07/CIDADAO_DO_FUTURO-TERMO_DE_HOMOLGACAO_assinado.pdf' }, { title: 'Homologação 002/2026', url: site + '2026/10/CD-TERMO_DE_HOMOLGACAO_002.2026_assinado-1.pdf' }] },
]
const amendments = [
  { project: 0, number: '41100006', year: 2021, parlamentar_name: 'Júlio Cesar Ribeiro', value: 100000 },
  { project: 1, number: '44970011', year: 2024, parlamentar_name: 'Prof. Paulo Fernando', value: 200000 },
]
const notices = [
  { ref: 'D149', project: 1, number: '001/2025', amount: 200000, start: '2025-05-20', end: '2025-05-26', object: 'Materiais, uniformes, equipe, divulgação e assessoria.', url: '2025/05/EDITAL-001-2025-CIDADAOS-DO-FUTURO-19.05.pdf' },
  { ref: 'D161', project: 1, number: '002/2025', amount: 131351.42, start: '2025-06-02', end: '2025-06-09', object: 'Coordenação, instrutores de jiu-jítsu e karatê e banners.', url: '2025/06/EDITAL-002-2025-CIDADAOS-DO-FUTURO-02.06.pdf' },
  { ref: 'D179', project: 2, number: '003/2025 — versão inicial', amount: 272400, start: '2025-12-06', end: '2025-12-23', object: 'Equipe, materiais, divulgação, assessoria e lanches. Classificação impressa em 24/12/2026, em divergência com o prazo de propostas. Ver também a versão posterior D190; não somar as versões.', url: '2025/12/EDITAL-003-2025-CIDADAO-DO-FUTURO.pdf' },
  { ref: 'D184', project: 2, number: '004/2025', amount: 21600, start: '2025-12-06', end: '2025-12-29', object: 'Instrutores de jiu-jítsu, karatê e judô. Classificação impressa em 30/12/2026, em divergência com o prazo. Os itens reaparecem em D190. Homologação autônoma não identificada.', url: '2026/01/Whatsapp-Scan-3-de-janeiro-de-2026-at-21.17.27.pdf' },
  { ref: 'D190', project: 2, number: '003/2025 — versão posterior', amount: 294000, start: '2025-12-06', end: '2026-01-06', object: 'Equipe, materiais, assessoria, lanches e os três instrutores. Classificação prevista para 08/01/2026; homologação datada de 09/01/2026. Reúne os itens das versões D179 e D184; não somar os valores.', url: '2026/01/EDITAL-003.2025-TERMO-DE-FOMENTO-976810.pdf' },
  { ref: 'D212', project: 3, number: '001/2026', amount: 294000, start: '2026-07-06', end: '2026-07-13', object: 'Materiais, equipe, assessorias, som e lanches. Classificação em 14/07/2026. Parte dos itens reaparece no edital 002/2026; o orçamento total do projeto permanece R$ 294.000,00.', url: '2026/07/CIDADAO_DO_FUTURO_-_EDITAL_001.2026_TERMO_DE_FOMENTO_994898.2026_assinado.pdf' },
  { ref: 'D230', project: 3, number: '002/2026', amount: 143448, start: '2026-08-17', end: '2026-08-26', object: 'Instrutor de dança, monitor, som e lanches. Classificação em 27/08/2026. Itens integram o mesmo termo de fomento; não são financiamento adicional.', url: '2026/10/TERMO_DE_EDITAL_002.2026_assinado-1.pdf' },
]
const courses = [
  { nome: 'Karatê', tipo: 'MODALIDADE', legacy: 'cmv9mdh8p000g6rs9em4hwifg', projects: [0, 1, 2] },
  { nome: 'Jiu-jítsu', tipo: 'MODALIDADE', legacy: 'cmv9mettg000k6rs916l8udn9', projects: [0, 1, 2] },
  { nome: 'Judô', tipo: 'MODALIDADE', legacy: 'cmv9mf9fp000o6rs9878nrer7', projects: [2] },
  { nome: 'Dança', tipo: 'MODALIDADE', legacy: 'cmv9r3vx200146rs9a09l28je', projects: [3] },
  { nome: 'Pilates', tipo: 'MODALIDADE', legacy: 'cmv6sx88r000yf8yc1zegdw52', projects: [] },
  { nome: 'Inglês', tipo: 'CURSO', legacy: 'cmv9r5ao600186rs9fovglrcu', projects: [] },
  { nome: 'Informática', tipo: 'CURSO', legacy: 'cmv9r5p9e001c6rs9n8ccisb5', projects: [] },
]

async function counts(client, tenantId) {
  return { students: await client.beneficiary.count({ where: { tenant_id: tenantId } }), documents: await client.document.count({ where: { tenant_id: tenantId } }), enrollments: await client.matricula.count({ where: { tenant_id: tenantId } }), classes: await client.turma.findMany({ where: { tenant_id: tenantId }, select: { id: true, nome: true, capacidade: true } }) }
}
async function main() {
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: 'cidadaodofuturo' }, select: { id: true } })
  const ids = [...projects.map(p => p.id), ...courses.map(c => c.legacy)]
  const existing = await db.project.findMany({ where: { id: { in: ids }, tenant_id: tenant.id, deleted_at: null } })
  if (existing.length !== ids.length) throw new Error('Expected projects are missing or outside the organization')
  const plan = { tenant: 'cidadaodofuturo', projects: projects.map(p => ({ name: p.name, instrument: p.instrument, amount: p.amount })), total: projects.reduce((sum, p) => sum + p.amount, 0), confirmedAmendments: amendments.length, editalVersions: notices.length, courses: courses.map(c => c.nome) }
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ dryRun: true, ...plan }, null, 2)); return }
  const auditDir = `/var/backups/semevo/courses-report-${new Date().toISOString().replace(/[:.]/g, '-')}`
  fs.mkdirSync(auditDir, { recursive: true, mode: 0o700 })
  const databaseUrl = new URL(process.env.DATABASE_URL)
  databaseUrl.searchParams.delete('schema')
  execFileSync('pg_dump', ['--format=custom', '--no-owner', `--file=${auditDir}/before-import.dump`, databaseUrl.toString()], { stdio: ['ignore', 'pipe', 'pipe'] })
  fs.chmodSync(`${auditDir}/before-import.dump`, 0o600)
  const before = await counts(db, tenant.id)
  const officialBefore = await db.transferegovRecord.findMany({ where: { tenant_id: tenant.id }, select: { id: true, project_id: true } })
  fs.writeFileSync(`${auditDir}/before.json`, JSON.stringify({ projects: existing, officialLinks: officialBefore, counts: before }), { mode: 0o600 })
  const result = await db.$transaction(async tx => {
    for (const project of projects) {
      const current = existing.find(p => p.id === project.id)
      const instrument = { source: SOURCE, instrument: project.instrument, proposal: project.proposal, process: project.process, official_status: project.official_status, released_amount: project.amount, counterpart_amount: 0, reference_date: '2026-10-22', official_url: `https://portaldatransparencia.gov.br/convenios/${project.match}`, document_urls: project.documents }
      const note = project.status === 'CONCLUIDO' ? 'Vigência da execução encerrada; o status concluído não representa aprovação da prestação de contas.' : 'Execução vigente na data do relatório.'
      const parliamentary = project === projects[2] || project === projects[3] ? 'Origem em emenda federal mencionada nos editais; número e autor não confirmados no relatório.' : 'Emenda parlamentar identificada e vinculada ao projeto.'
      await tx.project.update({ where: { id: project.id }, data: {
        name: project.name, type: project.type, status: project.status, start_date: date(project.start), end_date: date(project.end), total_budget: project.amount, approved_budget: project.amount,
        description: `Termo de fomento ${project.instrument}. Proposta ${project.proposal}. Processo ${project.process}.\nSituação registrada no relatório de 22/10/2026: ${project.official_status}. ${note}\nValor pactuado e liberado: R$ ${project.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Contrapartida financeira: R$ 0,00.\n${parliamentary}\nFonte: Relatorio_Cidadaos_do_Futuro_CNPJ_33358348000104.pdf, fornecido pela organização. Editais são seleções de fornecedores da OSC e não devem ser somados ao financiamento.`,
        tags: [...new Set([...current.tags, 'Relatório 22/10/2026', `TF ${project.instrument}`])],
        funding_sources: [...(Array.isArray(current.funding_sources) ? current.funding_sources.filter(item => item?.source !== SOURCE) : []), instrument],
      } })
    }
    for (const item of amendments) {
      const where = { tenant_id: tenant.id, number: item.number, year: item.year }
      const existingAmendment = await tx.emendaParlamentar.findFirst({ where })
      const data = { ...where, project_id: projects[item.project].id, parlamentar_name: item.parlamentar_name, type: 'INDIVIDUAL', value: item.value, status: 'PAGA', object: `Termo de fomento ${projects[item.project].instrument}. Emenda identificada no relatório de 22/10/2026; recurso liberado ao instrumento.` }
      if (existingAmendment) await tx.emendaParlamentar.update({ where: { id: existingAmendment.id }, data })
      else await tx.emendaParlamentar.create({ data })
    }
    for (const item of notices) {
      const external_id = `${SOURCE}:${item.ref}`
      const existingNotice = await tx.edital.findFirst({ where: { tenant_id: tenant.id, fonte: 'MANUAL', external_id } })
      const project = projects[item.project]
      const data = { tenant_id: tenant.id, project_id: project.id, fonte: 'MANUAL', external_id, titulo: `Edital ${item.number} · ${project.name} · TF ${project.instrument}`, orgao: 'Organização Social Projeto Cidadãos do Futuro', descricao: `Seleção de fornecedores e prestadores da própria OSC, vinculada ao termo ${project.instrument}. ${item.object}\nFonte: relatório de 22/10/2026, documento ${item.ref}. Prazo de propostas encerrado.`, valor_total: item.amount, data_abertura: date(item.start), data_encerramento: date(item.end), abrangencia: 'MUNICIPAL', uf: 'DF', area_tematica: 'Seleção de fornecedores da OSC', link_oficial: site + item.url }
      if (existingNotice) await tx.edital.update({ where: { id: existingNotice.id }, data })
      else await tx.edital.create({ data })
    }
    const courseIds = {}
    for (const course of courses) {
      const existingCourse = await tx.curso.findFirst({ where: { tenant_id: tenant.id, OR: [{ legacy_project_id: course.legacy }, { nome: course.nome }] } })
      const data = { nome: course.nome, tipo: course.tipo, legacy_project_id: course.legacy, projetos: { connect: course.projects.map(i => ({ id: projects[i].id })) } }
      const saved = existingCourse ? await tx.curso.update({ where: { id: existingCourse.id }, data }) : await tx.curso.create({ data: { tenant_id: tenant.id, ...data } })
      courseIds[course.nome] = saved.id
      // Only map explicit course names. The generic morning/afternoon classes have no known modality.
      if (course.nome === 'Pilates') await tx.turma.updateMany({ where: { tenant_id: tenant.id, deleted_at: null, curso_id: null, nome: { contains: 'Pilates', mode: 'insensitive' } }, data: { curso_id: saved.id } })
    }
    const official = await tx.transferegovRecord.findMany({ where: { tenant_id: tenant.id } })
    let correctedOfficialLinks = 0
    for (const record of official) {
      const project = projects.find(p => record.instrument_number?.split('/')[0] === p.match) ?? projects.find(p => record.title?.toLocaleLowerCase('pt-BR').includes(p.titleMatch.toLocaleLowerCase('pt-BR')))
      if (project && record.project_id !== project.id) {
        await tx.transferegovRecord.update({ where: { id: record.id }, data: { project_id: project.id } })
        correctedOfficialLinks++
      }
    }
    const after = await counts(tx, tenant.id)
    const normalize = value => JSON.stringify({ ...value, classes: value.classes.sort((a, b) => a.id.localeCompare(b.id)) })
    if (normalize(before) !== normalize(after)) throw new Error('Student, document, enrollment or class capacity counts changed unexpectedly')
    return { ...plan, courseIds, correctedOfficialLinks, preserved: after }
  }, { timeout: 60000 })
  fs.writeFileSync(`${auditDir}/result.json`, JSON.stringify(result, null, 2), { mode: 0o600 })
  console.log(JSON.stringify({ applied: true, auditDir, ...result }, null, 2))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => db.$disconnect())
