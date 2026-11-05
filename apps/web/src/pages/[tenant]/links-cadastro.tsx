import { useState } from 'react'
import type { GetServerSideProps } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/router'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { beneficiariosService, type BeneficiarioProfileInvite } from '@/services/beneficiarios'

type LinkRow = BeneficiarioProfileInvite & { url: string }

export default function LinksCadastroPage() {
  const router = useRouter()
  const tenant = typeof router.query.tenant === 'string' ? router.query.tenant : ''
  const [rows, setRows] = useState<LinkRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function generateList() {
    setLoading(true)
    setRows(null)
    setError('')
    setMessage('')
    try {
      const invites = await beneficiariosService.createProfileInviteList()
      setRows(invites.map((invite) => ({
        ...invite,
        url: `${window.location.origin}/${encodeURIComponent(invite.slug)}/completar-perfil/${encodeURIComponent(invite.id)}/${encodeURIComponent(invite.token)}`,
      })))
    } catch {
      setError('Não foi possível gerar a lista. Tente novamente. Se a solicitação chegou ao servidor, links anteriores podem ter sido substituídos.')
    } finally {
      setLoading(false)
    }
  }

  async function copy(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value)
      setMessage(success)
      setError('')
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione o texto do link para copiar.')
    }
  }

  return <DashboardLayout>
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/${tenant}/beneficiarios`} className="text-sm text-brand-700 hover:underline">← Beneficiários</Link>
          <h1 className="mt-2 text-xl font-semibold text-gray-900">Links para completar o cadastro</h1>
          <p className="mt-1 text-sm text-gray-600">Gere uma lista com o nome, ID e link individual de cada beneficiário cadastrado.</p>
        </div>
        <button type="button" onClick={generateList} disabled={loading} className="btn-primary disabled:opacity-50">
          {loading ? 'Gerando lista...' : rows ? 'Gerar novos links' : 'Gerar lista de links'}
        </button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Os links são individuais, válidos por 30 dias e podem ser usados uma vez. Gerar esta lista substitui os links de cadastro anteriores. Compartilhe cada link somente com o respectivo beneficiário ou responsável e copie a lista antes de sair desta página.
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

      {rows && <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4">
          <div>
            <h2 className="font-semibold text-gray-900">{rows.length} beneficiário{rows.length === 1 ? '' : 's'}</h2>
            {!!rows.length && <p className="text-xs text-gray-500">Links válidos até {new Date(rows[0].expires_at).toLocaleDateString('pt-BR')}.</p>}
          </div>
          {!!rows.length && <button type="button" className="btn-ghost" onClick={() => copy(rows.map(({ name, id, url }) => `${name} | ID: ${id} | ${url}`).join('\n'), 'Lista copiada.')}>Copiar lista</button>}
        </div>
        {!rows.length ? <p className="p-5 text-sm text-gray-600">Nenhum beneficiário cadastrado.</p> : <div className="divide-y divide-gray-100">
          {rows.map((row) => <div key={row.id} className="grid gap-2 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] md:items-center">
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900">{row.name}</p>
              <p className="break-all text-xs text-gray-500">ID: {row.id}</p>
            </div>
            <input aria-label={`Link de cadastro de ${row.name}`} readOnly value={row.url} onFocus={(event) => event.currentTarget.select()} className="input w-full min-w-0 text-xs" />
            <button type="button" className="btn-ghost" onClick={() => copy(row.url, `Link de ${row.name} copiado.`)}>Copiar</button>
          </div>)}
        </div>}
      </section>}
    </div>
  </DashboardLayout>
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  if (!ctx.req.cookies['refresh_token']) {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}
