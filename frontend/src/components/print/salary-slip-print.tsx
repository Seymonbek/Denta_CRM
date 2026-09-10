import { forwardRef } from 'react'
import { format } from 'date-fns'

interface SalarySlipPrintProps {
  doctor: {
    name: string
    specialization?: string
    phone?: string
    rate?: number
    basis?: string
  }
  summary?: {
    totalEarned: number
    totalPaid: number
    balance: number
  }
  items: Array<{
    date: string
    patientName: string
    procedureName: string
    price: number
    rate: number
    amount: number
  }>
}

export const SalarySlipPrint = forwardRef<HTMLDivElement, SalarySlipPrintProps>(
  ({ doctor, summary, items }, ref) => {
    if (!doctor) return null

    const todayStr = format(new Date(), 'dd.MM.yyyy HH:mm')

    return (
      <div
        ref={ref}
        className="print-container"
        style={{
          width: '210mm',
          minHeight: '297mm',
          padding: '15mm 20mm',
          margin: '0 auto',
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
          fontSize: '12px',
          lineHeight: '1.5',
          color: '#111',
          backgroundColor: '#fff',
        }}
      >
        {/* Header */}
        <div style={{ borderBottom: '2px solid #2563eb', paddingBottom: '10px', marginBottom: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#1e40af' }}>
                «DENTA CRM» STOMATOLOGIYA KLINIKASI
              </h1>
              <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#4b5563' }}>
                Toshkent sh., Markaziy filial | Tel: +998 71 200 00 00 | STIR: 308912456
              </p>
            </div>
            <div style={{ textAlign: 'right', fontSize: '11px', color: '#6b7280' }}>
              <p style={{ margin: 0 }}>Chop etilgan sana:</p>
              <p style={{ margin: 0, fontWeight: 'bold', color: '#111' }}>{todayStr}</p>
            </div>
          </div>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
            SHIFOKOR ISH HAQI VA KOMISSIYA HISOB-KITOB VEDOMOSTI
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#6b7280' }}>
            Bajarilgan muolajalar va hisoblangan komissiyalar to'g'risida rasmiy ma'lumotnoma
          </p>
        </div>

        {/* Doctor Info Box */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            padding: '10px 14px',
            marginBottom: '16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
            fontSize: '11px',
          }}
        >
          <div>
            <span style={{ color: '#64748b' }}>Shifokor F.I.Sh: </span>
            <strong style={{ fontSize: '12px', color: '#0f172a' }}>{doctor.name}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>Mutaxassisligi: </span>
            <strong>{doctor.specialization || 'Stomatolog'}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>Telefon raqami: </span>
            <strong>{doctor.phone || '—'}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>Standart komissiya foizi: </span>
            <strong style={{ color: '#16a34a' }}>{doctor.rate ?? 30}%</strong>
            {doctor.basis && (
              <span style={{ color: '#64748b', fontSize: '10px', marginLeft: '6px' }}>
                ({doctor.basis === 'from_total' ? 'Umumiy summadan' : 'Sof daromaddan'})
              </span>
            )}
          </div>
        </div>

        {/* Items Table */}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginBottom: '18px',
            fontSize: '11px',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', width: '30px' }}>№</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', width: '100px' }}>Sana</th>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>Bemor F.I.Sh</th>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>Bajarilgan Muolaja</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', width: '90px' }}>Muolaja Narxi</th>
              <th style={{ padding: '6px 8px', textAlign: 'center', width: '60px' }}>Foiz %</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', width: '100px' }}>Hisoblangan</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '16px', color: '#94a3b8' }}>
                  Ushbu davr uchun komissiya yozuvlari mavjud emas.
                </td>
              </tr>
            ) : (
              items.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '5px 8px', color: '#64748b' }}>{idx + 1}</td>
                  <td style={{ padding: '5px 8px', color: '#475569' }}>{item.date}</td>
                  <td style={{ padding: '5px 8px', fontWeight: '500' }}>{item.patientName}</td>
                  <td style={{ padding: '5px 8px' }}>{item.procedureName}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {item.price.toLocaleString()} so'm
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: '600' }}>
                    {item.rate}%
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>
                    {item.amount.toLocaleString()} so'm
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Financial Summary Box */}
        <div
          style={{
            marginLeft: 'auto',
            width: '280px',
            backgroundColor: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            padding: '10px 14px',
            marginBottom: '28px',
            fontSize: '11px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#64748b' }}>Jami hisoblangan komissiya:</span>
            <strong style={{ fontFamily: 'monospace' }}>
              {(summary?.totalEarned || 0).toLocaleString()} so'm
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#64748b' }}>Ilgari to'langan maosh:</span>
            <span style={{ fontFamily: 'monospace', color: '#16a34a' }}>
              {(summary?.totalPaid || 0).toLocaleString()} so'm
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: '6px',
              borderTop: '1px solid #cbd5e1',
              fontSize: '12px',
            }}
          >
            <strong style={{ color: '#0f172a' }}>Olinmagan qoldiq:</strong>
            <strong style={{ fontFamily: 'monospace', color: '#d97706' }}>
              {(summary?.balance || 0).toLocaleString()} so'm
            </strong>
          </div>
        </div>

        {/* Signatures */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '35px',
            paddingTop: '15px',
            borderTop: '1px dashed #cbd5e1',
            fontSize: '11px',
          }}
        >
          <div style={{ textAlign: 'center', width: '220px' }}>
            <p style={{ margin: 0, fontWeight: 'bold', color: '#334155' }}>Bosh shifokor / Kassir</p>
            <div style={{ height: '40px' }} />
            <div style={{ borderBottom: '1px solid #94a3b8', margin: '0 10px 4px' }} />
            <span style={{ fontSize: '10px', color: '#64748b' }}>(imzo, muhr)</span>
          </div>

          <div style={{ textAlign: 'center', width: '220px' }}>
            <p style={{ margin: 0, fontWeight: 'bold', color: '#334155' }}>Shifokor</p>
            <div style={{ height: '40px' }} />
            <div style={{ borderBottom: '1px solid #94a3b8', margin: '0 10px 4px' }} />
            <span style={{ fontSize: '10px', color: '#64748b' }}>{doctor.name} (imzo)</span>
          </div>
        </div>
      </div>
    )
  }
)

SalarySlipPrint.displayName = 'SalarySlipPrint'
