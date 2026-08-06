import { useState } from 'react'
import { FileText, Send, Plus, CheckCircle, MessageSquare } from 'lucide-react'
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

  // Template Form State
  const [templateName, setTemplateName] = useState('')
  const [templateContent, setTemplateContent] = useState('')

  // Issue Form State
  const [treatmentId, setTreatmentId] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [issueContent, setIssueContent] = useState('')
  const [sendTelegram, setSendTelegram] = useState(true)

  const { data: templates = [], isLoading: isTemplatesLoading } = usePrescriptionTemplates()
  const { data: prescriptionsData, isLoading: isPrescriptionsLoading } = usePrescriptions()
  const prescriptions = prescriptionsData?.results || []
  const { data: treatmentsData } = useTreatments()
  const treatments = treatmentsData?.results || []

  const createTemplateMutation = useCreatePrescriptionTemplate()
  const issuePrescriptionMutation = useIssuePrescription()

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
    } catch {
      toast.error('Retsept berishda xatolik.')
    }
  }

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <span>💊 Retseptlar & Shablonlar</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <div className='mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Retseptlar Boshqaruvi</h1>
            <p className='text-xs text-muted-foreground'>
              Bemorlarga retsept yozish, Telegram botga yuborish va tayyor shablonlar.
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Button variant='outline' onClick={() => setIsTemplateModalOpen(true)}>
              <Plus className='me-1.5 h-4 w-4' /> Yangi Shablon
            </Button>
            <Button onClick={() => setIsIssueModalOpen(true)} className='shadow'>
              <Send className='me-1.5 h-4 w-4' /> Retsept Berish
            </Button>
          </div>
        </div>

        <Tabs defaultValue='prescriptions' className='space-y-4'>
          <TabsList>
            <TabsTrigger value='prescriptions'>Berilgan Retseptlar</TabsTrigger>
            <TabsTrigger value='templates'>Retsept Shablonlari</TabsTrigger>
          </TabsList>

          {/* Prescriptions List */}
          <TabsContent value='prescriptions'>
            <div className='rounded-xl border bg-card shadow-sm overflow-hidden'>
              <Table>
                <TableHeader>
                  <TableRow className='bg-muted/30'>
                    <TableHead className='text-xs font-semibold'>Retsept Mazmuni</TableHead>
                    <TableHead className='text-xs font-semibold'>Davolash ID</TableHead>
                    <TableHead className='text-xs font-semibold'>Telegram'ga Yuborilgan Sana</TableHead>
                    <TableHead className='text-xs font-semibold text-end'>Holati</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isPrescriptionsLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className='text-center py-8 text-xs text-muted-foreground animate-pulse'>
                        Retseptlar yuklanmoqda...
                      </TableCell>
                    </TableRow>
                  ) : prescriptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className='text-center py-8 text-xs text-muted-foreground'>
                        Retseptlar topilmadi.
                      </TableCell>
                    </TableRow>
                  ) : (
                    prescriptions.map((p) => (
                      <TableRow key={p.id} className='hover:bg-muted/20'>
                        <TableCell className='text-xs font-medium max-w-md whitespace-pre-line'>
                          {p.content}
                        </TableCell>
                        <TableCell className='text-xs font-mono text-muted-foreground'>
                          {p.treatment}
                        </TableCell>
                        <TableCell className='text-xs font-mono text-muted-foreground'>
                          {p.sentToTelegramAt ? format(new Date(p.sentToTelegramAt), 'dd.MM.yyyy HH:mm') : "—"}
                        </TableCell>
                        <TableCell className='text-end'>
                          {p.sentToTelegramAt ? (
                            <Badge variant='default' className='text-[10px] bg-emerald-600'>
                              <Send className='me-1 h-3 w-3' /> Telegram'ga Yuborilgan
                            </Badge>
                          ) : (
                            <Badge variant='secondary' className='text-[10px]'>
                              Saqlangan
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
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
                templates.map((tpl) => (
                  <div key={tpl.id} className='flex flex-col justify-between rounded-xl border bg-card p-4 shadow-sm hover:shadow transition-shadow'>
                    <div>
                      <h4 className='font-bold text-sm mb-2 flex items-center gap-2'>
                        <FileText className='h-4 w-4 text-primary' /> {tpl.name}
                      </h4>
                      <p className='text-xs text-muted-foreground whitespace-pre-line bg-muted/30 p-2.5 rounded-lg border font-mono'>
                        {tpl.content}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Create Template Modal */}
        <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>Yangi Retsept Shablonini Yaratish</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreateTemplate} className='space-y-3 py-2'>
              <div className='space-y-1'>
                <label className='text-xs font-medium'>Shablon Nomi *</label>
                <Input
                  placeholder='Masalan: Ishishga qarshi dori-darmonlar'
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  required
                />
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-medium'>Retsept Mazmuni (Dozalar va ko'rsatmalar) *</label>
                <Textarea
                  placeholder={`1. Amoksitsillin 500mg - 1 kapsuladan 3 mahal (5 kun)\n2. Nimesil 100mg - og'riq bo'lganda`}
                  value={templateContent}
                  onChange={(e) => setTemplateContent(e.target.value)}
                  rows={5}
                  required
                />
              </div>

              <DialogFooter className='pt-2'>
                <Button type='button' variant='outline' onClick={() => setIsTemplateModalOpen(false)}>
                  Bekor qilish
                </Button>
                <Button type='submit' disabled={createTemplateMutation.isPending}>
                  {createTemplateMutation.isPending ? 'Saqlanmoqda...' : 'Shablonni Saqlash'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Issue Prescription Modal */}
        <Dialog open={isIssueModalOpen} onOpenChange={setIsIssueModalOpen}>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>Retsept Berish va Telegram'ga Yuborish</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleIssuePrescription} className='space-y-3 py-2'>
              <div className='space-y-1'>
                <label className='text-xs font-medium'>Davolash Ishi *</label>
                <Select value={treatmentId} onValueChange={setTreatmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder='Davolanishni tanlang' />
                  </SelectTrigger>
                  <SelectContent>
                    {treatments.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.patientName || 'Bemor'} - {t.diagnosis || 'Tashxis'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-medium'>Tayyor Shablonni Tanlash (Ixtiyoriy)</label>
                <Select
                  value={selectedTemplateId}
                  onValueChange={(val) => {
                    setSelectedTemplateId(val)
                    const tpl = templates.find((t) => t.id === val)
                    if (tpl) setIssueContent(tpl.content)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Shablon tanlang' />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-medium'>Retsept Mazmuni *</label>
                <Textarea
                  placeholder='Dori vositalari, dozalari va qabul qilish tartibi...'
                  value={issueContent}
                  onChange={(e) => setIssueContent(e.target.value)}
                  rows={4}
                  required
                />
              </div>

              <div className='flex items-center space-x-2 pt-2'>
                <Checkbox
                  id='sendTelegram'
                  checked={sendTelegram}
                  onCheckedChange={(val) => setSendTelegram(Boolean(val))}
                />
                <label htmlFor='sendTelegram' className='text-xs font-medium leading-none cursor-pointer'>
                  Bemorning Telegram botiga avtomatik yuborish 📲
                </label>
              </div>

              <DialogFooter className='pt-2'>
                <Button type='button' variant='outline' onClick={() => setIsIssueModalOpen(false)}>
                  Bekor qilish
                </Button>
                <Button type='submit' disabled={issuePrescriptionMutation.isPending}>
                  {issuePrescriptionMutation.isPending ? 'Rasmiylashtirilmoqda...' : 'Retseptni Berish'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Main>
    </>
  )
}
