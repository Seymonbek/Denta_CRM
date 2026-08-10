import { useState } from 'react'
import { FileText, Send, Plus, Search, Eye, Pill, Calendar, User, Stethoscope } from 'lucide-react'
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

export function PrescriptionsList() {
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false)
  const [selectedPrescriptionDetail, setSelectedPrescriptionDetail] = useState<any>(null)

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Template Form State
  const [templateName, setTemplateName] = useState('')
  const [templateContent, setTemplateContent] = useState('')

  // Issue Form State
  const [treatmentId, setTreatmentId] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [issueContent, setIssueContent] = useState('')
  const [sendTelegram, setSendTelegram] = useState(true)

  const { data: templatesData = [], isLoading: isTemplatesLoading } = usePrescriptionTemplates()
  const templates = Array.isArray(templatesData?.results)
    ? templatesData.results
    : Array.isArray(templatesData)
    ? templatesData
    : []

  const { data: prescriptionsData, isLoading: isPrescriptionsLoading } = usePrescriptions()
  const prescriptionsList = Array.isArray(prescriptionsData?.results)
    ? prescriptionsData.results
    : Array.isArray(prescriptionsData)
    ? prescriptionsData
    : []

  const { data: treatmentsData } = useTreatments()
  const treatments = Array.isArray(treatmentsData?.results)
    ? treatmentsData.results
    : Array.isArray(treatmentsData)
    ? treatmentsData
    : []

  const createTemplateMutation = useCreatePrescriptionTemplate()
  const issuePrescriptionMutation = useIssuePrescription()

  // Filter Prescriptions
  const filteredPrescriptions = prescriptionsList.filter((p: any) => {
    const text = (p?.content || '') + (typeof p?.treatment === 'object' ? p?.treatment?.patient_name || '' : '')
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

  const treatmentSelectOptions = treatments.map((t: any) => {
    const pName = typeof t?.patient === 'object' ? `${t.patient.first_name || ''} ${t.patient.last_name || ''}` : `Bemor #${t.patient || ''}`
    const proc = t?.procedure_type?.name || 'Muolaja'
    return {
      value: String(t.id),
      label: `${pName} - ${proc}`,
      sublabel: `Tashxis: ${t.diagnosis || 'Kiritilmagan'} | Narxi: ${t.price || 0} so'm`,
    }
  })

  const templateSelectOptions = templates.map((tpl: any) => ({
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
        <div className='mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight flex items-center gap-2'>
              <FileText className='h-6 w-6 text-primary' /> Retseptlar Boshqaruvi
            </h1>
            <p className='text-xs text-muted-foreground mt-1'>
              Bemorlarga retsept yozish, Telegram botga yuborish va tayyor shablonlar.
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Button variant='outline' onClick={() => setIsTemplateModalOpen(true)} className='text-xs font-semibold'>
              <Plus className='me-1.5 h-4 w-4' /> Yangi Shablon
            </Button>
            <Button onClick={() => setIsIssueModalOpen(true)} className='shadow text-xs font-bold gap-1.5'>
              <Send className='h-4 w-4' /> Retsept Berish
            </Button>
          </div>
        </div>

        <Tabs defaultValue='prescriptions' className='space-y-4'>
          <TabsList>
            <TabsTrigger value='prescriptions' className='text-xs font-medium gap-1.5'>
              <FileText className='h-3.5 w-3.5' /> Berilgan Retseptlar
            </TabsTrigger>
            <TabsTrigger value='templates' className='text-xs font-medium gap-1.5'>
              <Pill className='h-3.5 w-3.5' /> Retsept Shablonlari
            </TabsTrigger>
          </TabsList>

          {/* Prescriptions List with Search & Simplified View */}
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

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className='w-full sm:w-52 text-xs h-9'>
                  <SelectValue placeholder='Holat bo’yicha' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>Barchasi</SelectItem>
                  <SelectItem value='sent'>Telegram'ga Yuborilgan</SelectItem>
                  <SelectItem value='saved'>Saqlangan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Simplified Prescriptions Table */}
            <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
              <Table className='min-w-[550px] sm:min-w-full'>
                <TableHeader>
                  <TableRow className='bg-muted/30'>
                    <TableHead className='text-xs font-semibold'>Retsept Sarlavhasi</TableHead>
                    <TableHead className='text-xs font-semibold'>Bemor / Davolash</TableHead>
                    <TableHead className='text-xs font-semibold'>Holati</TableHead>
                    <TableHead className='text-xs font-semibold text-end'>Batafsil</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isPrescriptionsLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className='text-center py-8 text-xs text-muted-foreground animate-pulse'>
                        Retseptlar yuklanmoqda...
                      </TableCell>
                    </TableRow>
                  ) : filteredPrescriptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className='text-center py-8 text-xs text-muted-foreground'>
                        Hech qanday retsept topilmadi.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPrescriptions.map((p: any) => {
                      const sentAt = p?.sentToTelegramAt || p?.sent_to_telegram_at || p?.sent_at || ''
                      const treatmentDisplay = typeof p?.treatment === 'object'
                        ? (p?.treatment?.patient_name || p?.treatment?.diagnosis || 'Davolash yozuvi')
                        : `Davolash #${p?.treatment || ''}`
                      const contentTitle = p?.content ? p.content.split('\n')[0] : 'Retsept yozuvi'

                      return (
                        <TableRow
                          key={p?.id || Math.random()}
                          className='hover:bg-muted/20 cursor-pointer transition-colors'
                          onClick={() => setSelectedPrescriptionDetail(p)}
                        >
                          <TableCell className='text-xs font-bold truncate max-w-[200px]'>
                            <div className='flex items-center gap-2'>
                              <Pill className='h-3.5 w-3.5 text-primary shrink-0' />
                              <span className='truncate'>{contentTitle}</span>
                            </div>
                          </TableCell>
                          <TableCell className='text-xs font-medium text-muted-foreground truncate max-w-[180px]'>
                            {treatmentDisplay}
                          </TableCell>
                          <TableCell className='text-xs'>
                            {sentAt ? (
                              <Badge variant='default' className='text-[10px] bg-emerald-600 px-2 py-0.5'>
                                <Send className='me-1 h-3 w-3' /> Telegram'da
                              </Badge>
                            ) : (
                              <Badge variant='secondary' className='text-[10px] px-2 py-0.5'>
                                Saqlangan
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className='text-end'>
                            <Button
                              size='sm'
                              variant='ghost'
                              className='h-8 text-xs font-semibold gap-1 text-primary'
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedPrescriptionDetail(p)
                              }}
                            >
                              <Eye className='h-3.5 w-3.5' /> Batafsil
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Templates List */}
          <TabsContent value='templates'>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
              {isTemplatesLoading ? (
                <div className='col-span-full text-center py-8 text-xs text-muted-foreground animate-pulse'>
                  Shablonlar yuklanmoqda...
                </div>
              ) : templates.length === 0 ? (
                <div className='col-span-full text-center py-8 text-xs text-muted-foreground'>
                  Hali hech qanday shablon yaratilmagan.
                </div>
              ) : (
                templates.map((tpl: any) => (
                  <div key={tpl?.id || Math.random()} className='flex flex-col justify-between rounded-xl border bg-card p-4 shadow-sm hover:shadow transition-shadow'>
                    <div>
                      <h4 className='font-bold text-sm mb-2 flex items-center gap-2'>
                        <FileText className='h-4 w-4 text-primary' /> {tpl?.name || 'Shablon'}
                      </h4>
                      <p className='text-xs text-muted-foreground whitespace-pre-line bg-muted/30 p-2.5 rounded-lg border font-mono'>
                        {tpl?.content || ''}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Prescription Detail Modal */}
        <Dialog open={selectedPrescriptionDetail !== null} onOpenChange={(open) => !open && setSelectedPrescriptionDetail(null)}>
          <DialogContent className='sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto'>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2 text-base font-bold'>
                <FileText className='h-5 w-5 text-primary' /> Retsept Tafsiloti
              </DialogTitle>
            </DialogHeader>

            {selectedPrescriptionDetail && (
              <div className='space-y-4 py-2'>
                <div className='p-4 rounded-xl bg-muted/30 border space-y-2'>
                  <div className='text-xs font-semibold text-muted-foreground flex items-center gap-1.5'>
                    <User className='h-3.5 w-3.5 text-primary' /> Davolash / Bemor:
                  </div>
                  <div className='text-sm font-bold'>
                    {typeof selectedPrescriptionDetail?.treatment === 'object'
                      ? selectedPrescriptionDetail?.treatment?.patient_name || '—'
                      : `Davolash #${selectedPrescriptionDetail?.treatment || ''}`}
                  </div>
                </div>

                <div className='space-y-1.5'>
                  <label className='text-xs font-semibold text-muted-foreground flex items-center gap-1.5'>
                    <Pill className='h-3.5 w-3.5 text-primary' /> Dori Dozalari va Retsept Mazmuni:
                  </label>
                  <div className='p-3.5 rounded-xl border bg-card text-xs whitespace-pre-line font-mono leading-relaxed'>
                    {selectedPrescriptionDetail?.content || 'Mazmun kiritilmagan'}
                  </div>
                </div>

                <div className='flex items-center justify-between text-xs text-muted-foreground border-t pt-3'>
                  <span className='flex items-center gap-1'>
                    <Calendar className='h-3.5 w-3.5' /> Yuborilgan: {formatDateSafely(selectedPrescriptionDetail?.sentToTelegramAt || selectedPrescriptionDetail?.sent_to_telegram_at || selectedPrescriptionDetail?.created_at)}
                  </span>
                  {selectedPrescriptionDetail?.sentToTelegramAt && (
                    <Badge variant='default' className='bg-emerald-600 text-[10px]'>
                      Telegram Botga Yetkazildi
                    </Badge>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => setSelectedPrescriptionDetail(null)} className='w-full sm:w-auto text-xs font-bold'>
                Yopish
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Issue Prescription Modal with SearchableSelect */}
        <Dialog open={isIssueModalOpen} onOpenChange={setIsIssueModalOpen}>
          <DialogContent className='sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto'>
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

              <div className='space-y-1.5'>
                <label className='text-xs font-medium'>Tayyor Shablon (Ixtiyoriy)</label>
                <SearchableSelect
                  options={templateSelectOptions}
                  value={selectedTemplateId}
                  onValueChange={(val) => {
                    setSelectedTemplateId(val)
                    const found = templates.find((t: any) => String(t.id) === val)
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
                  placeholder='Masalan: Amoxicillin 500mg - Kuniga 3 mahal ovqatdan so’ng 5 kun...'
                  value={issueContent}
                  onChange={(e) => setIssueContent(e.target.value)}
                  rows={4}
                  className='text-xs font-mono'
                />
              </div>

              <div className='flex items-center space-x-2 pt-1'>
                <Checkbox
                  id='sendTelegram'
                  checked={sendTelegram}
                  onCheckedChange={(c) => setSendTelegram(Boolean(c))}
                />
                <label htmlFor='sendTelegram' className='text-xs font-medium leading-none cursor-pointer'>
                  Bemorning Telegram Botiga darhol xabar yuborish 📲
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
                  placeholder='Dori nomlari va dozalari...'
                  value={templateContent}
                  onChange={(e) => setTemplateContent(e.target.value)}
                  rows={4}
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
