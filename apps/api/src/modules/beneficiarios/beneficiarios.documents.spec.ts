import { BeneficiariosService } from './beneficiarios.service'

describe('Beneficiary attachments', () => {
  it('restricts downloads to the selected beneficiary and organization', async () => {
    const document = { file_url: 'tenant-1/student.pdf', name: 'Aluno.pdf', mime_type: 'application/pdf' }
    const prisma = { document: { findFirst: jest.fn().mockResolvedValue(document) } }
    const result = await new BeneficiariosService(prisma as never).getDocument('tenant-1', 'student-1', 'doc-1')
    expect(result).toEqual(document)
    expect(prisma.document.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'doc-1', tenant_id: 'tenant-1', beneficiary_id: 'student-1', deleted_at: null, beneficiary: { tenant_id: 'tenant-1', deleted_at: null } },
    }))
  })

  it('does not disclose missing or out-of-scope attachments', async () => {
    const prisma = { document: { findFirst: jest.fn().mockResolvedValue(null) } }
    await expect(new BeneficiariosService(prisma as never).getDocument('tenant-1', 'student-1', 'foreign-doc')).rejects.toThrow('Anexo não encontrado')
  })

  it('includes attachment names in the beneficiary profile without exposing storage paths', async () => {
    const prisma = { beneficiary: { findFirst: jest.fn().mockResolvedValue({ id: 'student-1', documents: [] }) } }
    await new BeneficiariosService(prisma as never).findOne('tenant-1', 'student-1')
    expect(prisma.beneficiary.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'student-1', tenant_id: 'tenant-1', deleted_at: null },
      include: expect.objectContaining({ documents: {
        where: { tenant_id: 'tenant-1', deleted_at: null },
        select: { id: true, name: true, mime_type: true, created_at: true },
        orderBy: { created_at: 'desc' },
      } }),
    }))
  })
})
