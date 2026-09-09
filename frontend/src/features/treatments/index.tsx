import { useState, useRef, useEffect } from 'react'
import {
  Plus,
  Camera,
  FileText,
  CreditCard,
  Search,
  X,
  Stethoscope,
} from 'lucide-react'
import { Link, useSearch } from '@tanstack/react-router'
import { format } from 'date-fns'
import { MobileImageUploader } from '@/components/ui/mobile-image-uploader'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { TablePagination } from '@/components/ui/table-pagination'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { ActiveTreatmentSession } from '@/components/treatment-session/active-treatment-session'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/get-error-message'

// Teeth FDI quadrants
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11]
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28]
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41]
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38]

const PRIMARY_UPPER_RIGHT = [55, 54, 53, 52, 51]
const PRIMARY_UPPER_LEFT = [61, 62, 63, 64, 65]
const PRIMARY_LOWER_RIGHT = [85, 84, 83, 82, 81]
const PRIMARY_LOWER_LEFT = [71, 72, 73, 74, 75]

const SURFACES_LIST = [
  { code: 'O', label: 'Oklyuzal / Kesuvchi (O)' },
  { code: 'M', label: 'Medial / Oldi (M)' },
  { code: 'D', label: 'Distal / Orqa (D)' },
  { code: 'V', label: 'Vestibulyar / Lab (V)' },
  { code: 'L', label: 'Lingval / Tanglay (L)' },
]

