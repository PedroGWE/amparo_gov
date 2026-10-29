/* Read-only validation against official public documentation and APIs.
 * Does not collect browser sessions, submit proposals, or access authenticated data.
 * Output contains schemas/status/counts/hashes only, without project/person payloads.
 */
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const root = path.resolve(__dirname, '../../..')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gtm-resource-validation-'))
const checks = [
  ['transferegov_portal','https://api-publica.transferegov.gestao.gov.br/'],
  ['discricionarias_spec','https://api-publica.transferegov.gestao.gov.br/discricionarias/openapi.json'],
  ['parcerias_spec','https://api-publica.transferegov.gestao.gov.br/parcerias/openapi.json'],
  ['discricionarias_programs','https://api-publica.transferegov.gestao.gov.br/discricionarias/todos-programas?pagina=1&tamanho_da_pagina=2&ano_programa=2026'],
  ['parcerias_programs','https://api-publica.transferegov.gestao.gov.br/parcerias/programa?pagina=1&tamanho_da_pagina=2&ano_programa=2026'],
  ['bndes_catalog','https://dadosabertos.bndes.gov.br/api/3/action/package_show?id=operacoes-financiamento'],
  ['bndes_operations','https://dadosabertos.bndes.gov.br/api/3/action/datastore_search?resource_id=6f56b78c-510f-44b6-8274-78a5b7e931f4&limit=2&offset=0&sort=numero_do_contrato%20asc'],
  ['salic_docs','https://api.salic.cultura.gov.br/docs'],
  ['salic_projects','https://api.salic.cultura.gov.br/api/v1/projetos?limit=2&offset=0'],
  ['salic_annual_aggregate','https://api.salic.cultura.gov.br/api/v1/projetos?limit=2&offset=0&ano_captacao=2026'],
  ['salic_funders','https://api.salic.cultura.gov.br/api/v1/incentivadores?limit=2&offset=0'],
  ['prosas_docs','https://developer.prosas.com.br/docs/restapi/prosas-api-rest/'],
  ['prosas_processes_docs','https://developer.prosas.com.br/docs/restapi/listar-processos-disponiveis/'],
]
const results=[]
for (const [name,url] of checks) {
  const file=path.join(directory,name+'.body')
  const response=spawnSync(process.platform==='win32'?'curl.exe':'curl',['-sS','--max-time','45','-H','Accept: application/json','-w','%{http_code}','-o',file,url],{encoding:'utf8',timeout:50000})
  const body=fs.existsSync(file)?fs.readFileSync(file):Buffer.alloc(0)
  const row={name,url,http_status:Number(response.stdout)||null,transport_ok:response.status===0,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')}
  try {
    const d=JSON.parse(body.toString('utf8'))
    row.root_fields=Object.keys(d)
    if(d.paths){row.security=d.security??null;row.paths=Object.keys(d.paths);const operation=d.paths[name==='parcerias_spec'?'/programa':'/todos-programas']?.get;row.program_parameters=operation?.parameters?.map(p=>({name:p.name,required:p.required,schema:p.schema}));row.program_fields=Object.keys(d.components.schemas[name==='parcerias_spec'?'ProgramaResponse':'TodosProgramasResponse']?.properties??{})}
    if(Array.isArray(d.data)){row.rows=d.data.length;row.total_pages=d.total_pages;row.total_items=d.total_items;row.record_fields=Object.keys(d.data[0]??{})}
    if(d.result?.resources){row.license=d.result.license_id;row.resources=d.result.resources.map(r=>({id:r.id,name:r.name,datastore_active:r.datastore_active,format:r.format}));row.metadata_modified=d.result.metadata_modified}
    if(d.result?.records){row.rows=d.result.records.length;row.total=d.result.total;row.record_fields=Object.keys(d.result.records[0]??{})}
    if(d.ano_captacao){row.shape='AGGREGATE_NOT_PROJECTS';row.projects_count=d.quantidade_projetos}
  }catch{}
  results.push(row);console.log(name,row.http_status,row.rows??row.shape??'documentação')
}
const output=path.join(root,'docs/resource-source-validation.json')
fs.writeFileSync(output,JSON.stringify({validated_at:new Date().toISOString(),method:'Official HTTPS GET via curl; no cookies or authentication',results},null,2)+'\n')
// Temporary responses intentionally not published; report preserves hashes and field names.
for(const file of fs.readdirSync(directory))fs.unlinkSync(path.join(directory,file))
fs.rmdirSync(directory)
console.log('Relatório:',output)
