import type { BeneficiarioProfileInvite } from '@/services/beneficiarios'

export type BeneficiaryLinkRow = BeneficiarioProfileInvite & { url: string }

export async function downloadBeneficiaryLinksDocx(rows: BeneficiaryLinkRow[]) {
  if (!rows.length) return
  const { Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx')
  const expiry = new Date(rows[0].expires_at).toLocaleDateString('pt-BR')

  const docxFile = new Document({
    creator: 'Amparo GOV',
    title: 'Lista de links para completar o cadastro dos beneficiários',
    sections: [{
      properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
      children: [
        new Paragraph({
          heading: HeadingLevel.TITLE,
          spacing: { after: 260 },
          children: [new TextRun({ text: 'Lista de links para completar o cadastro', bold: true, color: '000000', size: 32 })],
        }),
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: `${rows.length} beneficiário${rows.length === 1 ? '' : 's'}  |  Válido até ${expiry}`, color: '000000', size: 20 })],
        }),
        new Paragraph({
          spacing: { after: 320 },
          children: [new TextRun({ text: 'Cada link é individual e pode ser usado uma vez. Entregue apenas ao beneficiário ou responsável correspondente.', color: '404040', size: 19 })],
        }),
        ...rows.flatMap((row, index) => [
          new Paragraph({
            keepNext: true,
            spacing: { before: index ? 200 : 0, after: 50 },
            children: [new TextRun({ text: `${index + 1}. ${row.name}`, bold: true, color: '000000', size: 21 })],
          }),
          new Paragraph({
            keepNext: true,
            spacing: { after: 50 },
            children: [new TextRun({ text: `ID: ${row.id}`, color: '404040', size: 17 })],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: 'Link: ', color: '404040', size: 17 }),
              new ExternalHyperlink({
                link: row.url,
                children: [new TextRun({ text: row.url, color: '1261A0', underline: { color: '1261A0' }, size: 17 })],
              }),
            ],
          }),
        ]),
      ],
    }],
  })

  const blob = await Packer.toBlob(docxFile)
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = 'links_cadastro_beneficiarios.docx'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
