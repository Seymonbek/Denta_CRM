import { useState, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Save, CheckCircle, Upload, FileText, Camera, RefreshCw, AlertCircle } from 'lucide-react'
import { useUpdateTreatment, useUploadTreatmentPhoto, useTreatment } from '@/api/hooks/use-treatments'
import { useUpdateAppointment } from '@/api/hooks/use-appointments'
import { toast } from 'sonner'
import { confirmSwal } from '@/lib/sweetalert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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

  const [diagnosis, setDiagnosis] = useState(treatment?.diagnosis || '')
  const [description, setDescription] = useState(treatment?.description || '')
  const [price, setPrice] = useState(treatment?.price || '0.00')

  // Photo upload states
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedPhotoType, setSelectedPhotoType] = useState<PhotoType>('before')
  const [isUploading, setIsUploading] = useState(false)

  // Sync state when data is loaded
  if (treatment && diagnosis === '' && treatment.diagnosis !== '') {
    setDiagnosis(treatment.diagnosis || '')
  }
  if (treatment && description === '' && treatment.description !== '') {
    setDescription(treatment.description || '')
  }
  if (treatment && price === '0.00' && treatment.price && treatment.price !== '0.00') {
    setPrice(treatment.price)
  }

  const handleSaveNotes = async () => {
    try {
      await updateTreatment.mutateAsync({
        id: treatmentId,
        data: { diagnosis, description, price }
      })
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

  const handleFinishAppointment = async () => {
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
             size="lg" 
             className="bg-emerald-600 hover:bg-emerald-700 text-white"
             onClick={handleFinishAppointment}
             disabled={updateTreatment.isPending || updateAppointment.isPending}
           >
             {(updateTreatment.isPending || updateAppointment.isPending) ? <RefreshCw className="w-5 h-5 mr-2 animate-spin" /> : <CheckCircle className="w-5 h-5 mr-2" />}
             Qabulni Yakunlash
           </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
