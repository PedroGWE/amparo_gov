import { FormEvent, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, BookOpenCheck, Eye, EyeOff, GraduationCap, ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export default function EducaLoginPage() {
  const [perfil, setPerfil] = useState<'aluno' | 'professor'>('aluno')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { login } = useAuth()

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    try {
      await login(String(f.get('identificador')), String(f.get('senha')), String(f.get('instituto')).trim().toLowerCase(), perfil)
    } catch {
      setError('Não foi possível entrar. Confira o instituto, suas credenciais e o perfil selecionado.')
    } finally { setBusy(false) }
  }

  return (
    <main className="educa-login-page">
      <section className="educa-login-window" aria-labelledby="login-title">
        <div className="educa-login-hero">
          <Image src="/brand/educa/icone-educa.png" alt="" width={102} height={102} className="educa-hero-icon" priority />
          <p className="educa-eyebrow">Educa Amparo GOV</p>
          <h1>Um lugar para ensinar, aprender e crescer juntos.</h1>
          <div className="educa-hero-accent" />
          <p>Suas turmas, aulas e atividades organizadas em uma experiência simples e acolhedora.</p>
          <div className="educa-hero-features" aria-label="Recursos da plataforma">
            <span><BookOpenCheck /> Aulas e materiais em um só lugar</span>
            <span><Users /> Conexão entre alunos e professores</span>
            <span><ShieldCheck /> Ambiente seguro do seu instituto</span>
          </div>
        </div>
        <div className="educa-login-panel">
          <Image src="/brand/educa/logo-educa-amparo-gov.png" alt="Educa Amparo GOV" width={620} height={190} className="educa-login-logo" priority />
          <h2 id="login-title">Bem-vindo ao Educa</h2>
          <p>Use o acesso fornecido pelo seu instituto.</p>
          <div className="educa-profile-switch" aria-label="Escolha seu perfil">
            <button type="button" aria-pressed={perfil === 'aluno'} onClick={() => setPerfil('aluno')}><GraduationCap /> Sou aluno</button>
            <button type="button" aria-pressed={perfil === 'professor'} onClick={() => setPerfil('professor')}><Users /> Sou professor</button>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div><label htmlFor="instituto" className="label">Instituto</label><input id="instituto" name="instituto" className="input" placeholder="Identificador do instituto" autoComplete="organization" required /><p className="educa-field-help">É o nome curto informado pela sua instituição.</p></div>
            <div><label htmlFor="identificador" className="label">{perfil === 'aluno' ? 'Matrícula' : 'E-mail'}</label><input key={perfil} id="identificador" name="identificador" type={perfil === 'aluno' ? 'text' : 'email'} className="input" placeholder={perfil === 'aluno' ? 'Digite sua matrícula' : 'voce@instituto.org.br'} autoComplete="username" required /></div>
            <div><label htmlFor="senha" className="label">Senha</label><div className="educa-password-field"><input id="senha" name="senha" type={showPassword ? 'text' : 'password'} minLength={8} className="input" placeholder="Digite sua senha" autoComplete="current-password" required aria-describedby="password-help" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff /> : <Eye />}</button></div></div>
            {error && <p role="alert" className="educa-alert-error">{error}</p>}
            <button disabled={busy} className="btn-primary w-full">{busy ? 'Entrando...' : 'Entrar'} {!busy && <ArrowRight />}</button>
          </form>
          <div className="educa-login-footer"><p id="password-help">Esqueceu sua senha? Procure o gestor do seu instituto para solicitar um novo acesso.</p><Link href="/login">Acesso da gestão Amparo GOV <ArrowRight /></Link></div>
        </div>
      </section>
    </main>
  )
}
