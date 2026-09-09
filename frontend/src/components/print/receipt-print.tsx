import { forwardRef } from 'react'
import { format } from 'date-fns'
import { type PaymentMethod } from '@/types/api'

interface ReceiptPrintProps {
  payment: any
}

const METHOD_LABELS: Record<PaymentMethod | string, string> = {
  cash: 'Naqd Pul',
  card: 'Terminal (Karta)',
  payme: 'Payme',
  click: 'Click',
  bank_transfer: "Bank o'tkazmasi",
}

export const ReceiptPrint = forwardRef<HTMLDivElement, ReceiptPrintProps>(
  ({ payment }, ref) => {
    if (!payment) return null

    const pMethod = String(payment.method || payment.paymentMethod || payment.payment_method || '')
    const amount = Number(payment.amount || 0).toLocaleString()
    const pPatient = payment.patient as Record<string, unknown> | undefined
    const patientName = String(
      payment.patientName ||
      payment.patient_name ||
      (pPatient ? `${pPatient.firstName || ''} ${pPatient.lastName || ''}`.trim() : 'Bemor')
    )
    const doctorName = String(payment.doctorName || payment.doctor_name || (payment.treatment?.doctorName) || '')
    const procedureName = String(payment.procedureName || payment.procedure_name || (payment.treatment?.procedureTypeName) || '')
    const diagnosis = String(payment.diagnosis || payment.treatment?.diagnosis || '')
    const dateStr = payment.createdAt || payment.created_at || new Date().toISOString()
    const receiptDate = format(new Date(String(dateStr)), 'dd.MM.yyyy HH:mm:ss')
    const receiptNo = payment.id ? String(payment.id).slice(0, 8).toUpperCase() : 'N/A'
    const cashierName = payment.receivedBy
      ? `${payment.receivedBy.firstName || ''} ${payment.receivedBy.lastName || ''}`.trim()
      : 'Kassir'

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
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', letterSpacing: '1px' }}>«DENTA CRM»</h2>
          <p style={{ margin: '2px 0 0', fontSize: '10px', textTransform: 'uppercase' }}>Stomatologiya Markazi</p>
          <p style={{ margin: '1px 0 0', fontSize: '9px', color: '#333' }}>STIR: 308912456 | Tel: +998 71 200 00 00</p>
          <p style={{ margin: '1px 0 0', fontSize: '9px', color: '#333' }}>Toshkent sh., Markaziy filial</p>
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />

        {/* Info */}
        <div style={{ fontSize: '10px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span>Chek №:</span>
            <span style={{ fontWeight: 'bold' }}>#{receiptNo}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span>Sana / Vaqt:</span>
            <span>{receiptDate}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span>Kassir:</span>
            <span>{cashierName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span>Bemor:</span>
            <span style={{ fontWeight: 'bold' }}>{patientName}</span>
          </div>
          {doctorName && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Shifokor:</span>
              <span>{doctorName}</span>
            </div>
          )}
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />

        {/* Services & Treatment */}
        {(procedureName || diagnosis) && (
          <div style={{ marginBottom: '8px', fontSize: '10px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>Ko'rsatilgan Xizmat:</div>
            {procedureName && <div>• {procedureName}</div>}
            {diagnosis && <div style={{ color: '#444', fontSize: '9px' }}>Tashxis: {diagnosis}</div>}
            <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />
          </div>
        )}

        {/* Payment Details */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
            <span style={{ fontWeight: 'bold', fontSize: '12px' }}>JAMI TO'LOV:</span>
            <span style={{ fontWeight: 'bold', fontSize: '15px' }}>{amount} so'm</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
            <span>To'lov usuli:</span>
            <span style={{ fontWeight: 'bold' }}>{METHOD_LABELS[pMethod] || pMethod || 'Naqd'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginTop: '2px' }}>
            <span>Holati:</span>
            <span style={{ fontWeight: 'bold' }}>Muvaffaqiyatli to'landi</span>
          </div>
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />

        {/* Fiscal & QR Block */}
        <div style={{ textAlign: 'center', margin: '10px 0', fontSize: '9px' }}>
          <div style={{ 
            border: '1px solid #000', 
            padding: '4px', 
            display: 'inline-block',
            fontWeight: 'bold',
            letterSpacing: '1px',
            marginBottom: '4px'
          }}>
            [ FISKAL CHEK #{receiptNo} ]
          </div>
          <p style={{ margin: '2px 0 0' }}>Tashrifingiz uchun minnatdormiz!</p>
          <p style={{ margin: '1px 0 0' }}>Tabassumingiz — bizning yutug'imiz 😊</p>
        </div>

        <style>
          {`
            @media print {
              @page {
                margin: 0;
                size: 80mm auto;
              }
              body {
                margin: 0;
                padding: 0;
              }
              .print-container {
                width: 100% !important;
                padding: 2mm 3mm !important;
              }
            }
          `}
        </style>
      </div>
    )
  }
)
ReceiptPrint.displayName = 'ReceiptPrint'

