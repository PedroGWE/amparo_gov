import { useMemo, useRef, useState } from 'react'
import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import {
  DOCUMENT_ACCEPTED_EXTENSIONS,
  DOCUMENT_FORMAT_LABEL,
  DOCUMENT_MAX_SIZE_BYTES,
  createInstitutionalDocTypeSchema,
  isAllowedDocumentMime,
} from '@cidadao/shared'
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { documentsService, type DocStatus, type DocumentTypeRow } from '@/services/documents'

const NEW_TYPE = '__new__'

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return Math.max(1, Math.round(bytes / 1024)) + ' KB'
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function errorMessage(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data
    ?.message
  return typeof message === 'string' ? message : fallback
}

export default function DocumentosPage() {
  const { query } = useRouter()
  const {
    data: groups,
    error: loadError,
    isLoading,
    mutate,
  } = useSWR(query.tenant ? ['/documents', query.tenant] : null, () => documentsService.list())
  const [statusFilter, setStatusFilter] = useState<DocStatus | ''>('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(NEW_TYPE)
  const [newTypeName, setNewTypeName] = useState('')
  const [typeError, setTypeError] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [validUntil, setValidUntil] = useState('')
  const [showValidity, setShowValidity] = useState(false)
  const [sending, setSending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [success, setSuccess] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLElement>(null)
  const sendingRef = useRef(false)

  const rows = useMemo(() => groups?.flatMap((group) => group.types) ?? [], [groups])
  const selectedRow = rows.find((row) => row.id === selectedId)
  const isOtherDocument = selectedId === NEW_TYPE
  const hasDocumentName = isOtherDocument ? !!newTypeName.trim() : !!selectedRow
  const filteredGroups = (groups ?? [])
    .map((group) => ({
      ...group,
      types: group.types.filter(
        (row) =>
          (!statusFilter || row.status === statusFilter) &&
          normalize([group.name, row.name, row.document?.file_name ?? ''].join(' ')).includes(
            normalize(search.trim()),
          ),
      ),
    }))
    .filter((group) => group.types.length > 0)
  const filters: { value: DocStatus | ''; label: string; count: number }[] = [
    { value: '', label: 'Todos', count: rows.length },
    {
      value: 'PENDENTE',
      label: 'Sem anexo',
      count: rows.filter((row) => row.status === 'PENDENTE').length,
    },
    {
      value: 'VALIDO',
      label: 'Válidos',
      count: rows.filter((row) => row.status === 'VALIDO').length,
    },
    {
      value: 'VENCIDO',
      label: 'Vencidos',
      count: rows.filter((row) => row.status === 'VENCIDO').length,
    },
  ]

  function clearFile() {
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function pick(files: FileList | null) {
    if (sendingRef.current || !files?.length) return
    setSuccess('')
    setUploadError('')
    const nextFile = files[0]
    if (files.length > 1) {
      clearFile()
      setUploadError('Selecione um arquivo por documento.')
    } else if (
      !DOCUMENT_ACCEPTED_EXTENSIONS.split(',').some((extension) =>
        nextFile.name.toLowerCase().endsWith(extension),
      ) ||
      (nextFile.type && !isAllowedDocumentMime(nextFile.type))
    ) {
      clearFile()
      setUploadError(`Formato não permitido. Escolha um arquivo ${DOCUMENT_FORMAT_LABEL}.`)
    } else if (nextFile.size > DOCUMENT_MAX_SIZE_BYTES || nextFile.size === 0) {
      clearFile()
      setUploadError(
        nextFile.size === 0
          ? 'O arquivo está vazio. Escolha outro arquivo.'
          : 'O arquivo deve ter no máximo 10 MB.',
      )
    } else {
      setFile(nextFile)
    }
  }

  function chooseDocument(id: string) {
    setSelectedId(id)
    setTypeError('')
    setNewTypeName('')
    setValidUntil('')
    setShowValidity(false)
    setUploadError('')
    setSuccess('')
  }

  async function createType(name: string) {
    const { category, ...row } = await documentsService.createType({ name })
    await mutate(
      (current) => {
        const categories = current ?? []
        const exists = categories.some((group) => group.id === category.id)
        return exists
          ? categories.map((group) =>
              group.id === category.id
                ? {
                    ...group,
                    types: [...group.types.filter((type) => type.id !== row.id), row].sort((a, b) =>
                      a.name.localeCompare(b.name, 'pt-BR'),
                    ),
                  }
                : group,
            )
          : [...categories, { ...category, types: [row] }].sort((a, b) => a.order - b.order)
      },
      { revalidate: false },
    )
    // Keep the created type selected if upload fails, so retry does not create it again.
    setSelectedId(row.id)
    return row
  }

  function attach(row: DocumentTypeRow) {
    chooseDocument(row.id)
    clearFile()
    uploadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    inputRef.current?.click()
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!hasDocumentName || !file || sendingRef.current || busyId) return
    const parsedName = createInstitutionalDocTypeSchema.safeParse({ name: newTypeName })
    if (isOtherDocument && !parsedName.success) {
      setTypeError(parsedName.error.issues[0].message)
      return
    }
    sendingRef.current = true
    setSending(true)
    setUploadError('')
    setSuccess('')
    try {
      const row =
        isOtherDocument && parsedName.success ? await createType(parsedName.data.name) : selectedRow
      if (!row) return
      await documentsService.upload(row.id, file, validUntil || undefined)
      setSuccess(
        '“' + row.name + '” ' + (row.document ? 'substituído' : 'anexado') + ' com sucesso.',
      )
      clearFile()
      setSelectedId(NEW_TYPE)
      setNewTypeName('')
      setTypeError('')
      setValidUntil('')
      setShowValidity(false)
      void mutate()
    } catch (error) {
      setUploadError(errorMessage(error, 'Não foi possível enviar o documento. Tente novamente.'))
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  async function handleAction(row: DocumentTypeRow, action: 'delete' | 'download') {
    if (!row.document) return
    if (
      action === 'delete' &&
      !window.confirm('Excluir o arquivo de "' + row.name + '"? O documento ficará sem anexo.')
    )
      return
    setBusyId(row.id)
    setActionError('')
    setSuccess('')
    try {
      if (action === 'download') {
        await documentsService.download(row.document)
      } else {
        await documentsService.remove(row.document.id)
        setSuccess('Arquivo de “' + row.name + '” excluído.')
        void mutate()
      }
    } catch (error) {
      setActionError(
        errorMessage(
          error,
          'Não foi possível ' +
            (action === 'delete' ? 'excluir' : 'baixar') +
            ' o arquivo. Tente novamente.',
        ),
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Documentos</h1>
        <p className="mt-1 text-sm text-gray-500">
          Anexe e encontre os documentos da sua instituição em um só lugar. O envio é opcional.
        </p>
      </div>
      {loadError ? (
        <div
          role="alert"
          className="card mb-6 flex flex-wrap items-center justify-between gap-3 border-red-200"
        >
          <p className="text-sm text-red-700">Não foi possível carregar os documentos.</p>
          <button type="button" className="btn-ghost" onClick={() => void mutate()}>
            Tentar novamente
          </button>
        </div>
      ) : isLoading || !groups ? (
        <PageSpinner />
      ) : (
        <>
          <section
            ref={uploadRef}
            aria-labelledby="upload-heading"
            className="card mb-8 scroll-mt-6"
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <UploadCloud className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 id="upload-heading" className="font-semibold text-gray-900">
                  Enviar documento
                </h2>
                <p className="text-sm text-gray-500">
                  Envie um documento novo com o nome que desejar ou use um tipo já cadastrado.
                </p>
              </div>
            </div>
            <form onSubmit={submit} aria-busy={sending}>
              <div
                className="mb-5 grid gap-3 sm:grid-cols-2"
                role="group"
                aria-label="Como deseja enviar o documento?"
              >
                <button
                  type="button"
                  aria-pressed={isOtherDocument}
                  disabled={sending}
                  onClick={() => chooseDocument(NEW_TYPE)}
                  className={
                    'rounded-xl border p-4 text-left transition-colors ' +
                    (isOtherDocument
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-brand-300')
                  }
                >
                  <span className="block text-sm font-semibold">Enviar documento novo</span>
                  <span className="mt-1 block text-xs">Informe o nome e escolha o arquivo.</span>
                </button>
                <button
                  type="button"
                  aria-pressed={!isOtherDocument}
                  disabled={sending}
                  onClick={() => chooseDocument('')}
                  className={
                    'rounded-xl border p-4 text-left transition-colors ' +
                    (!isOtherDocument
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-brand-300')
                  }
                >
                  <span className="block text-sm font-semibold">Usar tipo cadastrado</span>
                  <span className="mt-1 block text-xs">Selecione um documento da lista.</span>
                </button>
              </div>
              <fieldset disabled={sending} className="grid min-w-0 gap-5 md:grid-cols-2">
                <div className="min-w-0 space-y-4">
                  {isOtherDocument ? (
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="new-document-type" className="label">
                          Nome do documento
                        </label>
                        <input
                          id="new-document-type"
                          className="input"
                          placeholder="Ex.: Estatuto social, contrato, declaração"
                          maxLength={150}
                          required
                          value={newTypeName}
                          aria-invalid={!!typeError}
                          aria-describedby={typeError ? 'document-type-error' : undefined}
                          onChange={(event) => {
                            setNewTypeName(event.target.value)
                            setTypeError('')
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-600">
                        O documento será salvo em “Outros documentos” e poderá ser encontrado
                        abaixo.
                      </p>
                      {typeError && (
                        <p id="document-type-error" role="alert" className="text-sm text-red-700">
                          {typeError}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="document-type" className="label">
                        Tipo de documento cadastrado
                      </label>
                      <select
                        id="document-type"
                        className="input"
                        required
                        value={selectedId}
                        onChange={(event) => chooseDocument(event.target.value)}
                      >
                        <option value="">Selecione o documento</option>
                        {groups.map((group) => (
                          <optgroup key={group.id} label={group.name}>
                            {group.types.map((row) => (
                              <option key={row.id} value={row.id}>
                                {row.name}
                                {row.document ? ' (já anexado)' : ''}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  )}
                  {selectedRow?.document && (
                    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                      Ao enviar, o novo arquivo substituirá o anexo atual:{' '}
                      <span className="break-all font-medium">
                        {selectedRow.document.file_name}
                      </span>
                      .
                    </p>
                  )}
                  <button
                    type="button"
                    className="text-sm font-medium text-brand-600 hover:underline disabled:opacity-50"
                    aria-expanded={showValidity}
                    aria-controls="validity-field"
                    onClick={() => setShowValidity(!showValidity)}
                  >
                    {showValidity
                      ? '− Ocultar validade'
                      : validUntil
                        ? 'Validade: ' + formatDate(validUntil) + ' · editar'
                        : '+ Adicionar validade (opcional)'}
                  </button>
                  <div id="validity-field" hidden={!showValidity}>
                    <label htmlFor="valid-until" className="label">
                      Data de validade
                    </label>
                    <input
                      id="valid-until"
                      type="date"
                      className="input"
                      value={validUntil}
                      onChange={(event) => setValidUntil(event.target.value)}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Preencha somente se o documento tiver vencimento.
                    </p>
                  </div>
                </div>
                <div className="min-w-0">
                  <span className="label">Arquivo</span>
                  <div
                    onDragOver={(event) => {
                      event.preventDefault()
                      if (!sending) setDragging(true)
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                        setDragging(false)
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      setDragging(false)
                      pick(event.dataTransfer.files)
                    }}
                    className={
                      'flex min-h-40 flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors ' +
                      (dragging
                        ? 'border-brand-500 bg-brand-50'
                        : file
                          ? 'border-brand-300 bg-brand-50/50'
                          : 'border-gray-300 bg-gray-50')
                    }
                  >
                    {file ? (
                      <FileText className="mb-2 h-7 w-7 text-brand-600" aria-hidden="true" />
                    ) : (
                      <UploadCloud className="mb-2 h-7 w-7 text-brand-600" aria-hidden="true" />
                    )}
                    <p className="max-w-full break-all text-sm font-medium text-gray-800">
                      {file ? file.name : 'Arraste e solte seu arquivo aqui'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {file
                        ? formatSize(file.size)
                        : `${DOCUMENT_FORMAT_LABEL} · até 10 MB por arquivo`}
                    </p>
                    <div className="mt-2 flex flex-wrap justify-center gap-1">
                      <button
                        type="button"
                        className="btn-ghost text-brand-600"
                        onClick={() => inputRef.current?.click()}
                      >
                        {file ? 'Trocar arquivo' : 'Selecionar arquivo'}
                      </button>
                      {file && (
                        <button
                          type="button"
                          className="btn-ghost"
                          aria-label="Remover arquivo selecionado"
                          onClick={clearFile}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <input
                      ref={inputRef}
                      type="file"
                      accept={DOCUMENT_ACCEPTED_EXTENSIONS}
                      className="hidden"
                      aria-label="Selecionar arquivo para anexar"
                      onChange={(event) => pick(event.target.files)}
                    />
                  </div>
                </div>
              </fieldset>
              {uploadError && (
                <p
                  role="alert"
                  className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {uploadError}
                </p>
              )}
              <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-500">
                  {file && hasDocumentName
                    ? 'Tudo pronto para enviar.'
                    : isOtherDocument
                      ? 'Informe o nome do documento e selecione o arquivo.'
                      : 'Selecione o tipo e o arquivo para habilitar o envio.'}
                </p>
                <button
                  type="submit"
                  className="btn-primary gap-2"
                  disabled={!file || !hasDocumentName || sending || !!busyId}
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <UploadCloud className="h-4 w-4" aria-hidden="true" />
                  )}
                  {sending
                    ? 'Enviando...'
                    : selectedRow?.document
                      ? 'Substituir documento'
                      : 'Enviar documento'}
                </button>
              </div>
            </form>
          </section>

          {success && (
            <p
              role="status"
              className="mb-5 flex items-start gap-2 rounded-lg border border-growth-200 bg-growth-50 px-4 py-3 text-sm text-growth-700"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {success}
            </p>
          )}
          {actionError && (
            <p
              role="alert"
              className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {actionError}
            </p>
          )}

          <section aria-labelledby="documents-heading">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 id="documents-heading" className="font-semibold text-gray-900">
                Documentos da instituição
              </h2>
              <div className="relative sm:w-80">
                <Search
                  className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-gray-400"
                  aria-hidden="true"
                />
                <label className="sr-only" htmlFor="document-search">
                  Buscar documento
                </label>
                <input
                  id="document-search"
                  type="search"
                  className="input pl-10"
                  placeholder="Buscar documento ou arquivo"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <div
              className="mb-5 flex flex-wrap gap-2"
              role="group"
              aria-label="Filtrar por situação"
            >
              {filters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={statusFilter === filter.value}
                  onClick={() => setStatusFilter(filter.value)}
                  className={
                    'btn gap-2 border ' +
                    (statusFilter === filter.value
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')
                  }
                >
                  {filter.label}
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs">
                    {filter.count}
                  </span>
                </button>
              ))}
            </div>
            {!filteredGroups.length ? (
              <div className="card py-10 text-center">
                <FileText className="mx-auto mb-3 h-8 w-8 text-gray-400" aria-hidden="true" />
                <p className="text-sm text-gray-600">Nenhum documento encontrado.</p>
                {(search || statusFilter) && (
                  <button
                    type="button"
                    className="btn-ghost mt-2"
                    onClick={() => {
                      setSearch('')
                      setStatusFilter('')
                    }}
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {filteredGroups.map((group) => (
                  <div
                    key={group.id}
                    className="overflow-hidden rounded-xl border border-gray-200 bg-white"
                  >
                    <h3 className="border-b border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 sm:px-5">
                      {group.name}
                    </h3>
                    <ul className="divide-y divide-gray-100">
                      {group.types.map((row) => (
                        <li
                          key={row.id}
                          className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-gray-900">{row.name}</p>
                              {row.document ? (
                                <Badge value={row.status} />
                              ) : (
                                <span className="text-xs text-gray-500">Sem anexo</span>
                              )}
                            </div>
                            {row.document && (
                              <>
                                <p className="mt-1 break-all text-xs text-gray-500">
                                  {row.document.file_name} · {formatSize(row.document.size_bytes)}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                  Enviado em {formatDate(row.document.sent_at)} ·{' '}
                                  {row.document.valid_until
                                    ? 'Validade: ' + formatDate(row.document.valid_until)
                                    : 'Sem validade informada'}
                                </p>
                              </>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-1">
                            <button
                              type="button"
                              className={
                                row.document
                                  ? 'btn-ghost gap-2 text-brand-600'
                                  : 'btn-primary gap-2'
                              }
                              disabled={sending || !!busyId}
                              onClick={() => attach(row)}
                              aria-label={(row.document ? 'Substituir ' : 'Anexar ') + row.name}
                            >
                              <UploadCloud className="h-4 w-4" aria-hidden="true" />
                              {row.document ? 'Substituir' : 'Anexar'}
                            </button>
                            {row.document && (
                              <>
                                <button
                                  type="button"
                                  className="btn-ghost gap-2"
                                  disabled={sending || !!busyId}
                                  onClick={() => handleAction(row, 'download')}
                                  aria-label={'Baixar ' + row.name}
                                >
                                  <Download className="h-4 w-4" aria-hidden="true" />
                                  Baixar
                                </button>
                                <button
                                  type="button"
                                  className="btn-ghost px-3 text-red-600"
                                  disabled={sending || !!busyId}
                                  onClick={() => handleAction(row, 'delete')}
                                  aria-label={'Excluir ' + row.name}
                                  title="Excluir arquivo"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </>
                            )}
                            {busyId === row.id && (
                              <span role="status">
                                <Loader2
                                  className="h-4 w-4 animate-spin text-brand-600"
                                  aria-hidden="true"
                                />
                                <span className="sr-only">Processando documento</span>
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </DashboardLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  if (!ctx.req.cookies['refresh_token']) {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}
