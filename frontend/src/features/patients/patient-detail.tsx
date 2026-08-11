import { useParams, Link } from '@tanstack/react-router'
import { ArrowLeft, Phone, MapPin, Calendar } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  usePatient,
  usePatientHistory,
  usePatientOdontogram,
  usePatientBalance,
} from '@/api/hooks/use-patients'
import { useAppointments } from '@/api/hooks/use-appointments'
import { useTreatments, useCreateTreatment } from '@/api/hooks/use-treatments'
import { getTreatmentsApi, createTreatmentApi, createToothRecordApi } from '@/api/treatments'
import { apiClient } from '@/api/client'
import { ActiveTreatmentSession } from '@/components/treatment-session/active-treatment-session'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Odontogram } from '@/components/odontogram/odontogram'
import { PatientTimeline } from '@/components/patient-timeline/patient-timeline'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

export function PatientDetail() {
  const { id } = useParams({ from: '/_authenticated/patients/$id' })
  const queryClient = useQueryClient()

  const { data: patient, isLoading: isPatientLoading } = usePatient(id)
  const { data: historyData = [] } = usePatientHistory(id)
  const { data: toothRecordsData = [] } = usePatientOdontogram(id)
  const { data: balanceData } = usePatientBalance(id)

  const { data: apptsData } = useAppointments({ patient: id, status: 'in_progress' })
  const activeAppts = Array.isArray(apptsData?.results) ? apptsData.results : Array.isArray(apptsData) ? apptsData : []
  const activeAppt = activeAppts[0]

  const { data: treatmentsRes } = useTreatments({ patient: id, stage: 'in_progress' })
  const activeTreatments = Array.isArray(treatmentsRes?.results) ? treatmentsRes.results : Array.isArray(treatmentsRes) ? treatmentsRes : []
  const activeTreatment = activeTreatments[0]

  const createTreatment = useCreateTreatment()

  const history = Array.isArray(historyData) ? historyData : []
  const toothRecords = Array.isArray(toothRecordsData) ? toothRecordsData : []

  if (isPatientLoading) {
    return (
      <div className='flex h-svh items-center justify-center text-xs text-muted-foreground animate-pulse'>
        Bemor ma'lumotlari yuklanmoqda...
      </div>
    )
  }

  if (!patient) {
    return (
      <div className='flex flex-col h-svh items-center justify-center text-center p-6'>
        <p className='text-sm font-semibold text-muted-foreground mb-4'>Bemor topilmadi.</p>
        <Button asChild variant='outline'>
          <Link to='/patients'>Bemorlar ro'yxatiga qaytish</Link>
        </Button>
      </div>
    )
  }

  const firstName = patient.firstName || patient.first_name || 'Bemor'
  const lastName = patient.lastName || patient.last_name || ''
  const phoneNumber = patient.phoneNumber || patient.phone_number || ''
  const gender = patient.gender || 'unknown'
  const address = patient.address || ''
  const notes = patient.notes || ''
  const createdAtStr = patient.createdAt || patient.created_at || ''

  const balanceDue = Number(balanceData?.balanceDue ?? balanceData?.balance_due ?? 0)
  const totalBilled = Number(balanceData?.totalBilled ?? balanceData?.total_billed ?? 0)
  const totalPaid = Number(balanceData?.totalPaid ?? balanceData?.total_paid ?? 0)

  const handleSaveToothRecord = async (record: {
    toothNumber: number
    procedure: any
    status: any
    notes: string
  }) => {
    try {
      // 1. Find or create an active treatment container for this patient
      const treatmentsRes = await getTreatmentsApi({ patient: id, stage: 'in_progress' })
      const treatments = treatmentsRes?.results || (Array.isArray(treatmentsRes) ? treatmentsRes : [])
      let treatmentId = treatments[0]?.id

      if (!treatmentId) {
        // Find an active appointment to link the treatment to
        const { getAppointmentsApi } = await import('@/api/appointments')
        
        let apptsRes = await getAppointmentsApi({ patient: id, status: 'in_progress' })
        let appts = apptsRes?.results || (Array.isArray(apptsRes) ? apptsRes : [])
        
        if (appts.length === 0) {
           apptsRes = await getAppointmentsApi({ patient: id, status: 'confirmed' })
           appts = apptsRes?.results || (Array.isArray(apptsRes) ? apptsRes : [])
        }

        const activeAppt = appts[0]

        if (!activeAppt) {
          toast.error("Bemorning faol navbati topilmadi. Avval qabulni boshlang (Jarayonda).")
          return
        }

        const doctorId = typeof activeAppt.doctor === 'object' ? activeAppt.doctor.id : activeAppt.doctor
        const departmentId = typeof activeAppt.department === 'object' ? activeAppt.department.id : activeAppt.department
        
        const newTreatment = await createTreatmentApi({
          patient: id,
          doctor: doctorId,
          department: departmentId,
          appointment: activeAppt.id,
          diagnosis: `Tish #${record.toothNumber} ko'rik va muolajasi`,
          description: record.notes || "Tish xaritasiga yozuv kiritildi",
          price: "0",
        } as any)
        treatmentId = newTreatment.id
      }

      if (treatmentId) {
        await createToothRecordApi(treatmentId, {
          toothNumber: record.toothNumber,
          procedure: record.procedure,
          status: record.status,
          notes: record.notes,
        })
      }

      // 2. Refresh Odontogram
      await queryClient.invalidateQueries({ queryKey: ['patients', id, 'odontogram'] })
      toast.success(`Tish #${record.toothNumber} saqlandi va yangilandi!`)
    } catch (err: any) {
      const errMsg = err?.response?.data?.department?.[0] || err?.response?.data?.detail || err?.response?.data?.non_field_errors?.[0] || "Saqlashda xatolik yuz berdi."
      toast.error(errMsg)
    }
  }

  const handleStartSession = async () => {
    if (!activeAppt) {
       toast.error("Bemorning faol navbati yo'q!")
       return
    }
    try {
      const doctorId = typeof activeAppt.doctor === 'object' ? activeAppt.doctor.id : activeAppt.doctor
      const departmentId = typeof activeAppt.department === 'object' ? activeAppt.department.id : activeAppt.department
      
      await createTreatment.mutateAsync({
        patient: id,
        doctor: doctorId,
        department: departmentId,
        appointment: activeAppt.id,
        diagnosis: "",
        description: "Qabul boshlandi",
        price: "0",
      } as any)
      toast.success("Muolaja sessiyasi boshlandi!")
    } catch(err: any) {
      toast.error("Xatolik yuz berdi")
    }
  }

  return (
    <>
      <Header>
        <Button asChild variant='ghost' size='sm' className='me-2'>
          <Link to='/patients'>
            <ArrowLeft className='h-4 w-4 me-1' /> Orqaga
          </Link>
        </Button>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <span>
            {firstName} {lastName}
          </span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        {/* Top Header Card */}
        <div className='mb-6 rounded-xl border bg-card p-6 shadow-sm flex flex-col md:flex-row justify-between gap-6'>
          <div className='flex items-start gap-4'>
            <div className='flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-xl shadow-inner'>
              {firstName[0] || 'B'}
            </div>
            <div>
              <div className='flex items-center gap-3'>
                <h1 className='text-xl font-bold tracking-tight'>
                  {firstName} {lastName}
                </h1>
                <Badge variant='outline' className='text-xs uppercase'>
                  {gender === 'male' ? 'Erkak' : gender === 'female' ? 'Ayol' : 'Noma’lum'}
                </Badge>
              </div>
              <div className='mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground'>
                {phoneNumber && (
                  <span className='flex items-center gap-1 font-mono'>
                    <Phone className='h-3.5 w-3.5 text-primary' /> {phoneNumber}
                  </span>
                )}
                {address && (
                  <span className='flex items-center gap-1'>
                    <MapPin className='h-3.5 w-3.5 text-primary' /> {address}
                  </span>
                )}
                {createdAtStr && (
                  <span className='flex items-center gap-1 font-mono'>
                    <Calendar className='h-3.5 w-3.5 text-primary' /> Ro'yxat: {formatDate(createdAtStr)}
                  </span>
                )}
              </div>
              {notes && (
                <p className='mt-2 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 p-2 rounded-md'>
                  📌 <strong>Eslatma:</strong> {notes}
                </p>
              )}
            </div>
          </div>

          {/* Balance Widget */}
          <div className='flex flex-col justify-center rounded-xl bg-muted/30 border p-4 min-w-[220px] text-end'>
            <span className='text-xs font-medium text-muted-foreground'>Qarzdorlik (Balans):</span>
            <span
              className={`text-xl font-bold font-mono mt-1 ${
                balanceDue > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {balanceDue.toLocaleString()} so'm
            </span>
            <div className='mt-2 flex justify-between text-[11px] text-muted-foreground border-t pt-1.5'>
              <span>Jami Hisoblangan:</span>
              <span className='font-mono'>{totalBilled.toLocaleString()}</span>
            </div>
            <div className='flex justify-between text-[11px] text-muted-foreground'>
              <span>Jami To'langan:</span>
              <span className='font-mono'>{totalPaid.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Detail Tabs */}
        <Tabs defaultValue={activeAppt ? 'session' : 'odontogram'} className='space-y-4'>
          <TabsList className='w-full justify-start overflow-x-auto border-b rounded-none bg-transparent p-0'>
            {activeAppt && (
              <TabsTrigger
                value='session'
                className='data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-4 py-2 text-xs font-semibold'
              >
                🔴 Joriy Muolaja
              </TabsTrigger>
            )}
            <TabsTrigger
              value='odontogram'
              className='data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-4 py-2 text-xs font-semibold'
            >
              🦷 Odontogram (Tish Xaritasi)
            </TabsTrigger>
            <TabsTrigger
              value='timeline'
              className='data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-4 py-2 text-xs font-semibold'
            >
              📜 Tashrif va Ishlar Tarixi
            </TabsTrigger>
            <TabsTrigger
              value='balance'
              className='data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-4 py-2 text-xs font-semibold'
            >
              💰 To'lovlar va Balans
            </TabsTrigger>
          </TabsList>

          {activeAppt && (
            <TabsContent value='session' className='pt-2'>
              {activeTreatment ? (
                <ActiveTreatmentSession 
                  treatmentId={activeTreatment.id} 
                  appointmentId={activeAppt.id} 
                  patientId={id} 
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-xl bg-muted/10 text-center">
                  <h3 className="text-lg font-bold mb-2">Qabul boshlangan, lekin muolaja sessiyasi ochilmagan</h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-md">
                    Bemorning qabuliga rasmlar yuklash, tashxis yozish va yakunlash uchun muolaja sessiyasini boshlang. Yoki tish xaritasiga yozuv kiritish orqali avtomatik ochishingiz mumkin.
                  </p>
                  <Button onClick={handleStartSession} disabled={createTreatment.isPending}>
                    {createTreatment.isPending ? 'Boshlanmoqda...' : 'Muolaja Sessiyasini Boshlash'}
                  </Button>
                </div>
              )}
            </TabsContent>
          )}

          <TabsContent value='odontogram' className='pt-2'>
            <Odontogram toothRecords={toothRecords} onSaveRecord={handleSaveToothRecord} />
          </TabsContent>

          <TabsContent value='timeline' className='pt-2'>
            <Card>
              <CardHeader>
                <CardTitle className='text-base font-bold'>Bemor Xronologik Tarixi</CardTitle>
              </CardHeader>
              <CardContent>
                <PatientTimeline history={history} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='balance' className='pt-2'>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-6'>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-xs font-medium text-muted-foreground'>
                    Jami Muolaja Narxi
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-xl font-bold font-mono'>
                    {totalBilled.toLocaleString()} so'm
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-xs font-medium text-muted-foreground'>
                    Jami Qabul Qilingan To'lov
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400'>
                    {totalPaid.toLocaleString()} so'm
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-xs font-medium text-muted-foreground'>
                    Qolgan Qarzdorlik
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-xl font-bold font-mono text-rose-600 dark:text-rose-400'>
                    {balanceDue.toLocaleString()} so'm
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </Main>
    </>
  )
}

function formatDate(dateStr: string) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString()
  } catch {
    return dateStr
  }
}
