import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { Plus, Search, ArrowRight, Phone, Send, Calendar, Clock, Sparkles, RefreshCw } from 'lucide-react'
import { confirmSwal } from '@/lib/sweetalert'
import { usePatients, useCreatePatient, usePatientRecall, useSendPatientRecall } from '@/api/hooks/use-patients'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { format } from 'date-fns'

export function PatientsList() {
  const authUser = useAuthStore((state) => state.user)
  const canAddPatient = authUser?.role === 'administrator' || authUser?.role === 'bosh_shifokor'
  const isDoctor = authUser?.role === 'doctor'

  const [activeTab, setActiveTab] = useState<'list' | 'recall'>('list')
  const [searchTerm, setSearchTerm] = useState('')
  const [genderFilter, setGenderFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Recall states
  const [recallDays, setRecallDays] = useState<number>(90)
  const [recallSearch, setRecallSearch] = useState('')

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [searchTerm, genderFilter])

  // Form State
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('+998')
  const [gender, setGender] = useState<string>('male')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')

  const { data, isLoading } = usePatients({
    search: searchTerm || undefined,
    gender: genderFilter && genderFilter !== 'all' ? genderFilter : undefined,
    page,
  })

  const { data: recallData = [], isLoading: isRecallLoading, refetch: refetchRecall } = usePatientRecall(recallDays)
  const sendRecallMutation = useSendPatientRecall()
  const createPatientMutation = useCreatePatient()

  const patients = Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data)
    ? data
    : []

  const totalCount = data?.count ?? patients.length
  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  // Filtered recall list
  const filteredRecallList = recallData.filter((r: any) => {
    if (!recallSearch) return true
    const term = recallSearch.toLowerCase()
    return (
      r.firstName.toLowerCase().includes(term) ||
      r.lastName.toLowerCase().includes(term) ||
      r.phoneNumber.toLowerCase().includes(term) ||
      r.recallReason.toLowerCase().includes(term)
    )
  })

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!firstName || !lastName || !phoneNumber) {
      toast.error('Ism, familiya va telefon raqamini kiriting.')
      return
    }

    try {
      await createPatientMutation.mutateAsync({
        firstName,
        lastName,
        phoneNumber,
        gender,
        address,
        notes,
      })
      toast.success('Yangi bemor muvaffaqiyatli ro’yxatga olindi!')
      setIsModalOpen(false)
      // Reset form
      setFirstName('')
      setLastName('')
      setPhoneNumber('+998')
      setAddress('')
      setNotes('')
    } catch (err: any) {
      const data = err?.response?.data
      const errorMsg =
        data?.phone_number?.[0] ||
        data?.first_name?.[0] ||
        data?.last_name?.[0] ||
        data?.error?.message ||
        data?.detail ||
        (typeof data === 'string' ? data : null) ||
        'Bemor qo’shishda xatolik yuz berdi.'
        
      const isDuplicate = 
        err?.response?.status === 400 && 
        (typeof errorMsg === 'string' && (errorMsg.toLowerCase().includes('mavjud') || errorMsg.toLowerCase().includes('already exists') || errorMsg.toLowerCase().includes('duplicate')));

      if (isDuplicate) {
        confirmSwal({
          title: "Ushbu bemor bazada mavjud!",
          text: "Siz kiritgan ism yoki telefon raqamiga ega bemor allaqachon mavjud. Qidiruvdan foydalaning.",
          confirmButtonText: "Tushunarli",
        })
      } else {
        toast.error(errorMsg)
      }
    }
  }

  const handleSendQuickRecall = async (patientId: string, patientName: string) => {
    try {
      const res: any = await sendRecallMutation.mutateAsync({ id: patientId })
      const channelName = res?.channel ? String(res.channel).toUpperCase() : 'TELEGRAM'
      toast.success(`Eslatma ${patientName}ga muvaffaqiyatli jo'natildi (${channelName})`)
    } catch {
      toast.error("Eslatma yuborishda xatolik yuz berdi")
    }
  }

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <span>👤 Bemorlar va Qayta Qabul (Recall)</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className='space-y-4'>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
            <TabsList className='bg-muted p-1'>
              <TabsTrigger value='list' className='text-xs font-semibold'>
                📋 Bemorlar Ro'yxati ({totalCount})
              </TabsTrigger>
              <TabsTrigger value='recall' className='text-xs font-semibold flex items-center gap-1.5'>
                <Sparkles className='h-3.5 w-3.5 text-amber-500' />
                📞 Qayta Qabul & Sodiqlik ({recallData.length})
              </TabsTrigger>
            </TabsList>

            {canAddPatient && activeTab === 'list' && (
              <Button onClick={() => setIsModalOpen(true)} className='shadow h-9 text-xs'>
                <Plus className='me-2 h-4 w-4' /> Yangi Bemor Ro'yxatga Olish
              </Button>
            )}
          </div>

          {/* TAB 1: BEMORLAR RO'YXATI */}
          <TabsContent value='list' className='space-y-4'>
            <div className='mb-2'>
              <h1 className='text-xl font-bold tracking-tight'>
                {isDoctor ? "Mening Bemorlarim" : "Klinika Bemorlari"}
              </h1>
              <p className='text-xs text-muted-foreground'>
                {isDoctor
                  ? "Sizga biriktirilgan va siz davolagan bemorlar ro'yxati hamda ularning tish kartalari."
                  : "Ro'yxatdan o'tgan barcha bemorlar va ularning tibbiy kartalari."}
              </p>
            </div>

            {/* Filter Toolbar */}
            <div className='flex flex-col sm:flex-row items-center gap-3'>
              <div className='relative flex-1 w-full'>
                <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
                <Input
                  placeholder='Ism, familiya yoki telefon raqami bo’yicha qidiruv...'
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className='ps-9 text-xs'
                />
              </div>
              <Select value={genderFilter} onValueChange={setGenderFilter}>
                <SelectTrigger className='w-full sm:w-40 text-xs'>
                  <SelectValue placeholder='Jins (Hamma)' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>Barchasi</SelectItem>
                  <SelectItem value='male'>Erkak</SelectItem>
                  <SelectItem value='female'>Ayol</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Data Table */}
            <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
              <Table className='min-w-[600px] sm:min-w-full'>
                <TableHeader>
                  <TableRow className='bg-muted/30'>
                    <TableHead className='text-xs font-semibold'>Bemor Ismi</TableHead>
                    <TableHead className='text-xs font-semibold'>Telefon Raqami</TableHead>
                    <TableHead className='text-xs font-semibold'>Jinsi</TableHead>
                    <TableHead className='text-xs font-semibold'>Manzili</TableHead>
                    <TableHead className='text-xs font-semibold'>Ro'yxatdan o'tgan sana</TableHead>
                    <TableHead className='text-xs font-semibold text-end'>Amallar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className='text-center py-8 text-xs text-muted-foreground animate-pulse'>
                        Bemorlar ro'yxati yuklanmoqda...
                      </TableCell>
                    </TableRow>
                  ) : patients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className='text-center py-8 text-xs text-muted-foreground'>
                        Hech qanday bemor topilmadi.
                      </TableCell>
                    </TableRow>
                  ) : (
                    patients.map((patient: any) => {
                      const pFirstName = String(patient?.firstName || patient?.first_name || 'Bemor')
                      const pLastName = String(patient?.lastName || patient?.last_name || '')
                      const pPhone = String(patient?.phoneNumber || patient?.phone_number || '-')
                      const pGender = String(patient?.gender || 'unknown')
                      const pAddress = String(patient?.address || '-')
                      const pCreatedAt = String(patient?.createdAt || patient?.created_at || '')
                      const pNotes = String(patient?.notes || '')

                      return (
                        <TableRow key={String(patient?.id)} className='hover:bg-muted/20'>
                          <TableCell className='font-medium text-xs'>
                            <div className='flex items-center gap-2'>
                              <div className='flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs shrink-0'>
                                {pFirstName[0] || 'B'}
                              </div>
                              <div className='flex flex-col'>
                                <span className='truncate font-semibold'>{pFirstName} {pLastName}</span>
                                {pNotes && (
                                  <span className='inline-flex items-center gap-1 text-[10px] text-rose-600 dark:text-rose-400 font-medium'>
                                    ⚠️ {pNotes.length > 30 ? pNotes.slice(0, 30) + '...' : pNotes}
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className='text-xs font-mono whitespace-nowrap'>{pPhone}</TableCell>
                          <TableCell className='text-xs whitespace-nowrap'>
                            <Badge variant='outline' className='text-[10px] uppercase'>
                              {pGender === 'male' ? 'Erkak' : pGender === 'female' ? 'Ayol' : 'Noma’lum'}
                            </Badge>
                          </TableCell>
                          <TableCell className='text-xs text-muted-foreground truncate max-w-[150px]'>
                            {pAddress}
                          </TableCell>
                          <TableCell className='text-xs text-muted-foreground font-mono whitespace-nowrap'>
                            {formatDateSafely(pCreatedAt)}
                          </TableCell>
                          <TableCell className='text-end whitespace-nowrap'>
                            <Button asChild size='sm' variant='ghost' className='h-8 text-xs'>
                              <Link to='/patients/$id' params={{ id: String(patient.id) }}>
                                Karta <ArrowRight className='ms-1.5 h-3.5 w-3.5' />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className='mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground'>
              <div>
                Jami: <span className='font-bold text-foreground'>{totalCount}</span> ta bemor
              </div>
              {totalPages > 1 && (
                <div className='flex items-center gap-1.5'>
                  <Button
                    size='sm'
                    variant='outline'
                    className='h-8 px-3 text-xs'
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Oldingi
                  </Button>
                  <span className='px-2 font-mono font-medium text-foreground'>
                    {page} / {totalPages}
                  </span>
                  <Button
                    size='sm'
                    variant='outline'
                    className='h-8 px-3 text-xs'
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Keyingi
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 2: RECALL JURNALI (BEMORLARNI QAYTARISH VA SODIQLIK) */}
          <TabsContent value='recall' className='space-y-4'>
            <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
              <div>
                <h1 className='text-xl font-bold tracking-tight flex items-center gap-2'>
                  <span>📞 Qayta Qabul va Sodiqlik (Recall Jurnali)</span>
                </h1>
                <p className='text-xs text-muted-foreground mt-0.5'>
                  Profilaktik tozalashga muhtoj, oxirgi qabuli 3-6 oydan oshgan yoki rejalashtirilgan muolajasi qolgan bemorlarni qayta klinikaga jalb qilish.
                </p>
              </div>

              {/* Recall Period Selector */}
              <div className='flex items-center gap-1.5 bg-muted p-1 rounded-lg'>
                {[
                  { label: '30 kun (1 oy)', value: 30 },
                  { label: '90 kun (3 oy)', value: 90 },
                  { label: '180 kun (6 oy)', value: 180 },
                ].map((item) => (
                  <Button
                    key={item.value}
                    size='sm'
                    variant={recallDays === item.value ? 'default' : 'ghost'}
                    className='h-8 text-xs font-semibold px-3'
                    onClick={() => setRecallDays(item.value)}
                  >
                    {item.label}
                  </Button>
                ))}
                <Button size='sm' variant='outline' className='h-8 w-8 p-0' onClick={() => refetchRecall()}>
                  <RefreshCw className='h-3.5 w-3.5' />
                </Button>
              </div>
            </div>

            {/* Recall Search */}
            <div className='relative w-full max-w-sm'>
              <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
              <Input
                placeholder='Recall ro’yxatidan qidirish...'
                value={recallSearch}
                onChange={(e) => setRecallSearch(e.target.value)}
                className='ps-9 text-xs'
              />
            </div>

            {/* Recall Table */}
            <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
              <Table className='min-w-[750px]'>
                <TableHeader>
                  <TableRow className='bg-muted/30'>
                    <TableHead className='text-xs font-semibold'>Bemor</TableHead>
                    <TableHead className='text-xs font-semibold'>Oxirgi Tashrif</TableHead>
                    <TableHead className='text-xs font-semibold'>O'tgan Vaqt</TableHead>
                    <TableHead className='text-xs font-semibold'>Oxirgi Shifokor & Muolaja</TableHead>
                    <TableHead className='text-xs font-semibold'>Recall Sababi</TableHead>
                    <TableHead className='text-xs font-semibold text-end'>Tezkor Amallar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isRecallLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className='text-center py-8 text-xs text-muted-foreground animate-pulse'>
                        Recall ro'yxati tahlil qilinmoqda...
                      </TableCell>
                    </TableRow>
                  ) : filteredRecallList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className='text-center py-8 text-xs text-muted-foreground'>
                        Hozirgi vaqtda qayta chaqirishga muhtoj bemorlar topilmadi. Barcha bemorlar o'z vaqtida ko'rikdan o'tgan!
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecallList.map((r: any) => (
                      <TableRow key={r.id} className='hover:bg-muted/20'>
                        <TableCell className='font-medium text-xs'>
                          <div className='flex flex-col'>
                            <span className='font-semibold'>{r.firstName} {r.lastName}</span>
                            <span className='text-[11px] font-mono text-muted-foreground flex items-center gap-1 mt-0.5'>
                              <Phone className='h-3 w-3 text-primary' /> {r.phoneNumber}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className='text-xs font-mono text-muted-foreground'>
                          {r.lastVisitDate ? format(new Date(r.lastVisitDate), 'dd.MM.yyyy') : '-'}
                        </TableCell>
                        <TableCell className='text-xs font-mono'>
                          <Badge variant='outline' className='text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300'>
                            <Clock className='h-3 w-3 mr-1' /> {r.daysSinceLastVisit} kun oldin
                          </Badge>
                        </TableCell>
                        <TableCell className='text-xs'>
                          <div className='flex flex-col'>
                            <span className='font-medium'>{r.lastDoctorName}</span>
                            <span className='text-[11px] text-muted-foreground'>{r.lastProcedureName}</span>
                          </div>
                        </TableCell>
                        <TableCell className='text-xs'>
                          <Badge 
                            variant={r.hasPlannedTeeth ? 'default' : 'secondary'}
                            className={`text-[10px] ${r.hasPlannedTeeth ? 'bg-indigo-600' : ''}`}
                          >
                            {r.recallReason}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-end'>
                          <div className='flex items-center justify-end gap-1.5'>
                            <Button
                              size='sm'
                              variant='default'
                              className='h-8 text-xs bg-emerald-600 hover:bg-emerald-700'
                              onClick={() => handleSendQuickRecall(r.id, `${r.firstName} ${r.lastName}`)}
                              disabled={sendRecallMutation.isPending}
                            >
                              <Send className='h-3 w-3 mr-1' /> Eslatma
                            </Button>
                            <Button
                              asChild
                              size='sm'
                              variant='outline'
                              className='h-8 text-xs'
                            >
                              <Link to='/appointments'>
                                <Calendar className='h-3 w-3 mr-1' /> Navbat
                              </Link>
                            </Button>
                            <Button asChild size='sm' variant='ghost' className='h-8 text-xs'>
                              <Link to='/patients/$id' params={{ id: r.id }}>
                                <ArrowRight className='h-3.5 w-3.5' />
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        {/* Create Patient Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>Yangi Bemor Ro’yxatga Olish</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreatePatient} className='space-y-3 py-2'>
              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Ismi *</label>
                  <Input
                    placeholder='Ali'
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Familiyasi *</label>
                  <Input
                    placeholder='Valiyev'
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Telefon raqami *</label>
                  <Input
                    placeholder='+998901234567'
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    required
                  />
                </div>
                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Jinsi</label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='male'>Erkak</SelectItem>
                      <SelectItem value='female'>Ayol</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-medium'>Manzili</label>
                <Input
                  placeholder='Toshkent sh., Yunusobod t.'
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className='space-y-1.5'>
                <label className='text-xs font-medium flex items-center gap-1.5'>
                  <span className='text-rose-600 font-bold'>⚠️</span>
                  <span>Tibbiy Eslatma va Allergiyalar:</span>
                </label>
                
                {/* Quick Medical Alert Chips */}
                <div className='flex flex-wrap gap-1.5 mb-1.5'>
                  {[
                    '⚠️ Lidokain allergiyasi',
                    '⚠️ Penitsillin allergiyasi',
                    '🩸 Gipertoniya (Qon bosimi)',
                    '🍬 Qandli diabet',
                    '🤰 Homiladorlik',
                    '⚡ Anesteziyaga sezuvchanlik'
                  ].map((chip) => (
                    <button
                      key={chip}
                      type='button'
                      onClick={() => {
                        if (notes.includes(chip)) {
                          setNotes(notes.replace(chip, '').replace(/,\s*,/g, ',').trim())
                        } else {
                          setNotes(notes ? `${notes}, ${chip}` : chip)
                        }
                      }}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition-all ${
                        notes.includes(chip)
                          ? 'bg-rose-500 text-white border-rose-600 font-semibold shadow-xs'
                          : 'bg-muted/40 hover:bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                <Textarea
                  placeholder='Allergiyalar, surunkali kasalliklar yoki boshqa muhim tibbiy maʼlumotlar...'
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className='text-xs'
                />
              </div>

              <DialogFooter className='pt-2'>
                <Button type='button' variant='outline' onClick={() => setIsModalOpen(false)}>
                  Bekor qilish
                </Button>
                <Button type='submit' disabled={createPatientMutation.isPending}>
                  {createPatientMutation.isPending ? 'Saqlanmoqda...' : 'Ro’yxatga olish'}
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
    return d.toLocaleDateString()
  } catch {
    return String(dateStr)
  }
}