export function TreatmentsList() {
  const searchParams = useSearch({ strict: false }) as {
    newPatientId?: string
    newDoctorId?: string
    newAppointmentId?: string
    activeTreatmentId?: string
  }

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTreatmentForPhoto, setSelectedTreatmentForPhoto] = useState<Treatment | null>(null)
  const [selectedTreatmentForSession, setSelectedTreatmentForSession] = useState<Treatment | null>(null)
  const [photoType, setPhotoType] = useState<'before' | 'after' | 'xray'>('before')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // Search, Filter & Pagination State
  const [searchTerm, setSearchTerm] = useState('')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('')
  const [stageFilter, setStageFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    setPage(1)
  }, [searchTerm, paymentStatusFilter, stageFilter])

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

  // Multi-tooth & surfaces selection
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([])
  const [selectedSurfaces, setSelectedSurfaces] = useState<string[]>([])
  const [showChildTeeth, setShowChildTeeth] = useState(false)

  const { data: treatmentsData, isLoading } = useTreatments({
    search: searchTerm.trim() || undefined,
    payment_status: paymentStatusFilter && paymentStatusFilter !== 'all' ? paymentStatusFilter : undefined,
    stage: stageFilter && stageFilter !== 'all' ? stageFilter : undefined,
    page,
    page_size: pageSize,
  })
  const treatments = Array.isArray(treatmentsData?.results)
    ? treatmentsData.results
    : Array.isArray(treatmentsData)
    ? treatmentsData
    : []
  const totalCount = treatmentsData?.count ?? treatments.length

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

  // Handle URL deep-linking from Appointments or Patients
  useEffect(() => {
    if (searchParams?.newPatientId || searchParams?.newAppointmentId || searchParams?.newDoctorId) {
      if (searchParams.newPatientId) setPatientId(searchParams.newPatientId)
      if (searchParams.newDoctorId) setDoctorId(searchParams.newDoctorId)
      if (searchParams.newAppointmentId) {
        setAppointmentId(searchParams.newAppointmentId)
        const app = appointments.find((a) => a.id === searchParams.newAppointmentId)
        if (app) {
          if (app.department) {
            setDepartmentId(typeof app.department === 'object' ? (app.department as any).id : app.department)
          }
          if (app.procedureType) {
            setProcedureTypeId(typeof app.procedureType === 'object' ? (app.procedureType as any).id : app.procedureType)
          }
        }
      }
      setIsModalOpen(true)
    }
  }, [searchParams, appointments])

  // If activeTreatmentId is passed in URL, open active session
  useEffect(() => {
    if (searchParams?.activeTreatmentId && treatments.length > 0) {
      const match = treatments.find((t: any) => t.id === searchParams.activeTreatmentId)
      if (match) setSelectedTreatmentForSession(match)
    }
  }, [searchParams, treatments])

  const toggleTooth = (tooth: number) => {
    setSelectedTeeth((prev) =>
      prev.includes(tooth) ? prev.filter((t) => t !== tooth) : [...prev, tooth]
    )
  }

  const toggleSurface = (code: string) => {
    setSelectedSurfaces((prev) =>
      prev.includes(code) ? prev.filter((s) => s !== code) : [...prev, code]
    )
  }

  const handleCreateTreatment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId || !doctorId || !departmentId || !procedureTypeId || !price) {
      toast.error('Barcha majburiy maydonlarni to’ldiring.')
      return
    }

    if (isSubmittingRef.current) return
    isSubmittingRef.current = true

    const discountPercent = defaultPrice > 0 ? ((defaultPrice - Number(price)) / defaultPrice) * 100 : 0
    try {
      await createTreatmentMutation.mutateAsync({
        appointment: appointmentId || undefined,
        patient: patientId,
        doctor: doctorId,
        department: departmentId,
        procedureType: procedureTypeId,
        diagnosis: diagnosis.trim() || undefined,
        description: description.trim() || undefined,
        price,
        discountReason: discountPercent > 10 ? discountReason : undefined,
        teeth: selectedTeeth.length > 0 ? selectedTeeth : undefined,
        surfaces: selectedSurfaces.length > 0 ? selectedSurfaces : undefined,
      } as any)
      toast.success('Davolash yozuvi muvaffaqiyatli saqlandi!')
      setIsModalOpen(false)
      // Reset form
      setAppointmentId('')
      setPatientId('')
      setDoctorId('')
      setDepartmentId('')
      setProcedureTypeId('')
      setDiagnosis('')
      setDescription('')
      setPrice('')
      setDefaultPrice(0)
      setDiscountReason('')
      setSelectedTeeth([])
      setSelectedSurfaces([])
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Saqlashda xatolik yuz berdi.'))
    } finally {
      isSubmittingRef.current = false
    }
  }

  const handleUploadPhoto = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTreatmentForPhoto || !selectedFile) {
      toast.error('Fayl tanlang.')
      return
    }

    try {
      await uploadPhotoMutation.mutateAsync({
        treatmentId: selectedTreatmentForPhoto.id,
        file: selectedFile,
        photoType,
      })
      toast.success('Rasm muvaffaqiyatli yuklandi!')
      setSelectedFile(null)
      setSelectedTreatmentForPhoto(null)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Rasm yuklashda xatolik yuz berdi.'))
    }
  }

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <span>🦷 Muolajalar va Davolash Seanslari</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <div className='mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Klinik Davolashlar (Treatments)</h1>
            <p className='text-xs text-muted-foreground'>
              Bemorlarning davolash yozuvlari, tish kartalari, fotosuratlari va kassa dalolatnomalari.
            </p>
          </div>
          <Button onClick={() => setIsModalOpen(true)} className='shadow h-8 text-xs gap-1.5'>
            <Plus className='h-4 w-4' /> Yangi Davolash Yozish
          </Button>
        </div>

        {/* Search & Filters */}
        <div className='mb-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-wrap'>
          <div className='flex items-center gap-2.5 flex-1 min-w-[240px] max-w-md'>
            <div className='relative w-full'>
              <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
              <Input
                type='text'
                placeholder='Bemor ismi, telefon yoki tashxis...'
                className='pl-8 h-9 text-xs'
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type='button'
                  onClick={() => setSearchTerm('')}
                  className='absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground'
                >
                  <X className='h-3.5 w-3.5' />
                </button>
              )}
            </div>
          </div>

          <div className='flex items-center gap-2 flex-wrap'>
            <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
              <SelectTrigger className='w-[160px] h-9 text-xs'>
                <SelectValue placeholder="To'lov holati" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>Barcha to'lovlar</SelectItem>
                <SelectItem value='paid'>To'langan</SelectItem>
                <SelectItem value='partial'>Qisman to'langan</SelectItem>
                <SelectItem value='unpaid'>To'lanmagan</SelectItem>
              </SelectContent>
            </Select>

            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className='w-[150px] h-9 text-xs'>
                <SelectValue placeholder='Bosqich' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>Barcha bosqichlar</SelectItem>
                <SelectItem value='in_progress'>Jarayonda</SelectItem>
                <SelectItem value='completed'>Yakunlangan</SelectItem>
              </SelectContent>
            </Select>

            {(searchTerm || (paymentStatusFilter && paymentStatusFilter !== 'all') || (stageFilter && stageFilter !== 'all')) && (
              <Button
                variant='ghost'
                size='sm'
                className='h-9 px-2 text-xs text-muted-foreground hover:text-foreground'
                onClick={() => {
                  setSearchTerm('')
                  setPaymentStatusFilter('')
                  setStageFilter('')
                }}
              >
                <X className='me-1 h-3.5 w-3.5' /> Tozalash
              </Button>
            )}
          </div>
        </div>

        {/* Treatments Table */}
        <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
          <Table>
            <TableHeader>
              <TableRow className='bg-muted/30'>
                <TableHead className='text-xs font-semibold'>Bemor</TableHead>
                <TableHead className='text-xs font-semibold'>Shifokor</TableHead>
                <TableHead className='text-xs font-semibold'>Tashxis & Tishlar</TableHead>
                <TableHead className='text-xs font-semibold'>Narx (so'm)</TableHead>
                <TableHead className='text-xs font-semibold'>To'lov</TableHead>
                <TableHead className='text-xs font-semibold'>Bosqich</TableHead>
                <TableHead className='text-xs font-semibold text-end'>Harakatlar</TableHead>
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
                  const patientIdVal = t.patientId || (typeof t.patient === 'object' ? (t.patient as any)?.id : t.patient)
                  const patientName = t.patientName || (typeof t.patient === 'object' ? `${(t.patient as any).firstName || ''} ${(t.patient as any).lastName || ''}`.trim() : '') || 'Bemor'
                  const doctorName = t.doctorName || (typeof t.doctor === 'object' && (t.doctor as any)?.user ? `Dr. ${(t.doctor as any).user.firstName || ''} ${(t.doctor as any).user.lastName || ''}`.trim() : '') || 'Shifokor'
                  const procedureTypeName = t.procedureTypeName || (typeof t.procedureType === 'object' ? (t.procedureType as any)?.name : '') || ''
                  const approvalStatus = t.approvalStatus || t.approval_status || 'approved'
                  const hasDiscount = Number(t.discountPercent || t.discount_percent || 0) > 0
                  const toothRecordsList: any[] = t.toothRecords || []

                  return (
                    <TableRow key={t.id} className='hover:bg-muted/20'>
                      <TableCell className='font-medium text-xs'>
                        {patientIdVal ? (
                          <Link
                            to='/patients/$id'
                            params={{ id: String(patientIdVal) }}
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
                        <div className='flex items-center gap-1.5 flex-wrap mt-0.5'>
                          {procedureTypeName && <span className='text-[10px] text-muted-foreground'>{procedureTypeName}</span>}
                          {toothRecordsList.length > 0 && (
                            <div className='flex items-center gap-1'>
                              {toothRecordsList.map((rec: any) => (
                                <Badge key={rec.id || rec.toothNumber} variant='outline' className='text-[9px] px-1 py-0 h-4 bg-muted/40 font-mono'>
                                  #{rec.toothNumber}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
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
                                ❌ Rad etilgan
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
                      <TableCell className='text-end'>
                        <div className='flex items-center justify-end gap-1.5 flex-wrap'>
                          {/* Davolash seansini ochish */}
                          <Button
                            size='sm'
                            variant='default'
                            className='h-7 text-xs gap-1 bg-primary hover:bg-primary/90 text-primary-foreground font-medium'
                            onClick={() => setSelectedTreatmentForSession(t)}
                          >
                            <Stethoscope className='h-3.5 w-3.5' /> Davolash
                          </Button>

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
                            <FileText className='h-3.5 w-3.5' /> PDF
                          </Button>

                          <Button
                            size='sm'
                            variant='ghost'
                            className='h-7 text-xs gap-1'
                            onClick={() => setSelectedTreatmentForPhoto(t)}
                          >
                            <Camera className='h-3.5 w-3.5' />
                            {Array.isArray(t.photos) && t.photos.length > 0 && (
                              <span className='text-[10px] font-mono'>({t.photos.length})</span>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Table Pagination */}
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          className='mt-2'
        />

        {/* Create Treatment Modal with Multi-Tooth Selector */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className='sm:max-w-2xl max-h-[90vh] overflow-y-auto'>
            <DialogHeader>
              <DialogTitle>Yangi Davolash Yozuvi Yaratish</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreateTreatment} className='space-y-4 py-2'>
              <div className='space-y-1'>
                <label className='text-xs font-medium'>Navbat (Appointment) - Ixtiyoriy</label>
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
                  <SelectTrigger className='text-xs h-9'>
                    <SelectValue placeholder='Navbatni tanlang (agar bor bo’lsa)' />
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
                    <SelectTrigger className='text-xs h-9'>
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
                    <SelectTrigger className='text-xs h-9'>
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

              {/* Teeth Multi-Selector Section */}
              <div className='border rounded-xl p-3 bg-muted/20 space-y-2'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-1.5 text-xs font-bold text-foreground'>
                    <span>🦷 Davolanayotgan Tishlar (Odontogram)</span>
                    {selectedTeeth.length > 0 && (
                      <Badge variant='secondary' className='text-[10px] font-mono'>
                        {selectedTeeth.length} ta tish
                      </Badge>
                    )}
                  </div>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() => setShowChildTeeth(!showChildTeeth)}
                    className='h-6 text-[11px] text-muted-foreground hover:text-primary'
                  >
                    {showChildTeeth ? 'Doimiy tishlar' : 'Sut tishlari (Bolalar)'}
                  </Button>
                </div>

                {/* Adult Teeth Grid */}
                {!showChildTeeth ? (
                  <div className='space-y-1.5'>
                    {/* Upper */}
                    <div className='flex justify-center gap-1'>
                      {UPPER_RIGHT.map((n) => (
                        <button
                          key={n}
                          type='button'
                          onClick={() => toggleTooth(n)}
                          className={`w-7 h-7 text-xs font-mono font-bold rounded border transition-colors ${
                            selectedTeeth.includes(n)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-card text-foreground hover:bg-muted'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                      <div className='w-2' />
                      {UPPER_LEFT.map((n) => (
                        <button
                          key={n}
                          type='button'
                          onClick={() => toggleTooth(n)}
                          className={`w-7 h-7 text-xs font-mono font-bold rounded border transition-colors ${
                            selectedTeeth.includes(n)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-card text-foreground hover:bg-muted'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    {/* Lower */}
                    <div className='flex justify-center gap-1'>
                      {LOWER_RIGHT.map((n) => (
                        <button
                          key={n}
                          type='button'
                          onClick={() => toggleTooth(n)}
                          className={`w-7 h-7 text-xs font-mono font-bold rounded border transition-colors ${
                            selectedTeeth.includes(n)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-card text-foreground hover:bg-muted'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                      <div className='w-2' />
                      {LOWER_LEFT.map((n) => (
                        <button
                          key={n}
                          type='button'
                          onClick={() => toggleTooth(n)}
                          className={`w-7 h-7 text-xs font-mono font-bold rounded border transition-colors ${
                            selectedTeeth.includes(n)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-card text-foreground hover:bg-muted'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Child Teeth Grid */
                  <div className='space-y-1.5'>
                    <div className='flex justify-center gap-1'>
                      {PRIMARY_UPPER_RIGHT.map((n) => (
                        <button
                          key={n}
                          type='button'
                          onClick={() => toggleTooth(n)}
                          className={`w-7 h-7 text-xs font-mono font-bold rounded border transition-colors ${
                            selectedTeeth.includes(n)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-card text-foreground hover:bg-muted'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                      <div className='w-2' />
                      {PRIMARY_UPPER_LEFT.map((n) => (
                        <button
                          key={n}
                          type='button'
                          onClick={() => toggleTooth(n)}
                          className={`w-7 h-7 text-xs font-mono font-bold rounded border transition-colors ${
                            selectedTeeth.includes(n)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-card text-foreground hover:bg-muted'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className='flex justify-center gap-1'>
                      {PRIMARY_LOWER_RIGHT.map((n) => (
                        <button
                          key={n}
                          type='button'
                          onClick={() => toggleTooth(n)}
                          className={`w-7 h-7 text-xs font-mono font-bold rounded border transition-colors ${
                            selectedTeeth.includes(n)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-card text-foreground hover:bg-muted'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                      <div className='w-2' />
                      {PRIMARY_LOWER_LEFT.map((n) => (
                        <button
                          key={n}
                          type='button'
                          onClick={() => toggleTooth(n)}
                          className={`w-7 h-7 text-xs font-mono font-bold rounded border transition-colors ${
                            selectedTeeth.includes(n)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-card text-foreground hover:bg-muted'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Surfaces Selector */}
                <div className='pt-2 border-t mt-2'>
                  <span className='text-[11px] font-semibold text-muted-foreground block mb-1'>
                    Tish Sirtlari (Surfaces):
                  </span>
                  <div className='flex flex-wrap gap-1.5'>
                    {SURFACES_LIST.map((s) => (
                      <button
                        key={s.code}
                        type='button'
                        onClick={() => toggleSurface(s.code)}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                          selectedSurfaces.includes(s.code)
                            ? 'bg-primary/20 border-primary text-primary font-bold'
                            : 'bg-background hover:bg-muted text-muted-foreground'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-medium'>Tashxis (Diagnosis)</label>
                <Input
                  placeholder='Karies, Pulpit, Periodontit...'
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  className='text-xs h-9'
                />
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-medium'>Muolaja Narxi (so'm) *</label>
                <Input
                  type='number'
                  placeholder='300000'
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className='text-xs h-9'
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
                    className='text-xs h-9'
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
                  className='text-xs'
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

        {/* Active Treatment Session Modal (Treatment Workspace) */}
        <Dialog open={selectedTreatmentForSession !== null} onOpenChange={(open) => !open && setSelectedTreatmentForSession(null)}>
          <DialogContent className='sm:max-w-4xl max-h-[92vh] overflow-y-auto p-4 sm:p-6'>
            <DialogHeader className='border-b pb-3'>
              <DialogTitle className='text-lg font-bold flex items-center gap-2'>
                <Stethoscope className='h-5 w-5 text-primary' />
                Davolash Seansi va Tish Kartasi
              </DialogTitle>
            </DialogHeader>

            {selectedTreatmentForSession && (
              <ActiveTreatmentSession
                treatmentId={selectedTreatmentForSession.id}
                appointmentId={
                  selectedTreatmentForSession.appointmentId ||
                  (typeof selectedTreatmentForSession.appointment === 'object'
                    ? (selectedTreatmentForSession.appointment as any)?.id
                    : selectedTreatmentForSession.appointment) ||
                  ''
                }
                patientId={
                  selectedTreatmentForSession.patientId ||
                  (typeof selectedTreatmentForSession.patient === 'object'
                    ? (selectedTreatmentForSession.patient as any)?.id
                    : selectedTreatmentForSession.patient) ||
                  ''
                }
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Photo Gallery & Comparison Modal */}
        <Dialog open={selectedTreatmentForPhoto !== null} onOpenChange={(open) => !open && setSelectedTreatmentForPhoto(null)}>
          <DialogContent className='sm:max-w-2xl max-h-[90vh] overflow-y-auto'>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2'>
                <Camera className='h-5 w-5 text-primary' />
                Davolash Fotosuratlari va Rentgen
              </DialogTitle>
            </DialogHeader>

            {selectedTreatmentForPhoto && (
              <Tabs defaultValue='compare' className='w-full'>
                <TabsList className='grid grid-cols-2 w-full'>
                  <TabsTrigger value='compare'>Taqqoslash (Before & After)</TabsTrigger>
                  <TabsTrigger value='upload'>Yangi Foto Yuklash</TabsTrigger>
                </TabsList>

                {/* TAB: COMPARE */}
                <TabsContent value='compare' className='pt-3 space-y-4'>
                  {Array.isArray(selectedTreatmentForPhoto.photos) && selectedTreatmentForPhoto.photos.length > 0 ? (
                    <div className='space-y-4'>
                      <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                        {/* Before photo */}
                        <div className='border rounded-xl p-3 bg-muted/20 text-center space-y-2'>
                          <Badge variant='outline' className='text-xs font-bold text-amber-600 border-amber-400'>
                            Davolashdan Oldin (Before)
                          </Badge>
                          {selectedTreatmentForPhoto.photos.find((p: any) => p.photoType === 'before') ? (
                            <img
                              src={selectedTreatmentForPhoto.photos.find((p: any) => p.photoType === 'before')?.imageUrl || ''}
                              alt='Before'
                              className='w-full h-48 object-cover rounded-lg border shadow-xs'
                            />
                          ) : (
                            <div className='h-48 border border-dashed rounded-lg flex items-center justify-center text-xs text-muted-foreground'>
                              Oldingi rasm yuklanmagan
                            </div>
                          )}
                        </div>

                        {/* After photo */}
                        <div className='border rounded-xl p-3 bg-muted/20 text-center space-y-2'>
                          <Badge variant='outline' className='text-xs font-bold text-emerald-600 border-emerald-400'>
                            Davolashdan Keyin (After)
                          </Badge>
                          {selectedTreatmentForPhoto.photos.find((p: any) => p.photoType === 'after') ? (
                            <img
                              src={selectedTreatmentForPhoto.photos.find((p: any) => p.photoType === 'after')?.imageUrl || ''}
                              alt='After'
                              className='w-full h-48 object-cover rounded-lg border shadow-xs'
                            />
                          ) : (
                            <div className='h-48 border border-dashed rounded-lg flex items-center justify-center text-xs text-muted-foreground'>
                              Keyingi rasm yuklanmagan
                            </div>
                          )}
                        </div>
                      </div>

                      {/* X-Ray Photos */}
                      {selectedTreatmentForPhoto.photos.some((p: any) => p.photoType === 'xray') && (
                        <div className='border rounded-xl p-3 bg-muted/10 space-y-2'>
                          <Badge variant='secondary' className='text-xs font-bold'>
                            Rentgen Tasvirlar (X-Ray)
                          </Badge>
                          <div className='grid grid-cols-2 sm:grid-cols-3 gap-2'>
                            {selectedTreatmentForPhoto.photos
                              .filter((p: any) => p.photoType === 'xray')
                              .map((p: any) => (
                                <img
                                  key={p.id}
                                  src={p.imageUrl || ''}
                                  alt='X-Ray'
                                  className='w-full h-32 object-cover rounded-md border'
                                />
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className='py-8 text-center text-xs text-muted-foreground border rounded-xl border-dashed'>
                      Ushbu davolash uchun hozircha fotosuratlar yuklanmagan. "Yangi Foto Yuklash" bo'limidan qo'shishingiz mumkin.
                    </div>
                  )}
                </TabsContent>

                {/* TAB: UPLOAD */}
                <TabsContent value='upload' className='pt-3'>
                  <form onSubmit={handleUploadPhoto} className='space-y-4'>
                    <div className='space-y-1'>
                      <label className='text-xs font-medium'>Rasm turi (Photo Type)</label>
                      <Select value={photoType} onValueChange={(val: 'before' | 'after' | 'xray') => setPhotoType(val)}>
                        <SelectTrigger className='text-xs h-9'>
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
                      <label className='text-xs font-medium mb-1 block'>Foto Fayl / Kamera</label>
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
                        Yopish
                      </Button>
                      <Button type='submit' disabled={uploadPhotoMutation.isPending || !selectedFile}>
                        {uploadPhotoMutation.isPending ? 'Yuklanmoqda...' : 'Rasmni Yuklash'}
                      </Button>
                    </DialogFooter>
                  </form>
                </TabsContent>
              </Tabs>
            )}
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
