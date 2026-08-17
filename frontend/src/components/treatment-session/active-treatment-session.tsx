import { useState, useRef, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Save, CheckCircle, Upload, FileText, Camera, RefreshCw, AlertCircle } from 'lucide-react'
import { useUpdateTreatment, useUploadTreatmentPhoto, useTreatment } from '@/api/hooks/use-treatments'
import { useUpdateAppointment } from '@/api/hooks/use-appointments'
import { usePrescriptions, useIssuePrescription, usePrescriptionTemplates } from '@/api/hooks/use-prescriptions'
import { getProcedureBOMsApi } from '@/api/inventory'
import { useMaterials, useCreateMaterialUsage, useMaterialUsages } from '@/api/hooks/use-inventory'
import { toast } from 'sonner'
import { confirmSwal } from '@/lib/sweetalert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { type PhotoType } from '@/types/api'
import { useAuthStore } from '@/stores/auth-store'
import { useQueryClient } from '@tanstack/react-query'

interface ActiveTreatmentSessionProps {
  treatmentId: string
  appointmentId: string
  patientId?: string
}

export function ActiveTreatmentSession({ treatmentId, appointmentId }: ActiveTreatmentSessionProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  const authUser = useAuthStore((state) => state.user)
  const isAdministrator = authUser?.role === 'administrator'
  const canEditTreatment = authUser?.role === 'doctor' || authUser?.role === 'bosh_shifokor'
  
  const { data: treatment, isLoading } = useTreatment(treatmentId)
  const updateTreatment = useUpdateTreatment()
  const uploadPhoto = useUploadTreatmentPhoto()
  const updateAppointment = useUpdateAppointment()
  
  // Prescription Hooks
  const { data: prescriptionsData } = usePrescriptions({ treatment: treatmentId })
  const prescriptionsList: any[] = Array.isArray(prescriptionsData) ? prescriptionsData : []
  const { data: templatesData } = usePrescriptionTemplates()
  const templates: any[] = Array.isArray(templatesData) ? templatesData : []
  const issuePrescriptionMutation = useIssuePrescription()

  const [diagnosis, setDiagnosis] = useState(treatment?.diagnosis || '')
  const [description, setDescription] = useState(treatment?.description || '')
  const [price, setPrice] = useState(treatment?.price || '0.00')

  // Prescription UI State
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false)
  const [prescriptionContent, setPrescriptionContent] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [sendToTelegram, setSendToTelegram] = useState(true)

  // Photo upload states
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedPhotoType, setSelectedPhotoType] = useState<PhotoType>('before')
  const [isUploading, setIsUploading] = useState(false)

  // Material usage states
  const { data: materialsData } = useMaterials()
  const materials: any[] = Array.isArray(materialsData) ? materialsData : []
  const { data: materialUsagesData } = useMaterialUsages({ treatment: treatmentId })
  const materialUsages: any[] = Array.isArray(materialUsagesData) ? materialUsagesData : []
  const createMaterialUsage = useCreateMaterialUsage()
  const [selectedMaterialId, setSelectedMaterialId] = useState('')
  const [materialQuantity, setMaterialQuantity] = useState('1')

  // Sync state when data is loaded, and handle local storage draft
  useEffect(() => {
    const draftKey = `treatment_draft_${treatmentId}`
    const draft = localStorage.getItem(draftKey)
    
    // If we have a draft and the user hasn't explicitly saved recently, we can restore it.
    // To be safe, we only restore if current state is empty or matches server state but draft is different.
    if (draft) {
      try {
        const { diagnosis: draftDiag, description: draftDesc } = JSON.parse(draft)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (draftDiag && diagnosis === '') setDiagnosis(draftDiag)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (draftDesc && description === '') setDescription(draftDesc)
      } catch (_e) {
        // ignore JSON parse errors
      }
    } else {
      if (treatment && diagnosis === '' && treatment.diagnosis) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDiagnosis(treatment.diagnosis)
      }
      if (treatment && description === '' && treatment.description) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDescription(treatment.description)
      }
    }

    if (treatment && price === '0.00' && treatment.price && treatment.price !== '0.00') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrice(treatment.price)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treatment, treatmentId])

  // Save to local storage on change
  useEffect(() => {
    const draftKey = `treatment_draft_${treatmentId}`
    if (diagnosis || description) {
      localStorage.setItem(draftKey, JSON.stringify({ diagnosis, description }))
    }
  }, [diagnosis, description, treatmentId])

  const handleSaveNotes = async () => {
    try {
      await updateTreatment.mutateAsync({
        id: treatmentId,
        data: { diagnosis, description, price }
      })
      localStorage.removeItem(`treatment_draft_${treatmentId}`)
      toast.success("Ma'lumotlar saqlandi")
    } catch (error) {
      toast.error("Xatolik yuz berdi")
    }
  }

  const handlePhotoUpload = async (_e: React.ChangeEvent<HTMLInputElement>) => {
    const file = _e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      await uploadPhoto.mutateAsync({
        treatmentId,
        file,
        photoType: selectedPhotoType
      })
      toast.success("Rasm muvaffaqiyatli yuklandi")
    } catch (error) {
      toast.error("Rasm yuklashda xatolik yuz berdi")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleIssuePrescription = async (_e: React.FormEvent) => {
    _e.preventDefault()
    if (!prescriptionContent.trim() && !selectedTemplateId) {
      toast.error('Retsept matnini kiriting yoki shablon tanlang.')
      return
    }

    try {
      await issuePrescriptionMutation.mutateAsync({
        treatmentId,
        data: {
          templateId: selectedTemplateId || undefined,
          content: prescriptionContent,
          sendTelegram: sendToTelegram,
        },
      })
      toast.success('Retsept muvaffaqiyatli saqlandi')
      setIsPrescriptionModalOpen(false)
      setPrescriptionContent('')
      setSelectedTemplateId('')
    } catch (error) {
      toast.error('Retsept saqlashda xatolik yuz berdi.')
    }
  }

  const handleAddMaterial = async () => {
    if (!selectedMaterialId || !materialQuantity || Number(materialQuantity) <= 0) {
      toast.error('Material va miqdorni kiriting')
      return
    }

    try {
      await createMaterialUsage.mutateAsync({
        treatment: treatmentId,
        material: selectedMaterialId,
        quantityUsed: materialQuantity
      })
      toast.success("Material qo'shildi")
      setSelectedMaterialId('')
      setMaterialQuantity('1')
      queryClient.invalidateQueries({ queryKey: ['treatments', treatmentId] })
    } catch (error) {
      toast.error("Material qo'shishda xatolik yuz berdi")
    }
  }

  const handleFinishAppointment = async () => {
    if (!materialUsages || materialUsages.length === 0) {
      const procedureTypeId = typeof (treatment as any)?.procedureType === 'object' 
        ? (treatment as any)?.procedureType?.id 
        : ((treatment as any)?.procedureType || (treatment as any)?.procedure_type)
      
      let bomProcessed = false
      if (procedureTypeId) {
        try {
          const boms = await getProcedureBOMsApi({ procedure_type: procedureTypeId })
          if (boms && boms.length > 0) {
            const wantAuto = await confirmSwal({
              title: "Materiallar kiritilmagan",
              text: "Muolaja uchun texkarta mavjud. Materiallarni avtomatik ravishda sarflashni xohlaysizmi?",
              confirmButtonText: "Ha, Avtomatik Sarflash",
              cancelButtonText: "Yo'q, O'zim Kiritaman"
            })
            
            if (wantAuto) {
              const toastId = toast.loading("Materiallar sarflanmoqda...")
              for (const bom of boms) {
                await createMaterialUsage.mutateAsync({
                  treatment: treatmentId,
                  material: bom.material,
                  quantityUsed: bom.defaultQuantity
                } as any)
              }
              toast.success("Materiallar muvaffaqiyatli sarflandi!", { id: toastId })
              bomProcessed = true
            } else {
              return
            }
          }
        } catch {
          // ignore
        }
      }

      if (!bomProcessed) {
        toast.error("Diqqat! Muolajani yakunlashdan oldin ishlatilgan materiallarni kiriting.", {
          duration: 5000,
        })
        return
      }
    }

    if ((treatment as any)?.approvalStatus === 'pending' || (treatment as any)?.approval_status === 'pending') {
      toast.error("Chegirma tasdiqlanmagan. Bosh shifokor tasdig'ini kuting.")
      return
    }

    const isConfirmed = await confirmSwal({
      title: "Qabulni yakunlaysizmi?",
      text: `Jami summa: ${price} so'm. Barcha ishlar yakunlandimi?`,
      confirmButtonText: "Ha, Yakunlash",
      cancelButtonText: "Bekor qilish"
    })

    if (!isConfirmed) return

    try {
      // 1. Update treatment stage to completed
      await updateTreatment.mutateAsync({
        id: treatmentId,
        data: { diagnosis, description, price, stage: 'completed' }
      })

      // 2. Update appointment status to completed
      await updateAppointment.mutateAsync({
        id: appointmentId,
        data: { status: 'completed' }
      })

      toast.success("Qabul muvaffaqiyatli yakunlandi!")
      
      const nextVisit = await confirmSwal({
        title: "Keyingi tashrif",
        text: "Bemor uchun keyingi tashrifni (yangi navbat) belgilashni xohlaysizmi?",
        confirmButtonText: "Ha, taqvimga o'tish",
        cancelButtonText: "Yo'q, kerak emas"
      })

      if (nextVisit) {
        navigate({ to: '/appointments' })
      } else {
         // Reload page or navigate to patient list
         window.location.reload()
      }
    } catch (error) {
      toast.error("Yakunlashda xatolik yuz berdi")
    }
  }

  if (isLoading || !treatment) {
    return <div className="animate-pulse text-center p-4">Ma'lumotlar yuklanmoqda...</div>
  }

  return (
    <div className="space-y-6">
      {/* Administrator Read-only Notice */}
      {isAdministrator && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="text-xs">
            <p className="font-bold">Administrator Nazorati (Faqat ko'rish rejimi)</p>
            <p className="text-muted-foreground mt-0.5">
              Muolaja jarayoni, tashxis qo'yish, retsept yozish, material sarflash va qabulni yakunlash bevosita <strong>Shifokor</strong> yoki <strong>Bosh Shifokor</strong> tomonidan amalga oshiriladi. Muolajani yakunlash yoki ma'lumot kiritish uchun shifokor profiliga kiring.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Diagnosis & Notes Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Tashxis va Xulosa
            </CardTitle>
            <CardDescription>
              Bemorning holati va qilingan ishlar tafsilotlari
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="diagnosis">Tashxis (Diagnoz)</Label>
              <Input 
                id="diagnosis" 
                placeholder="Masalan: Tish kariyesi, Pulpit..." 
                value={diagnosis}
                disabled={!canEditTreatment}
                onChange={(_e) => setDiagnosis(_e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Batafsil Xulosa (Shikoyat, qilingan ishlar)</Label>
              <Textarea 
                id="description" 
                placeholder="Bemor shikoyatlari va bajarilgan muolajalar haqida batafsil ma'lumot..." 
                className="min-h-[120px]"
                value={description}
                disabled={!canEditTreatment}
                onChange={(_e) => setDescription(_e.target.value)}
              />
            </div>
            {canEditTreatment && (
              <div className="flex justify-end">
                <Button variant="secondary" onClick={handleSaveNotes} disabled={updateTreatment.isPending}>
                  {updateTreatment.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Saqlash
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Photos Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" /> Rasmlar va Rentgen
            </CardTitle>
            <CardDescription>
              Muolajadan oldin, keyin va rentgen rasmlarini yuklash
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canEditTreatment && (
              <div className="flex items-center gap-3">
                <Select value={selectedPhotoType} onValueChange={(val: PhotoType) => setSelectedPhotoType(val)}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Rasm turi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="before">Muolajadan oldin</SelectItem>
                    <SelectItem value="after">Muolajadan keyin</SelectItem>
                    <SelectItem value="xray">Rentgen (X-Ray)</SelectItem>
                  </SelectContent>
                </Select>
                
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={fileInputRef} 
                  onChange={handlePhotoUpload}
                />
                <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                  {isUploading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  Yuklash
                </Button>
              </div>
            )}

            {/* Photo Gallery preview */}
            {(treatment as any)?.photos && (treatment as any).photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 mt-4 max-h-[250px] overflow-y-auto pr-2">
                {(treatment as any).photos.map((photo: any) => (
                  <div key={photo.id} className="relative group rounded-md overflow-hidden border">
                    <img 
                      src={photo.thumbnailPath || photo.imageUrl || ''} 
                      alt={photo.photoType} 
                      className="w-full h-24 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Badge variant="outline" className="text-white border-white text-[10px]">
                        {photo.photoType === 'before' ? 'Oldin' : photo.photoType === 'after' ? 'Keyin' : 'Rentgen'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[120px] bg-muted/20 border border-dashed rounded-lg text-muted-foreground text-sm">
                Hozircha rasmlar yuklanmagan
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Prescriptions Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Retseptlar va Dori-darmonlar
            </CardTitle>
            <CardDescription>
              Bemorga shu muolaja davomida yozilgan retseptlar
            </CardDescription>
          </div>
          {canEditTreatment && (
            <Button variant="outline" size="sm" onClick={() => setIsPrescriptionModalOpen(true)}>
              Retsept Yozish
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {prescriptionsList.length > 0 ? (
            <div className="space-y-3">
              {prescriptionsList.map((p: any) => (
                <div key={String(p.id)} className="p-3 border rounded-lg bg-muted/20 flex flex-col gap-2">
                  <div className="text-sm whitespace-pre-wrap">{String(p.content || (p.template && typeof p.template === 'object' ? p.template.content : 'Shablon asosida'))}</div>
                  <div className="flex justify-between items-center text-xs text-muted-foreground mt-2 border-t pt-2">
                    <span>Sana: {new Date(p.createdAt || new Date()).toLocaleString()}</span>
                    {(p.sentToTelegramAt || p.sent_to_telegram_at || p.sent_at) && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200">
                        Telegram orqali yuborildi
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center p-4 border border-dashed rounded-lg text-muted-foreground text-sm">
              Hozircha retsept yozilmagan.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Materials Card */}
      <Card>
        <CardHeader className="flex flex-row justify-between items-center pb-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
            <CardTitle className="text-lg">Ishlatilgan Materiallar</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {canEditTreatment && (
            <div className="flex gap-2 items-end mb-4">
              <div className="flex-1 space-y-1">
                <Label>Material</Label>
                <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Material tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} ({m.quantityInStock || m.quantity_in_stock} {m.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24 space-y-1">
                <Label>Miqdori</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={materialQuantity}
                  onChange={(e) => setMaterialQuantity(e.target.value)}
                />
              </div>
              <Button
                onClick={handleAddMaterial}
                disabled={createMaterialUsage.isPending || !selectedMaterialId}
              >
                {createMaterialUsage.isPending ? '...' : "Qo'shish"}
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {materialUsages && materialUsages.length > 0 ? (
              materialUsages.map((usage: any) => {
                const matchedMaterial = materials.find((m: any) => m.id === usage.material || m.id === usage.materialId);
                const name = usage.material_name || usage.materialName || usage.material?.name || matchedMaterial?.name || 'Material';
                const unit = usage.material_unit || usage.materialUnit || usage.material?.unit || matchedMaterial?.unit || '';
                return (
                  <div key={usage.id} className="flex justify-between items-center p-3 border rounded-lg bg-muted/20">
                    <div>
                      <span className="font-medium">{name}</span>
                    </div>
                    <Badge variant="outline">{usage.quantityUsed || usage.quantity_used} {unit}</Badge>
                  </div>
                );
              })
            ) : (
              <div className="text-center p-4 border border-dashed rounded-lg text-muted-foreground text-sm">
                Materiallar kiritilmagan.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Completion Card */}
      <Card className="border-primary/20 bg-primary/5 dark:bg-primary/10">
        <CardHeader>
          <CardTitle className="text-lg">Yakuniy Hisob-kitob va Yakunlash</CardTitle>
          <CardDescription>
            Muolajaning yakuniy narxini belgilang va qabulni tugating. Bemorning balansiga ushbu summa hisoblanadi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-end gap-4">
            <div className="space-y-2 flex-1">
              <Label htmlFor="price">Jami Muolaja Narxi (so'm)</Label>
              <Input 
                id="price" 
                type="number" 
                min="0"
                className="text-lg font-mono font-bold"
                value={price}
                disabled={!canEditTreatment}
                onChange={(_e) => setPrice(_e.target.value)}
              />
            </div>
            <div className="flex-1 space-y-2">
               <div className="flex items-center gap-2 text-amber-600 text-xs bg-amber-50 p-2 rounded-md border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50">
                  <AlertCircle className="w-4 h-4" />
                  Eslatma: Qabul yakunlangach, uni qayta tahrirlab bo'lmaydi va to'lov bemor qarzdorligiga qo'shiladi.
               </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end border-t pt-4 border-primary/10">
           <Button
              className="w-full h-12 text-base font-semibold shadow-md bg-primary hover:bg-primary/90"
              onClick={handleFinishAppointment}
              disabled={
                !canEditTreatment ||
                updateTreatment.isPending || 
                updateAppointment.isPending || 
                (treatment as any)?.approvalStatus === 'pending' || 
                (treatment as any)?.approval_status === 'pending'
              }
            >
              {(updateTreatment.isPending || updateAppointment.isPending) ? <RefreshCw className="w-5 h-5 mr-2 animate-spin" /> : <CheckCircle className="w-5 h-5 mr-2" />}
              {!canEditTreatment 
                ? "Qabulni Yakunlash (Faqat Shifokor uchun)"
                : (treatment as any)?.approvalStatus === 'pending' || (treatment as any)?.approval_status === 'pending' 
                ? "Tasdiq kutilmoqda (Chegirma)" 
                : "Qabulni Yakunlash"}
            </Button>
        </CardFooter>
      </Card>

      {/* Prescription Modal */}
      <Dialog open={isPrescriptionModalOpen} onOpenChange={setIsPrescriptionModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Yangi Retsept Yozish</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleIssuePrescription} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Tayyor Shablon (Ixtiyoriy)</Label>
              <Select value={selectedTemplateId} onValueChange={(val) => {
                setSelectedTemplateId(val)
                const tpl = templates.find((t: any) => String(t.id) === val)
                if (tpl) {
                  setPrescriptionContent(tpl.content || '')
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Shablonni tanlang..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanlanmagan</SelectItem>
                  {templates.map((tpl: any) => (
                    <SelectItem key={String(tpl.id)} value={String(tpl.id)}>
                      {String(tpl.name || tpl.title || '')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Retsept Matni *</Label>
              <Textarea
                required
                className="min-h-[150px]"
                placeholder="Dori-darmonlar va qabul qilish tartibini yozing..."
                value={prescriptionContent}
                onChange={(_e) => setPrescriptionContent(_e.target.value)}
              />
            </div>
            <div className="flex flex-col space-y-2">
              <div className="flex items-center space-x-2 bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/50">
                <Checkbox
                  id="telegram"
                  checked={sendToTelegram}
                  onCheckedChange={(checked) => setSendToTelegram(!!checked)}
                  disabled={!((treatment as any)?.patient?.telegramChatId || (treatment as any)?.patient?.telegram_chat_id)}
                />
                <Label htmlFor="telegram" className="text-sm font-medium cursor-pointer flex-1">
                  Bemorga Telegram orqali yuborish
                </Label>
              </div>
              {!((treatment as any)?.patient?.telegramChatId || (treatment as any)?.patient?.telegram_chat_id) && (
                <p className="text-[11px] text-rose-500 font-medium">
                  Bemor Telegram botga ulanmagan (faqat chop etish mumkin).
                </p>
              )}
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsPrescriptionModalOpen(false)}>
                Bekor Qilish
              </Button>
              <Button type="submit" disabled={issuePrescriptionMutation.isPending}>
                {issuePrescriptionMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash va Yuborish'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
