import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { ProjectManagementService } from './project-management.service'
import { PrismaService } from '../prisma/prisma.service'

describe('ProjectManagementService', () => {
  const projectId = 'project-1'
  const tenantId = 'tenant-1'
  const studentId = 'student-1'

  it('allows the same student in another project while blocking duplicate links in this project', async () => {
    const prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: projectId }) },
      beneficiary: { findFirst: jest.fn().mockResolvedValue({ id: studentId }) },
      beneficiarioProjeto: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'link-1', status: 'ATIVO' }),
        upsert: jest.fn().mockResolvedValue({ id: 'link-1', project_id: projectId }),
      },
    }
    const service = new ProjectManagementService(prisma as unknown as PrismaService)
    await expect(service.linkStudent(tenantId, projectId, studentId)).resolves.toMatchObject({ project_id: projectId })
    expect(prisma.beneficiarioProjeto.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { beneficiary_id_project_id: { beneficiary_id: studentId, project_id: projectId } },
    }))
    await expect(service.linkStudent(tenantId, projectId, studentId)).rejects.toBeInstanceOf(ConflictException)
  })

  it('does not link a student from another tenant', async () => {
    const prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: projectId }) },
      beneficiary: { findFirst: jest.fn().mockResolvedValue(null) },
      beneficiarioProjeto: { upsert: jest.fn() },
    }
    const service = new ProjectManagementService(prisma as unknown as PrismaService)
    await expect(service.linkStudent(tenantId, projectId, studentId)).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.beneficiary.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenant_id: tenantId }) }))
    expect(prisma.beneficiarioProjeto.upsert).not.toHaveBeenCalled()
  })

  it('rejects attendance with an enrollment outside the selected class', async () => {
    const prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: projectId }) },
      turma: { findFirst: jest.fn().mockResolvedValue({ id: 'class-1' }) },
      matricula: { count: jest.fn().mockResolvedValue(0) },
      presenca: { upsert: jest.fn() },
      $transaction: jest.fn(),
    }
    const service = new ProjectManagementService(prisma as unknown as PrismaService)
    await expect(service.saveAttendance(tenantId, projectId, 'class-1', { data: '2026-10-14', presencas: [{ matricula_id: 'outside', presente: true }] })).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.presenca.upsert).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
