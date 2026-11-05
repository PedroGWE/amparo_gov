import { useEffect, useState, type FormEvent } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/router'
import Head from 'next/head'
import axios from 'axios'
import { publicApi } from '@/lib/api'

type Profile = {
  id: string; name: string; cpf: string | null; birth_date: string | null; gender: string | null
  telefone: string | null; email: string | null; rg_certidao: string | null
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null
  bairro: string | null; cidade: string | null; uf_endereco: string | null
  escola: string | null; serie_ano: string | null; necessidades_especiais: string | null
  alergias: string | null; medicamentos: string | null; observacoes_gerais: string | null
  renda_familiar: number | null; pessoas_residencia: number | null
  responsavel_nome: string | null; responsavel_parentesco: string | null
  responsavel_cpf: string | null; responsavel_telefone: string | null; responsavel_email: string | null
  termo_consentimento: boolean; autorizacao_uso_imagem: boolean
  project: { name: string } | null
}

type TextKey = { [K in keyof Profile]: Profile[K] extends string | null ? K : never }[keyof Profile]
type Field = { key: TextKey; label: string; type?: string; hint?: string; maxLength?: number }
const steps = ['Dados pessoais', 'Endereço', 'Família', 'Escola e saúde', 'Consentimento']
const personal: Field[] = [
  { key: 'cpf', label: 'CPF', hint: 'Somente números' },
  { key: 'rg_certidao', label: 'RG ou certidão' },
  { key: 'birth_date', label: 'Data de nascimento', type: 'date' },
  { key: 'telefone', label: 'Telefone', type: 'tel' },
  { key: 'email', label: 'E-mail', type: 'email' },
]
const address: Field[] = [
  { key: 'cep', label: 'CEP', maxLength: 8 }, { key: 'uf_endereco', label: 'UF', maxLength: 2 },
  { key: 'logradouro', label: 'Rua / avenida' }, { key: 'numero', label: 'Número' },
  { key: 'complemento', label: 'Complemento' }, { key: 'bairro', label: 'Bairro' },
  { key: 'cidade', label: 'Cidade' },
]
const school: Field[] = [
  { key: 'escola', label: 'Escola' }, { key: 'serie_ano', label: 'Série / ano' },
  { key: 'necessidades_especiais', label: 'Necessidades especiais' },
  { key: 'alergias', label: 'Alergias' }, { key: 'medicamentos', label: 'Medicamentos em uso' },
  { key: 'observacoes_gerais', label: 'Outras informações importantes' },
]
const guardian: Field[] = [
  { key: 'responsavel_nome', label: 'Nome do responsável' },
  { key: 'responsavel_cpf', label: 'CPF do responsável' },
  { key: 'responsavel_telefone', label: 'Telefone do responsável', type: 'tel' },
  { key: 'responsavel_email', label: 'E-mail do responsável', type: 'email' },
]

