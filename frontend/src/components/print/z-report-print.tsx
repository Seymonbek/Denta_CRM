import { forwardRef } from 'react'
import { format } from 'date-fns'
import type { CashShift, ShiftPaymentItem, ShiftExpenseItem } from '@/api/hooks/use-cash-shifts'

interface ZReportPrintProps {
  shift: CashShift | null
  payments?: ShiftPaymentItem[]
  expenses?: ShiftExpenseItem[]
}

export const ZReportPrint = forwardRef<HTMLDivElement, ZReportPrintProps>(
  ({ shift, payments = [], expenses = [] }, ref) => {
    if (!shift) return null

    const openedStr = shift.opened_at ? format(new Date(shift.opened_at), 'dd.MM.yyyy HH:mm') : '-'
    const closedStr = shift.closed_at ? format(new Date(shift.closed_at), 'dd.MM.yyyy HH:mm') : 'Hali ochiq'
    const printTimeStr = format(new Date(), 'dd.MM.yyyy HH:mm:ss')

    const startBal = Number(shift.start_balance) || 0
    const cashIn = Number(shift.cash_collected) || 0
    const cardIn = Number(shift.card_collected) || 0
    const totalIn = cashIn + cardIn

    const cashOut = Number(shift.cash_expenses) || 0
    const cardOut = Number(shift.card_expenses) || 0
    const totalOut = cashOut + cardOut

    const expectedCashInHand = startBal + cashIn - cashOut
    const isClosed = shift.status === 'closed'
    const reportTitle = isClosed ? 'KASSA SMENASI Z-HISOBOTI' : 'ORALIK KASSA X-HISOBOTI'

    return (
      <div
        ref={ref}
        className="print-container"
        style={{
          width: '80mm',
          padding: '5mm 4mm',
          margin: '0 auto',
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: '11px',
          lineHeight: '1.4',
          color: '#000',
          backgroundColor: '#fff',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>«DENTA CRM»</h2>
          <p style={{ margin: '1px 0 0', fontSize: '10px' }}>STOMATOLOGIYA KLINIKASI</p>
          <p style={{ margin: '1px 0 0', fontSize: '9px', color: '#333' }}>Toshkent sh., Markaziy filial</p>
          <p style={{ margin: '1px 0 0', fontSize: '9px', color: '#333' }}>STIR: 308912456 | Tel: +998 71 200 00 00</p>
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

        {/* Title */}
        <div style={{ textAlign: 'center', margin: '6px 0' }}>
          <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 'bold' }}>{reportTitle}</h3>
          <p style={{ margin: '1px 0 0', fontSize: '10px' }}>
            SMENA № {shift.id.slice(0, 8).toUpperCase()} ({isClosed ? 'YOPILGAN' : 'OCHIQ'})
          </p>
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

        {/* Metadata */}
        <div style={{ fontSize: '10px', marginBottom: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Kassir / Mas'ul:</span>
            <strong>{shift.admin_name}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Ochilgan:</span>
            <span>{openedStr}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Yopilgan:</span>
            <span>{closedStr}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Chop etildi:</span>
            <span>{printTimeStr}</span>
          </div>
        </div>

        <div style={{ borderBottom: '1px solid #000', margin: '6px 0' }} />

        {/* Financial Summary */}
        <div style={{ fontSize: '11px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span>Boshlang'ich qoldiq:</span>
            <span>{startBal.toLocaleString()} UZS</span>
          </div>

          <div style={{ borderBottom: '1px dashed #ccc', margin: '4px 0' }} />
          <div style={{ fontWeight: 'bold', margin: '2px 0', fontSize: '10px' }}>[+] TUSHUMLAR:</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '6px' }}>
            <span>• Naqd tushum:</span>
            <span>+{cashIn.toLocaleString()} UZS</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '6px' }}>
            <span>• Karta / O'tkazma:</span>
            <span>+{cardIn.toLocaleString()} UZS</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginTop: '2px' }}>
            <span>Jami tushum ({payments.length} ta):</span>
            <span>+{totalIn.toLocaleString()} UZS</span>
          </div>

          <div style={{ borderBottom: '1px dashed #ccc', margin: '4px 0' }} />
          <div style={{ fontWeight: 'bold', margin: '2px 0', fontSize: '10px' }}>[-] CHIQIMLAR:</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '6px' }}>
            <span>• Naqd xarajat:</span>
            <span>-{cashOut.toLocaleString()} UZS</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '6px' }}>
            <span>• Karta xarajat:</span>
            <span>-{cardOut.toLocaleString()} UZS</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginTop: '2px' }}>
            <span>Jami chiqim ({expenses.length} ta):</span>
            <span>-{totalOut.toLocaleString()} UZS</span>
          </div>

          <div style={{ borderBottom: '2px solid #000', margin: '6px 0' }} />
          
          <div style={{ backgroundColor: '#f3f4f6', padding: '4px 6px', borderRadius: '3px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', fontSize: '10px' }}>KASSA NAQD QOLDIG'I:</span>
              <span style={{ fontWeight: 'bold', fontSize: '13px' }}>
                {expectedCashInHand.toLocaleString()} UZS
              </span>
            </div>
            <div style={{ fontSize: '8px', color: '#555', marginTop: '2px' }}>
              (Boshlang'ich + Naqd tushum - Naqd xarajat)
            </div>
          </div>
        </div>

        {/* Transactions summary if any */}
        {payments.length > 0 && (
          <div style={{ marginTop: '8px', fontSize: '9px' }}>
            <div style={{ borderBottom: '1px dashed #000', marginBottom: '4px' }}>
              <strong>TUSHUMLAR RO'YXATI ({payments.length}):</strong>
            </div>
            {payments.slice(0, 15).map((p, idx) => (
              <div key={p.id || idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.patient_name || 'Bemor'}
                </span>
                <span>{Number(p.amount).toLocaleString()} ({p.method === 'cash' ? 'N' : 'K'})</span>
              </div>
            ))}
            {payments.length > 15 && (
              <div style={{ textAlign: 'center', color: '#555', fontSize: '8px' }}>
                ... yana {payments.length - 15} ta to'lov
              </div>
            )}
          </div>
        )}

        {expenses.length > 0 && (
          <div style={{ marginTop: '8px', fontSize: '9px' }}>
            <div style={{ borderBottom: '1px dashed #000', marginBottom: '4px' }}>
              <strong>CHIQIMLAR RO'YXATI ({expenses.length}):</strong>
            </div>
            {expenses.map((e, idx) => (
              <div key={e.id || idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.category_name}: {e.description || '-'}
                </span>
                <span>-{Number(e.amount).toLocaleString()} ({e.payment_method === 'cash' ? 'N' : 'K'})</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderBottom: '1px dashed #000', margin: '10px 0 8px 0' }} />

        {/* Signatures */}
        <div style={{ fontSize: '9px', marginTop: '10px' }}>
          <div style={{ marginBottom: '14px' }}>
            <div>Mas'ul kassir / admin: ____________________</div>
            <div style={{ fontSize: '8px', color: '#666', marginTop: '1px' }}>({shift.admin_name})</div>
          </div>
          <div>
            <div>Bosh shifokor / Nazoratchi: ____________________</div>
            <div style={{ fontSize: '8px', color: '#666', marginTop: '1px' }}>({shift.approved_by || 'Rahbariyat'})</div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '8px', color: '#666' }}>
          *** KASSA SMENASI HISOBOTI TUGADI ***
        </div>
      </div>
    )
  }
)

ZReportPrint.displayName = 'ZReportPrint'
