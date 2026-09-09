import { forwardRef } from 'react'
import { format } from 'date-fns'
import { type Patient, type ToothRecord, type Treatment } from '@/types/api'

interface DentalRecord025Props {
  patient: Patient
  toothRecords?: ToothRecord[]
  treatments?: Treatment[]
}

const ADULT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const ADULT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]

const PRIMARY_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65]
const PRIMARY_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75]

const PROCEDURE_CODES: Record<string, string> = {
  filling: 'Pl',
  root_canal: 'Pt',
  extraction: 'R',
  crown: 'K',
  implant: 'I',
  cleaning: 'G',
  whitening: 'Oq',
  other: 'B',
}

const STATUS_LETTERS: Record<string, string> = {
  healthy: 'S',
  treated: 'D',
  planned: 'R',
  missing: 'X',
}

export const DentalRecord025 = forwardRef<HTMLDivElement, DentalRecord025Props>(
  ({ patient, toothRecords = [], treatments = [] }, ref) => {
    const todayStr = format(new Date(), 'dd.MM.yyyy')
    const birthDateStr = patient.birthDate
      ? format(new Date(patient.birthDate), 'dd.MM.yyyy')
      : '-'

    // Lookup map for teeth
    const toothMap = new Map<number, ToothRecord>()
    toothRecords.forEach((tr) => {
      toothMap.set(tr.toothNumber, tr)
    })

    const getToothDisplay = (num: number) => {
      const rec = toothMap.get(num)
      if (!rec) {
        return { code: 'S', surfaces: '', isRecorded: false }
      }
      const procCode = rec.procedure ? PROCEDURE_CODES[rec.procedure] : undefined
      const statusCode = rec.status ? STATUS_LETTERS[rec.status] : undefined
      const code = procCode || statusCode || 'Pl'
      const surfaces = Array.isArray(rec.surfaces) ? rec.surfaces.join('') : ''
      return { code, surfaces, isRecorded: true }
    }

    return (
      <div
        ref={ref}
        className='print-dental-record bg-white text-black p-8 max-w-[210mm] mx-auto text-xs leading-relaxed font-sans'
        style={{
          color: '#000',
          backgroundColor: '#fff',
        }}
      >
        {/* Official Header */}
        <div className='flex justify-between items-start border-b-2 border-black pb-3 mb-4'>
          <div>
            <div className='text-[10px] font-semibold uppercase tracking-wider text-gray-600'>
              O'zbekiston Respublikasi Sog'liqni Saqlash Vazirligi
            </div>
            <div className='text-sm font-bold uppercase mt-0.5'>
              «Denta CRM» Stomatologiya Klinikasi
            </div>
          </div>
          <div className='text-right'>
            <div className='border border-black px-2 py-0.5 text-[10px] font-mono font-bold inline-block'>
              025/h SHAKLI
            </div>
            <div className='text-[10px] text-gray-500 mt-1'>
              Tasdiqlangan tibbiy hujjat
            </div>
          </div>
        </div>

        {/* Title */}
        <div className='text-center my-3'>
          <h1 className='text-base font-black uppercase tracking-wide'>
            Stomatologik Bemorning Ambulatoriya Tibbiy Kartasi № {patient.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className='text-[11px] text-gray-600 mt-0.5'>
            To'ldirilgan sana: {todayStr}
          </p>
        </div>

        {/* Patient Personal Data Section */}
        <div className='border border-black p-3 mb-4 space-y-2 rounded-none'>
          <div className='font-bold text-xs uppercase border-b border-gray-400 pb-1'>
            I. Bemor Haqida Umumiy Ma'lumotlar
          </div>
          <div className='grid grid-cols-2 gap-x-4 gap-y-1.5 pt-1 text-[11px]'>
            <div>
              <span className='font-semibold'>F.I.Sh:</span>{' '}
              <span className='font-bold uppercase text-xs'>
                {patient.lastName} {patient.firstName}
              </span>
            </div>
            <div>
              <span className='font-semibold'>Jinsi:</span>{' '}
              <span>{patient.gender === 'male' ? 'Erkak' : patient.gender === 'female' ? 'Ayol' : "Ko'rsatilmagan"}</span>
            </div>
            <div>
              <span className='font-semibold'>Tug'ilgan sana / Yoshi:</span>{' '}
              <span>{birthDateStr} {patient.age ? `(${patient.age} yosh)` : ''}</span>
            </div>
            <div>
              <span className='font-semibold'>Telefon:</span>{' '}
              <span className='font-mono'>{patient.phoneNumber}</span>
            </div>
            <div className='col-span-2'>
              <span className='font-semibold'>Yashash manzili:</span>{' '}
              <span>{patient.address || "Ko'rsatilmagan"}</span>
            </div>
            <div>
              <span className='font-semibold'>Qon guruhi:</span>{' '}
              <span className='font-mono font-bold'>{patient.bloodGroup || "Noma'lum"}</span>
            </div>
            <div>
              <span className='font-semibold'>Klinikaga kelgan sana:</span>{' '}
              <span>{patient.createdAt ? format(new Date(patient.createdAt), 'dd.MM.yyyy') : todayStr}</span>
            </div>
          </div>

          {/* Allergies & Warnings Banner */}
          {patient.allergies && (
            <div className='border border-black bg-gray-100 p-2 mt-2'>
              <span className='font-black text-black uppercase tracking-wider text-[10px] block'>
                ⚠️ DIQQAT! Dori vositalariga allergik ta'sirchanlik:
              </span>
              <div className='font-bold text-black mt-0.5 text-[11px]'>
                {patient.allergies}
              </div>
            </div>
          )}

          {patient.notes && (
            <div className='text-[10px] text-gray-700 italic pt-1'>
              <span className='font-semibold'>Qo'shimcha anamnez:</span> {patient.notes}
            </div>
          )}
        </div>

        {/* Odontogram Chart Section */}
        <div className='border border-black p-3 mb-4 rounded-none'>
          <div className='font-bold text-xs uppercase border-b border-gray-400 pb-1 mb-2'>
            II. Tishlar Formulasi (Odontogram / FDI)
          </div>

          {/* Adult Teeth Table */}
          <div className='overflow-x-auto mb-3'>
            <div className='text-[10px] font-bold text-gray-700 mb-1 text-center uppercase'>
              Doimiy Tishlar Formulasi (Kattalar - 32 ta tish)
            </div>
            <table className='w-full text-center border-collapse border border-black text-[9px]'>
              <tbody>
                {/* Upper Teeth Numbers */}
                <tr className='bg-gray-100 font-bold border-b border-black'>
                  <td className='border-r border-black font-semibold p-1 text-[8px] bg-gray-200'>Tish №</td>
                  {ADULT_UPPER.map((num) => (
                    <td key={num} className={`p-1 border-r border-black last:border-r-0 ${num === 11 ? 'border-r-2 border-r-black' : ''}`}>
                      {num}
                    </td>
                  ))}
                </tr>
                {/* Upper Teeth Status / Codes */}
                <tr className='border-b border-black h-6'>
                  <td className='border-r border-black font-semibold p-1 text-[8px] bg-gray-200'>Holati</td>
                  {ADULT_UPPER.map((num) => {
                    const { code, surfaces, isRecorded } = getToothDisplay(num)
                    return (
                      <td key={num} className={`p-1 border-r border-black last:border-r-0 font-bold ${num === 11 ? 'border-r-2 border-r-black' : ''} ${isRecorded ? 'bg-gray-100' : ''}`}>
                        {code}
                        {surfaces && <span className='text-[7px] block font-normal text-gray-600'>{surfaces}</span>}
                      </td>
                    )
                  })}
                </tr>

                {/* Lower Teeth Status / Codes */}
                <tr className='border-b border-black h-6'>
                  <td className='border-r border-black font-semibold p-1 text-[8px] bg-gray-200'>Holati</td>
                  {ADULT_LOWER.map((num) => {
                    const { code, surfaces, isRecorded } = getToothDisplay(num)
                    return (
                      <td key={num} className={`p-1 border-r border-black last:border-r-0 font-bold ${num === 41 ? 'border-r-2 border-r-black' : ''} ${isRecorded ? 'bg-gray-100' : ''}`}>
                        {code}
                        {surfaces && <span className='text-[7px] block font-normal text-gray-600'>{surfaces}</span>}
                      </td>
                    )
                  })}
                </tr>
                {/* Lower Teeth Numbers */}
                <tr className='bg-gray-100 font-bold'>
                  <td className='border-r border-black font-semibold p-1 text-[8px] bg-gray-200'>Tish №</td>
                  {ADULT_LOWER.map((num) => (
                    <td key={num} className={`p-1 border-r border-black last:border-r-0 ${num === 41 ? 'border-r-2 border-r-black' : ''}`}>
                      {num}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Child/Primary Teeth Table (Optional/Compact) */}
          <div className='overflow-x-auto mb-2'>
            <div className='text-[10px] font-bold text-gray-700 mb-1 text-center uppercase'>
              Sut Tishlari Formulasi (Bolalar - 20 ta tish)
            </div>
            <table className='w-full text-center border-collapse border border-black text-[9px]'>
              <tbody>
                <tr className='bg-gray-100 font-bold border-b border-black'>
                  <td className='border-r border-black font-semibold p-1 text-[8px] bg-gray-200'>Tish №</td>
                  {PRIMARY_UPPER.map((num) => (
                    <td key={num} className={`p-1 border-r border-black last:border-r-0 ${num === 51 ? 'border-r-2 border-r-black' : ''}`}>
                      {num}
                    </td>
                  ))}
                </tr>
                <tr className='border-b border-black h-5'>
                  <td className='border-r border-black font-semibold p-1 text-[8px] bg-gray-200'>Holati</td>
                  {PRIMARY_UPPER.map((num) => {
                    const { code } = getToothDisplay(num)
                    return (
                      <td key={num} className={`p-1 border-r border-black last:border-r-0 font-bold ${num === 51 ? 'border-r-2 border-r-black' : ''}`}>
                        {code}
                      </td>
                    )
                  })}
                </tr>
                <tr className='border-b border-black h-5'>
                  <td className='border-r border-black font-semibold p-1 text-[8px] bg-gray-200'>Holati</td>
                  {PRIMARY_LOWER.map((num) => {
                    const { code } = getToothDisplay(num)
                    return (
                      <td key={num} className={`p-1 border-r border-black last:border-r-0 font-bold ${num === 81 ? 'border-r-2 border-r-black' : ''}`}>
                        {code}
                      </td>
                    )
                  })}
                </tr>
                <tr className='bg-gray-100 font-bold'>
                  <td className='border-r border-black font-semibold p-1 text-[8px] bg-gray-200'>Tish №</td>
                  {PRIMARY_LOWER.map((num) => (
                    <td key={num} className={`p-1 border-r border-black last:border-r-0 ${num === 81 ? 'border-r-2 border-r-black' : ''}`}>
                      {num}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className='text-[9px] text-gray-600 flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-gray-300'>
            <span><b>S</b> - Sog'lom</span>
            <span><b>Pl</b> - Plomba (Filling)</span>
            <span><b>Pt</b> - Kanal davolangan (Pulpit/Periodontit)</span>
            <span><b>K</b> - Koronka (Toj)</span>
            <span><b>I</b> - Implant</span>
            <span><b>R</b> - Olib tashlangan (Radix)</span>
            <span><b>X</b> - Tish yo'q (Missing)</span>
          </div>
        </div>

        {/* Treatment History Table Section */}
        <div className='border border-black p-3 mb-4 rounded-none'>
          <div className='font-bold text-xs uppercase border-b border-gray-400 pb-1 mb-2'>
            III. O'tkazilgan Davolash Muolajalari va Operatsiyalar Tarixi
          </div>

          {treatments.length === 0 ? (
            <div className='text-center py-4 text-gray-500 italic text-[11px]'>
              Hozircha o'tkazilgan muolajalar qayd etilmagan.
            </div>
          ) : (
            <table className='w-full text-left border-collapse border border-black text-[10px]'>
              <thead>
                <tr className='bg-gray-100 border-b border-black'>
                  <th className='p-1.5 border-r border-black w-20'>Sana</th>
                  <th className='p-1.5 border-r border-black w-32'>Shifokor</th>
                  <th className='p-1.5 border-r border-black w-36'>Tashxis & Muolaja</th>
                  <th className='p-1.5 border-r border-black'>Bajarilgan ish tavsifi</th>
                  <th className='p-1.5 border-r border-black w-24 text-right'>Narxi (so'm)</th>
                  <th className='p-1.5 w-16 text-center'>Imzo</th>
                </tr>
              </thead>
              <tbody>
                {treatments.map((tr) => {
                  const trDate = tr.createdAt ? format(new Date(tr.createdAt), 'dd.MM.yyyy') : '-'
                  const trDoctor = tr.doctor as any
                  const trProc = tr.procedureType as any
                  const docName = tr.doctorName || (trDoctor && typeof trDoctor === 'object' && trDoctor.user ? `Dr. ${trDoctor.user.firstName || ''} ${trDoctor.user.lastName || ''}`.trim() : 'Shifokor')
                  const procName = tr.procedureTypeName || (trProc && typeof trProc === 'object' && trProc.name ? trProc.name : '')

                  return (
                    <tr key={tr.id} className='border-b border-black last:border-b-0'>
                      <td className='p-1.5 border-r border-black font-mono'>{trDate}</td>
                      <td className='p-1.5 border-r border-black font-medium'>{docName}</td>
                      <td className='p-1.5 border-r border-black'>
                        <div className='font-bold'>{tr.diagnosis || 'Tashxis kiritilmagan'}</div>
                        {procName && <div className='text-[9px] text-gray-600'>{procName}</div>}
                      </td>
                      <td className='p-1.5 border-r border-black'>{tr.description || '-'}</td>
                      <td className='p-1.5 border-r border-black text-right font-mono font-bold'>
                        {Number(tr.price || 0).toLocaleString()}
                      </td>
                      <td className='p-1.5 text-center text-gray-400 italic text-[9px]'>[imzo]</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Doctor Signature & Stamp Area */}
        <div className='mt-8 pt-4 border-t border-black flex justify-between items-end text-xs'>
          <div className='space-y-6'>
            <div>
              <span className='font-semibold'>Davolovchi Shifokor F.I.Sh:</span>{' '}
              <span className='border-b border-black inline-block w-48'></span>
            </div>
            <div>
              <span className='font-semibold'>Shifokor Imzosi:</span>{' '}
              <span className='border-b border-black inline-block w-48'></span>
            </div>
          </div>
          <div className='text-center border border-dashed border-gray-500 w-32 h-24 flex items-center justify-center text-gray-400 text-[10px]'>
            M.O'. (Klinika Muhri)
          </div>
        </div>
      </div>
    )
  }
)
