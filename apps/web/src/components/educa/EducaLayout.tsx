import { type ReactNode, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  School,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  Video,
  X,
} from 'lucide-react'
import { EducaBrand } from './EducaBrand'
import { initials } from './educa-utils'
import { Modal } from '@/components/ui/Modal'

export type EducaSection =
  | 'inicio'
  | 'turmas'
  | 'planejamento'
  | 'aulas'
  | 'atividades'
  | 'materiais'
  | 'chamada'
  | 'frequencia'
  | 'perfil'
  | 'acessos'
  | 'relatorios'
  | 'alunos'
export function EducaLayout({
  children,
  teacher,
  manager,
  section,
  navigate,
  userName,
  institute,
  tenant,
  search,
  setSearch,
  logout,
}: {
  children: ReactNode
  teacher: boolean
  manager: boolean
  section: EducaSection
  navigate: (section: EducaSection) => void
  userName: string
  institute: string
  tenant: string
  search: string
  setSearch: (value: string) => void
  logout: () => Promise<unknown>
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const role = manager ? 'Gestor' : teacher ? 'Professor' : 'Aluno'
  const nav = [
    { id: 'inicio', label: 'Visão geral', icon: LayoutDashboard },
    { id: 'turmas', label: manager ? 'Turmas' : 'Minhas turmas', icon: Users },
    ...(teacher ? [{ id: 'planejamento', label: 'Planejamento', icon: CalendarDays }] : []),
    { id: 'aulas', label: teacher ? 'Aulas' : 'Minhas aulas', icon: Video },
    { id: 'atividades', label: teacher ? 'Atividades' : 'Minhas atividades', icon: ClipboardCheck },
    { id: 'materiais', label: 'Biblioteca', icon: BookOpen },
    {
      id: teacher ? 'chamada' : 'frequencia',
      label: teacher ? 'Chamada' : 'Minha frequência',
      icon: CheckSquare,
    },
    ...(manager
      ? [
          { id: 'acessos', label: 'Acessos', icon: ShieldCheck },
          { id: 'relatorios', label: 'Chamadas recebidas', icon: FileText },
        ]
      : []),
    ...(!teacher ? [{ id: 'perfil', label: 'Meu perfil', icon: UserRound }] : []),
  ]
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setProfileOpen(false)
        if (mobileOpen) {
          setMobileOpen(false)
          menuButtonRef.current?.focus()
        }
      }
      if (mobileOpen && event.key === 'Tab') {
        const items = Array.from(
          sidebarRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href]') ?? [],
        )
        const first = items[0]
        const last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    function outside(event: MouseEvent) {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false)
    }
    document.addEventListener('keydown', key)
    document.addEventListener('click', outside)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('click', outside)
    }
  }, [mobileOpen])
  useEffect(() => {
    if (!mobileOpen) return
    closeButtonRef.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [mobileOpen])
  useEffect(() => {
    setMobileOpen(false)
    if (window.matchMedia('(max-width:800px)').matches)
      menuButtonRef.current?.focus({ preventScroll: true })
  }, [section])
  return (
    <div className="edu-app">
      <a className="edu-skip-link" href="#edu-main">
        Ir para o conteúdo
      </a>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Fechar menu de navegação"
          className="edu-menu-overlay"
          onClick={() => {
            setMobileOpen(false)
            menuButtonRef.current?.focus()
          }}
        />
      )}
      <aside
        ref={sidebarRef}
        id="edu-sidebar"
        className={`edu-sidebar${mobileOpen ? ' is-open' : ''}`}
        aria-label="Menu do Educa"
      >
        <div className="edu-sidebar-brand">
          <button
            type="button"
            className="edu-brand-button"
            aria-label="Ir para a visão geral"
            onClick={() => {
              navigate('inicio')
              setMobileOpen(false)
            }}
          >
            <EducaBrand />
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            className="edu-icon-button edu-mobile-only"
            aria-label="Fechar menu"
            onClick={() => {
              setMobileOpen(false)
              menuButtonRef.current?.focus()
            }}
          >
            <X />
          </button>
        </div>
        <p className="edu-sidebar-caption">
          {manager ? 'GESTÃO EDUCACIONAL' : teacher ? 'PORTAL DO PROFESSOR' : 'PORTAL DO ALUNO'}
        </p>
        <nav aria-label="Navegação do portal" className="edu-side-nav">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                navigate(id as EducaSection)
                setMobileOpen(false)
              }}
              aria-current={section === id ? 'page' : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              {section === id && <span className="edu-nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="edu-sidebar-bottom">
          <button
            type="button"
            className="edu-help-button"
            onClick={() => {
              setHelpOpen(true)
              setMobileOpen(false)
            }}
          >
            <span>
              <CircleHelp size={21} />
            </span>
            <span>
              <strong>Precisa de uma mão?</strong>
              <small>Encontre ajuda para começar</small>
            </span>
          </button>
          {manager && (
            <Link className="edu-back-management" href={`/${tenant}/dashboard`}>
              <ArrowLeft size={16} />
              Voltar à gestão
            </Link>
          )}
          <button
            type="button"
            className="edu-sidebar-profile"
            onClick={() => {
              navigate('perfil')
              setMobileOpen(false)
            }}
          >
            <span className="edu-avatar">{initials(userName)}</span>
            <span>
              <strong>{userName}</strong>
              <small>{role}</small>
            </span>
            <ChevronDown size={16} />
          </button>
        </div>
      </aside>
      <div className="edu-workspace">
        <header className="edu-topbar">
          <div className="edu-topbar-start">
            <button
              ref={menuButtonRef}
              type="button"
              className="edu-icon-button edu-mobile-only"
              aria-label="Abrir menu"
              aria-expanded={mobileOpen}
              aria-controls="edu-sidebar"
              onClick={() => setMobileOpen(true)}
            >
              <Menu />
            </button>
            <span className="edu-mobile-brand">
              <EducaBrand compact />
            </span>
            <label className="edu-global-search">
              <Search size={17} />
              <span className="sr-only">Buscar no conteúdo do portal</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  teacher ? 'Buscar turmas, aulas e atividades...' : 'Buscar turmas e conteúdos...'
                }
              />
              <kbd aria-hidden="true">Busca</kbd>
            </label>
          </div>
          <div className="edu-topbar-end">
            <span className="edu-institute">
              <School size={16} />
              {institute}
            </span>
            <button
              type="button"
              className="edu-icon-button edu-help-top"
              aria-label="Ajuda do portal"
              onClick={() => setHelpOpen(true)}
            >
              <CircleHelp size={21} />
            </button>
            <div className="edu-profile-menu" ref={profileRef}>
              <button
                type="button"
                className="edu-user-button"
                aria-label={`Opções de ${userName}`}
                aria-expanded={profileOpen}
                onClick={() => setProfileOpen((value) => !value)}
              >
                <span className="edu-avatar">{initials(userName)}</span>
                <span className="edu-user-text">
                  <strong>{userName}</strong>
                  <small>{role}</small>
                </span>
                <ChevronDown size={16} />
              </button>
              {profileOpen && (
                <div className="edu-profile-dropdown">
                  <button
                    type="button"
                    onClick={() => {
                      navigate('perfil')
                      setProfileOpen(false)
                    }}
                  >
                    <UserRound size={17} />
                    Meu perfil
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHelpOpen(true)
                      setProfileOpen(false)
                    }}
                  >
                    <CircleHelp size={17} />
                    Ajuda
                  </button>
                  <button type="button" onClick={() => void logout()}>
                    <LogOut size={17} />
                    Sair do portal
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="edu-main" className="edu-main" tabIndex={-1}>
          <label className="edu-mobile-search edu-search">
            <Search size={17} />
            <span className="sr-only">Buscar no portal pelo celular</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar turmas e conteúdos..."
            />
          </label>
          {children}
          <footer className="edu-footer">
            <span>Educa Amparo GOV</span>
            <span>Ensinar hoje. Construir amanhãs mais fortes.</span>
          </footer>
        </main>
      </div>
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Conte com o Educa">
        <div className="edu-help-content">
          <span className="edu-help-symbol">
            <GraduationCap size={32} />
          </span>
          <h3>{teacher ? 'Tudo pronto para a próxima aula?' : 'Vamos aprender juntos?'}</h3>
          <ol>
            {teacher ? (
              <>
                <li>
                  <strong>Escolha a turma.</strong> Você encontra somente as turmas em que tem
                  acesso.
                </li>
                <li>
                  <strong>Organize o encontro.</strong> Agende a aula, publique materiais e prepare
                  as atividades.
                </li>
                <li>
                  <strong>Acompanhe os alunos.</strong> Corrija entregas e envie a chamada ao
                  gestor.
                </li>
              </>
            ) : (
              <>
                <li>
                  <strong>Entre na sua turma.</strong> Use Minhas turmas para encontrar seu
                  conteúdo.
                </li>
                <li>
                  <strong>Acompanhe as aulas.</strong> O botão Entrar na aula abre o Google Meet.
                </li>
                <li>
                  <strong>Envie suas atividades.</strong> Escreva uma resposta ou anexe uma foto ou
                  PDF. A avaliação aparece na própria atividade.
                </li>
              </>
            )}
          </ol>
          <p>
            Problemas de acesso ou senha? Fale com o gestor da sua instituição. Ele pode conferir
            seu vínculo e gerar um novo acesso.
          </p>
          <button
            type="button"
            className="edu-btn edu-btn-primary"
            onClick={() => setHelpOpen(false)}
          >
            Entendi, vamos lá
          </button>
        </div>
      </Modal>
    </div>
  )
}
