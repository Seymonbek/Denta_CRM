import { useState, useRef, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Save, CheckCircle, Upload, FileText, Camera, RefreshCw, AlertCircle } from 'lucide-react'
import { useUpdateTreatment, useUploadTreatmentPhoto, useTreatment } from '@/api/hooks/use-treatments'
import { useUpdateAppointment } from '@/api/hooks/use-appointments'
import { usePrescriptions, useIssuePrescription, usePrescriptionTemplates } from '@/api/hooks/use-prescriptions'
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
import { PhotoType } from '@/types/api'

interface ActiveTreatmentSessionProps {
  treatmentId: string
  appointmentId: string
  patientId: string
}

export function ActiveTreatmentSession({ treatmentId, appointmentId, patientId }: ActiveTreatmentSessionProps) {
  const navigate = useNavigate()
  
  const { data: treatment, isLoading } = useTreatment(treatmentId)
  const updateTreatment = useUpdateTreatment()
  const uploadPhoto = useUploadTreatmentPhoto()
  const updateAppointment = useUpdateAppointment()
  
  // Prescription Hooks
  const { data: prescriptionsData } = usePrescriptions({ treatment: treatmentId })
  const prescriptionsList = Array.isArray(prescriptionsData?.results) ? prescriptionsData.results : Array.isArray(prescriptionsData) ? prescriptionsData : []
  const { data: templatesData } = usePrescriptionTemplates()
  const templates = Array.isArray(templatesData?.results) ? templatesData.results : Array.isArray(templatesData) ? templatesData : []
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

  // Sync state when data is loaded, and handle local storage draft
  useEffect(() => {
    const draftKey = `treatment_draft_${treatmentId}`
    const draft = localStorage.getItem(draftKey)
    
    // If we have a draft and the user hasn't explicitly saved recently, we can restore it.
    // To be safe, we only restore if current state is empty or matches server state but draft is different.
    if (draft) {
      try {
        const { diagnosis: draftDiag, description: draftDesc } = JSON.parse(draft)
        if (draftDiag && diagnosis === '') setDiagnosis(draftDiag)
        if (draftDesc && description === '') setDescription(draftDesc)
      } catch (e) {
        // ignore JSON parse errors
      }
    } else {
      if (treatment && diagnosis === '' && treatment.diagnosis) {
        setDiagnosis(treatment.diagnosis)
      }
      if (treatment && description === '' && treatment.description) {
        setDescription(treatment.description)
      }
    }

    if (treatment && price === '0.00' && treatment.price && treatment.price !== '0.00') {
      setPrice(treatment.price)
    }
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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
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

  const handleIssuePrescription = async (e: React.FormEvent) => {
    e.preventDefault()
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
    } catch (err: any) {
      toast.error('Retsept saqlashda xatolik yuz berdi.')
    }
  }

  const handleFinishAppointment = async () => {
    if (!treatment?.material_usages || treatment.material_usages.length === 0) {
      toast.error("Diqqat! Muolajani yakunlashdan oldin ishlatilgan materiallarni kiriting.", {
        duration: 5000,
      })
      return
    }

    if (treatment?.approvalStatus === 'pending' || treatment?.approval_status === 'pending') {
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
                onChange={(e) => setDiagnosis(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Batafsil Xulosa (Shikoyat, qilingan ishlar)</Label>
              <Textarea 
                id="description" 
                placeholder="Bemor shikoyatlari va bajarilgan muolajalar haqida batafsil ma'lumot..." 
                className="min-h-[120px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={handleSaveNotes} disabled={updateTreatment.isPending}>
                {updateTreatment.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Saqlash
              </Button>
            </div>
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

            {/* Photo Gallery preview */}
            {treatment.photos && treatment.photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 mt-4 max-h-[250px] overflow-y-auto pr-2">
                {treatment.photos.map(photo => (
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
          <Button variant="outline" size="sm" onClick={() => setIsPrescriptionModalOpen(true)}>
            Retsept Yozish
          </Button>
        </CardHeader>
        <CardContent>
          {prescriptionsList.length > 0 ? (
            <div className="space-y-3">
              {prescriptionsList.map((p: any) => (
                <div key={p.id} className="p-3 border rounded-lg bg-muted/20 flex flex-col gap-2">
                  <div className="text-sm whitespace-pre-wrap">{p.content || (p.template && typeof p.template === 'object' ? p.template.content : 'Shablon asosida')}</div>
                  <div className="flex justify-between items-center text-xs text-muted-foreground mt-2 border-t pt-2">
                    <span>Sana: {new Date(p.createdAt || p.created_at || Date.now()).toLocaleString()}</span>
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
                onChange={(e) => setPrice(e.target.value)}
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
                updateTreatment.isPending || 
                updateAppointment.isPending || 
                treatmentData?.approvalStatus === 'pending' || 
                treatmentData?.approval_status === 'pending'
              }
            >
              {(updateTreatment.isPending || updateAppointment.isPending) ? <RefreshCw className="w-5 h-5 mr-2 animate-spin" /> : <CheckCircle className="w-5 h-5 mr-2" />}
              {treatmentData?.approvalStatus === 'pending' || treatmentData?.approval_status === 'pending' 
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
                    <SelectItem key={tpl.id} value={String(tpl.id)}>
                      {tpl.name || tpl.title}
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
                onChange={(e) => setPrescriptionContent(e.target.value)}
              />
            </div>
            <div className="flex flex-col space-y-2">
              <div className="flex items-center space-x-2 bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/50">
                <Checkbox
                  id="telegram"
                  checked={sendToTelegram}
                  onCheckedChange={(checked) => setSendToTelegram(!!checked)}
                  disabled={!(treatment?.patient?.telegramChatId || treatment?.patient?.telegram_chat_id)}
                />
                <Label htmlFor="telegram" className="text-sm font-medium cursor-pointer flex-1">
                  Bemorga Telegram orqali yuborish
                </Label>
              </div>
              {!(treatment?.patient?.telegramChatId || treatment?.patient?.telegram_chat_id) && (
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
