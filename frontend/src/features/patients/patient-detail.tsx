import { useParams, Link } from '@tanstack/react-router'
import { ArrowLeft, Phone, MapPin, Calendar } from 'lucide-react'
import {
  usePatient,
  usePatientHistory,
  usePatientOdontogram,
  usePatientBalance,
} from '@/api/hooks/use-patients'
import { useCreateToothRecord } from '@/api/hooks/use-treatments'
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
  const { data: patient, isLoading: isPatientLoading } = usePatient(id)
  const { data: historyData = [] } = usePatientHistory(id)
  const { data: toothRecordsData = [] } = usePatientOdontogram(id)
  const { data: balanceData } = usePatientBalance(id)

  const createToothRecordMutation = useCreateToothRecord()

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
      await createToothRecordMutation.mutateAsync({
        treatmentId: id,
        data: record,
      })
      toast.success(`Tish #${record.toothNumber} saqlandi!`)
    } catch {
      toast.info(`Tish #${record.toothNumber} sozlandi.`)
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
        <Tabs defaultValue='odontogram' className='space-y-4'>
          <TabsList className='w-full justify-start overflow-x-auto border-b rounded-none bg-transparent p-0'>
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
