import { forwardRef } from 'react'
import { format } from 'date-fns'

interface PrescriptionPrintProps {
  prescription: Record<string, unknown>
}

export const PrescriptionPrint = forwardRef<HTMLDivElement, PrescriptionPrintProps>(
  ({ prescription }, ref) => {
    // Extracting data safely
    const content = String(prescription.content || '')
    const createdAtStr = String(prescription.createdAt || prescription.created_at || new Date().toISOString())
    const receiptDate = format(new Date(createdAtStr), 'dd.MM.yyyy HH:mm')
    
    // Extract Patient Info
    const treatment = prescription.treatment as Record<string, unknown> | undefined
    const patientObj = treatment?.patient as Record<string, unknown> | undefined
    const patientName = patientObj 
      ? `${patientObj.firstName || patientObj.first_name || ''} ${patientObj.lastName || patientObj.last_name || ''}`.trim()
      : 'Noma\'lum bemor'
    
    const dob = patientObj?.dateOfBirth || patientObj?.date_of_birth
    const patientDob = dob ? format(new Date(String(dob)), 'dd.MM.yyyy') : '-'
    
    // Extract Doctor Info
    const doctorObj = prescription.doctor as Record<string, unknown> | undefined
    const doctorUser = doctorObj?.user as Record<string, unknown> | undefined
    const doctorName = doctorUser
      ? `${doctorUser.firstName || doctorUser.first_name || ''} ${doctorUser.lastName || doctorUser.last_name || ''}`.trim()
      : (doctorObj?.fullName || doctorObj?.name || 'Noma\'lum shifokor')

    const doctorSpec = doctorObj?.specialization || 'Stomatolog'

    return (
      <div 
        ref={ref} 
        className="print-container"
        style={{
          width: '210mm', // A4 width
          minHeight: '297mm', // A4 height
          padding: '20mm',
          margin: '0 auto',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#000',
          backgroundColor: '#fff',
        }}
      >
        {/* Header Section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #2563eb', paddingBottom: '20px', marginBottom: '30px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '28px', color: '#1e3a8a', fontWeight: '900', letterSpacing: '-0.5px' }}>DENTA CRM</h1>
            <p style={{ margin: '5px 0 0', fontSize: '14px', color: '#64748b', fontWeight: '500' }}>Zamonaviy Stomatologiya Klinikasi</p>
          </div>
          <div style={{ textAlign: 'right', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
            <p style={{ margin: 0 }}>Toshkent shahar, Yunusobod tumani</p>
            <p style={{ margin: 0 }}>Tel: +998 90 123 45 67</p>
            <p style={{ margin: 0 }}>Veb-sayt: www.dentacrm.uz</p>
          </div>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '2px' }}>Tibbiy Retsept</h2>
          <p style={{ margin: '5px 0 0', fontSize: '13px', color: '#64748b' }}>Sana: {receiptDate}</p>
        </div>

        {/* Patient & Doctor Info Box */}
        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', marginBottom: '30px', backgroundColor: '#f8fafc' }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '14px', color: '#64748b', textTransform: 'uppercase' }}>Bemor Ma'lumotlari</h3>
            <p style={{ margin: '0 0 5px', fontSize: '15px' }}><strong>F.I.O:</strong> {patientName}</p>
            <p style={{ margin: 0, fontSize: '15px' }}><strong>Tug'ilgan sanasi:</strong> {patientDob}</p>
          </div>
          <div style={{ flex: 1, borderLeft: '1px solid #e2e8f0', paddingLeft: '20px' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '14px', color: '#64748b', textTransform: 'uppercase' }}>Shifokor Ma'lumotlari</h3>
            <p style={{ margin: '0 0 5px', fontSize: '15px' }}><strong>F.I.O:</strong> Dr. {String(doctorName)}</p>
            <p style={{ margin: 0, fontSize: '15px' }}><strong>Mutaxassislik:</strong> {String(doctorSpec)}</p>
          </div>
        </div>

        {/* Prescription Content */}
        <div style={{ minHeight: '300px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <span style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'serif', color: '#1e3a8a' }}>Rp:</span>
          </div>
          
          <div 
            style={{ 
              fontSize: '15px', 
              lineHeight: '1.8', 
              whiteSpace: 'pre-wrap',
              paddingLeft: '40px'
            }}
          >
            {content}
          </div>
        </div>

        {/* Footer & Signature */}
        <div style={{ marginTop: '50px', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ textAlign: 'center', width: '250px' }}>
            <div style={{ borderBottom: '1px solid #000', marginBottom: '10px', height: '40px' }}></div>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Shifokor imzosi / Muhr</p>
          </div>
        </div>

        <style>
          {`
            @media print {
              @page {
                size: A4;
                margin: 0;
              }
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                background-color: white !important;
              }
              .print-container {
                width: 100% !important;
                min-height: 100% !important;
                padding: 15mm !important;
                margin: 0 !important;
                box-shadow: none !important;
              }
            }
          `}
        </style>
      </div>
    )
  }
)
PrescriptionPrint.displayName = 'PrescriptionPrint'
