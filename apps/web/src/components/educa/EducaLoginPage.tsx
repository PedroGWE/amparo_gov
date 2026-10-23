import Image from 'next/image'
import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import Cookies from 'js-cookie'
import {
  ArrowRight,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  LockKeyhole,
  School,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { EducaBrand } from './EducaBrand'

export default function EducaLoginPage() {
  const [perfil, setPerfil] = useState<'aluno' | 'professor'>('aluno')
  const [institute, setInstitute] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [help, setHelp] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { login } = useAuth()
  useEffect(() => {
    setInstitute(Cookies.get('tenant_slug') ?? '')
  }, [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const data = new FormData(event.currentTarget)
    try {
      await login(
        String(data.get('identificador')),
        String(data.get('senha')),
        institute.trim().toLowerCase(),
        perfil,
      )
    } catch {
      setError(
        'Não foi possível entrar. Confira o instituto, sua matrícula ou e-mail e a senha. Verifique também o perfil selecionado.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="edu-login">
      <section className="edu-login-window" aria-labelledby="edu-login-title">
        <div className="edu-login-story">
          <EducaBrand />
          <h1>
            Ensinar hoje.
            <br />
            <span>Construir amanhãs mais fortes.</span>
          </h1>
          <p>
            Um espaço que aproxima pessoas, inspira descobertas e coloca o aprendizado em movimento.
          </p>
          <Image
            unoptimized
            className="edu-learning-art"
            src="/brand/educa/learning-illustration.svg"
            width={420}
            height={300}
            alt=""
          />
          <span className="edu-login-trust">
            <ShieldCheck size={16} />
            Cuidado e conexão em cada etapa.
          </span>
        </div>
        <div className="edu-login-panel">
          <div className="edu-login-mobile-brand">
            <EducaBrand />
          </div>
          <p className="edu-eyebrow">SEU ESPAÇO DE APRENDIZAGEM</p>
          <h2 id="edu-login-title">Que bom te ver aqui!</h2>
          <p className="edu-login-intro">
            Entre para acompanhar suas turmas e continuar de onde parou.
          </p>
          <div className="edu-profile-switch" aria-label="Escolha seu perfil">
            <button
              type="button"
              aria-pressed={perfil === 'aluno'}
              onClick={() => {
                setPerfil('aluno')
                setError('')
              }}
            >
              <GraduationCap size={17} />
              Sou aluno
            </button>
            <button
              type="button"
              aria-pressed={perfil === 'professor'}
              onClick={() => {
                setPerfil('professor')
                setError('')
              }}
            >
              <Users size={17} />
              Sou professor
            </button>
          </div>
          <form onSubmit={submit} className="edu-login-form" aria-label={`Acesso de ${perfil}`}>
            <label className="edu-field" htmlFor="edu-institute">
              <span>Instituto</span>
              <input
                id="edu-institute"
                name="instituto"
                className="input"
                value={institute}
                onChange={(event) => setInstitute(event.target.value)}
                placeholder="Ex.: cidadaodofuturo"
                autoComplete="organization"
                autoCapitalize="none"
                spellCheck={false}
                required
                aria-describedby="edu-institute-help"
              />
              <small id="edu-institute-help" className="edu-field-help">
                Use o identificador informado pela sua instituição.
              </small>
            </label>
            <label className="edu-field" htmlFor="edu-identifier">
              <span>{perfil === 'aluno' ? 'Sua matrícula' : 'Seu e-mail'}</span>
              <input
                key={perfil}
                id="edu-identifier"
                name="identificador"
                type={perfil === 'aluno' ? 'text' : 'email'}
                className="input"
                placeholder={perfil === 'aluno' ? 'Digite sua matrícula' : 'voce@instituto.org.br'}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </label>
            <label className="edu-field" htmlFor="edu-password">
              <span>Sua senha</span>
              <span className="edu-password">
                <input
                  id="edu-password"
                  name="senha"
                  type={showPassword ? 'text' : 'password'}
                  minLength={8}
                  className="input"
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            {error && (
              <p role="alert" className="edu-alert edu-alert-error">
                {error}
              </p>
            )}
            <button disabled={busy} type="submit" className="edu-btn edu-btn-primary">
              {busy ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  Entrando no seu espaço...
                </>
              ) : (
                <>
                  Entrar no Educa
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          <button
            type="button"
            className="edu-login-help"
            aria-expanded={help}
            aria-controls="edu-login-help"
            onClick={() => setHelp((value) => !value)}
          >
            Precisa de ajuda para acessar?
          </button>
          {help && (
            <p id="edu-login-help" className="edu-login-help-text">
              {perfil === 'aluno'
                ? 'Sua matrícula e senha são fornecidas pela instituição.'
                : 'Use o e-mail e a senha cadastrados pelo gestor.'}{' '}
              Esqueceu a senha ou não recebeu seu acesso? Fale com o gestor do seu instituto para
              solicitar novas credenciais.
            </p>
          )}
          <div className="edu-login-footer">
            <span className="flex items-center gap-1">
              <LockKeyhole size={12} />
              Seu acesso é individual
            </span>
            <Link href="/login">
              <School size={13} />
              Acesso da gestão
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
