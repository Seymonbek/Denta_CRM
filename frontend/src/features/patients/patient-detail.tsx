import { useState, useRef } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { ArrowLeft, Phone, MapPin, Calendar, ShieldAlert, Clock, Play, Printer } from 'lucide-react'
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
import { getTreatmentsApi } from '@/api/treatments'
import { savePatientOdontogramApi } from '@/api/patients'
import { ActiveTreatmentSession } from '@/components/treatment-session/active-treatment-session'
import { DentalRecord025 } from '@/components/print/dental-record-025'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Odontogram } from '@/components/odontogram/odontogram'
import { PatientTimeline } from '@/components/patient-timeline/patient-timeline'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type ToothProcedure, type ToothStatus } from '@/types/api'
import { toast } from 'sonner'

export function PatientDetail() {
  const { id } = useParams({ from: '/_authenticated/patients/$id' })
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isAdministrator = user?.role === 'administrator'

  const isSavingToothRef = useRef(false)
  const isStartingSessionRef = useRef(false)

  const { data: patient, isLoading, error } = usePatient(id)
  const { data: history = [] } = usePatientHistory(id)
  const { data: toothRecords = [] } = usePatientOdontogram(id)
  const { data: balanceData } = usePatientBalance(id)

  const { data: appointmentsData } = useAppointments({ patient: id })
  const appointments = Array.isArray(appointmentsData?.results)
    ? appointmentsData.results
    : Array.isArray(appointmentsData)
    ? appointmentsData
    : []

  const inProgressAppt = appointments.find((a: any) => a.status === 'in_progress')
  const todayScheduledAppt = appointments.find((a: any) => {
    if (a.status === 'confirmed' || a.status === 'scheduled') {
      const start = a.scheduledStart || a.scheduled_start
      return start && new Date(start).toDateString() === new Date().toDateString()
    }
    return false
  })

  const { data: activeTreatmentsData } = useTreatments({
    patient: id,
    stage: 'in_progress',
  })
  const activeTreatment = Array.isArray(activeTreatmentsData?.results)
    ? activeTreatmentsData.results[0]
    : Array.isArray(activeTreatmentsData)
    ? activeTreatmentsData[0]
    : undefined

  const { data: allTreatmentsData } = useTreatments({
    patient: id,
    page_size: 50,
  })
  const patientTreatments = Array.isArray(allTreatmentsData?.results)
    ? allTreatmentsData.results
    : Array.isArray(allTreatmentsData)
    ? allTreatmentsData
    : []

  const [isPrint025Open, setIsPrint025Open] = useState(false)
  const printComponentRef = useRef<HTMLDivElement>(null)

  const createTreatment = useCreateTreatment()

  if (isLoading) {
    return (
      <div className='flex h-[50vh] items-center justify-center'>
        <div className='text-sm text-muted-foreground'>Yuklanmoqda...</div>
      </div>
    )
  }

  if (error || !patient) {
    return (
      <div className='flex h-[50vh] flex-col items-center justify-center gap-2'>
        <div className='text-sm text-destructive'>Bemor topilmadi yoki xatolik yuz berdi.</div>
        <Button asChild variant='outline' size='sm'>
          <Link to='/patients'>Orqaga qaytish</Link>
        </Button>
      </div>
    )
  }

  const firstName = patient.firstName || ''
  const lastName = patient.lastName || ''
  const phoneNumber = patient.phoneNumber || ''
  const gender = patient.gender
  const address = patient.address || ''
  const notes = patient.notes || ''
  const createdAtStr = patient.createdAt || ''
  const birthDate = patient.birthDate
  const age = patient.age
  const bloodGroup = patient.bloodGroup
  const allergies = patient.allergies

  const balanceDue = Number(balanceData?.balanceDue || 0)
  const totalBilled = Number(balanceData?.totalBilled || 0)
  const totalPaid = Number(balanceData?.totalPaid || 0)


  const handleSaveToothRecord = async (record: {
    toothNumber: number
    procedure: ToothProcedure
    status: ToothStatus
    surfaces?: string[]
    notes: string
  }) => {
    if (isSavingToothRef.current) return
    isSavingToothRef.current = true
    try {
      // If there's an active treatment, associate with it; otherwise save directly to patient baseline odontogram
      const treatmentsRes = await getTreatmentsApi({ patient: id, stage: 'in_progress' })
      const treatmentsList = (treatmentsRes as any)?.results || (Array.isArray(treatmentsRes) ? treatmentsRes : [])
      const activeTreatmentId = treatmentsList[0]?.id

      await savePatientOdontogramApi(id, {
        tooth_number: record.toothNumber,
        procedure: record.procedure,
        status: record.status,
        surfaces: record.surfaces,
        notes: record.notes,
        treatment_id: activeTreatmentId,
      })

      // Refresh Odontogram and History
      await queryClient.invalidateQueries({ queryKey: ['patients', id, 'odontogram'] })
      await queryClient.invalidateQueries({ queryKey: ['patients', id, 'odontogram-history'] })
      await queryClient.invalidateQueries({ queryKey: ['treatments'] })
      toast.success(`Tish #${record.toothNumber} saqlandi va yangilandi!`)
    } catch (_err: any) {
      const errMsg = _err?.response?.data?.detail || _err?.response?.data?.non_field_errors?.[0] || "Saqlashda xatolik yuz berdi."
      toast.error(errMsg)
    } finally {
      isSavingToothRef.current = false
    }
  }

  const handleStartSession = async () => {
    if (isStartingSessionRef.current) return
    isStartingSessionRef.current = true
    try {
      const targetAppt = inProgressAppt || todayScheduledAppt
      let doctorId = targetAppt ? (typeof targetAppt.doctor === 'object' ? targetAppt.doctor.id : targetAppt.doctor) : null
      let departmentId = targetAppt ? (typeof targetAppt.department === 'object' ? targetAppt.department.id : targetAppt.department) : null
      const procedureTypeId = targetAppt?.procedureType ? (typeof targetAppt.procedureType === 'object' ? targetAppt.procedureType.id : targetAppt.procedureType) : ''

      if (!doctorId || !departmentId) {
        const { getDoctorsApi } = await import('@/api/doctors')
        const docs = await getDoctorsApi()
        const docList = Array.isArray(docs) ? docs : (docs as any)?.results || []
        const myDoc = docList.find((d: any) => d.user?.id === user?.id || d.id === (user as any)?.doctorId) || docList[0]
        
        if (myDoc) {
          doctorId = doctorId || myDoc.id
          const docDept = myDoc.departments?.[0] || myDoc.department
          departmentId = departmentId || (typeof docDept === 'object' ? docDept?.id : docDept)
        }

        if (!departmentId) {
          const { getDepartmentsApi } = await import('@/api/departments')
          const depts = await getDepartmentsApi()
          const deptList = Array.isArray(depts) ? depts : (depts as any)?.results || []
          if (deptList[0]) departmentId = deptList[0].id
        }
      }

      if (!doctorId || !departmentId) {
        toast.error("Muolajani boshlash uchun shifokor va bo'lim topilmadi.")
        return
      }

      // If appointment was scheduled/confirmed, transition it to in_progress
      if (todayScheduledAppt && todayScheduledAppt.status !== 'in_progress') {
        const { updateAppointmentApi } = await import('@/api/appointments')
        await updateAppointmentApi(todayScheduledAppt.id, { status: 'in_progress' })
        await queryClient.invalidateQueries({ queryKey: ['appointments'] })
      }
      
      await createTreatment.mutateAsync({
        patient: id,
        doctor: String(doctorId),
        department: String(departmentId),
        procedureType: String(procedureTypeId || ''),
        appointment: targetAppt ? String(targetAppt.id) : undefined,
        diagnosis: "",
        description: "Qabul boshlandi",
        price: "0",
      })
      await queryClient.invalidateQueries({ queryKey: ['treatments'] })
      toast.success("Bemor qabuli va muolaja sessiyasi boshlandi!")
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
        {/* Scheduled Appointment Notice */}
        {todayScheduledAppt && !activeTreatment && (
          <div className='mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-900 dark:text-blue-200 shadow-2xs'>
            <div className='flex items-center gap-2.5 text-xs font-semibold'>
              <Clock className='w-4 h-4 text-blue-600 shrink-0' />
              <span>
                Bugun soat {todayScheduledAppt.scheduledStart ? new Date(todayScheduledAppt.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} ga navbat belgilangan ({todayScheduledAppt.procedureTypeName || 'Ko’rik'}). Bemor kelganida qabulni boshlang.
              </span>
            </div>
            {!isAdministrator && (
              <Button size='sm' className='h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white shrink-0 shadow-xs' onClick={handleStartSession} disabled={createTreatment.isPending}>
                <Play className='w-3.5 h-3.5 mr-1 fill-current' /> {createTreatment.isPending ? 'Boshlanmoqda...' : 'Qabulni Boshlash'}
              </Button>
            )}
          </div>
        )}

        {/* Top Header Card */}
        <div className='mb-6 rounded-xl border bg-card p-6 shadow-sm flex flex-col md:flex-row justify-between gap-6'>
          <div className='flex items-start gap-4'>
            <div className='flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-xl shadow-inner'>
              {firstName[0] || 'B'}
            </div>
            <div>
              <div className='flex items-center gap-3 flex-wrap'>
                <h1 className='text-xl font-bold tracking-tight'>
                  {firstName} {lastName}
                </h1>
                <Badge variant='outline' className='text-xs uppercase'>
                  {gender === 'male' ? 'Erkak' : gender === 'female' ? 'Ayol' : 'Noma’lum'}
                </Badge>
                {bloodGroup && (
                  <Badge variant='secondary' className='text-xs font-mono font-semibold'>
                    {bloodGroup}
                  </Badge>
                )}
                {age != null && (
                  <Badge variant='outline' className='text-xs'>
                    {age} yosh
                  </Badge>
                )}
              </div>
              <div className='mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground'>
                {phoneNumber && (
                  <span className='flex items-center gap-1 font-mono'>
                    <Phone className='h-3.5 w-3.5 text-primary' /> {phoneNumber}
                  </span>
                )}
                {birthDate && (
                  <span className='flex items-center gap-1 font-mono'>
                    <Calendar className='h-3.5 w-3.5 text-primary' /> Tug'ilgan: {birthDate}
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
              {allergies && (
                <div className='mt-3 flex items-start gap-2.5 bg-rose-500/15 border border-rose-500/40 text-rose-900 dark:text-rose-200 p-2.5 rounded-lg shadow-xs'>
                  <ShieldAlert className='h-5 w-5 text-rose-600 shrink-0 mt-0.5' />
                  <div>
                    <span className='font-bold text-xs uppercase tracking-wider block text-rose-700 dark:text-rose-400'>
                      ⚠️ DORI VOSITALARIGA ALLERGIYALARI MAVJUD:
                    </span>
                    <p className='text-xs mt-0.5 font-bold text-rose-800 dark:text-rose-300'>{allergies}</p>
                  </div>
                </div>
              )}
              {notes && (
                <div className='mt-2 flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 p-2.5 rounded-lg shadow-xs'>
                  <ShieldAlert className='h-5 w-5 text-amber-600 shrink-0 mt-0.5' />
                  <div>
                    <span className='font-bold text-xs uppercase tracking-wider block text-amber-700 dark:text-amber-400'>
                      ℹ️ QO'SHIMCHA TIBBIY ESLATMA:
                    </span>
                    <p className='text-xs mt-0.5 font-medium'>{notes}</p>
                  </div>
                </div>
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
            <div className='mt-3 pt-2 border-t'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setIsPrint025Open(true)}
                className='h-7 text-xs gap-1.5 w-full bg-background hover:bg-muted font-medium'
              >
                <Printer className='h-3.5 w-3.5 text-primary' /> 025/h Kartani Chop Etish
              </Button>
            </div>
          </div>
        </div>

        {/* Detail Tabs */}
        <Tabs defaultValue={activeTreatment ? 'session' : 'odontogram'} className='space-y-4'>
          <TabsList className='w-full justify-start overflow-x-auto border-b rounded-none bg-transparent p-0'>
            {activeTreatment && (
              <TabsTrigger
                value='session'
                className='data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-4 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400'
              >
                🔴 Joriy Qabul (Jarayonda)
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

          {activeTreatment && (
            <TabsContent value='session' className='pt-2'>
              <ActiveTreatmentSession 
                treatmentId={activeTreatment.id} 
                appointmentId={activeTreatment.appointmentId || activeTreatment.appointment || ''} 
                patientId={id} 
              />
            </TabsContent>
          )}

          <TabsContent value='odontogram' className='pt-2'>
            <Odontogram 
              patientId={patient.id} 
              toothRecords={toothRecords} 
              readOnly={false}
              onSaveRecord={handleSaveToothRecord} 
            />
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

        {/* 025/h Dental Record Print Preview Dialog */}
        <Dialog open={isPrint025Open} onOpenChange={setIsPrint025Open}>
          <DialogContent className='max-w-4xl max-h-[92vh] overflow-y-auto p-4 sm:p-6'>
            <DialogHeader className='flex flex-row items-center justify-between border-b pb-3'>
              <DialogTitle className='text-sm font-bold flex items-center gap-2'>
                <Printer className='h-4 w-4 text-primary' />
                025/h Stomatologik Ambulatoriya Kartasi
              </DialogTitle>
              <Button
                size='sm'
                onClick={() => {
                  const printContent = printComponentRef.current
                  if (!printContent) return
                  const win = window.open('', '', 'width=900,height=650')
                  if (!win) return
                  win.document.write(`
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <title>025-h_${patient.lastName}_${patient.firstName}</title>
                        <style>
                          @page { size: A4; margin: 10mm; }
                          body { font-family: system-ui, -apple-system, sans-serif; color: #000; background: #fff; margin: 0; padding: 0; }
                          table { border-collapse: collapse; width: 100%; }
                          th, td { border: 1px solid #000; padding: 3px; }
                        </style>
                      </head>
                      <body>
                        ${printContent.innerHTML}
                      </body>
                    </html>
                  `)
                  win.document.close()
                  win.focus()
                  setTimeout(() => {
                    win.print()
                    win.close()
                  }, 350)
                }}
                className='h-8 text-xs gap-1.5 font-medium'
              >
                <Printer className='h-3.5 w-3.5' /> Chop Etish (Print)
              </Button>
            </DialogHeader>

            <div className='py-2 overflow-x-auto'>
              <div ref={printComponentRef} className='bg-white p-2 min-w-[700px] border shadow-xs'>
                <DentalRecord025
                  patient={patient}
                  toothRecords={toothRecords}
                  treatments={patientTreatments}
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
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
