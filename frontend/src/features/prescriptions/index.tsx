import { useState, useRef, useEffect, useMemo } from 'react'
import {
  FileText,
  Send,
  Plus,
  Search,
  Eye,
  Pill,
  Calendar,
  User,
  Printer,
  Download,
  Sparkles,
  Copy,
  Check,
  Stethoscope,
  CheckCircle2,
  BookmarkPlus,
} from 'lucide-react'
import { TablePagination } from '@/components/ui/table-pagination'
import {
  usePrescriptionTemplates,
  useCreatePrescriptionTemplate,
  usePrescriptions,
  useIssuePrescription,
} from '@/api/hooks/use-prescriptions'
import { useTreatments } from '@/api/hooks/use-treatments'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { useReactToPrint } from 'react-to-print'
import { PrescriptionPrint } from '@/components/print/prescription-print'
import { type Treatment, type PrescriptionTemplate } from '@/types/api'
import { format, isThisMonth } from 'date-fns'

interface ClinicalPreset {
  id: string
  title: string
  category: string
  icon: string
  badgeText: string
  content: string
}

const CLINICAL_PRESETS: ClinicalPreset[] = [
  {
    id: 'caries-fluoride',
    title: "Kariesdan so'ng ftorlash & remineralizatsiya",
    category: 'Terapevtik',
    icon: '🦷',
    badgeText: 'Profilaktika',
    content: `1. R.O.C.S. Medical Minerals remineralizatsiya geli - tishlar tozalangach kuniga 2 mahal 14 kun davomida surtilsin.
2. Tish cho'tkasini yumshoq (Soft) turiga almashtirish tavsiya etiladi.
3. Ftor miqdori yuqori (1450 ppm) bo'lgan tish pastasi bilan kuniga 2 marta yuvish.
4. Shirin va gazlangan ichimliklarni cheklash.`,
  },
  {
    id: 'pulpitis-pain',
    title: "Pulpit / Ildiz kanali davolash (Og'riq qoldiruvchi)",
    category: 'Endodontiya',
    icon: '⚡',
    badgeText: "Og'riqsizlantirish",
    content: `1. Nimesil (100mg) - 1 paket ovqatdan so'ng og'riq paydo bo'lganda (kuniga ko'pi bilan 2 mahal, 3 kun).
2. Tavegil yoki Suprastin 1 tabletka - kechki uyqudan oldin (shish va sezuvchanlikni kamaytirish uchun).
3. Iliq tuzli va sodali suv bilan (1 stakan suvga 0.5 choy qoshiqdan) kuniga 3-4 mahal og'izni chayish.
4. Muolaja qilingan tish bilan 2 kun davomida qattiq ovqat chaynamaslik!`,
  },
  {
    id: 'extraction-antibiotic',
    title: "Tish sug'urish (Ekstraktsiya)dan so'ng antibakterial",
    category: 'Jarrohlik',
    icon: '🩹',
    badgeText: 'Jarrohlik',
    content: `1. Amoxicillin 500mg (yoki Amoxiclav 625mg) - 1 tabletkadan kuniga 3 mahal 5 kun (ovqatdan so'ng).
2. Ketonal 50mg (yoki Nimesil) - og'riq bo'lsa 1 tabletka/paket ovqatdan so'ng.
3. Xlorgeksidin 0.05% eritmasi - operatsiyadan keyingi 2-kundan boshlab og'iz bo'shlig'ida sokin vanna qilish (kuchli chayqamaslik!).
4. Doka tamponini 20 daqiqadan so'ng ehtiyotkorlik bilan tashlang.
5. 2 soat davomida ovqatlanmang; issiq ovqat, hammom va jismoniy zo'riqish 3 kunga taqiqlanadi!`,
  },
  {
    id: 'periodontitis-gum',
    title: 'Periodontit va milk qonashi (Gingivit)',
    category: 'Parodontologiya',
    icon: '🌿',
    badgeText: 'Milklarni davolash',
    content: `1. Metrogil Denta geli - tishlar yuvilgach milklarga kuniga 2 mahal 7-10 kun davomida surtilsin (surgandan so'ng 30 daqiqa chayilmasin va ovqatlanilmasin).
2. Xlorgeksidin 0.05% yoki Stomatofit - ovqatdan so'ng og'izni 1 daqiqa chayish (7 kun).
3. Vitamin C 500mg - kuniga 1 mahal ovqatdan so'ng 10 kun.
4. Tishlararo cho'tka (interdental brush) va tish ipidan (floss) foydalanish.`,
  },
  {
    id: 'implant-postop',
    title: 'Implantatsiya operatsiyasidan keyingi rejim',
    category: 'Implantologiya',
    icon: '🛡️',
    badgeText: 'Implantatsiya',
    content: `1. Augmentin (Amoxiclav) 875/125mg - 1 tabletkadan har 12 soatda 7 kun (ovqat vaqtida).
2. Nimesil - og'riq va yallig'lanishga qarshi 1 paketdan kuniga 2 mahal 3 kun.
3. Loratadin 10mg - kechqurun 1 tabletka 3 kun (yumshoq to'qimalar shishini kamaytirish uchun).
4. Muzli kompress - operatsiya sohasiga tashqi yuzadan 15 daqiqa qo'yish, 15 daqiqa dam olish (dastlabki 24 soat).
5. Xlorgeksidin 0.05% - operatsiyadan keyingi 2-kundan boshlab ehtiyotkorlik bilan vanna qilish.`,
  },
]

