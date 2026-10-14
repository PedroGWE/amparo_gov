import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

const schema = z.object({
  tenantSlug: z.string().trim().min(2, 'Informe a organização'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const { login } = useAuth()
  const [serverError, setServerError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setServerError('')
    try {
      await login(data.email, data.password, data.tenantSlug)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Erro ao fazer login. Verifique suas credenciais.'
      setServerError(msg)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top_left,_#ECF2FA,_#F5F8FC_55%)] px-4 py-10">
      <div className="card w-full max-w-md overflow-hidden p-0 shadow-[0_18px_50px_rgb(20_47_84/0.12)]">
        <div className="border-b border-[#D5DEEA] bg-white px-8 pb-6 pt-7 text-center">
          <Image src="/amparo/logo-principal.png" alt="Amparo GOV" width={2180} height={721} priority className="mx-auto h-auto w-[250px]" />
          <p className="mt-1 text-sm font-semibold tracking-wide text-brand-700">Gestão que cuida.</p>
        </div>

        <div className="px-6 py-7 sm:px-8">
          <h1 className="mb-2 text-2xl font-bold text-brand-900">Entrar na plataforma</h1>
          <p className="mb-6 text-sm text-[#516176]">Acesse a gestão da sua organização com segurança.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="tenantSlug" className="label">Organização</label>
              <input id="tenantSlug" className="input" placeholder="ex: instituto-exemplo" {...register('tenantSlug')} />
              {errors.tenantSlug && <p className="mt-1 text-xs text-red-600">{errors.tenantSlug.message}</p>}
            </div>
            <div>
              <label htmlFor="email" className="label">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="seu@email.com"
                {...register('email')}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="label">
                Senha
              </label>
              <input
                id="password"
                type="password"
                className="input"
                placeholder="••••••••"
                {...register('password')}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {serverError}
              </div>
            )}

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full mt-2">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>
          <Link href="/educa" className="block text-center mt-5 text-sm text-brand-700">Professor ou aluno? Acesse o Educa Amparo Gov</Link>
        </div>
      </div>
    </div>
  )
}
