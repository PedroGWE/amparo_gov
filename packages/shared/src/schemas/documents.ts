import { z } from 'zod'

// ============================================================
// Documentos Institucionais (repositório do tenant)
// ============================================================

export const DOCUMENT_ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const
export const DOCUMENT_ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png,.doc,.docx'
export const DOCUMENT_FORMAT_LABEL = 'PDF, JPG, PNG, DOC ou DOCX'
export const DOCUMENT_MAX_SIZE_MB = 20
export const DOCUMENT_MAX_SIZE_BYTES = DOCUMENT_MAX_SIZE_MB * 1024 * 1024

export const createInstitutionalDocTypeSchema = z.object({
  name: z
    .string()
    .trim()
    .transform((name) => name.replace(/\s+/g, ' '))
    .pipe(
      z.string().min(1, 'Informe o nome do tipo de documento.').max(150, 'Use até 150 caracteres.'),
    ),
})
export type CreateInstitutionalDocTypeInput = z.infer<typeof createInstitutionalDocTypeSchema>

export const institutionalDocStatusSchema = z.enum(['PENDENTE', 'VALIDO', 'VENCIDO'])
export type InstitutionalDocStatus = z.infer<typeof institutionalDocStatusSchema>

export const uploadInstitutionalDocSchema = z.object({
  // multipart envia campos como string; aceita '' como ausente
  valid_until: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .optional()
    .refine((v) => v === undefined || !Number.isNaN(Date.parse(v)), {
      message: 'Data de validade inválida',
    }),
})
export type UploadInstitutionalDocInput = z.infer<typeof uploadInstitutionalDocSchema>

export const queryInstitutionalDocsSchema = z.object({
  status: institutionalDocStatusSchema.optional(),
  category_id: z.string().optional(),
})
export type QueryInstitutionalDocsInput = z.infer<typeof queryInstitutionalDocsSchema>

export function isAllowedDocumentMime(mime: string): boolean {
  return (DOCUMENT_ALLOWED_MIMES as readonly string[]).includes(mime)
}