export default function CompleteProfilePage() {
  const router = useRouter()
  const slug = typeof router.query.tenant === 'string' ? router.query.tenant : ''
  const parts = Array.isArray(router.query.profile) ? router.query.profile : []
  const beneficiaryId = parts.length === 2 ? parts[0] : ''
  const token = parts.length === 2 ? parts[1] : parts.length === 1 ? parts[0] : ''
  const apiPath = `/beneficiary-profile/${encodeURIComponent(slug)}/${beneficiaryId ? `${encodeURIComponent(beneficiaryId)}/` : ''}${encodeURIComponent(token)}`
  const [profile, setProfile] = useState<Profile | null>(null)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!slug || !token) return
    let active = true
    publicApi.get<Profile>(apiPath)
      .then(({ data }) => { if (active) setProfile({ ...data, birth_date: data.birth_date?.slice(0, 10) ?? null }) })
      .catch(() => { if (active) setError('Este link é inválido, expirou ou já foi utilizado. Peça um novo link à instituição.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [slug, token, beneficiaryId, apiPath])

  function setField(key: keyof Profile, value: string | number | boolean | null) {
    setProfile(current => current ? { ...current, [key]: value } : current)
  }

  function renderFields(fields: Field[]) {
    return fields.map(({ key, label, type, hint, maxLength }) => (
      <label key={key} className="block text-sm font-medium text-gray-800">
        {label}
        <input className="input mt-1 w-full" type={type ?? 'text'} value={profile?.[key] ?? ''}
          maxLength={maxLength} max={type === 'date' ? new Date().toISOString().slice(0, 10) : undefined}
          placeholder={hint} onChange={event => setField(key, event.target.value)} />
      </label>
    ))
  }

  function next() {
    if (!profile) return
    if (step === 0 && profile.name.trim().length < 2) { setError('Informe o nome completo do beneficiário.'); return }
    const guardianStarted = !!(profile.responsavel_nome || profile.responsavel_parentesco || profile.responsavel_cpf || profile.responsavel_telefone || profile.responsavel_email)
    if (step === 2 && guardianStarted && (!profile.responsavel_nome?.trim() || !profile.responsavel_parentesco)) {
      setError('Informe o nome e o parentesco do responsável.'); return
    }
    setError('')
    setStep(current => Math.min(current + 1, steps.length - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile || step !== steps.length - 1) return
    setSaving(true)
    setError('')
    const { id, project, ...values } = profile
    const payload = Object.fromEntries(Object.entries(values).map(([key, value]) =>
      [key, typeof value === 'string' && value.trim() === '' ? null : value]))
    try {
      await publicApi.post(apiPath, payload)
      setDone(true)
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined
      setError(Array.isArray(message) ? message.join('. ') : typeof message === 'string' ? message : 'Não foi possível salvar o perfil. Confira os dados e tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <Head>
      <title>Cadastro do beneficiário | Amparo GOV</title>
      <meta name="robots" content="noindex, nofollow" />
      <meta property="og:title" content="Complete seu cadastro | Amparo GOV" />
      <meta property="og:image" content={`${process.env.NEXT_PUBLIC_SITE_URL || 'https://app.amparogov.org'}/amparo/logo-principal.png`} />
    </Head>
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900 sm:py-12">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl bg-white shadow-sm">
        <header className="border-b border-gray-100 px-6 py-5 sm:px-8">
          <Image src="/amparo/logo-principal.png" alt="Amparo GOV" width={2180} height={721} priority className="h-auto w-44" />
          <h1 className="mt-5 text-2xl font-bold">Complete seu cadastro</h1>
          <p className="mt-1 text-sm text-gray-600">Confira as informações e preencha o que falta. Seus dados serão salvos no seu cadastro.</p>
          {profile && <div className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
            <strong>{profile.name}</strong><span className="block break-all text-xs">ID do beneficiário: {profile.id}</span>
            {profile.project && <span className="block text-xs">Projeto: {profile.project.name}</span>}
          </div>}
        </header>
        <div className="px-6 py-6 sm:px-8">
          {loading && <p role="status">Carregando cadastro...</p>}
          {done && <p className="rounded-lg bg-emerald-50 p-4 text-emerald-800" role="status">Cadastro atualizado com sucesso. Obrigado por enviar seus dados.</p>}
          {profile && !done && <>
            <div className="mb-6" aria-label="Etapa do cadastro">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Etapa {step + 1} de {steps.length}</p>
              <div className="mt-2 h-2 rounded-full bg-gray-100" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={steps.length} aria-label="Progresso do cadastro"><div className="h-full rounded-full bg-brand-600" style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
              <h2 className="mt-4 text-lg font-semibold">{steps[step]}</h2>
            </div>
            {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
            <form onSubmit={submit} className="space-y-5">
              {step === 0 && <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-gray-800 sm:col-span-2">Nome completo *<input className="input mt-1 w-full" value={profile.name} onChange={event => setField('name', event.target.value)} maxLength={200} autoComplete="name" /></label>
                {renderFields(personal)}
                <label className="block text-sm font-medium text-gray-800 sm:col-span-2">Gênero<select className="input mt-1 w-full" value={profile.gender ?? ''} onChange={event => setField('gender', event.target.value || null)}>
                  <option value="">Selecione</option><option value="FEMININO">Feminino</option><option value="MASCULINO">Masculino</option><option value="NAO_BINARIO">Não binário</option><option value="OUTRO">Outro</option><option value="PREFIRO_NAO_INFORMAR">Prefiro não informar</option>
                </select></label>
              </div>}
              {step === 1 && <div className="grid gap-4 sm:grid-cols-2">{renderFields(address)}</div>}
              {step === 2 && <div className="space-y-5">
                <p className="text-sm text-gray-600">Informe os dados do responsável, quando houver.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium">Pessoas na residência<input className="input mt-1 w-full" type="number" min={1} step={1} value={profile.pessoas_residencia ?? ''} onChange={event => setField('pessoas_residencia', event.target.value ? Number(event.target.value) : null)} /></label>
                  <label className="block text-sm font-medium">Renda familiar mensal (R$)<input className="input mt-1 w-full" type="number" min={0} step="0.01" value={profile.renda_familiar ?? ''} onChange={event => setField('renda_familiar', event.target.value ? Number(event.target.value) : null)} /></label>
                  {renderFields(guardian)}
                  <label className="block text-sm font-medium">Parentesco<select className="input mt-1 w-full" value={profile.responsavel_parentesco ?? ''} onChange={event => setField('responsavel_parentesco', event.target.value || null)}><option value="">Selecione</option><option value="MAE">Mãe</option><option value="PAI">Pai</option><option value="AVO">Avô ou avó</option><option value="TIO">Tio ou tia</option><option value="TUTOR_LEGAL">Tutor legal</option><option value="OUTRO">Outro</option></select></label>
                </div>
              </div>}
              {step === 3 && <div className="grid gap-4 sm:grid-cols-2">{renderFields(school)}</div>}
              {step === 4 && <div className="space-y-4 text-sm">
                <p className="rounded-lg bg-blue-50 p-3 text-blue-900">A instituição usará os dados para acompanhar o beneficiário. Revise as informações antes de enviar.</p>
                <label className="flex gap-3"><input type="checkbox" required checked={profile.termo_consentimento} onChange={event => setField('termo_consentimento', event.target.checked)} /><span>Confirmo os dados e autorizo seu uso pela instituição para acompanhar o beneficiário. *</span></label>
                <label className="flex gap-3"><input type="checkbox" checked={profile.autorizacao_uso_imagem} onChange={event => setField('autorizacao_uso_imagem', event.target.checked)} /><span>Autorizo o uso da imagem do beneficiário pela instituição.</span></label>
              </div>}
              <div className="flex justify-between gap-3 border-t border-gray-100 pt-5">
                <button type="button" onClick={() => { setError(''); setStep(current => Math.max(0, current - 1)) }} disabled={step === 0 || saving} className="btn-ghost disabled:opacity-40">Voltar</button>
                {step < steps.length - 1
                  ? <button type="button" onClick={next} className="btn-primary">Continuar</button>
                  : <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">{saving ? 'Salvando...' : 'Enviar cadastro'}</button>}
              </div>
            </form>
          </>}
          {!profile && !loading && error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
        </div>
      </div>
    </main>
  </>
}