export function PrescriptionsList() {
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false)
  const [selectedPrescriptionDetail, setSelectedPrescriptionDetail] = useState<any>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    setPage(1)
  }, [searchTerm, statusFilter])

  // Template Form State
  const [templateName, setTemplateName] = useState('')
  const [templateContent, setTemplateContent] = useState('')

  // Issue Form State
  const [treatmentId, setTreatmentId] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [issueContent, setIssueContent] = useState('')
  const [sendTelegram, setSendTelegram] = useState(true)

  const { data: templatesData = [] } = usePrescriptionTemplates()
  const templates: PrescriptionTemplate[] = Array.isArray(templatesData) ? templatesData : []

  const { data: prescriptionsData, isLoading: isPrescriptionsLoading } = usePrescriptions()
  const prescriptionsList: any[] = useMemo(() => {
    if (Array.isArray(prescriptionsData?.results)) return prescriptionsData.results
    if (Array.isArray(prescriptionsData)) return prescriptionsData
    return []
  }, [prescriptionsData])

  const { data: treatmentsData } = useTreatments()
  const treatments: Treatment[] = useMemo(() => {
    if (Array.isArray(treatmentsData?.results)) return treatmentsData.results
    if (Array.isArray(treatmentsData)) return treatmentsData
    return []
  }, [treatmentsData])

  const createTemplateMutation = useCreatePrescriptionTemplate()
  const issuePrescriptionMutation = useIssuePrescription()

  const printRef = useRef<HTMLDivElement>(null)
  const [prescriptionToPrint, setPrescriptionToPrint] = useState<any>(null)

  const handlePrintAction = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Retsept_${prescriptionToPrint?.id || 'DentaCRM'}`,
    onAfterPrint: () => setPrescriptionToPrint(null),
  })

  const triggerPrint = (prescription: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setPrescriptionToPrint(prescription)
    setTimeout(() => {
      if (handlePrintAction) handlePrintAction()
    }, 100)
  }

  // Copy helper
  const handleCopyText = (text: string, id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    toast.success("Retsept matni xotiraga nusxalandi!")
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Filter Prescriptions
  const filteredPrescriptions = useMemo(() => {
    return prescriptionsList.filter((p: any) => {
      const text =
        (p?.content || '') +
        (p?.treatment && typeof p.treatment === 'object' ? p.treatment.patient_name || '' : '')
      const matchesSearch = text.toLowerCase().includes(searchTerm.toLowerCase())
      const sentAt = p?.sentToTelegramAt || p?.sent_to_telegram_at || p?.sent_at
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'sent'
          ? Boolean(sentAt)
          : !sentAt
      return matchesSearch && matchesStatus
    })
  }, [prescriptionsList, searchTerm, statusFilter])

  const totalCount = filteredPrescriptions.length
  const paginatedPrescriptions = useMemo(() => {
    return filteredPrescriptions.slice((page - 1) * pageSize, page * pageSize)
  }, [filteredPrescriptions, page, pageSize])

  // Top KPI Metrics
  const kpiStats = useMemo(() => {
    const total = prescriptionsList.length
    const sentTelegramCount = prescriptionsList.filter((p: any) => {
      return Boolean(p?.sentToTelegramAt || p?.sent_to_telegram_at || p?.sent_at)
    }).length
    const thisMonthCount = prescriptionsList.filter((p: any) => {
      const d = p?.createdAt || p?.created_at
      if (!d) return false
      try {
        return isThisMonth(new Date(d))
      } catch {
        return false
      }
    }).length
    const templatesCount = templates.length

    return {
      total,
      sentTelegramCount,
      thisMonthCount,
      templatesCount,
    }
  }, [prescriptionsList, templates])

  // CSV Export
  const handleExportCSV = () => {
    if (filteredPrescriptions.length === 0) {
      toast.info('Eksport qilish uchun retseptlar topilmadi.')
      return
    }

    const headers = [
      'ID',
      'Bemor / Davolash',
      'Shifokor',
      'Telegram Holati',
      'Retsept Mazmuni',
      'Sana',
    ]

    const rows = filteredPrescriptions.map((p: any) => {
      const sentAt = p?.sentToTelegramAt || p?.sent_to_telegram_at || p?.sent_at
      const treatmentDisplay =
        p?.treatment && typeof p.treatment === 'object'
          ? p.treatment.patient_name || p.treatment.diagnosis || 'Davolash yozuvi'
          : `Davolash #${p?.treatment || ''}`

      const doctorName =
        p?.doctor && typeof p.doctor === 'object'
          ? p.doctor.fullName || p.doctor.user?.first_name || 'Shifokor'
          : 'Shifokor'

      const contentClean = String(p?.content || '').replace(/"/g, '""').replace(/\n/g, ' ')
      const dateStr = p?.createdAt || p?.created_at || ''

      return [
        p?.id || '',
        `"${treatmentDisplay.replace(/"/g, '""')}"`,
        `"${doctorName.replace(/"/g, '""')}"`,
        sentAt ? 'Telegram orqali yetkazilgan' : 'Saqlangan (Ofline)',
        `"${contentClean}"`,
        dateStr ? format(new Date(dateStr), 'dd.MM.yyyy HH:mm') : '',
      ].join(',')
    })

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Klinika_Retseptlari_${format(new Date(), 'yyyy-MM-dd')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Retseptlar muvaffaqiyatli CSV faylga yuklab olindi!')
  }

  // Quick Apply Clinical Preset
  const handleApplyPreset = (preset: ClinicalPreset) => {
    setIssueContent(preset.content)
    toast.success(`"${preset.title}" klinik shabloni kiritildi!`)
  }

  // Seed standard presets into DB if missing
  const handleSeedTemplates = async () => {
    const existingNames = new Set(templates.map((t: any) => String(t.name || '').toLowerCase()))
    let addedCount = 0

    for (const preset of CLINICAL_PRESETS) {
      if (!existingNames.has(preset.title.toLowerCase())) {
        try {
          await createTemplateMutation.mutateAsync({
            name: preset.title,
            content: preset.content,
          })
          addedCount++
        } catch {
          // ignore single item fail
        }
      }
    }

    if (addedCount > 0) {
      toast.success(`${addedCount} ta klinik shablon muvaffaqiyatli saqlandi!`)
    } else {
      toast.info('Barcha klinik shablonlar allaqachon mavjud.')
    }
  }

  const treatmentSelectOptions = treatments.map((t: Treatment) => {
    const pName = t.patientName || `Bemor #${t.patient || ''}`
    const proc = t.procedureTypeName || 'Muolaja'
    return {
      value: String(t.id),
      label: `${pName} - ${proc}`,
      sublabel: `Tashxis: ${t.diagnosis || 'Kiritilmagan'} | Narxi: ${Number(t.price || 0).toLocaleString()} so'm`,
    }
  })

  const templateSelectOptions = templates.map((tpl: PrescriptionTemplate) => ({
    value: String(tpl.id),
    label: tpl.name || 'Shablon',
    sublabel: tpl.content ? tpl.content.slice(0, 40) + '...' : '',
  }))

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!templateName || !templateContent) {
      toast.error('Nomi va mazmunini kiriting.')
      return
    }

    try {
      await createTemplateMutation.mutateAsync({
        name: templateName,
        content: templateContent,
      })
      toast.success('Retsept shabloni yaratildi!')
      setIsTemplateModalOpen(false)
      setTemplateName('')
      setTemplateContent('')
    } catch {
      toast.error('Shablon yaratishda xatolik.')
    }
  }

  const handleIssuePrescription = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!treatmentId || (!selectedTemplateId && !issueContent)) {
      toast.error('Davolash yozuvi va retsept mazmunini kiriting.')
      return
    }

    try {
      await issuePrescriptionMutation.mutateAsync({
        treatmentId,
        data: {
          templateId: selectedTemplateId || undefined,
          content: issueContent || undefined,
          sendTelegram,
        },
      })
      toast.success('Retsept rasmiylashtirildi va yuborildi!')
      setIsIssueModalOpen(false)
      setTreatmentId('')
      setSelectedTemplateId('')
      setIssueContent('')
    } catch {
      toast.error('Retsept berishda xatolik yuz berdi.')
    }
  }

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <Pill className='h-5 w-5 text-primary' />
          <span>Retseptlar & Shablonlar</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        {/* Top Header Actions */}
        <div className='mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight flex items-center gap-2'>
              <FileText className='h-6 w-6 text-primary' /> Retseptlar va Klinik Shablonlar
            </h1>
            <p className='text-xs sm:text-sm text-muted-foreground mt-1'>
              Bemorlarga elektron retsept rasmiylashtirish, Telegram botga yetkazish va rasmiy blankada chop etish.
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              variant='outline'
              onClick={handleExportCSV}
              className='text-xs font-semibold hover:bg-muted/60'
            >
              <Download className='me-1.5 h-4 w-4 text-emerald-600' /> Eksport (CSV)
            </Button>
            <Button
              variant='outline'
              onClick={() => setIsTemplateModalOpen(true)}
              className='text-xs font-semibold'
            >
              <Plus className='me-1.5 h-4 w-4' /> Yangi Shablon
            </Button>
            <Button
              onClick={() => setIsIssueModalOpen(true)}
              className='shadow text-xs font-bold gap-1.5'
            >
              <Send className='h-4 w-4' /> Retsept Berish
            </Button>
          </div>
        </div>

        {/* 4 KPI Summary Cards */}
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6'>
          <Card className='border-l-4 border-l-blue-500 shadow-sm'>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>
                Jami Retseptlar
              </CardTitle>
              <Pill className='h-4 w-4 text-blue-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-blue-600 font-mono'>
                {kpiStats.total}
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                Bemorlar uchun rasmiylashtirilgan
              </p>
            </CardContent>
          </Card>

          <Card className='border-l-4 border-l-emerald-500 shadow-sm'>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>
                Shu Oygi Retseptlar
              </CardTitle>
              <Calendar className='h-4 w-4 text-emerald-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-emerald-600 font-mono'>
                {kpiStats.thisMonthCount}
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                Joriy oyda berilgan retseptlar
              </p>
            </CardContent>
          </Card>

          <Card className='border-l-4 border-l-sky-500 shadow-sm'>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>
                Telegram Yetkazildi
              </CardTitle>
              <Send className='h-4 w-4 text-sky-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-sky-600 font-mono'>
                {kpiStats.sentTelegramCount}
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                Bemor botiga to'g'ridan-to'g'ri yuborilgan
              </p>
            </CardContent>
          </Card>

          <Card className='border-l-4 border-l-purple-500 shadow-sm'>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>
                Klinik Shablonlar
              </CardTitle>
              <BookmarkPlus className='h-4 w-4 text-purple-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-purple-600 font-mono'>
                {kpiStats.templatesCount + CLINICAL_PRESETS.length}
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                {kpiStats.templatesCount} ta maxsus, {CLINICAL_PRESETS.length} ta standart andoza
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue='prescriptions' className='space-y-4'>
          <TabsList className='bg-muted/50 p-1'>
            <TabsTrigger value='prescriptions' className='text-xs font-medium gap-1.5'>
              <FileText className='h-3.5 w-3.5' /> Berilgan Retseptlar ({filteredPrescriptions.length})
            </TabsTrigger>
            <TabsTrigger value='templates' className='text-xs font-medium gap-1.5'>
              <Pill className='h-3.5 w-3.5' /> Klinik Shablonlar Katalogi
            </TabsTrigger>
          </TabsList>

          {/* Prescriptions List with Search & Table */}
          <TabsContent value='prescriptions' className='space-y-4'>
            <div className='flex flex-col sm:flex-row items-center justify-between gap-3'>
              <div className='relative w-full sm:w-80'>
                <Search className='absolute left-3 top-2.5 h-4 w-4 text-muted-foreground' />
                <Input
                  placeholder='Retsept yoki bemor izlash...'
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className='ps-9 text-xs h-9'
                />
              </div>

              <div className='flex items-center gap-2 w-full sm:w-auto'>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className='w-full sm:w-56 text-xs h-9'>
                    <SelectValue placeholder='Holat bo’yicha' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>Barcha holatlar</SelectItem>
                    <SelectItem value='sent'>Telegram'ga Yuborilgan</SelectItem>
                    <SelectItem value='saved'>Saqlangan (Ofline)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Prescriptions Table */}
            <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
              <Table className='min-w-[650px] sm:min-w-full'>
                <TableHeader>
                  <TableRow className='bg-muted/30'>
                    <TableHead className='text-xs font-semibold'>Retsept Sarlavhasi</TableHead>
                    <TableHead className='text-xs font-semibold'>Bemor / Davolash</TableHead>
                    <TableHead className='text-xs font-semibold'>Holati</TableHead>
                    <TableHead className='text-xs font-semibold'>Sana</TableHead>
                    <TableHead className='text-xs font-semibold text-end'>Harakatlar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isPrescriptionsLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className='text-center py-8 text-xs text-muted-foreground animate-pulse'>
                        Retseptlar yuklanmoqda...
                      </TableCell>
                    </TableRow>
                  ) : paginatedPrescriptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className='text-center py-10 text-xs text-muted-foreground'>
                        <div className='flex flex-col items-center justify-center gap-2'>
                          <Pill className='h-8 w-8 text-muted-foreground/40' />
                          <span>Hech qanday retsept topilmadi.</span>
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() => setIsIssueModalOpen(true)}
                            className='mt-1 text-xs'
                          >
                            <Send className='h-3.5 w-3.5 mr-1.5' /> Retsept Rasmiylashtirish
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedPrescriptions.map((p: any) => {
                      const sentAt = p?.sentToTelegramAt || p?.sent_to_telegram_at || p?.sent_at || ''
                      const treatmentDisplay =
                        p?.treatment && typeof p.treatment === 'object'
                          ? p.treatment.patient_name || p.treatment.diagnosis || 'Davolash yozuvi'
                          : `Davolash #${p?.treatment || ''}`
                      const contentTitle = p?.content ? String(p.content).split('\n')[0] : 'Retsept yozuvi'
                      const dateStr = p?.createdAt || p?.created_at || ''

                      return (
                        <TableRow
                          key={String(p?.id)}
                          className='hover:bg-muted/20 cursor-pointer transition-colors'
                          onClick={() => setSelectedPrescriptionDetail(p)}
                        >
                          <TableCell className='text-xs font-bold truncate max-w-[240px]'>
                            <div className='flex items-center gap-2'>
                              <div className='p-1.5 rounded-lg bg-primary/10 text-primary shrink-0'>
                                <Pill className='h-4 w-4' />
                              </div>
                              <div className='truncate'>
                                <p className='truncate'>{contentTitle}</p>
                                <p className='text-[10px] font-normal text-muted-foreground truncate'>
                                  {String(p?.content || '').slice(0, 45)}...
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className='text-xs font-medium text-muted-foreground truncate max-w-[200px]'>
                            <div className='flex items-center gap-1.5'>
                              <User className='h-3.5 w-3.5 text-primary/70 shrink-0' />
                              <span className='truncate'>{treatmentDisplay}</span>
                            </div>
                          </TableCell>
                          <TableCell className='text-xs'>
                            {sentAt ? (
                              <Badge variant='default' className='text-[10px] bg-emerald-600 hover:bg-emerald-600 px-2 py-0.5 gap-1'>
                                <Send className='h-3 w-3' /> Telegram'da
                              </Badge>
                            ) : (
                              <Badge variant='secondary' className='text-[10px] px-2 py-0.5'>
                                Saqlangan
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className='text-xs text-muted-foreground whitespace-nowrap'>
                            {dateStr ? format(new Date(dateStr), 'dd.MM.yyyy HH:mm') : '—'}
                          </TableCell>
                          <TableCell className='text-end'>
                            <div className='flex items-center justify-end gap-1.5'>
                              <Button
                                variant='ghost'
                                size='sm'
                                className='h-7 w-7 p-0 text-muted-foreground hover:text-foreground'
                                title='Nusxa olish'
                                onClick={(e) => handleCopyText(p?.content || '', String(p?.id), e)}
                              >
                                {copiedId === String(p?.id) ? (
                                  <Check className='h-3.5 w-3.5 text-emerald-600' />
                                ) : (
                                  <Copy className='h-3.5 w-3.5' />
                                )}
                              </Button>
                              <Button
                                variant='outline'
                                size='sm'
                                className='h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/5'
                                title='Rasmiy blankada chop etish'
                                onClick={(e) => triggerPrint(p, e)}
                              >
                                <Printer className='h-3.5 w-3.5' /> Chop etish
                              </Button>
                              <Button
                                variant='outline'
                                size='sm'
                                className='h-7 text-xs gap-1 hover:bg-muted/50'
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedPrescriptionDetail(p)
                                }}
                              >
                                <Eye className='h-3.5 w-3.5' /> Ko'rish
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
          </TabsContent>

          {/* Templates Catalog Tab */}
          <TabsContent value='templates' className='space-y-6'>
            {/* Quick Seeding Banner */}
            <div className='rounded-2xl border bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-transparent p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
              <div className='flex items-start gap-3'>
                <div className='p-2 rounded-xl bg-primary text-primary-foreground'>
                  <Sparkles className='h-5 w-5' />
                </div>
                <div>
                  <h3 className='text-sm font-bold text-foreground'>
                    Standart Stomatologik Retsept Shablonlari
                  </h3>
                  <p className='text-xs text-muted-foreground mt-0.5 max-w-xl'>
                    Karies, pulpit, tish sug'urish (ekstraktsiya), periodontit va implantatsiya bo'yicha tasdiqlangan klinik protokollar.
                  </p>
                </div>
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={handleSeedTemplates}
                disabled={createTemplateMutation.isPending}
                className='text-xs font-semibold whitespace-nowrap'
              >
                <BookmarkPlus className='h-4 w-4 mr-1.5 text-primary' />
                Standart Shablonlarni Bazaga Qo'shish
              </Button>
            </div>

            {/* Built-in Clinical Presets Cards */}
            <div>
              <h3 className='text-sm font-bold mb-3 flex items-center gap-2'>
                <Stethoscope className='h-4 w-4 text-primary' />
                Klinik Tavsiya Protokollari ({CLINICAL_PRESETS.length})
              </h3>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                {CLINICAL_PRESETS.map((preset) => (
                  <Card key={preset.id} className='rounded-2xl hover:shadow-md transition-shadow flex flex-col justify-between'>
                    <CardHeader className='pb-2'>
                      <div className='flex items-center justify-between gap-2'>
                        <Badge variant='outline' className='text-[10px] font-semibold bg-primary/5 text-primary border-primary/20'>
                          {preset.badgeText}
                        </Badge>
                        <span className='text-xs text-muted-foreground font-medium'>
                          {preset.category}
                        </span>
                      </div>
                      <CardTitle className='text-sm font-bold mt-2 flex items-center gap-1.5'>
                        <span>{preset.icon}</span>
                        <span>{preset.title}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className='space-y-3 pt-0'>
                      <div className='p-3 rounded-xl bg-muted/40 border text-xs font-mono whitespace-pre-line text-muted-foreground leading-relaxed max-h-40 overflow-y-auto'>
                        {preset.content}
                      </div>
                      <div className='flex items-center gap-2 pt-1'>
                        <Button
                          variant='outline'
                          size='sm'
                          className='text-xs flex-1'
                          onClick={() => {
                            setIssueContent(preset.content)
                            setIsIssueModalOpen(true)
                          }}
                        >
                          <Send className='h-3.5 w-3.5 mr-1.5' /> Ushbu andoza bilan retsept berish
                        </Button>
                        <Button
                          variant='ghost'
                          size='sm'
                          className='h-8 w-8 p-0 text-muted-foreground'
                          title='Nusxa olish'
                          onClick={(e) => handleCopyText(preset.content, preset.id, e)}
                        >
                          {copiedId === preset.id ? (
                            <Check className='h-3.5 w-3.5 text-emerald-600' />
                          ) : (
                            <Copy className='h-3.5 w-3.5' />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Custom Templates from DB */}
            {templates.length > 0 && (
              <div className='pt-4 border-t'>
                <h3 className='text-sm font-bold mb-3 flex items-center gap-2'>
                  <BookmarkPlus className='h-4 w-4 text-purple-600' />
                  Shifokorlar Tomonidan Saqlangan Shablonlar ({templates.length})
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                  {templates.map((tpl: any) => (
                    <Card key={String(tpl?.id)} className='rounded-2xl hover:shadow-md transition-shadow flex flex-col justify-between'>
                      <CardHeader className='pb-2'>
                        <CardTitle className='text-sm font-bold flex items-center gap-2'>
                          <Pill className='h-4 w-4 text-primary' />
                          <span>{String(tpl?.name || 'Shablon')}</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className='space-y-3 pt-0'>
                        <div className='p-3 rounded-xl bg-muted/40 border text-xs font-mono whitespace-pre-line text-muted-foreground leading-relaxed max-h-36 overflow-y-auto'>
                          {String(tpl?.content || '')}
                        </div>
                        <Button
                          variant='outline'
                          size='sm'
                          className='text-xs w-full'
                          onClick={() => {
                            setSelectedTemplateId(String(tpl?.id))
                            setIssueContent(String(tpl?.content || ''))
                            setIsIssueModalOpen(true)
                          }}
                        >
                          <Send className='h-3.5 w-3.5 mr-1.5' /> Retsept Rasmiylashtirish
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Prescription Detail Modal */}
        <Dialog open={selectedPrescriptionDetail !== null} onOpenChange={(open) => !open && setSelectedPrescriptionDetail(null)}>
          <DialogContent className='sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto'>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2 text-base font-bold'>
                <FileText className='h-5 w-5 text-primary' /> Tibbiy Retsept Tafsiloti
              </DialogTitle>
            </DialogHeader>

            {selectedPrescriptionDetail && (
              <div className='space-y-4 py-2'>
                <div className='grid grid-cols-2 gap-3 p-4 rounded-xl bg-muted/30 border'>
                  <div>
                    <div className='text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5 uppercase'>
                      <User className='h-3.5 w-3.5 text-primary' /> Bemor / Davolash:
                    </div>
                    <div className='text-sm font-bold mt-1'>
                      {selectedPrescriptionDetail?.treatment && typeof selectedPrescriptionDetail.treatment === 'object'
                        ? selectedPrescriptionDetail.treatment.patient_name || '—'
                        : `Davolash #${selectedPrescriptionDetail?.treatment || ''}`}
                    </div>
                  </div>
                  <div>
                    <div className='text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5 uppercase'>
                      <Stethoscope className='h-3.5 w-3.5 text-primary' /> Shifokor:
                    </div>
                    <div className='text-sm font-bold mt-1'>
                      {selectedPrescriptionDetail?.doctor && typeof selectedPrescriptionDetail.doctor === 'object'
                        ? selectedPrescriptionDetail.doctor.fullName || selectedPrescriptionDetail.doctor.user?.first_name || 'Shifokor'
                        : 'Shifokor'}
                    </div>
                  </div>
                </div>

                <div className='space-y-1.5'>
                  <div className='flex items-center justify-between'>
                    <label className='text-xs font-semibold text-muted-foreground flex items-center gap-1.5'>
                      <Pill className='h-3.5 w-3.5 text-primary' /> Dori Dozalari va Ko'rsatmalar:
                    </label>
                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-6 text-[11px] gap-1 text-muted-foreground'
                      onClick={() => handleCopyText(selectedPrescriptionDetail?.content || '', 'modal-copy')}
                    >
                      <Copy className='h-3 w-3' /> Nusxa olish
                    </Button>
                  </div>
                  <div className='p-4 rounded-xl border bg-card text-xs whitespace-pre-line font-mono leading-relaxed shadow-sm'>
                    {selectedPrescriptionDetail?.content || 'Mazmun kiritilmagan'}
                  </div>
                </div>

                <div className='flex items-center justify-between text-xs text-muted-foreground border-t pt-3'>
                  <span className='flex items-center gap-1.5'>
                    <Calendar className='h-3.5 w-3.5' /> Yuborilgan: {formatDateSafely(selectedPrescriptionDetail?.sentToTelegramAt || selectedPrescriptionDetail?.sent_to_telegram_at || selectedPrescriptionDetail?.createdAt || selectedPrescriptionDetail?.created_at)}
                  </span>
                  {selectedPrescriptionDetail?.sentToTelegramAt || selectedPrescriptionDetail?.sent_to_telegram_at ? (
                    <Badge variant='default' className='bg-emerald-600 text-[10px] gap-1'>
                      <CheckCircle2 className='h-3 w-3' /> Telegram Botga Yetkazildi
                    </Badge>
                  ) : (
                    <Badge variant='secondary' className='text-[10px]'>
                      Ofline / Saqlangan
                    </Badge>
                  )}
                </div>
              </div>
            )}

            <DialogFooter className='gap-2 sm:gap-0'>
              <Button
                variant='outline'
                onClick={() => triggerPrint(selectedPrescriptionDetail)}
                className='text-xs font-semibold gap-1.5 border-primary/30 text-primary'
              >
                <Printer className='h-3.5 w-3.5' /> Rasmiy Blankada Chop Etish
              </Button>
              <Button onClick={() => setSelectedPrescriptionDetail(null)} className='text-xs font-bold'>
                Yopish
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Issue Prescription Modal with SearchableSelect & Quick Presets */}
        <Dialog open={isIssueModalOpen} onOpenChange={setIsIssueModalOpen}>
          <DialogContent className='sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto'>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2'>
                <Send className='h-5 w-5 text-primary' /> Retsept Rasmiylashtirish
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleIssuePrescription} className='space-y-4 py-2'>
              <div className='space-y-1.5'>
                <label className='text-xs font-medium'>Davolash Yozuvi / Bemor *</label>
                <SearchableSelect
                  options={treatmentSelectOptions}
                  value={treatmentId}
                  onValueChange={setTreatmentId}
                  placeholder='Davolash yozuvi va bemorni izlang...'
                  searchPlaceholder='Bemor yoki muolajani yozing...'
                />
              </div>

              {/* Quick Clinical Preset Buttons */}
              <div className='space-y-1.5'>
                <label className='text-xs font-medium flex items-center justify-between'>
                  <span className='flex items-center gap-1'>
                    <Sparkles className='h-3.5 w-3.5 text-amber-500' /> Tezkor Klinik Shablonlar (1-bosishda):
                  </span>
                </label>
                <div className='flex flex-wrap gap-1.5'>
                  {CLINICAL_PRESETS.map((p) => (
                    <Button
                      key={p.id}
                      type='button'
                      variant='outline'
                      size='sm'
                      className='text-[11px] h-7 px-2 bg-muted/30 hover:bg-primary/10 hover:border-primary/30'
                      onClick={() => handleApplyPreset(p)}
                    >
                      <span className='mr-1'>{p.icon}</span> {p.badgeText}
                    </Button>
                  ))}
                </div>
              </div>

              <div className='space-y-1.5'>
                <label className='text-xs font-medium'>Saqlangan Shablonlardan Tanlash (Ixtiyoriy)</label>
                <SearchableSelect
                  options={templateSelectOptions}
                  value={selectedTemplateId}
                  onValueChange={(val) => {
                    setSelectedTemplateId(val)
                    const found = templates.find((t: PrescriptionTemplate) => String(t.id) === val)
                    if (found?.content) {
                      setIssueContent(found.content)
                    }
                  }}
                  placeholder='Shablonlardan tanlang...'
                  searchPlaceholder='Shablon nomini yozing...'
                />
              </div>

              <div className='space-y-1.5'>
                <label className='text-xs font-medium'>Retsept Mazmuni (Dori va doza ko'rsatmalari) *</label>
                <Textarea
                  placeholder='Dori nomlari, qabul qilish tartibi va dozalari...'
                  value={issueContent}
                  onChange={(e) => setIssueContent(e.target.value)}
                  rows={5}
                  className='text-xs font-mono'
                />
              </div>

              <div className='flex items-center space-x-2 pt-1 p-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900'>
                <Checkbox
                  id='sendTelegram'
                  checked={sendTelegram}
                  onCheckedChange={(c) => setSendTelegram(Boolean(c))}
                />
                <label htmlFor='sendTelegram' className='text-xs font-medium leading-none cursor-pointer'>
                  Bemorning Telegram Botiga darhol retseptni yetkazish 📲
                </label>
              </div>

              <DialogFooter className='pt-2'>
                <Button type='button' variant='outline' onClick={() => setIsIssueModalOpen(false)}>
                  Bekor qilish
                </Button>
                <Button type='submit' disabled={issuePrescriptionMutation.isPending} className='font-bold gap-1.5'>
                  <Send className='h-4 w-4' /> {issuePrescriptionMutation.isPending ? 'Yuborilmoqda...' : 'Yuborish'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Create Template Modal */}
        <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
          <DialogContent className='sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto'>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2'>
                <Plus className='h-5 w-5 text-primary' /> Yangi Retsept Shabloni
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateTemplate} className='space-y-3 py-2'>
              <div className='space-y-1'>
                <label className='text-xs font-medium'>Shablon Nomi *</label>
                <Input
                  placeholder='Masalan: Standart Antibiyotik Kursi'
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-medium'>Shablon Mazmuni *</label>
                <Textarea
                  placeholder='Dori nomlari, vaqt oralig’i va dozalari...'
                  value={templateContent}
                  onChange={(e) => setTemplateContent(e.target.value)}
                  rows={5}
                  className='text-xs font-mono'
                />
              </div>

              <DialogFooter className='pt-2'>
                <Button type='button' variant='outline' onClick={() => setIsTemplateModalOpen(false)}>
                  Bekor qilish
                </Button>
                <Button type='submit' disabled={createTemplateMutation.isPending} className='font-bold'>
                  {createTemplateMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Hidden Print Container */}
        <div style={{ display: 'none' }}>
          {prescriptionToPrint && <PrescriptionPrint ref={printRef} prescription={prescriptionToPrint} />}
        </div>
      </Main>
    </>
  )
}

function formatDateSafely(dateStr: string) {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('uz-UZ')
  } catch {
    return '—'
  }
}
