import React, { useState, useMemo } from 'react'
import { 
  FileText, 
  Plus, 
  Trash2, 
  Printer, 
  Clock, 
  CheckCircle2, 
  Sparkles
} from 'lucide-react'
import { 
  useTreatmentPlans, 
  useCreateTreatmentPlan, 
  useUpdateTreatmentPlan, 
  useDeleteTreatmentPlan 
} from '@/api/hooks/use-treatments'
import { useDoctors } from '@/api/hooks/use-doctors'
import { useProcedureTypes } from '@/api/hooks/use-procedure-types'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { confirmSwal } from '@/lib/sweetalert'
import { format } from 'date-fns'

const PLAN_STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; color: string }> = {
  draft: { label: 'Qoralama', variant: 'secondary', color: 'text-muted-foreground' },
  proposed: { label: 'Taklif qilingan', variant: 'outline', color: 'text-blue-600 border-blue-300' },
  accepted: { label: 'Bemor qabul qilgan', variant: 'default', color: 'bg-emerald-600 text-white' },
  in_progress: { label: 'Bajarilmoqda', variant: 'default', color: 'bg-amber-600 text-white' },
  completed: { label: 'Yakunlangan', variant: 'default', color: 'bg-primary text-white' },
  cancelled: { label: 'Bekor qilingan', variant: 'destructive', color: 'bg-rose-600 text-white' },
}

interface PatientTreatmentPlansTabProps {
  patientId: string
  patientName: string
}

