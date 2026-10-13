import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  Building2,
  LayoutDashboard,
  FolderKanban,
  Users,
  GraduationCap,
  DollarSign,
  FileText,
  FolderArchive,
  Megaphone,
  Settings,
  LogOut,
  ChevronRight,
  Handshake,
  ClipboardCheck,
  Landmark,
  Plug,
  Package,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '@/hooks/useAuth'

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, href: 'dashboard' },
  { label: 'Projetos', icon: FolderKanban, href: 'projetos' },
  { label: 'Editais', icon: Megaphone, href: 'editais' },
  { label: 'Beneficiários', icon: Users, href: 'beneficiarios' },
  { label: 'Professores', icon: GraduationCap, href: 'professores' },
  { label: 'Financeiro', icon: DollarSign, href: 'financeiro' },
  { label: 'Estoque', icon: Package, href: 'estoque' },
  { label: 'Parcerias', icon: Handshake, href: 'parcerias' },
  { label: 'Transferegov', icon: Landmark, href: 'transferegov' },
  { label: 'Dados públicos', icon: Plug, href: 'integracoes' },
  { label: 'Prestação de contas', icon: ClipboardCheck, href: 'prestacao-contas' },
  { label: 'Dados Básicos', icon: Building2, href: 'institucional/dados-basicos' },
  { label: 'Documentos', icon: FolderArchive, href: 'institucional/documentos' },
  { label: 'Relatórios', icon: FileText, href: 'relatorios' },
  { label: 'Configurações', icon: Settings, href: 'configuracoes' },
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { user, tenantSlug, logout } = useAuth()
  const tenant = (router.query.tenant as string) || tenantSlug || ''

  return (
    <div className="flex h-screen bg-cream">
      <aside className="w-64 flex-shrink-0 bg-brand-600 text-white flex flex-col shadow-xl">
        <div className="flex h-24 items-center border-b border-white/15 bg-brand-600 px-5">
          <Image
            src="/amparo/logo-fundo-escuro.png"
            alt="Amparo GOV"
            width={2172}
            height={724}
            className="h-auto w-full object-contain"
            priority
          />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const href = tenant ? (item.href ? `/${tenant}/${item.href}` : `/${tenant}`) : '#'
            const active = item.href === '' ? router.pathname === '/[tenant]' : router.pathname === `/[tenant]/${item.href}`
            return (
              <Link
                key={item.href}
                href={href}
                className={clsx(
                  'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-star-500',
                  active ? 'bg-white text-brand-700 shadow-sm' : 'text-white/85 hover:bg-white/10 hover:text-white',
                )}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {item.label}
                {active && <ChevronRight className="ml-auto h-3 w-3" />}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="h-9 w-9 rounded-full bg-star-500 flex items-center justify-center text-brand-900 font-bold text-sm flex-shrink-0">
              {user?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name ?? '—'}</p>
              <p className="text-xs text-white/60 truncate">{user?.email ?? '—'}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="h-20 bg-white/95 border-b border-[#D5DEEA] flex items-center px-6 backdrop-blur">
          <h1 className="font-display text-xl font-bold text-brand-900 capitalize">
            {navItems.find((n) =>
              n.href === '' ? router.pathname === '/[tenant]' : router.pathname === `/[tenant]/${n.href}`
            )?.label ?? 'Dashboard'}
          </h1>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
