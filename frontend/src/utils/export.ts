import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface ExportColumn {
  header: string
  key: string
  width?: number
}

/**
 * Ma'lumotlarni jadvalli Excel faylida eksport qiladi.
 * @param data Obyektlar massivi
 * @param columns Ustunlar konfiguratsiyasi
 * @param filename Fayl nomi (.xlsx bo'lishi kerak)
 */
export const exportToExcel = (
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  filename: string
) => {
  // Data transform
  const worksheetData = data.map((item) => {
    const row: Record<string, unknown> = {}
    columns.forEach((col) => {
      row[col.header] = item[col.key] ?? ''
    })
    return row
  })

  // Worksheet yaratish
  const worksheet = XLSX.utils.json_to_sheet(worksheetData)

  // Ustunlar kengligini o'rnatish
  worksheet['!cols'] = columns.map((col) => ({
    wch: col.width || 15,
  }))

  // Workbook yaratish va unga sheetni qo'shish
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Hisobot')

  // Faylni yuklab olish
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

/**
 * Ma'lumotlarni PDF formatida jadval ko'rinishida eksport qiladi.
 * @param data Obyektlar massivi
 * @param columns Ustunlar konfiguratsiyasi
 * @param title Hujjat sarlavhasi (ichida Denta CRM yozuvi ham chiqadi)
 * @param filename Fayl nomi (.pdf bo'lishi kerak)
 */
export const exportToPDF = (
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  title: string,
  filename: string
) => {
  const doc = new jsPDF()

  // Denta CRM sarlavhasi
  doc.setFontSize(20)
  doc.setTextColor(41, 128, 185) // Primary ko'k rang
  doc.text('Denta CRM Hisoboti', 14, 22)

  // Sub sarlavha
  doc.setFontSize(14)
  doc.setTextColor(50, 50, 50)
  doc.text(title, 14, 32)

  // Sana
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`Chop etilgan sana: ${new Date().toLocaleString()}`, 14, 40)

  // Jadval uchun ma'lumotlarni tayyorlash
  const tableHeaders = columns.map((col) => col.header)
  const tableData = data.map((item) =>
    columns.map((col) => (item[col.key] !== undefined && item[col.key] !== null ? String(item[col.key]) : ''))
  )

  autoTable(doc, {
    startY: 45,
    head: [tableHeaders],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 10,
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
  })

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}
