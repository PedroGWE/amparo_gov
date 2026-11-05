import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import axios from 'axios'
import { publicApi } from '@/lib/api'

type Profile = {
  name: string; cpf: string | null; birth_date: string | null; gender: string | null
  telefone: string | null; email: string | null; rg_certidao: string | null
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null
  bairro: string | null; cidade: string | null; uf_endereco: string | null
  escola: string | null; serie_ano: string | null; necessidades_especiais: string | null
  alergias: string | null; medicamentos: string | null; observacoes_gerais: string | null
  termo_consentimento: boolean; autorizacao_uso_imagem: boolean
  project: { name: string } | null
}

const fields: { key: keyof Profile; label: string; type?: string }[] = [
  { key: 'cpf', label: 'CPF', type: 'text' }, { key: 'birth_date', label: 'Data de nascimento', type: 'date' },
  { key: 'telefone', label: 'Telefone', type: 'tel' }, { key: 'email', label: 'E-mail', type: 'email' },
  { key: 'rg_certidao', label: 'RG ou certidão' },
  { key: 'cep', label: 'CEP' }, { key: 'logradouro', label: 'Rua / endereço' },
  { key: 'numero', label: 'Número' }, { key: 'complemento', label: 'Complemento' },
  { key: 'bairro', label: 'Bairro' }, { key: 'cidade', label: 'Cidade' },
  { key: 'uf_endereco', label: 'UF' }, { key: 'escola', label: 'Escola' },
  { key: 'serie_ano', label: 'Série / ano' },
  { key: 'necessidades_especiais', label: 'Necessidades especiais' },
  { key: 'alergias', label: 'Alergias' }, { key: 'medicamentos', label: 'Medicamentos' },
  { key: 'observacoes_gerais', label: 'Outras informações importantes' },
]

export default function CompleteProfilePage() {
  const router = useRouter()
  const slug = typeof router.query.tenant === 'string' ? router.query.tenant : ''
  const token = typeof router.query.token === 'string' ? router.query.token : ''
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!slug || !token) return
    let active = true
    publicApi.get<Profile>(`/beneficiary-profile/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`)
      .then(({ data }) => { if (active) setProfile({ ...data, birth_date: data.birth_date?.slice(0, 10) ?? null }) })
      .catch(() => { if (active) setError('Este link é inválido, expirou ou já foi utilizado. Peça um novo link à instituição.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [slug, token])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    setSaving(true)
    setError('')
    const { project, ...values } = profile
    try {
      await publicApi.post(`/beneficiary-profile/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`, values)
      setDone(true)
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined
      setError(Array.isArray(message) ? message.join('. ') : typeof message === 'string' ? message : 'Não foi possível salvar o perfil. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  function setField(key: keyof Profile, value: string | boolean | null) {
    setProfile(current => current ? { ...current, [key]: value } : current)
  }

  return <>
    <Head><title>Completar perfil | Amparo GOV</title><meta name="robots" content="noindex, nofollow" /></Head>
    <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-brand-700">Amparo GOV</p>
        <h1 className="mt-2 text-2xl font-bold">Complete seu perfil</h1>
        {loading && <p className="mt-6" role="status">Carregando cadastro...</p>}
        {done && <p className="mt-6 rounded-lg bg-emerald-50 p-4 text-emerald-800" role="status">Perfil atualizado com sucesso. Obrigado por enviar seus dados.</p>}
        {error && <p className="mt-6 rounded-lg bg-red-50 p-4 text-red-700" role="alert">{error}</p>}
        {profile && !done && <form className="mt-6 space-y-6" onSubmit={submit}>
          <p className="text-sm text-gray-600">Confira e complete seus dados. {profile.project && <>Projeto: <strong>{profile.project.name}</strong>.</>}</p>
          <label className="block text-sm font-medium">Nome completo *<input className="input mt-1 w-full" required minLength={2} maxLength={200} value={profile.name} onChange={e => setField('name', e.target.value)} /></label>
          <label className="block text-sm font-medium">Gênero<select className="input mt-1 w-full" value={profile.gender ?? ''} onChange={e => setField('gender', e.target.value || null)}><option value="">Não informado</option><option value="MASCULINO">Masculino</option><option value="FEMININO">Feminino</option><option value="NAO_BINARIO">Não binário</option><option value="OUTRO">Outro</option><option value="PREFIRO_NAO_INFORMAR">Prefiro não informar</option></select></label>
          <div className="grid gap-4 sm:grid-cols-2">{fields.map(({ key, label, type }) => <label key={key} className="block text-sm font-medium">{label}<input className="input mt-1 w-full" type={type ?? 'text'} value={String(profile[key] ?? '')} onChange={e => setField(key, e.target.value)} maxLength={key === 'cep' ? 8 : key === 'uf_endereco' ? 2 : undefined} /></label>)}</div>
          <div className="space-y-3 border-t border-gray-200 pt-5">
            <label className="flex gap-3 text-sm"><input type="checkbox" required checked={profile.termo_consentimento} onChange={e => setField('termo_consentimento', e.target.checked)} /><span>Confirmo que os dados estão corretos e autorizo seu uso pela instituição para o acompanhamento do beneficiário. *</span></label>
            <label className="flex gap-3 text-sm"><input type="checkbox" checked={profile.autorizacao_uso_imagem} onChange={e => setField('autorizacao_uso_imagem', e.target.checked)} /><span>Autorizo o uso da imagem do beneficiário pela instituição.</span></label>
          </div>
          <button type="submit" disabled={saving} className="btn-primary w-full justify-center disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar perfil'}</button>
        </form>}
      </div>
    </main>
  </>
}
