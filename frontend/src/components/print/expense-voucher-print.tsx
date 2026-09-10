import { forwardRef } from 'react'
import { format } from 'date-fns'

interface ExpenseVoucherPrintProps {
  expense: {
    id: string
    category_name?: string
    amount: string | number
    description?: string
    date: string
    payment_method?: string
    recorded_by_name?: string
  } | null
}

export const ExpenseVoucherPrint = forwardRef<HTMLDivElement, ExpenseVoucherPrintProps>(
  ({ expense }, ref) => {
    if (!expense) return null

    const expenseDate = expense.date ? new Date(expense.date) : new Date()
    const formattedDate = format(expenseDate, 'dd.MM.yyyy HH:mm')
    const numAmount = Number(expense.amount) || 0
    const methodText = expense.payment_method === 'cash' ? 'Naqd pul (Kassa)' : 'Bank kartasi / O\'tkazma'

    return (
      <div
        ref={ref}
        className="print-container"
        style={{
          width: '210mm',
          minHeight: '148mm', // A5 landscape or half A4
          padding: '12mm 16mm',
          margin: '0 auto',
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
          fontSize: '12px',
          lineHeight: '1.5',
          color: '#111',
          backgroundColor: '#fff',
        }}
      >
        {/* Header */}
        <div style={{ borderBottom: '2px solid #dc2626', paddingBottom: '8px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#991b1b' }}>
                «DENTA CRM» STOMATOLOGIYA KLINIKASI
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: '10px', color: '#4b5563' }}>
                Toshkent sh., Markaziy filial | Tel: +998 71 200 00 00 | STIR: 308912456
              </p>
            </div>
            <div style={{ textAlign: 'right', fontSize: '10px', color: '#6b7280' }}>
              <p style={{ margin: 0 }}>Hujjat shakli: <strong>KO-2 (Chiqim kassa orderi)</strong></p>
              <p style={{ margin: '2px 0 0' }}>Chop etilgan: <strong>{format(new Date(), 'dd.MM.yyyy HH:mm')}</strong></p>
            </div>
          </div>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '14px' }}>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
            CHIQIM KASSA ORDERI (XARAJAT KVITANSIYASI) № {String(expense.id).slice(-8).toUpperCase()}
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#4b5563' }}>
            Operatsion xarajat tasdiqlovchi rasmiy kassa vaucheri
          </p>
        </div>

        {/* Details Table */}
        <div style={{ marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '6px 8px', color: '#6b7280', width: '30%' }}>Operatsiya sanasi va vaqti:</td>
                <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#111' }}>{formattedDate}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '6px 8px', color: '#6b7280' }}>Xarajat toifasi:</td>
                <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#1e40af' }}>
                  {expense.category_name || 'Umumiy xarajat'}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '6px 8px', color: '#6b7280' }}>To'lov manbai / usuli:</td>
                <td style={{ padding: '6px 8px', fontWeight: '600' }}>{methodText}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '6px 8px', color: '#6b7280' }}>Mas'ul shaxs (Kiritdi):</td>
                <td style={{ padding: '6px 8px', fontWeight: '600' }}>{expense.recorded_by_name || 'Administrator'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '6px 8px', color: '#6b7280' }}>Xarajat maqsadi / Izoh:</td>
                <td style={{ padding: '6px 8px' }}>{expense.description || 'Izoh ko\'rsatilmagan'}</td>
              </tr>
              <tr style={{ backgroundColor: '#fef2f2', borderBottom: '2px solid #ef4444' }}>
                <td style={{ padding: '10px 8px', color: '#991b1b', fontWeight: 'bold', fontSize: '12px' }}>
                  Chiqim summasi:
                </td>
                <td style={{ padding: '10px 8px', fontWeight: 'bold', fontSize: '15px', color: '#dc2626' }}>
                  {numAmount.toLocaleString()} UZS
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Notes */}
        <div style={{ backgroundColor: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: '4px', padding: '8px 12px', marginBottom: '24px', fontSize: '10px', color: '#4b5563' }}>
          <p style={{ margin: 0 }}>
            * Ushbu chiqim kassa orderi buxgalteriya hisobida moddiy xarajat sifatida aks ettiriladi va kassa hisoboti bilan birga saqlanadi.
          </p>
        </div>

        {/* Signatures */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '20px', paddingTop: '10px', borderTop: '1px solid #e5e7eb' }}>
          <div>
            <p style={{ margin: '0 0 25px 0', fontSize: '10px', color: '#6b7280' }}>Bosh shifokor / Rahbar:</p>
            <div style={{ borderBottom: '1px solid #333', width: '85%' }}></div>
            <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#9ca3af' }}>(imzo va F.I.Sh.)</p>
          </div>
          <div>
            <p style={{ margin: '0 0 25px 0', fontSize: '10px', color: '#6b7280' }}>Kassir / Mas'ul:</p>
            <div style={{ borderBottom: '1px solid #333', width: '85%' }}></div>
            <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#9ca3af' }}>(imzo va F.I.Sh.)</p>
          </div>
          <div>
            <p style={{ margin: '0 0 25px 0', fontSize: '10px', color: '#6b7280' }}>Qabul qildi / Puldor:</p>
            <div style={{ borderBottom: '1px solid #333', width: '85%' }}></div>
            <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#9ca3af' }}>(imzo va F.I.Sh.)</p>
          </div>
        </div>

        {/* Stamp place */}
        <div style={{ textAlign: 'right', marginTop: '12px' }}>
          <span style={{ display: 'inline-block', border: '1px dashed #9ca3af', borderRadius: '50%', width: '50px', height: '50px', lineHeight: '50px', textAlign: 'center', fontSize: '10px', color: '#9ca3af' }}>
            M.O'.
          </span>
        </div>
      </div>
    )
  }
)

ExpenseVoucherPrint.displayName = 'ExpenseVoucherPrint'
