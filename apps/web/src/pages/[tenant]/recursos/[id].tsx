import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { useAuth } from '@/hooks/useAuth'
import { resourcesService as service } from '@/services/resources'
import { RecordDetail } from '../recursos'

export default function ResourceDetailsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const id = typeof router.query.id === 'string' ? router.query.id : null
  const tenant = typeof router.query.tenant === 'string' ? router.query.tenant : ''
  const key = user && id ? ['resources-detail', `${user.tenantId}:${user.id}`, id] : null
  const detail = useSWR(key, () => service.detail(id!))
  const [message, setMessage] = useState('')
  const canManage = !!user?.permissions?.some((p) => p === '*' || p === 'editais:manage')
  async function remove() {
    try {
      await service.remove(id!)
      await router.push(`/${tenant}/recursos`)
    } catch {
      setMessage('Não foi possível remover este registro manual.')
    }
  }
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-5">
        <Link href={tenant ? `/${tenant}/recursos` : '#'} className="text-sm text-brand-700 underline">
          Voltar a oportunidades e recursos
        </Link>
        <h1 className="text-2xl font-bold">Detalhes do recurso</h1>
        {message && <p role="alert">{message}</p>}
        {detail.isLoading && <p role="status">Carregando…</p>}
        {detail.error && (
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
            Registro não encontrado ou indisponível para sua organização.
          </p>
        )}
        {detail.data && (
          <div className="card p-5 sm:p-8">
            <RecordDetail record={detail.data} canManage={canManage} onRemove={remove} />
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
