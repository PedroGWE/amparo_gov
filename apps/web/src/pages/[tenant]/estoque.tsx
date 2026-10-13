import type { GetServerSideProps } from 'next'
import { FormEvent, useState } from 'react'
import useSWR from 'swr'
import axios from 'axios'
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Package, Pencil, Plus, Search } from 'lucide-react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Modal } from '@/components/ui/Modal'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

type Item = {
  id: string
  sku: string | null
  name: string
  category: string | null
  unit: string
  location: string | null
  quantity: string
  minimum_quantity: string
  is_active: boolean
}

type Movement = {
  id: string
  type: 'ENTRADA' | 'SAIDA'
  quantity: string
  balance_after: string
  note: string | null
  created_at: string
  item: { id: string; name: string; unit: string }
  actor: { name: string }
}

type ItemForm = { name: string; sku: string; category: string; unit: string; location: string; minimum_quantity: string }
const emptyForm: ItemForm = { name: '', sku: '', category: '', unit: 'UN', location: '', minimum_quantity: '0' }
const amount = (value: string | number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(Number(value))

function errorMessage(error: unknown) {
  const message = axios.isAxiosError(error) ? error.response?.data?.message : undefined
  return Array.isArray(message) ? message.join('. ') : typeof message === 'string' ? message : 'Não foi possível concluir a operação. Tente novamente.'
}

export default function EstoquePage() {
  const permissions = useAuthStore((state) => state.user?.permissions)
  const canWrite = permissions?.some((permission) => permission === '*' || permission === 'inventory:write') ?? false
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showInactive, setShowInactive] = useState(false)
  const [itemModal, setItemModal] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [itemForm, setItemForm] = useState<ItemForm>(emptyForm)
  const [movementItem, setMovementItem] = useState<Item | null>(null)
  const [movementType, setMovementType] = useState<'ENTRADA' | 'SAIDA'>('ENTRADA')
  const [movementQuantity, setMovementQuantity] = useState('')
  const [movementNote, setMovementNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const { data: items, error: listError, mutate: refreshItems } = useSWR(
    ['/inventory', search, page, showInactive],
    () => api.get('/inventory', { params: { search: search.trim() || undefined, page, limit: 20, active: showInactive ? 'all' : 'true' } }).then((response) => response.data as { data: Item[]; total: number; totalPages: number }),
  )
  const { data: summary, mutate: refreshSummary } = useSWR('/inventory/summary',
    () => api.get('/inventory/summary').then((response) => response.data as { total: number; low_stock: number; out_of_stock: number }),
  )
  const { data: movements, mutate: refreshMovements } = useSWR('/inventory/movements',
    () => api.get('/inventory/movements').then((response) => response.data as Movement[]),
  )

  function openCreate() {
    setEditing(null)
    setItemForm(emptyForm)
    setError('')
    setItemModal(true)
  }

  function openEdit(item: Item) {
    setEditing(item)
    setItemForm({ name: item.name, sku: item.sku ?? '', category: item.category ?? '', unit: item.unit, location: item.location ?? '', minimum_quantity: item.minimum_quantity })
    setError('')
    setItemModal(true)
  }

  function openMovement(item: Item, type: 'ENTRADA' | 'SAIDA') {
    setMovementItem(item)
    setMovementType(type)
    setMovementQuantity('')
    setMovementNote('')
    setError('')
  }

  async function refresh() {
    await Promise.all([refreshItems(), refreshSummary(), refreshMovements()])
  }

  async function saveItem(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const payload = { ...itemForm, minimum_quantity: Number(itemForm.minimum_quantity) }
      if (editing) await api.patch(`/inventory/${editing.id}`, payload)
      else await api.post('/inventory', payload)
      setItemModal(false)
      setSuccess(editing ? 'Item atualizado.' : 'Item cadastrado. Registre uma entrada para adicionar saldo.')
      await refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  async function saveMovement(event: FormEvent) {
    event.preventDefault()
    if (!movementItem) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await api.post(`/inventory/${movementItem.id}/movements`, { type: movementType, quantity: Number(movementQuantity), note: movementNote })
      setMovementItem(null)
      setSuccess(movementType === 'ENTRADA' ? 'Entrada registrada.' : 'Saída registrada.')
      await refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(item: Item) {
    if (item.is_active && !window.confirm(`Arquivar ${item.name}? O histórico será preservado.`)) return
    setError('')
    setSuccess('')
    try {
      await api.patch(`/inventory/${item.id}`, { is_active: !item.is_active })
      setSuccess(item.is_active ? 'Item arquivado.' : 'Item reativado.')
      await refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-xl font-semibold text-gray-900">Estoque</h1><p className="text-sm text-gray-500">Materiais, saldos e movimentações da organização.</p></div>
          {canWrite && <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={openCreate}><Plus className="h-4 w-4" /> Novo item</button>}
        </div>

        {success && <div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}
        {error && !itemModal && !movementItem && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {listError && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Não foi possível carregar o estoque. Confira seu acesso e tente novamente.</div>}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card flex items-center gap-3"><Package className="h-8 w-8 text-brand-600" /><div><p className="text-xs text-gray-500">Itens ativos</p><p className="text-2xl font-semibold">{summary?.total ?? '—'}</p></div></div>
          <div className="card flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-amber-600" /><div><p className="text-xs text-gray-500">No mínimo ou abaixo</p><p className="text-2xl font-semibold">{summary?.low_stock ?? '—'}</p></div></div>
          <div className="card flex items-center gap-3"><Package className="h-8 w-8 text-red-600" /><div><p className="text-xs text-gray-500">Sem saldo</p><p className="text-2xl font-semibold">{summary?.out_of_stock ?? '—'}</p></div></div>
        </div>

        <section className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-gray-900">Itens</h2><div className="flex flex-wrap gap-3"><label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input className="input pl-9" placeholder="Buscar item ou código" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label><label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={showInactive} onChange={(event) => { setShowInactive(event.target.checked); setPage(1) }} /> Mostrar arquivados</label></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b text-xs uppercase text-gray-500"><tr><th className="py-3 pr-3">Item</th><th className="py-3 pr-3">Categoria / local</th><th className="py-3 pr-3 text-right">Saldo</th><th className="py-3 pr-3 text-right">Mínimo</th><th className="py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-gray-100">{items?.data.map((item) => {
            const low = item.is_active && Number(item.quantity) <= Number(item.minimum_quantity)
            return <tr key={item.id} className={!item.is_active ? 'opacity-60' : ''}><td className="py-3 pr-3"><span className="font-medium text-gray-900">{item.name}</span>{item.sku && <span className="ml-2 text-xs text-gray-500">{item.sku}</span>}{!item.is_active && <span className="ml-2 text-xs text-gray-500">Arquivado</span>}</td><td className="py-3 pr-3 text-gray-600">{item.category || '—'}{item.location ? ` · ${item.location}` : ''}</td><td className={`py-3 pr-3 text-right font-semibold ${low ? 'text-amber-700' : 'text-gray-900'}`}>{amount(item.quantity)} {item.unit}</td><td className="py-3 pr-3 text-right text-gray-600">{amount(item.minimum_quantity)}</td><td className="py-3 text-right"><div className="flex justify-end gap-2">{canWrite && item.is_active && <><button type="button" className="text-xs font-medium text-emerald-700 hover:underline" onClick={() => openMovement(item, 'ENTRADA')}>Entrada</button><button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => openMovement(item, 'SAIDA')}>Saída</button></>}{canWrite && <><button type="button" aria-label={`Editar ${item.name}`} className="text-gray-500 hover:text-gray-900" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></button><button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => toggleActive(item)}>{item.is_active ? 'Arquivar' : 'Reativar'}</button></>}</div></td></tr>
          })}</tbody></table></div>
          {!items && !listError && <p className="text-sm text-gray-500">Carregando itens...</p>}
          {items?.data.length === 0 && <p className="py-5 text-center text-sm text-gray-500">Nenhum item encontrado.</p>}
          {!!items && items.totalPages > 1 && <div className="flex items-center justify-end gap-3 text-sm"><button type="button" disabled={page === 1} className="btn-ghost disabled:opacity-40" onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page} de {items.totalPages}</span><button type="button" disabled={page >= items.totalPages} className="btn-ghost disabled:opacity-40" onClick={() => setPage(page + 1)}>Próxima</button></div>}
        </section>

        <section className="card"><h2 className="mb-3 font-semibold text-gray-900">Últimas movimentações</h2><div className="space-y-2">{movements?.map((movement) => <div key={movement.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 py-2 text-sm"><div className="flex items-center gap-2">{movement.type === 'ENTRADA' ? <ArrowDownCircle className="h-5 w-5 text-emerald-600" /> : <ArrowUpCircle className="h-5 w-5 text-brand-600" />}<div><p className="font-medium text-gray-900">{movement.item.name} · {movement.type === 'ENTRADA' ? 'Entrada' : 'Saída'} de {amount(movement.quantity)} {movement.item.unit}</p><p className="text-xs text-gray-500">{movement.note || 'Sem observação'} · {movement.actor.name}</p></div></div><div className="text-right text-xs text-gray-500"><p>{new Date(movement.created_at).toLocaleString('pt-BR')}</p><p>Saldo: {amount(movement.balance_after)} {movement.item.unit}</p></div></div>)}{movements?.length === 0 && <p className="text-sm text-gray-500">Nenhuma movimentação registrada.</p>}{!movements && <p className="text-sm text-gray-500">Carregando histórico...</p>}</div></section>
      </div>

      <Modal open={itemModal} onClose={() => setItemModal(false)} title={editing ? `Editar ${editing.name}` : 'Novo item'}>
        <form onSubmit={saveItem} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm sm:col-span-2">Nome *<input className="input mt-1 w-full" value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} required minLength={2} maxLength={200} /></label><label className="text-sm">Código / SKU<input className="input mt-1 w-full" value={itemForm.sku} onChange={(event) => setItemForm({ ...itemForm, sku: event.target.value })} maxLength={80} /></label><label className="text-sm">Categoria<input className="input mt-1 w-full" value={itemForm.category} onChange={(event) => setItemForm({ ...itemForm, category: event.target.value })} maxLength={100} /></label><label className="text-sm">Unidade *<input className="input mt-1 w-full" value={itemForm.unit} onChange={(event) => setItemForm({ ...itemForm, unit: event.target.value })} required maxLength={20} placeholder="UN, KG, L..." /></label><label className="text-sm">Estoque mínimo<input className="input mt-1 w-full" type="number" min="0" step="0.001" value={itemForm.minimum_quantity} onChange={(event) => setItemForm({ ...itemForm, minimum_quantity: event.target.value })} required /></label><label className="text-sm sm:col-span-2">Local de armazenamento<input className="input mt-1 w-full" value={itemForm.location} onChange={(event) => setItemForm({ ...itemForm, location: event.target.value })} maxLength={120} /></label></div><p className="text-xs text-gray-500">O saldo é atualizado por entradas e saídas registradas no histórico.</p>{error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}<div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setItemModal(false)}>Cancelar</button><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Salvando...' : 'Salvar item'}</button></div></form>
      </Modal>

      <Modal open={!!movementItem} onClose={() => setMovementItem(null)} title={`${movementType === 'ENTRADA' ? 'Entrada' : 'Saída'} · ${movementItem?.name ?? ''}`}>
        <form onSubmit={saveMovement} className="space-y-4"><p className="text-sm text-gray-600">Saldo atual: <strong>{movementItem ? amount(movementItem.quantity) : '0'} {movementItem?.unit}</strong></p><label className="block text-sm">Quantidade *<input className="input mt-1 w-full" type="number" min="0.001" step="0.001" value={movementQuantity} onChange={(event) => setMovementQuantity(event.target.value)} required /></label><label className="block text-sm">Observação<textarea className="input mt-1 w-full" rows={3} maxLength={500} value={movementNote} onChange={(event) => setMovementNote(event.target.value)} placeholder="Origem, destino ou motivo" /></label>{error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}<div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setMovementItem(null)}>Cancelar</button><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Registrando...' : 'Registrar movimentação'}</button></div></form>
      </Modal>
    </DashboardLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  if (!ctx.req.cookies.refresh_token) return { redirect: { destination: '/login', permanent: false } }
  return { props: {} }
}
