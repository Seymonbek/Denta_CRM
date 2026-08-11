import { useState } from 'react'
import { Plus, Camera, FileText, Activity, Search, CreditCard } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { MobileImageUploader } from '@/components/ui/mobile-image-uploader'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  useTreatments,
  useCreateTreatment,
  useUploadTreatmentPhoto,
} from '@/api/hooks/use-treatments'
import { useAppointments } from '@/api/hooks/use-appointments'
import { useDoctors } from '@/api/hooks/use-doctors'
import { usePatients } from '@/api/hooks/use-patients'
import { useDepartments } from '@/api/hooks/use-departments'
import { useProcedureTypes } from '@/api/hooks/use-procedure-types'
import { Treatment } from '@/types/api'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/get-error-message'

export function TreatmentsList() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTreatmentForPhoto, setSelectedTreatmentForPhoto] = useState<Treatment | null>(null)
  const [photoType, setPhotoType] = useState<'before' | 'after' | 'xray'>('before')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // Form State
  const [appointmentId, setAppointmentId] = useState('')
  const [patientId, setPatientId] = useState('')
  const [doctorId, setDoctorId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [procedureTypeId, setProcedureTypeId] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')

  const { data: treatmentsData, isLoading } = useTreatments()
  const treatments = Array.isArray(treatmentsData?.results)
    ? treatmentsData.results
    : Array.isArray(treatmentsData)
    ? treatmentsData
    : []

  const { data: appointmentsData } = useAppointments()
  const appointments = Array.isArray(appointmentsData?.results)
    ? appointmentsData.results
    : Array.isArray(appointmentsData)
    ? appointmentsData
    : []

  const { data: doctorsData = [] } = useDoctors()
  const doctors = Array.isArray(doctorsData) ? doctorsData : []

  const { data: patientsData } = usePatients({ page_size: 100 })
  const patients = Array.isArray(patientsData?.results)
    ? patientsData.results
    : Array.isArray(patientsData)
    ? patientsData
    : []

  const { data: departmentsData = [] } = useDepartments()
  const departments = Array.isArray(departmentsData) ? departmentsData : []

  const { data: procedureTypesData = [] } = useProcedureTypes()
  const procedureTypes = Array.isArray(procedureTypesData) ? procedureTypesData : []

  const createTreatmentMutation = useCreateTreatment()
  const uploadPhotoMutation = useUploadTreatmentPhoto()

  const handleCreateTreatment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appointmentId || !patientId || !doctorId || !departmentId || !procedureTypeId || !price) {
      toast.error('Barcha majburiy maydonlarni to’ldiring.')
      return
    }

    try {
      await createTreatmentMutation.mutateAsync({
        appointment: appointmentId,
        patient: patientId,
        doctor: doctorId,
        department: departmentId,
        procedureType: procedureTypeId,
        diagnosis,
        description,
        price,
      })
      toast.success('Davolash yozuvi yaratildi!')
      setIsModalOpen(false)
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Yaratishda xatolik yuz berdi.'))
    }
  }

  const handleUploadPhoto = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTreatmentForPhoto || !selectedFile) {
      toast.error('Faylni tanlang.')
      return
    }

    try {
      await uploadPhotoMutation.mutateAsync({
        treatmentId: selectedTreatmentForPhoto.id,
        file: selectedFile,
        photoType,
      })
      toast.success('Fotosurat yuklandi!')
      setSelectedTreatmentForPhoto(null)
      setSelectedFile(null)
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Rasm yuklashda xatolik.'))
    }
  }

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <span>🦷 Davolash Yozuvlari</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <div className='mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Barcha Davolanish Ishlari</h1>
            <p className='text-xs text-muted-foreground'>
              Tashxislar, muolajalar narxi, foto hujjatlashtirish va to'lov holatlari.
            </p>
          </div>
          <Button onClick={() => setIsModalOpen(true)} className='shadow'>
            <Plus className='me-2 h-4 w-4' /> Yangi Davolash Yozuvi
          </Button>
        </div>

        {/* Treatments Table */}
        <div className='rounded-xl border bg-card shadow-sm overflow-hidden'>
          <Table>
            <TableHeader>
              <TableRow className='bg-muted/30'>
                <TableHead className='text-xs font-semibold'>Bemor</TableHead>
                <TableHead className='text-xs font-semibold'>Shifokor</TableHead>
                <TableHead className='text-xs font-semibold'>Tashxis & Muolaja</TableHead>
                <TableHead className='text-xs font-semibold'>Narx (so'm)</TableHead>
                <TableHead className='text-xs font-semibold'>To'lov Holati</TableHead>
                <TableHead className='text-xs font-semibold'>Bosqich</TableHead>
                <TableHead className='text-xs font-semibold text-end'>Foto Yuklash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className='text-center py-8 text-xs text-muted-foreground animate-pulse'>
                    Davolash yozuvlari yuklanmoqda...
                  </TableCell>
                </TableRow>
              ) : treatments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className='text-center py-8 text-xs text-muted-foreground'>
                    Yozuvlar topilmadi.
                  </TableCell>
                </TableRow>
              ) : (
                treatments.map((t: any) => {
                  const patientName = t?.patientName || t?.patient_name || (t?.patient && typeof t.patient === 'object' ? `${t.patient.firstName || t.patient.first_name || ''} ${t.patient.lastName || t.patient.last_name || ''}`.trim() : t?.patient) || 'Bemor'
                  const doctorName = t?.doctorName || t?.doctor_name || (t?.doctor && typeof t.doctor === 'object' ? `${t.doctor.user?.firstName || t.doctor.user?.first_name || ''} ${t.doctor.user?.lastName || t.doctor.user?.last_name || ''}`.trim() : t?.doctor) || 'Shifokor'
                  const procedureTypeName = t?.procedureTypeName || t?.procedure_type_name || (t?.procedureType && typeof t.procedureType === 'object' ? t.procedureType.name : t?.procedureType) || ''

                  return (
                    <TableRow key={t?.id || Math.random()} className='hover:bg-muted/20'>
                      <TableCell className='font-medium text-xs'>
                        <Link
                          to='/patients/$id'
                          params={{ id: String(t?.patient?.id || t?.patient_id || t?.patient) }}
                          className='text-primary hover:underline font-bold'
                        >
                          {patientName}
                        </Link>
                      </TableCell>
                      <TableCell className='text-xs text-muted-foreground'>
                        {doctorName}
                      </TableCell>
                      <TableCell className='text-xs max-w-xs'>
                        <p className='font-semibold truncate'>{t?.diagnosis || 'Tashxis kiritilmagan'}</p>
                        <p className='text-[10px] text-muted-foreground truncate'>{procedureTypeName}</p>
                      </TableCell>
                      <TableCell className='text-xs font-mono font-bold'>
                        {Number(t?.price || 0).toLocaleString()} so'm
                      </TableCell>
                      <TableCell className='text-xs'>
                        <Badge
                          variant={
                            t?.paymentStatus === 'paid' || t?.payment_status === 'paid'
                              ? 'default'
                              : t?.paymentStatus === 'partial' || t?.payment_status === 'partial'
                              ? 'secondary'
                              : 'destructive'
                          }
                          className='text-[10px]'
                        >
                          {t?.paymentStatus === 'paid' || t?.payment_status === 'paid'
                            ? "To'langan"
                            : t?.paymentStatus === 'partial' || t?.payment_status === 'partial'
                            ? "Qisman to'langan"
                            : "To'lanmagan"}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-xs'>
                        <Badge variant='outline' className='text-[10px] uppercase'>
                          {t?.stage === 'completed' ? 'Yakunlangan' : 'Jarayonda'}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-end flex items-center justify-end gap-1.5'>
                        {(t?.paymentStatus !== 'paid' && t?.payment_status !== 'paid') && (
                          <Button
                            size='sm'
                            variant='outline'
                            className='h-7 text-xs gap-1 border-purple-500/30 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20'
                            asChild
                          >
                            <Link to='/payments' search={{ treatmentId: t.id }}>
                              <CreditCard className='h-3.5 w-3.5' /> Kassa
                            </Link>
                          </Button>
                        )}
                        <Button
                          size='sm'
                          variant='outline'
                          className='h-7 text-xs gap-1 border-blue-500/30 text-blue-600 hover:bg-blue-50'
                          onClick={() => {
                            const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1/'
                            const url = `${baseUrl}treatments/${t.id}/pdf-act/`
                            window.open(url, '_blank')
                          }}
                        >
                          <FileText className='h-3.5 w-3.5' /> Dalolatnoma (PDF)
                        </Button>

                        <Button
                          size='sm'
                          variant='ghost'
                          className='h-7 text-xs'
                          onClick={() => setSelectedTreatmentForPhoto(t)}
                        >
                          <Camera className='me-1.5 h-3.5 w-3.5' /> Foto
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Create Treatment Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className='sm:max-w-lg'>
            <DialogHeader>
              <DialogTitle>Yangi Davolash Yozuvi Yaratish</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreateTreatment} className='space-y-3 py-2'>
              <div className='space-y-1'>
                <label className='text-xs font-medium'>Navbat (Appointment) *</label>
                <Select
                  value={appointmentId}
                  onValueChange={(val) => {
                    setAppointmentId(val)
                    const app = appointments.find((a: any) => a.id === val)
                    if (app) {
                      setPatientId(typeof app.patient === 'object' ? app.patient.id : app.patient)
                      setDoctorId(typeof app.doctor === 'object' ? app.doctor.id : app.doctor)
                      setDepartmentId(typeof app.department === 'object' ? app.department.id : app.department)
                      if (app.procedureType) {
                        setProcedureTypeId(typeof app.procedureType === 'object' ? app.procedureType.id : app.procedureType)
                      }
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Navbatni tanlang' />
                  </SelectTrigger>
                  <SelectContent>
                    {appointments.map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>
                        {formatDateSafely(a.scheduledStart || a.scheduled_start)} - {a.patientName || 'Bemor'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Bemor *</label>
                  <SearchableSelect
                    options={patients.map((p: any) => ({
                      value: String(p.id),
                      label: `${p.firstName || p.first_name || ''} ${p.lastName || p.last_name || ''}`,
                      sublabel: p.phoneNumber || p.phone_number || '',
                    }))}
                    value={patientId}
                    onValueChange={setPatientId}
                    placeholder='Bemor tanlang...'
                    searchPlaceholder='Bemor ismi...'
                  />
                </div>

                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Shifokor *</label>
                  <SearchableSelect
                    options={doctors.map((d: any) => ({
                      value: String(d.id),
                      label: `Dr. ${d.user?.firstName || d.user?.first_name || ''} ${d.user?.lastName || d.user?.last_name || ''}`,
                      sublabel: d.specialization || 'Stomatolog',
                    }))}
                    value={doctorId}
                    onValueChange={setDoctorId}
                    placeholder='Shifokor tanlang...'
                    searchPlaceholder='Shifokor...'
                  />
                </div>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Bo'lim *</label>
                  <Select value={departmentId} onValueChange={setDepartmentId}>
                    <SelectTrigger>
                      <SelectValue placeholder='Bo’lim' />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Muolaja turi *</label>
                  <Select
                    value={procedureTypeId}
                    onValueChange={(val) => {
                      setProcedureTypeId(val)
                      const proc = procedureTypes.find((p: any) => p.id === val)
                      if (proc) setPrice(proc.defaultPrice || proc.default_price || '')
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Muolaja' />
                    </SelectTrigger>
                    <SelectContent>
                      {procedureTypes.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-medium'>Tashxis (Diagnosis)</label>
                <Input
                  placeholder='Karies, Pulpit...'
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                />
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-medium'>Muolaja Narxi (so'm) *</label>
                <Input
                  type='number'
                  placeholder='300000'
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-medium'>Batafsil Tavsif</label>
                <Textarea
                  placeholder='Amalga oshirilgan ishlar tafsiloti...'
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <DialogFooter className='pt-2'>
                <Button type='button' variant='outline' onClick={() => setIsModalOpen(false)}>
                  Bekor qilish
                </Button>
                <Button type='submit' disabled={createTreatmentMutation.isPending}>
                  {createTreatmentMutation.isPending ? 'Saqlanmoqda...' : 'Yozuvni Saqlash'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Upload Photo Modal */}
        <Dialog open={selectedTreatmentForPhoto !== null} onOpenChange={(open) => !open && setSelectedTreatmentForPhoto(null)}>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>Davolanish Fotosuratini Yuklash (Before/After/Xray)</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleUploadPhoto} className='space-y-4 py-2'>
              <div className='space-y-1'>
                <label className='text-xs font-medium'>Rasm turi (Photo Type)</label>
                <Select value={photoType} onValueChange={(val) => setPhotoType(val as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='before'>Davolashdan Oldin (Before)</SelectItem>
                    <SelectItem value='after'>Davolashdan Keyin (After)</SelectItem>
                    <SelectItem value='xray'>Rentgen Rasm (X-Ray)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-medium mb-1 block'>Foto Tayyorlash / Kamera</label>
                <MobileImageUploader
                  onFileSelect={(file) => setSelectedFile(file)}
                  selectedFile={selectedFile}
                />
              </div>

              <DialogFooter className='pt-2'>
                <Button type='button' variant='outline' onClick={() => setSelectedTreatmentForPhoto(null)}>
                  Bekor qilish
                </Button>
                <Button type='submit' disabled={uploadPhotoMutation.isPending || !selectedFile}>
                  {uploadPhotoMutation.isPending ? 'Yuklanmoqda...' : 'Rasmni Yuklash'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Main>
    </>
  )
}

function formatDateSafely(dateStr: string) {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return String(dateStr)
    return format(d, 'dd.MM.yyyy HH:mm')
  } catch {
    return String(dateStr)
  }
}
