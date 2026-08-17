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
    const pMethod = String(payment.paymentMethod || payment.payment_method || '')
    const amount = Number(payment.amount || 0).toLocaleString()
    const pPatient = payment.patient as Record<string, unknown> | undefined
    const patientName = String(payment.patientName || payment.patient_name || (pPatient ? `${pPatient.firstName || ''} ${pPatient.lastName || ''}`.trim() : 'Bemor'))
    const dateStr = payment.createdAt || payment.created_at || new Date().toISOString()
    const receiptDate = format(new Date(String(dateStr)), 'dd.MM.yyyy HH:mm')
    const receiptNo = payment.id ? String(payment.id).slice(0, 8).toUpperCase() : 'N/A'

    return (
      <div 
        ref={ref} 
        className="print-container"
        style={{
          width: '80mm', // Thermal printer width
          padding: '4mm',
          margin: '0 auto',
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#000',
          backgroundColor: '#fff',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>DENTA CRM</h2>
          <p style={{ margin: '2px 0 0', fontSize: '10px' }}>Stomatologiya Klinikasi</p>
          <p style={{ margin: '2px 0 0', fontSize: '10px' }}>Manzil: Toshkent shahar</p>
          <p style={{ margin: '2px 0 0', fontSize: '10px' }}>Tel: +998 90 123 45 67</p>
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }} />

        {/* Info */}
        <div style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Chek raqami:</span>
            <span>#{receiptNo}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Sana:</span>
            <span>{receiptDate}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Bemor:</span>
            <span style={{ fontWeight: 'bold' }}>{patientName}</span>
          </div>
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }} />

        {/* Payment Details */}
        <div style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontWeight: 'bold' }}>Jami to'lov:</span>
            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{amount} so'm</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>To'lov usuli:</span>
            <span>{METHOD_LABELS[pMethod] || pMethod}</span>
          </div>
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }} />

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '15px' }}>
          <p style={{ margin: 0, fontWeight: 'bold' }}>Tashrifingiz uchun rahmat!</p>
          <p style={{ margin: '4px 0 0', fontSize: '10px' }}>Sizga sog'lik tilaymiz</p>
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
                padding: 2mm !important;
              }
            }
          `}
        </style>
      </div>
    )
  }
)
ReceiptPrint.displayName = 'ReceiptPrint'
