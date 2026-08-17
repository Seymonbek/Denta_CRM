import { useState, useRef } from 'react'
import { Plus, Camera, FileText, CreditCard } from 'lucide-react'
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
import { type Treatment } from '@/types/api'
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
  const [defaultPrice, setDefaultPrice] = useState<number>(0)
  const [discountReason, setDiscountReason] = useState('')

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

  const isSubmittingRef = useRef(false)

  const handleCreateTreatment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appointmentId || !patientId || !doctorId || !departmentId || !procedureTypeId || !price) {
      toast.error('Barcha majburiy maydonlarni to’ldiring.')
      return
    }
    
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true

    const discountPercent = defaultPrice > 0 ? ((defaultPrice - Number(price)) / defaultPrice) * 100 : 0
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
        originalPrice: defaultPrice > 0 ? defaultPrice : undefined,
        discountPercent: discountPercent > 0 ? discountPercent : 0,
        discountReason: discountReason || undefined,
      })
      toast.success('Davolash yozuvi yaratildi!')
      setIsModalOpen(false)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Yaratishda xatolik yuz berdi.'))
    } finally {
      isSubmittingRef.current = false
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
    } catch (err: unknown) {
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
        <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
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
                  const patientId = t.patientId || (typeof t.patient === 'object' ? (t.patient as any)?.id : t.patient)
                  const patientName = t.patientName || (typeof t.patient === 'object' ? `${(t.patient as any).firstName || ''} ${(t.patient as any).lastName || ''}`.trim() : '') || 'Bemor'
                  const doctorName = t.doctorName || (typeof t.doctor === 'object' && (t.doctor as any)?.user ? `Dr. ${(t.doctor as any).user.firstName || ''} ${(t.doctor as any).user.lastName || ''}`.trim() : '') || 'Shifokor'
                  const procedureTypeName = t.procedureTypeName || (typeof t.procedureType === 'object' ? (t.procedureType as any)?.name : '') || ''
                  const approvalStatus = t.approvalStatus || t.approval_status || 'approved'
                  const hasDiscount = Number(t.discountPercent || t.discount_percent || 0) > 0

                  return (
                    <TableRow key={t.id} className='hover:bg-muted/20'>
                      <TableCell className='font-medium text-xs'>
                        {patientId ? (
                          <Link
                            to='/patients/$id'
                            params={{ id: String(patientId) }}
                            className='text-primary hover:underline font-bold flex items-center gap-1'
                          >
                            {patientName}
                          </Link>
                        ) : (
                          <span className="font-bold">{patientName}</span>
                        )}
                      </TableCell>
                      <TableCell className='text-xs text-muted-foreground font-medium'>
                        {doctorName}
                      </TableCell>
                      <TableCell className='text-xs max-w-xs'>
                        <p className='font-semibold truncate'>{t.diagnosis || 'Tashxis kiritilmagan'}</p>
                        {procedureTypeName && <p className='text-[10px] text-muted-foreground truncate'>{procedureTypeName}</p>}
                      </TableCell>
                      <TableCell className='text-xs'>
                        <span className="font-mono font-bold block">{Number(t.price || 0).toLocaleString()} so'm</span>
                        {hasDiscount && (
                          <div className="mt-0.5">
                            {approvalStatus === 'pending' ? (
                              <Badge variant='outline' className='text-[9px] bg-amber-500/10 text-amber-600 border-amber-300'>
                                ⏳ Chegirma kutilmoqda ({t.discountPercent || t.discount_percent}%)
                              </Badge>
                            ) : approvalStatus === 'rejected' ? (
                              <Badge variant='destructive' className='text-[9px] px-1 py-0'>
                                ❌ Chegirma rad etilgan
                              </Badge>
                            ) : (
                              <span className='text-[10px] text-emerald-600 font-medium'>
                                Chegirma: {t.discountPercent || t.discount_percent}%
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className='text-xs'>
                        <Badge
                          variant={
                            t.paymentStatus === 'paid'
                              ? 'default'
                              : t.paymentStatus === 'partial'
                              ? 'secondary'
                              : 'destructive'
                          }
                          className='text-[10px]'
                        >
                          {t.paymentStatus === 'paid'
                            ? "To'langan"
                            : t.paymentStatus === 'partial'
                            ? "Qisman to'langan"
                            : "To'lanmagan"}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-xs'>
                        <Badge variant='outline' className='text-[10px] uppercase'>
                          {t.stage === 'completed' ? 'Yakunlangan' : 'Jarayonda'}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-end flex items-center justify-end gap-1.5'>
                        {t.paymentStatus !== 'paid' && (
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
                    const app = appointments.find((a) => a.id === val)
                    if (app) {
                      setPatientId(typeof app.patient === 'object' ? (app.patient as any).id : app.patient)
                      setDoctorId(typeof app.doctor === 'object' ? (app.doctor as any).id : app.doctor)
                      setDepartmentId(typeof app.department === 'object' ? (app.department as any).id : app.department)
                      if (app.procedureType) {
                        setProcedureTypeId(typeof app.procedureType === 'object' ? (app.procedureType as any).id : app.procedureType)
                      }
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Navbatni tanlang' />
                  </SelectTrigger>
                  <SelectContent>
                    {appointments.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {formatDateSafely(a.scheduledStart)} - {a.patientName || 'Bemor'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Bemor *</label>
                  <SearchableSelect
                    options={patients.map((p) => ({
                      value: String(p.id),
                      label: `${p.firstName || ''} ${p.lastName || ''}`,
                      sublabel: p.phoneNumber || '',
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
                    options={doctors.map((d) => ({
                      value: String(d.id),
                      label: `Dr. ${d.user?.firstName || ''} ${d.user?.lastName || ''}`,
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
                      {departments.map((d) => (
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
                      const proc = procedureTypes.find((p) => p.id === val)
                      if (proc) {
                        const dp = Number(proc.defaultPrice || 0)
                        setDefaultPrice(dp)
                        setPrice(String(dp))
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Muolaja' />
                    </SelectTrigger>
                    <SelectContent>
                      {procedureTypes.map((p) => (
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
                {defaultPrice > 0 && Number(price) < defaultPrice && (
                  <p className='text-[10px] text-muted-foreground mt-1'>
                    Asl narx: {Number(defaultPrice).toLocaleString()} so'm 
                    ({(((defaultPrice - Number(price)) / defaultPrice) * 100).toFixed(1)}% chegirma)
                  </p>
                )}
                {defaultPrice > 0 && ((defaultPrice - Number(price)) / defaultPrice) * 100 > 10 && (
                  <Badge variant='destructive' className='text-[10px] mt-1'>
                    Diqqat! 10% dan yuqori chegirma bosh shifokor tasdig'ini talab qiladi.
                  </Badge>
                )}
              </div>

              {defaultPrice > 0 && ((defaultPrice - Number(price)) / defaultPrice) * 100 > 10 && (
                <div className='space-y-1 mt-2'>
                  <label className='text-xs font-medium text-destructive'>Chegirma Sababi *</label>
                  <Input
                    placeholder='Chegirma berish sababini yozing...'
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    required
                  />
                </div>
              )}

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
                <Select value={photoType} onValueChange={(val: 'before' | 'after' | 'xray') => setPhotoType(val)}>
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
                />
                {selectedFile && (
                  <p className='text-xs text-emerald-500 font-medium mt-1'>
                    Tanlangan: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
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