export function PatientTreatmentPlansTab({ patientId, patientName }: PatientTreatmentPlansTabProps) {
  const user = useAuthStore((s) => s.user)
  const canEdit = user?.role === 'doctor' || user?.role === 'bosh_shifokor'

  const { data: plans = [], isLoading } = useTreatmentPlans({ patient: patientId })
  const { data: doctorsData = [] } = useDoctors()
  const doctors: any[] = Array.isArray(doctorsData) ? doctorsData : (doctorsData as any)?.results || []

  const { data: procedureTypesData = [] } = useProcedureTypes()
  const procedureTypes: any[] = Array.isArray(procedureTypesData) ? procedureTypesData : []

  const createPlan = useCreateTreatmentPlan()
  const updatePlan = useUpdateTreatmentPlan()
  const deletePlan = useDeleteTreatmentPlan()

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [title, setTitle] = useState('Kompleks davolash rejasi')
  const [doctorId, setDoctorId] = useState('')
  const [discountPercent, setDiscountPercent] = useState('0')
  const [notes, setNotes] = useState('')

  // Plan Items State for Create
  const [items, setItems] = useState<Array<{
    title: string
    toothNumber: string
    procedureType: string
    estimatedPrice: string
    order: number
  }>>([
    { title: '1-Bosqich muolajasi', toothNumber: '16', procedureType: '', estimatedPrice: '0', order: 1 }
  ])

  // Print modal state
  const [selectedPlanForPrint, setSelectedPlanForPrint] = useState<any | null>(null)

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        title: `${prev.length + 1}-Bosqich muolajasi`,
        toothNumber: '',
        procedureType: '',
        estimatedPrice: '0',
        order: prev.length + 1,
      }
    ])
  }

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleItemChange = (index: number, field: string, val: string) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: val }

      // Auto-set estimatedPrice when procedure is selected
      if (field === 'procedureType') {
        const proc = procedureTypes.find((p: any) => String(p.id) === String(val))
        if (proc && proc.defaultPrice) {
          next[index].estimatedPrice = String(proc.defaultPrice)
          if (!next[index].title || next[index].title.includes('Bosqich')) {
            const toothPrefix = next[index].toothNumber ? `Tish #${next[index].toothNumber} ` : ''
            next[index].title = `${toothPrefix}${proc.name}`
          }
        }
      }
      return next
    })
  }

  const totalCalculated = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.estimatedPrice) || 0), 0)
  }, [items])

  const totalWithDiscount = useMemo(() => {
    const disc = Math.min(100, Math.max(0, Number(discountPercent) || 0))
    return totalCalculated * (1 - disc / 100)
  }, [totalCalculated, discountPercent])

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!doctorId) {
      toast.error("Iltimos, reja tuzuvchi shifokorni tanlang.")
      return
    }

    try {
      await createPlan.mutateAsync({
        patient: patientId,
        doctor: doctorId,
        title,
        notes,
        discountPercent: Number(discountPercent) || 0,
        status: 'proposed',
        items: items.map((item, idx) => ({
          title: item.title || `Bosqich ${idx + 1}`,
          toothNumber: item.toothNumber ? Number(item.toothNumber) : null,
          procedureType: item.procedureType || null,
          estimatedPrice: Number(item.estimatedPrice) || 0,
          order: idx + 1,
          status: 'planned',
        }))
      })

      toast.success("Yangi davolash rejasi (smeta) muvaffaqiyatli saqlashga kiritildi!")
      setIsCreateModalOpen(false)
      // reset form
      setTitle('Kompleks davolash rejasi')
      setNotes('')
      setDiscountPercent('0')
      setItems([{ title: '1-Bosqich muolajasi', toothNumber: '16', procedureType: '', estimatedPrice: '0', order: 1 }])
    } catch (_err: any) {
      const msg = _err?.response?.data?.detail || "Rejani yaratishda xatolik yuz berdi"
      toast.error(msg)
    }
  }

  const handleChangeStatus = async (planId: string, newStatus: string) => {
    try {
      await updatePlan.mutateAsync({
        id: planId,
        data: { status: newStatus }
      })
      toast.success("Reja holati yangilandi!")
    } catch {
      toast.error("Holatni yangilashda xatolik")
    }
  }

  const handleDeletePlan = async (planId: string) => {
    const ok = await confirmSwal({
      title: "Rejani o'chirish",
      text: "Haqiqatan ham ushbu davolash rejasini o'chirmoqchimisiz?",
      icon: "warning",
      confirmButtonText: "Ha, o'chirish"
    })
    if (!ok) return

    try {
      await deletePlan.mutateAsync(planId)
      toast.success("Davolash rejasi o'chirildi")
    } catch {
      toast.error("O'chirishda xatolik yuz berdi")
    }
  }

  const handlePrintSmeta = (plan: any) => {
    setSelectedPlanForPrint(plan)
    setTimeout(() => {
      window.print()
    }, 300)
  }

  return (
    <div className="space-y-4">
      {/* Top Header Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Bemorning Davolash Rejalari va Smetalari (Treatment Plans)
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Kompleks stomatologik muolajalar bosqichlari, tishlar xaritasi bo'yicha smeta va bajarilish nazorati.
          </p>
        </div>

        {canEdit && (
          <Button 
            size="sm" 
            onClick={() => setIsCreateModalOpen(true)}
            className="h-8 text-xs gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Yangi Reja Tuzish
          </Button>
        )}
      </div>

      {/* Plans List */}
      {isLoading ? (
        <div className="text-xs text-center py-8 text-muted-foreground">Yuklanmoqda...</div>
      ) : plans.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <Sparkles className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-semibold">Ushbu bemorda hali davolash rejasi tuzilmagan</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Tishlar bo'yicha bosqichma-bosqich davolash rejasi va narx smetasini shakllantirish uchun "Yangi Reja Tuzish" tugmasini bosing.
            </p>
            {canEdit && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-4 text-xs gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Reja Tuzish
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {plans.map((plan: any) => {
            const statusConfig = PLAN_STATUS_MAP[plan.status] || PLAN_STATUS_MAP.proposed
            const planItems: any[] = Array.isArray(plan.items) ? plan.items : []

            return (
              <Card key={plan.id} className="shadow-xs border-primary/20 overflow-hidden">
                <CardHeader className="bg-muted/20 pb-3">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-bold text-foreground">
                          {plan.title}
                        </CardTitle>
                        <Badge variant={statusConfig.variant} className={`text-[10px] font-semibold ${statusConfig.color}`}>
                          {statusConfig.label}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs mt-1">
                        Shifokor: <span className="font-semibold text-foreground">{plan.doctorName || 'Noma`lum'}</span> • Sana: {plan.createdAt ? format(new Date(plan.createdAt), 'dd.MM.yyyy') : ''}
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePrintSmeta(plan)}
                        className="h-7 text-xs gap-1"
                      >
                        <Printer className="w-3 h-3 text-primary" />
                        Smeta (Chop etish)
                      </Button>

                      {canEdit && (
                        <Select 
                          value={plan.status} 
                          onValueChange={(val) => handleChangeStatus(plan.id, val)}
                        >
                          <SelectTrigger className="h-7 text-xs w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="proposed">Taklif qilingan</SelectItem>
                            <SelectItem value="accepted">Bemor qabul qilgan</SelectItem>
                            <SelectItem value="in_progress">Bajarilmoqda</SelectItem>
                            <SelectItem value="completed">Yakunlangan</SelectItem>
                            <SelectItem value="cancelled">Bekor qilingan</SelectItem>
                          </SelectContent>
                        </Select>
                      )}

                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeletePlan(plan.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-4">
                  {/* Items Table */}
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow className="text-xs">
                          <TableHead className="w-12 text-center">#</TableHead>
                          <TableHead className="w-20">Tish</TableHead>
                          <TableHead>Bosqich / Muolaja</TableHead>
                          <TableHead className="text-end">Taxminiy Narx</TableHead>
                          <TableHead className="w-28 text-center">Holati</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {planItems.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-4">
                              Ushbu rejada hali bosqichlar mavjud emas
                            </TableCell>
                          </TableRow>
                        ) : (
                          planItems.map((item: any, idx: number) => {
                            const isCompleted = item.status === 'completed'
                            return (
                              <TableRow key={item.id || idx} className="text-xs">
                                <TableCell className="text-center font-mono font-bold text-muted-foreground">
                                  {item.order || idx + 1}
                                </TableCell>
                                <TableCell>
                                  {item.toothNumber ? (
                                    <Badge variant="outline" className="font-mono font-bold text-xs bg-muted">
                                      #{item.toothNumber}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <span className={`font-semibold ${isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                    {item.title}
                                  </span>
                                  {item.notes && (
                                    <p className="text-[11px] text-muted-foreground mt-0.5">{item.notes}</p>
                                  )}
                                </TableCell>
                                <TableCell className="text-end font-mono font-bold text-primary">
                                  {Number(item.estimatedPrice || 0).toLocaleString()} so'm
                                </TableCell>
                                <TableCell className="text-center">
                                  {isCompleted ? (
                                    <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1">
                                      <CheckCircle2 className="w-3 h-3" /> Bajarildi
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] text-amber-600 gap-1 border-amber-300">
                                      <Clock className="w-3 h-3" /> Rejada
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pricing summary */}
                  <div className="flex flex-col sm:flex-row items-end sm:items-center justify-between gap-3 pt-2 border-t text-xs">
                    {plan.notes ? (
                      <p className="text-muted-foreground italic max-w-md">
                        Izoh: {plan.notes}
                      </p>
                    ) : <div />}

                    <div className="flex items-center gap-4 text-end">
                      {Number(plan.discountPercent) > 0 && (
                        <div>
                          <span className="text-muted-foreground block text-[11px]">Chegirma:</span>
                          <span className="font-semibold text-rose-600">
                            {plan.discountPercent}% ({((Number(plan.totalEstimatedPrice) || 0) - (Number(plan.finalPriceWithDiscount) || 0)).toLocaleString()} so'm)
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Jami Smeta Qiymati:</span>
                        <span className="text-sm font-bold font-mono text-primary">
                          {Number(plan.finalPriceWithDiscount || plan.totalEstimatedPrice || 0).toLocaleString()} so'm
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* CREATE TREATMENT PLAN MODAL */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleCreateSubmit}>
            <DialogHeader>
              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Yangi Kompleks Davolash Rejasi (Smeta) Tuzish
              </DialogTitle>
              <DialogDescription className="text-xs">
                Bemor uchun davolash bosqichlarini belgilang va taxminiy narx smetasini shakllantiring.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Reja Nomi *</Label>
                  <Input 
                    value={title} 
                    onChange={(e) => setTitle(e.target.value)} 
                    placeholder="Masalan: Tishlarni to'liq restavratsiya qilish"
                    className="h-8 text-xs"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Mas'ul Shifokor *</Label>
                  <Select value={doctorId} onValueChange={setDoctorId} required>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Shifokorni tanlang..." />
                    </SelectTrigger>
                    <SelectContent>
                      {doctors.map((doc: any) => (
                        <SelectItem key={doc.id} value={doc.id} className="text-xs">
                          {doc.user ? `Dr. ${doc.user.first_name} ${doc.user.last_name}` : 'Shifokor'} ({doc.specialization || 'Umumiy'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground">
                    Davolash Bosqichlari ({items.length} ta)
                  </Label>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={handleAddItem}
                    className="h-6 text-[11px] gap-1 text-primary border-primary/30"
                  >
                    <Plus className="w-3 h-3" /> Bosqich Qo'shish
                  </Button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {items.map((item, idx) => (
                    <div key={idx} className="p-2.5 rounded-lg border bg-muted/20 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[11px] text-muted-foreground font-mono">
                          #{idx + 1}-bosqich
                        </span>
                        {items.length > 1 && (
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleRemoveItem(idx)}
                            className="h-5 w-5 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-3 sm:col-span-2">
                          <Input 
                            type="number"
                            placeholder="Tish #"
                            value={item.toothNumber}
                            onChange={(e) => handleItemChange(idx, 'toothNumber', e.target.value)}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div className="col-span-9 sm:col-span-4">
                          <Select 
                            value={item.procedureType} 
                            onValueChange={(val) => handleItemChange(idx, 'procedureType', val)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Muolaja tanlang..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-48">
                              {procedureTypes.map((proc: any) => (
                                <SelectItem key={proc.id} value={proc.id} className="text-xs">
                                  {proc.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-7 sm:col-span-3">
                          <Input 
                            value={item.title}
                            onChange={(e) => handleItemChange(idx, 'title', e.target.value)}
                            placeholder="Muolaja nomi"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="col-span-5 sm:col-span-3">
                          <Input 
                            type="number"
                            value={item.estimatedPrice}
                            onChange={(e) => handleItemChange(idx, 'estimatedPrice', e.target.value)}
                            placeholder="Narxi"
                            className="h-8 text-xs font-mono font-bold text-end"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Discount & Total */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                <div className="space-y-1">
                  <Label className="text-xs">Chegirma Foizi (0 - 100%)</Label>
                  <Input 
                    type="number" 
                    min="0" 
                    max="100" 
                    value={discountPercent} 
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Qo'shimcha Klinik Izoh</Label>
                  <Input 
                    value={notes} 
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Masalan: Bemor 2 haftadan so'ng keladi..."
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Total Calculation Display */}
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-between text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Jami Hisoblangan:</span>
                  <span className="font-mono text-xs">{totalCalculated.toLocaleString()} so'm</span>
                </div>
                <div className="text-end">
                  <span className="text-muted-foreground block text-[11px]">Smeta Yakuniy Narxi:</span>
                  <span className="text-sm font-bold font-mono text-primary">
                    {totalWithDiscount.toLocaleString()} so'm
                  </span>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateModalOpen(false)}>
                Bekor Qilish
              </Button>
              <Button type="submit" size="sm" disabled={createPlan.isPending}>
                {createPlan.isPending ? 'Saqlanmoqda...' : 'Smetani Saqlash'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* PRINT-ONLY SMETA TEMPLATE */}
      {selectedPlanForPrint && (
        <div className="hidden print:block fixed inset-0 bg-white p-8 text-black z-50">
          <div className="border-b-2 border-black pb-4 mb-4 flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold uppercase tracking-wider">DENTACRM KLINIKASI</h1>
              <p className="text-xs text-gray-600">Davolash Rejasi va Narx Smetasi</p>
            </div>
            <div className="text-end text-xs">
              <p>Sana: {format(new Date(), 'dd.MM.yyyy')}</p>
              <p>Reja #: {selectedPlanForPrint.id?.slice(0, 8)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs mb-6 p-3 bg-gray-50 border">
            <div>
              <p><strong>Bemor:</strong> {patientName}</p>
              <p><strong>Reja Nomi:</strong> {selectedPlanForPrint.title}</p>
            </div>
            <div>
              <p><strong>Shifokor:</strong> {selectedPlanForPrint.doctorName}</p>
              <p><strong>Holati:</strong> {PLAN_STATUS_MAP[selectedPlanForPrint.status]?.label || selectedPlanForPrint.status}</p>
            </div>
          </div>

          <table className="w-full text-xs border border-collapse mb-6">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="p-2 border text-center w-12">#</th>
                <th className="p-2 border text-center w-16">Tish</th>
                <th className="p-2 border text-left">Muolaja Nomi / Bosqich</th>
                <th className="p-2 border text-end w-32">Taxminiy Narx</th>
              </tr>
            </thead>
            <tbody>
              {(selectedPlanForPrint.items || []).map((item: any, idx: number) => (
                <tr key={idx} className="border-b">
                  <td className="p-2 border text-center font-bold">{item.order || idx + 1}</td>
                  <td className="p-2 border text-center font-bold">{item.toothNumber ? `#${item.toothNumber}` : '—'}</td>
                  <td className="p-2 border">{item.title}</td>
                  <td className="p-2 border text-end font-mono">{Number(item.estimatedPrice || 0).toLocaleString()} so'm</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end text-xs mb-10">
            <div className="w-64 space-y-1 text-end border-t pt-2">
              <p>Jami Hisoblangan: <span className="font-mono">{Number(selectedPlanForPrint.totalEstimatedPrice || 0).toLocaleString()} so'm</span></p>
              {Number(selectedPlanForPrint.discountPercent) > 0 && (
                <p>Chegirma: <span className="font-mono text-red-600">-{selectedPlanForPrint.discountPercent}%</span></p>
              )}
              <p className="text-sm font-bold border-t pt-1">
                Yakuniy To'lov: <span className="font-mono">{Number(selectedPlanForPrint.finalPriceWithDiscount || selectedPlanForPrint.totalEstimatedPrice || 0).toLocaleString()} so'm</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-10 text-xs pt-12 border-t">
            <div>
              <p className="mb-8">Shifokor imzosi: _____________________</p>
            </div>
            <div className="text-end">
              <p className="mb-8">Bemor roziligi (imzo): _____________________</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
