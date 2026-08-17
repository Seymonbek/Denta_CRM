import { useRef } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { ArrowLeft, Phone, MapPin, Calendar } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  usePatient,
  usePatientHistory,
  usePatientOdontogram,
  usePatientBalance,
} from '@/api/hooks/use-patients'
import { useAuthStore } from '@/stores/auth-store'
import { useAppointments } from '@/api/hooks/use-appointments'
import { useTreatments, useCreateTreatment } from '@/api/hooks/use-treatments'
import { getTreatmentsApi, createTreatmentApi, createToothRecordApi } from '@/api/treatments'
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
import { type ToothProcedure, type ToothStatus } from '@/types/api'
import { toast } from 'sonner'

export function PatientDetail() {
  const { id } = useParams({ from: '/_authenticated/patients/$id' })
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const isAdministrator = user?.role === 'administrator'

  const isSavingToothRef = useRef(false)
  const isStartingSessionRef = useRef(false)

  const { data: patient, isLoading: isPatientLoading } = usePatient(id)
  const { data: history = [] } = usePatientHistory(id)
  const { data: toothRecords = [] } = usePatientOdontogram(id)
  const { data: balanceData } = usePatientBalance(id)

  const { data: appointmentsData } = useAppointments({ patient: id })
  const appointments = Array.isArray(appointmentsData?.results)
    ? appointmentsData.results
    : Array.isArray(appointmentsData)
    ? appointmentsData
    : []

  const activeAppt = appointments.find(
    (a: any) => a.status === 'in_progress' || a.status === 'confirmed' || a.status === 'scheduled'
  )

  const { data: treatmentsData } = useTreatments({ patient: id })
  const treatments = Array.isArray(treatmentsData?.results)
    ? treatmentsData.results
    : Array.isArray(treatmentsData)
    ? treatmentsData
    : []

  const activeTreatment = treatments.find((t: any) => t.stage === 'in_progress')

  const createTreatment = useCreateTreatment()

  if (isPatientLoading) {
    return (
      <div className='flex h-screen items-center justify-center'>
        <p className='text-muted-foreground'>Bemor ma'lumotlari yuklanmoqda...</p>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className='flex h-screen flex-col items-center justify-center gap-4'>
        <p className='text-muted-foreground'>Bemor topilmadi</p>
        <Button asChild variant='outline'>
          <Link to='/patients'>Bemorlar ro'yxatiga qaytish</Link>
        </Button>
      </div>
    )
  }

  const firstName = patient.firstName || 'Bemor'
  const lastName = patient.lastName || ''
  const phoneNumber = patient.phoneNumber || ''
  const gender = patient.gender || 'unknown'
  const address = patient.address || ''
  const notes = patient.notes || ''
  const createdAtStr = patient.createdAt || ''

  const balanceDue = Number(balanceData?.balanceDue || 0)
  const totalBilled = Number(balanceData?.totalBilled || 0)
  const totalPaid = Number(balanceData?.totalPaid || 0)


  const handleSaveToothRecord = async (record: {
    toothNumber: number
    procedure: ToothProcedure
    status: ToothStatus
    notes: string
  }) => {
    if (isSavingToothRef.current) return
    isSavingToothRef.current = true
    try {
      // 1. Find or create an active treatment container for this patient
      const treatmentsRes = await getTreatmentsApi({ patient: id, stage: 'in_progress' })
      const treatmentsList = (treatmentsRes as any)?.results || (Array.isArray(treatmentsRes) ? treatmentsRes : [])
      let treatmentId = treatmentsList[0]?.id

      if (!treatmentId) {
        // Find an active appointment to link the treatment to
        const { getAppointmentsApi } = await import('@/api/appointments')
        
        let apptsRes = await getAppointmentsApi({ patient: id, status: 'in_progress' })
        let appts = (apptsRes as any)?.results || (Array.isArray(apptsRes) ? apptsRes : [])
        
        if (appts.length === 0) {
           apptsRes = await getAppointmentsApi({ patient: id, status: 'confirmed' })
           appts = (apptsRes as any)?.results || (Array.isArray(apptsRes) ? apptsRes : [])
        }

        const activeFoundAppt = appts[0]

        if (!activeFoundAppt) {
          toast.error("Bemorning faol navbati topilmadi. Avval qabulni boshlang (Jarayonda).")
          return
        }

        const doctorId = typeof activeFoundAppt.doctor === 'object' ? activeFoundAppt.doctor.id : activeFoundAppt.doctor
        const departmentId = typeof activeFoundAppt.department === 'object' ? activeFoundAppt.department.id : activeFoundAppt.department
        const procedureTypeId = activeFoundAppt.procedureType ? (typeof activeFoundAppt.procedureType === 'object' ? activeFoundAppt.procedureType.id : activeFoundAppt.procedureType) : ''
        
        const newTreatment = await createTreatmentApi({
          patient: id,
          doctor: String(doctorId),
          department: String(departmentId),
          procedureType: String(procedureTypeId || ''),
          appointment: String(activeFoundAppt.id),
          diagnosis: `Tish #${record.toothNumber} ko'rik va muolajasi`,
          description: record.notes || "Tish xaritasiga yozuv kiritildi",
          price: "0",
        })
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
    } catch (_err: any) {
      const errMsg = _err?.response?.data?.department?.[0] || _err?.response?.data?.detail || _err?.response?.data?.non_field_errors?.[0] || "Saqlashda xatolik yuz berdi."
      toast.error(errMsg)
    } finally {
      isSavingToothRef.current = false
    }
  }

  const handleStartSession = async () => {
    if (!activeAppt) {
       toast.error("Bemorning faol navbati yo'q!")
       return
    }
    if (isStartingSessionRef.current) return
    isStartingSessionRef.current = true
    try {
      const doctorId = typeof activeAppt.doctor === 'object' ? activeAppt.doctor.id : activeAppt.doctor
      const departmentId = typeof activeAppt.department === 'object' ? activeAppt.department.id : activeAppt.department
      const procedureTypeId = activeAppt.procedureType ? (typeof activeAppt.procedureType === 'object' ? activeAppt.procedureType.id : activeAppt.procedureType) : ''
      
      await createTreatment.mutateAsync({
        patient: id,
        doctor: String(doctorId),
        department: String(departmentId),
        procedureType: String(procedureTypeId || ''),
        appointment: String(activeAppt.id),
        diagnosis: "",
        description: "Qabul boshlandi",
        price: "0",
      })
      toast.success("Muolaja sessiyasi boshlandi!")
    } catch (_err: unknown) {
      toast.error("Xatolik yuz berdi")
    } finally {
      isStartingSessionRef.current = false
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
        <Tabs defaultValue={activeTreatment || activeAppt ? 'session' : 'odontogram'} className='space-y-4'>
          <TabsList className='w-full justify-start overflow-x-auto border-b rounded-none bg-transparent p-0'>
            {(activeTreatment || activeAppt) && (
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

          {(activeTreatment || activeAppt) && (
            <TabsContent value='session' className='pt-2'>
              {activeTreatment ? (
                <ActiveTreatmentSession 
                  treatmentId={activeTreatment.id} 
                  appointmentId={activeAppt?.id || activeTreatment.appointmentId || activeTreatment.appointment || ''} 
                  patientId={id} 
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-xl bg-muted/10 text-center">
                  <h3 className="text-lg font-bold mb-2">Qabul boshlangan, lekin muolaja sessiyasi ochilmagan</h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-md">
                    Bemorning qabuliga rasmlar yuklash, tashxis yozish va yakunlash uchun muolaja sessiyasini boshlang. Yoki tish xaritasiga yozuv kiritish orqali avtomatik ochishingiz mumkin.
                  </p>
                  
                  {isAdministrator ? (
                    <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md font-medium">
                      Administratorlar muolaja sessiyasini boshlash huquqiga ega emas. Iltimos, muolajani boshlash uchun tegishli shifokor profiliga kiring.
                    </div>
                  ) : (
                    <Button onClick={handleStartSession} disabled={createTreatment.isPending}>
                      {createTreatment.isPending ? 'Boshlanmoqda...' : 'Muolaja Sessiyasini Boshlash'}
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
          )}

          <TabsContent value='odontogram' className='pt-2'>
            <Odontogram patientId={patient.id} toothRecords={toothRecords} onSaveRecord={handleSaveToothRecord} />
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
