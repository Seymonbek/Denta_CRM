import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { 
  Save, 
  CheckCircle, 
  Upload, 
  FileText, 
  Camera, 
  RefreshCw, 
  AlertCircle, 
  Plus, 
  Calendar,
  Sparkles,
  Stethoscope,
  ShieldAlert
} from 'lucide-react'
import { useUpdateTreatment, useUploadTreatmentPhoto, useTreatment } from '@/api/hooks/use-treatments'
import { useUpdateAppointment, useCreateAppointment } from '@/api/hooks/use-appointments'
import { usePrescriptions, useIssuePrescription, usePrescriptionTemplates } from '@/api/hooks/use-prescriptions'
import { useProcedureTypes } from '@/api/hooks/use-procedure-types'
import { getProcedureBOMsApi } from '@/api/inventory'
import { useMaterials, useCreateMaterialUsage, useMaterialUsages } from '@/api/hooks/use-inventory'
import { usePatientOdontogram, usePatient } from '@/api/hooks/use-patients'
import { createToothRecordApi } from '@/api/treatments'
import { toast } from 'sonner'
import { confirmSwal } from '@/lib/sweetalert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { type PhotoType, type ToothStatus, type ToothProcedure, type ToothRecord } from '@/types/api'
import { useAuthStore } from '@/stores/auth-store'
import { useQueryClient } from '@tanstack/react-query'
import { format, addDays } from 'date-fns'

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11]
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28]
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41]
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38]

const TOOTH_STATUS_STYLES: Record<ToothStatus, { bg: string; text: string; label: string; border: string }> = {
  healthy: { bg: 'bg-emerald-500/10 hover:bg-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-700', label: "Sog'lom" },
  treated: { bg: 'bg-blue-500/10 hover:bg-blue-500/20', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-300 dark:border-blue-700', label: 'Davolangan' },
  planned: { bg: 'bg-amber-500/10 hover:bg-amber-500/20', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-300 dark:border-amber-700', label: 'Rejalashtirilgan' },
  missing: { bg: 'bg-rose-500/10 hover:bg-rose-500/20', text: 'text-rose-700 dark:text-rose-400 line-through', border: 'border-rose-300 dark:border-rose-700', label: "Yo'q" },
}

interface ActiveTreatmentSessionProps {
  treatmentId: string
  appointmentId: string
  patientId?: string
}

export function ActiveTreatmentSession({ treatmentId, appointmentId, patientId }: ActiveTreatmentSessionProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  const authUser = useAuthStore((state) => state.user)
  const isAdministrator = authUser?.role === 'administrator'
  const canEditTreatment = authUser?.role === 'doctor' || authUser?.role === 'bosh_shifokor'
  
  const { data: treatment, isLoading: isTreatmentLoading } = useTreatment(treatmentId)
  const resolvedPatientId = patientId || (treatment as any)?.patientId || (treatment as any)?.patient?.id || (treatment as any)?.patient || ''
  const { data: patientData } = usePatient(resolvedPatientId)
  
  const treatmentDepartmentId = typeof treatment?.department === 'object' ? (treatment.department as any)?.id : treatment?.department
  const treatmentDepartmentName = typeof treatment?.department === 'object' ? (treatment.department as any)?.name : ''

  const { data: toothRecordsData = [] } = usePatientOdontogram(resolvedPatientId)
  const toothRecords: ToothRecord[] = Array.isArray(toothRecordsData) ? toothRecordsData : []
  
  const { data: procedureTypesData = [] } = useProcedureTypes()
  const procedureTypesList: any[] = Array.isArray(procedureTypesData) ? procedureTypesData : []

  const availableProcedures = useMemo(() => {
    if (!treatmentDepartmentId) return procedureTypesList
    const filtered = procedureTypesList.filter((p: any) => {
      const pDeptId = typeof p.department === 'object' ? p.department?.id : p.department
      return !pDeptId || String(pDeptId) === String(treatmentDepartmentId)
    })
    return filtered.length > 0 ? filtered : procedureTypesList
  }, [procedureTypesList, treatmentDepartmentId])

  const updateTreatment = useUpdateTreatment()
  const uploadPhoto = useUploadTreatmentPhoto()
  const updateAppointment = useUpdateAppointment()
  const createAppointment = useCreateAppointment()
  
  // Prescription Hooks
  const { data: prescriptionsData } = usePrescriptions({ treatment: treatmentId })
  const prescriptionsList: any[] = Array.isArray(prescriptionsData) ? prescriptionsData : []
  const { data: templatesData } = usePrescriptionTemplates()
  const templates: any[] = Array.isArray(templatesData) ? templatesData : []
  const issuePrescriptionMutation = useIssuePrescription()

  // Form states
  const [selectedTooth, setSelectedTooth] = useState<number | null>(16)
  const [selectedProcedureId, setSelectedProcedureId] = useState<string>('')
  const [diagnosis, setDiagnosis] = useState(treatment?.diagnosis || '')
  const [description, setDescription] = useState(treatment?.description || '')
  const [price, setPrice] = useState(treatment?.price || '0.00')

  // Prescription UI State
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false)
  const [prescriptionContent, setPrescriptionContent] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [sendToTelegram, setSendToTelegram] = useState(true)

  // Follow-up Appointment Modal State
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false)
  const [followUpDays, setFollowUpDays] = useState<number>(7)
  const [followUpDate, setFollowUpDate] = useState<string>(format(addDays(new Date(), 7), 'yyyy-MM-dd'))
  const [followUpTime, setFollowUpTime] = useState<string>('10:00')

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

  // Map tooth records by toothNumber
  const toothRecordMap = useMemo(() => {
    const map = new Map<number, ToothRecord>()
    for (const record of toothRecords) {
      map.set(record.toothNumber, record)
    }
    return map
  }, [toothRecords])

  // Sync state when data is loaded, and handle local storage draft
  useEffect(() => {
    if (treatment) {
      if (treatment.diagnosis && diagnosis === '') setDiagnosis(treatment.diagnosis)
      if (treatment.description && description === '') setDescription(treatment.description)
      if (treatment.price && price === '0.00' && treatment.price !== '0.00') setPrice(treatment.price)
      
      const proc = (treatment as any).procedureType || (treatment as any).procedure_type
      const procId = typeof proc === 'object' && proc !== null ? proc.id : proc
      if (procId && !selectedProcedureId) {
        setSelectedProcedureId(String(procId))
      }
    }
  }, [treatment])

  // Save to local storage on change
  useEffect(() => {
    const draftKey = `treatment_draft_${treatmentId}`
    if (diagnosis || description) {
      localStorage.setItem(draftKey, JSON.stringify({ diagnosis, description, price, selectedTooth }))
    }
  }, [diagnosis, description, price, selectedTooth, treatmentId])

  // Handle Procedure Type Selection with Auto-Price and Auto-BOM suggestions
  const handleSelectProcedure = async (procId: string) => {
    setSelectedProcedureId(procId)
    const proc = availableProcedures.find((p: any) => String(p.id) === String(procId)) || procedureTypesList.find((p: any) => String(p.id) === String(procId))
    if (proc) {
      // 1. Auto-fill price
      if (proc.defaultPrice && Number(proc.defaultPrice) > 0) {
        setPrice(String(proc.defaultPrice))
      }
      
      // 2. Auto-suggest diagnosis if empty or default
      const toothLabel = selectedTooth ? `Tish #${selectedTooth} ` : ''
      const newDiag = `${toothLabel}${proc.name}`.trim()
      setDiagnosis(newDiag)

      // 3. Auto-load BOM materials preview
      try {
        const boms = await getProcedureBOMsApi({ procedure_type: proc.id })
        if (boms && boms.length > 0 && materialUsages.length === 0) {
          toast.info(`Texkarta topildi: ${boms.length} ta standart material biriktiriladi.`)
          for (const bom of boms) {
            await createMaterialUsage.mutateAsync({
              treatment: treatmentId,
              material: bom.material,
              quantityUsed: bom.defaultQuantity || '1'
            } as any)
          }
          queryClient.invalidateQueries({ queryKey: ['treatments', treatmentId] })
          queryClient.invalidateQueries({ queryKey: ['material-usages'] })
        }
      } catch {
        // ignore
      }

      // 4. Update treatment record with selected procedure
      try {
        await updateTreatment.mutateAsync({
          id: treatmentId,
          data: {
            procedureType: proc.id,
            diagnosis: newDiag,
            price: proc.defaultPrice || price
          }
        })
        toast.success(`Muolaja tanlandi: ${proc.name}`)
      } catch (_err: any) {
        const errMsg = _err?.response?.data?.procedure_type?.[0] || _err?.response?.data?.detail || "Muolajani saqlashda xatolik."
        toast.error(errMsg)
      }
    }
  }

  // Handle Tooth Selection and Quick Status Update
  const handleToothClick = async (toothNum: number) => {
    setSelectedTooth(toothNum)
    const currentRec = toothRecordMap.get(toothNum)
    if (currentRec) {
      toast.info(`Tish #${toothNum}: ${TOOTH_STATUS_STYLES[currentRec.status]?.label || currentRec.status} (${currentRec.notes || 'Izohsiz'})`)
    }
  }

  const handleUpdateToothStatus = async (status: ToothStatus) => {
    if (!selectedTooth) return
    try {
      await createToothRecordApi(treatmentId, {
        toothNumber: selectedTooth,
        status: status,
        procedure: (selectedProcedureId ? 'filling' : 'other') as ToothProcedure,
        notes: diagnosis || `Tish #${selectedTooth} holati o'zgartirildi`
      })
      await queryClient.invalidateQueries({ queryKey: ['patients', resolvedPatientId, 'odontogram'] })
      toast.success(`Tish #${selectedTooth} holati "${TOOTH_STATUS_STYLES[status]?.label}" ga o'zgartirildi!`)
    } catch {
      toast.error("Tish holatini saqlashda xatolik yuz berdi")
    }
  }

  const handleSaveNotes = async () => {
    try {
      await updateTreatment.mutateAsync({
        id: treatmentId,
        data: { 
          diagnosis, 
          description, 
          price, 
          procedureType: selectedProcedureId || undefined 
        }
      })
      localStorage.removeItem(`treatment_draft_${treatmentId}`)
      toast.success("Barcha ma'lumotlar saqlandi!")
    } catch {
      toast.error("Ma'lumotlarni saqlashda xatolik yuz berdi")
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
    } catch {
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
      toast.success('Retsept muvaffaqiyatli saqlandi va Telegramga yuborildi')
      setIsPrescriptionModalOpen(false)
      setPrescriptionContent('')
      setSelectedTemplateId('')
    } catch {
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
      queryClient.invalidateQueries({ queryKey: ['material-usages'] })
    } catch {
      toast.error("Material qo'shishda xatolik yuz berdi")
    }
  }

  const handleFinishAppointment = async () => {
    if (!materialUsages || materialUsages.length === 0) {
      const procedureTypeId = selectedProcedureId || typeof (treatment as any)?.procedureType === 'object' 
        ? (treatment as any)?.procedureType?.id 
        : ((treatment as any)?.procedureType || (treatment as any)?.procedure_type)
      
      let bomProcessed = false
      if (procedureTypeId) {
        try {
          const boms = await getProcedureBOMsApi({ procedure_type: procedureTypeId })
          if (boms && boms.length > 0) {
            for (const bom of boms) {
              await createMaterialUsage.mutateAsync({
                treatment: treatmentId,
                material: bom.material,
                quantityUsed: bom.defaultQuantity || '1'
              } as any)
            }
            bomProcessed = true
          }
        } catch {
          // ignore
        }
      }

      if (!bomProcessed) {
        toast.error("Diqqat! Muolajani yakunlashdan oldin kamida bitta ishlatilgan materialni kiriting.", {
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
      text: `Jami muolaja summasi: ${Number(price).toLocaleString()} so'm. Kassaga to'lov hisobi yuboriladi.`,
      confirmButtonText: "Ha, Qabulni Yakunlash",
      cancelButtonText: "Bekor qilish"
    })

    if (!isConfirmed) return

    try {
      // 1. Update treatment stage to completed
      await updateTreatment.mutateAsync({
        id: treatmentId,
        data: { 
          diagnosis, 
          description, 
          price, 
          procedureType: selectedProcedureId || undefined,
          stage: 'completed' 
        }
      })

      // 2. Update appointment status to completed if appointment ID exists
      if (appointmentId && appointmentId.trim() !== '' && appointmentId !== 'undefined') {
        try {
          await updateAppointment.mutateAsync({
            id: appointmentId,
            data: { status: 'completed' }
          })
        } catch {
          // ignore
        }
      }

      localStorage.removeItem(`treatment_draft_${treatmentId}`)
      await queryClient.invalidateQueries({ queryKey: ['treatments'] })
      await queryClient.invalidateQueries({ queryKey: ['appointments'] })
      await queryClient.invalidateQueries({ queryKey: ['patients', resolvedPatientId] })
      toast.success("Qabul muvaffaqiyatli yakunlandi! Kassaga hisob uzatildi.")
      
      // Open Follow-up Appointment Modal
      setIsFollowUpModalOpen(true)
    } catch (err: any) {
      const errMsg = err?.response?.data?.stage?.[0] || 
                     err?.response?.data?.detail || 
                     err?.response?.data?.non_field_errors?.[0] || 
                     "Yakunlashda xatolik yuz berdi"
      toast.error(errMsg)
    }
  }

  const handleCreateFollowUp = async () => {
    if (!resolvedPatientId || !followUpDate || !followUpTime) {
      toast.error("Sana va vaqtni tanlang")
      return
    }

    try {
      const doc = (treatment as any)?.doctor
      const doctorId = typeof doc === 'object' && doc !== null ? doc.id : doc
      const dept = (treatment as any)?.department
      const departmentId = typeof dept === 'object' && dept !== null ? dept.id : dept

      const startDateTime = new Date(`${followUpDate}T${followUpTime}:00`)
      const endDateTime = new Date(startDateTime.getTime() + 30 * 60000)

      await createAppointment.mutateAsync({
        patient: String(resolvedPatientId),
        doctor: String(doctorId),
        department: String(departmentId),
        procedureType: selectedProcedureId || undefined,
        scheduledStart: startDateTime.toISOString(),
        scheduledEnd: endDateTime.toISOString(),
        notes: `Qayta qabul / Nazorat ko'rigi (#${treatmentId.slice(0, 8)})`,
      } as any)

      toast.success("Keyingi tashrif muvaffaqiyatli belgilandi!")
      setIsFollowUpModalOpen(false)
      navigate({ to: '/appointments' })
    } catch {
      toast.error("Keyingi navbatni belgilashda xatolik yuz berdi")
    }
  }

  if (isTreatmentLoading || !treatment) {
    return <div className="animate-pulse text-center p-8 text-muted-foreground text-sm">Muolaja ma'lumotlari yuklanmoqda...</div>
  }

  const doctorDisplayName = (treatment as any).doctorName || ((treatment as any).doctor && typeof (treatment as any).doctor === 'object' ? `${(treatment as any).doctor.firstName || ''} ${(treatment as any).doctor.lastName || ''}`.trim() : '') || 'Dr. Shifokor'
  const departmentDisplayName = (treatment as any).departmentName || ((treatment as any).department && typeof (treatment as any).department === 'object' ? (treatment as any).department.name : '') || "Bo'lim"

  return (
    <div className="space-y-6">
      {/* Top Session Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border bg-card/60 backdrop-blur shadow-sm gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-lg">
            🦷
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight">
                Faol Davolash Sessiyasi
              </h2>
              <Badge className="bg-emerald-500 hover:bg-emerald-600 text-[10px] px-2 py-0">
                🔴 Qabul Jarayonda
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Shifokor: <span className="font-semibold text-foreground">{doctorDisplayName}</span> • Bo'lim: <span className="font-medium text-foreground">{departmentDisplayName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canEditTreatment && (
            <Button variant="secondary" size="sm" onClick={handleSaveNotes} disabled={updateTreatment.isPending} className="h-8 text-xs">
              {updateTreatment.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Qoralamani Saqlash
            </Button>
          )}
        </div>
      </div>

      {/* Medical Alert / Allergy Warning Banner */}
      {patientData?.notes && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-500/10 border-2 border-rose-500/40 text-rose-900 dark:text-rose-200 shadow-sm animate-pulse">
          <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
              ⚠️ DIQQAT! BEMORNING TIBBIY OGOHLANTIRISH VA ALLERGIYALARI:
            </p>
            <p className="text-rose-900 dark:text-rose-200 font-semibold mt-0.5 text-xs">
              {patientData.notes}
            </p>
          </div>
        </div>
      )}

      {/* Administrator Read-only Notice */}
      {isAdministrator && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="text-xs">
            <p className="font-bold">Administrator Nazorati (Faqat ko'rish rejimi)</p>
            <p className="text-muted-foreground mt-0.5">
              Muolaja jarayoni, tashxis qo'yish, retsept yozish, material sarflash va qabulni yakunlash bevosita <strong>Shifokor</strong> yoki <strong>Bosh Shifokor</strong> tomonidan amalga oshiriladi.
            </p>
          </div>
        </div>
      )}

      {/* 1-QADAM: INTERAKTIV TISH XARITASI VA MUOLAJA KATALOGI */}
      <Card className="border-primary/20 shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-bold">1-Qadam: Tish va Muolajani Tanlash (Odontogram)</CardTitle>
            </div>
            {selectedTooth && (
              <Badge variant="outline" className="font-mono text-xs border-primary/40 text-primary font-bold">
                Tanlangan: #{selectedTooth}-tish
              </Badge>
            )}
          </div>
          <CardDescription className="text-xs">
            Kreslodagi tishni bosing va bajariladigan muolajani tanlang. Narx va materiallar avtomatik shakllanadi.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {/* Visual Dental Arch Selector */}
          <div className="flex flex-col items-center gap-2 p-3 bg-muted/10 rounded-xl border border-dashed">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Yuqori Jag' (Upper Arch)</span>
            <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-center">
              <div className="flex items-center gap-1">
                {UPPER_RIGHT.map((n) => renderToothButton(n))}
              </div>
              <div className="w-px h-6 bg-border mx-1" />
              <div className="flex items-center gap-1">
                {UPPER_LEFT.map((n) => renderToothButton(n))}
              </div>
            </div>

            <div className="w-full border-t border-muted my-1" />

            <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-center">
              <div className="flex items-center gap-1">
                {LOWER_RIGHT.map((n) => renderToothButton(n))}
              </div>
              <div className="w-px h-6 bg-border mx-1" />
              <div className="flex items-center gap-1">
                {LOWER_LEFT.map((n) => renderToothButton(n))}
              </div>
            </div>
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Pastki Jag' (Lower Arch)</span>
          </div>

          {/* Tooth Quick Actions & Procedure Dropdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Stethoscope className="w-3.5 h-3.5 text-primary" /> Muolaja Turi (Katalogdan) *
                </span>
                {treatmentDepartmentName && (
                  <Badge variant="outline" className="text-[10px] font-normal border-primary/30 text-primary">
                    {treatmentDepartmentName}
                  </Badge>
                )}
              </Label>
              <Select 
                value={selectedProcedureId} 
                onValueChange={handleSelectProcedure}
                disabled={!canEditTreatment}
              >
                <SelectTrigger className="h-9 text-xs truncate">
                  <SelectValue placeholder={availableProcedures.length > 0 ? "Muolaja turini tanlang..." : "Bo'limga tegishli muolajalar..."} />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {availableProcedures.map((proc: any) => (
                    <SelectItem key={proc.id} value={proc.id} className="text-xs">
                      {proc.name} — <span className="font-mono font-bold text-primary">{Number(proc.defaultPrice || 0).toLocaleString()} so'm</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedTooth && canEditTreatment && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tish #{selectedTooth} Holatini Belgilash</Label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button type="button" size="sm" variant="outline" className="h-8 text-[11px] text-emerald-600 hover:bg-emerald-50 border-emerald-300" onClick={() => handleUpdateToothStatus('healthy')}>
                    Sog'lom
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 text-[11px] text-blue-600 hover:bg-blue-50 border-blue-300" onClick={() => handleUpdateToothStatus('treated')}>
                    Davolangan
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 text-[11px] text-amber-600 hover:bg-amber-50 border-amber-300" onClick={() => handleUpdateToothStatus('planned')}>
                    Rejalashtirilgan
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 text-[11px] text-rose-600 hover:bg-rose-50 border-rose-300" onClick={() => handleUpdateToothStatus('missing')}>
                    O'chirilgan
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2-QADAM: TASHXIS, XULOSA VA FOTOSURATLAR */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Diagnosis Card */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> 2-Qadam: Tashxis va Shifokor Xulosasi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="diagnosis" className="text-xs">Tashxis (Diagnoz)</Label>
              <Input 
                id="diagnosis" 
                placeholder="Masalan: Tish #16 kariesi, Pulpit..." 
                className="h-8 text-xs font-medium"
                value={diagnosis}
                disabled={!canEditTreatment}
                onChange={(_e) => setDiagnosis(_e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="description" className="text-xs">Bajarilgan Ishlar / Xulosa</Label>
              <Textarea 
                id="description" 
                placeholder="Qilingan ishlar, ishlatilgan usul va tavsiyalar..." 
                className="min-h-[100px] text-xs"
                value={description}
                disabled={!canEditTreatment}
                onChange={(_e) => setDescription(_e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Photos Card */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary" /> Rentgen va Fotosuratlar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {canEditTreatment && (
              <div className="flex items-center gap-2">
                <Select value={selectedPhotoType} onValueChange={(val: PhotoType) => setSelectedPhotoType(val)}>
                  <SelectTrigger className="w-40 h-8 text-xs">
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
                <Button size="sm" className="h-8 text-xs" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                  {isUploading ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
                  Rasm Yuklash
                </Button>
              </div>
            )}

            {/* Photo Gallery */}
            {(treatment as any)?.photos && (treatment as any).photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 mt-2 max-h-[140px] overflow-y-auto pr-1">
                {(treatment as any).photos.map((photo: any) => (
                  <div key={photo.id} className="relative group rounded-lg overflow-hidden border bg-muted/20">
                    <img 
                      src={photo.thumbnailPath || photo.imageUrl || ''} 
                      alt={photo.photoType} 
                      className="w-full h-20 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Badge variant="outline" className="text-white border-white text-[9px]">
                        {photo.photoType === 'before' ? 'Oldin' : photo.photoType === 'after' ? 'Keyin' : 'Rentgen'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[90px] bg-muted/10 border border-dashed rounded-lg text-muted-foreground text-xs">
                Rasmlar yuklanmagan
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 3-QADAM: RETSEPT VA ISHLATILGAN MATERIALLAR */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Prescriptions */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-500" /> 3-Qadam: Retsept va Dori-darmonlar
            </CardTitle>
            {canEditTreatment && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setIsPrescriptionModalOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Retsept Yozish
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {prescriptionsList.length > 0 ? (
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {prescriptionsList.map((p: any) => (
                  <div key={String(p.id)} className="p-2.5 border rounded-lg bg-muted/15 text-xs flex flex-col gap-1">
                    <p className="font-medium whitespace-pre-wrap">{String(p.content || (p.template && typeof p.template === 'object' ? p.template.content : 'Retsept'))}</p>
                    <div className="flex justify-between items-center text-[10px] text-muted-foreground border-t pt-1 mt-1">
                      <span>{new Date(p.createdAt || new Date()).toLocaleDateString()}</span>
                      {(p.sentToTelegramAt || p.sent_to_telegram_at) && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-600 dark:bg-blue-900/20 text-[9px] py-0">
                          Telegramga yuborildi
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-4 border border-dashed rounded-lg text-muted-foreground text-xs">
                Retsept yozilmagan. Shifokor shablon tanlab 1 bosishda yozishi mumkin.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Materials Usage */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500" /> Ishlatilgan Materiallar Sarfi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {canEditTreatment && (
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Material qo'shish..." />
                    </SelectTrigger>
                    <SelectContent>
                      {materials.map((m: any) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">
                          {m.name} ({m.quantityInStock || m.quantity_in_stock} {m.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-20 space-y-1">
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="h-8 text-xs font-mono"
                    value={materialQuantity}
                    onChange={(e) => setMaterialQuantity(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleAddMaterial}
                  disabled={createMaterialUsage.isPending || !selectedMaterialId}
                >
                  {createMaterialUsage.isPending ? '...' : "+"}
                </Button>
              </div>
            )}

            <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
              {materialUsages && materialUsages.length > 0 ? (
                materialUsages.map((usage: any) => {
                  const matchedMaterial = materials.find((m: any) => m.id === usage.material || m.id === usage.materialId);
                  const name = usage.material_name || usage.materialName || usage.material?.name || matchedMaterial?.name || 'Material';
                  const unit = usage.material_unit || usage.materialUnit || usage.material?.unit || matchedMaterial?.unit || '';
                  return (
                    <div key={usage.id} className="flex justify-between items-center px-2.5 py-1.5 border rounded bg-muted/15 text-xs">
                      <span className="font-medium text-foreground">{name}</span>
                      <Badge variant="outline" className="font-mono text-[10px]">{usage.quantityUsed || usage.quantity_used} {unit}</Badge>
                    </div>
                  );
                })
              ) : (
                <div className="text-center p-3 border border-dashed rounded text-muted-foreground text-xs">
                  Texkarta materiallari avtomatik yuklanadi.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 4-QADAM: YAKUNIY HISOB-KITOB VA QABULNI YAKUNLASH */}
      <Card className="border-primary/30 bg-primary/5 shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" /> 4-Qadam: Yakuniy Hisob-kitob va Kassaga Yuborish
              </CardTitle>
              <CardDescription className="text-xs">
                Yakuniy narxni tasdiqlang. "Yakunlash" bosilganda kassa navbatiga avtomatik hisob uzatiladi.
              </CardDescription>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Jami Summa:</span>
              <span className="text-2xl font-bold font-mono text-primary">
                {Number(price || 0).toLocaleString()} so'm
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div className="space-y-1">
              <Label htmlFor="price" className="text-xs font-semibold">Muolaja Narxi (so'm) *</Label>
              <Input 
                id="price" 
                type="number" 
                min="0"
                className="h-10 text-base font-mono font-bold"
                value={price}
                disabled={!canEditTreatment}
                onChange={(_e) => setPrice(_e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-lg border">
              💡 Shifokor qabulni yakunlagach, bemor reception kassasiga borib, chekni to'laydi.
            </div>
          </div>
        </CardContent>
        <div className="p-4 border-t border-primary/10 flex justify-end">
          <Button
            className="w-full sm:w-auto px-8 h-11 text-sm font-bold shadow bg-primary hover:bg-primary/90"
            onClick={handleFinishAppointment}
            disabled={
              !canEditTreatment ||
              updateTreatment.isPending || 
              updateAppointment.isPending || 
              (treatment as any)?.approvalStatus === 'pending' || 
              (treatment as any)?.approval_status === 'pending'
            }
          >
            {(updateTreatment.isPending || updateAppointment.isPending) ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-2" />
            )}
            {!canEditTreatment 
              ? "Faqat Shifokor Yakunlashi Mumkin"
              : "🏁 QABULNI YAKUNLASH VA KASSAGA YUBORISH"}
          </Button>
        </div>
      </Card>

      {/* Prescription Modal */}
      <Dialog open={isPrescriptionModalOpen} onOpenChange={setIsPrescriptionModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Tibbiy Retsept Yozish</DialogTitle>
            <DialogDescription className="text-xs">
              Tayyor shablonni tanlang yoki yangi retsept yozing.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleIssuePrescription} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Tayyor Retsept Shabloni</Label>
              <Select value={selectedTemplateId} onValueChange={(val) => {
                setSelectedTemplateId(val)
                const tpl = templates.find((t: any) => String(t.id) === val)
                if (tpl) {
                  setPrescriptionContent(tpl.content || '')
                }
              }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Shablonni tanlang..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Shablonsiz (Bo'sh)</SelectItem>
                  {templates.map((tpl: any) => (
                    <SelectItem key={String(tpl.id)} value={String(tpl.id)}>
                      {String(tpl.name || tpl.title || '')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Retsept Matni *</Label>
              <Textarea
                required
                className="min-h-[120px] text-xs"
                placeholder="Dori nomi, dozasi va qabul qilish tartibi..."
                value={prescriptionContent}
                onChange={(_e) => setPrescriptionContent(_e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-2 bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/50">
              <Checkbox
                id="telegram"
                checked={sendToTelegram}
                onCheckedChange={(checked) => setSendToTelegram(!!checked)}
              />
              <Label htmlFor="telegram" className="text-xs font-medium cursor-pointer flex-1">
                Bemorning Telegramiga avtomatik yuborish
              </Label>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsPrescriptionModalOpen(false)}>
                Bekor Qilish
              </Button>
              <Button type="submit" size="sm" disabled={issuePrescriptionMutation.isPending}>
                {issuePrescriptionMutation.isPending ? 'Yuborilmoqda...' : 'Saqlash va Yuborish'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Follow-up Appointment Modal */}
      <Dialog open={isFollowUpModalOpen} onOpenChange={setIsFollowUpModalOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <Calendar className="w-5 h-5" /> Keyingi Qabulni Belgilash
            </DialogTitle>
            <DialogDescription className="text-xs">
              Qabul muvaffaqiyatli yakunlandi! Bemor uchun keyingi tashrif / nazorat ko'rigi vaqtini belgilaysizmi?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tezkor muddat:</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: '3 kun', days: 3 },
                  { label: '1 hafta', days: 7 },
                  { label: '2 hafta', days: 14 },
                  { label: '1 oy', days: 30 }
                ].map((item) => (
                  <Button
                    key={item.days}
                    type="button"
                    size="sm"
                    variant={followUpDays === item.days ? 'default' : 'outline'}
                    className="h-8 text-xs"
                    onClick={() => {
                      setFollowUpDays(item.days)
                      setFollowUpDate(format(addDays(new Date(), item.days), 'yyyy-MM-dd'))
                    }}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Sana</Label>
                <Input 
                  type="date" 
                  className="h-8 text-xs font-mono"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Boshlanish vaqti</Label>
                <Input 
                  type="time" 
                  className="h-8 text-xs font-mono"
                  value={followUpTime}
                  onChange={(e) => setFollowUpTime(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => {
              setIsFollowUpModalOpen(false)
              window.location.reload()
            }}>
              O'tkazib Yuborish (Kerak emas)
            </Button>
            <Button size="sm" onClick={handleCreateFollowUp} disabled={createAppointment.isPending}>
              {createAppointment.isPending ? 'Belgilanmoqda...' : 'Navbatni Belgilash'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )

  function renderToothButton(toothNum: number) {
    const isSelected = selectedTooth === toothNum
    const rec = toothRecordMap.get(toothNum)
    const status: ToothStatus = rec?.status || 'healthy'
    const style = TOOTH_STATUS_STYLES[status] || TOOTH_STATUS_STYLES.healthy

    return (
      <button
        key={toothNum}
        type="button"
        onClick={() => handleToothClick(toothNum)}
        className={`flex flex-col items-center justify-center w-7 sm:w-8 h-9 sm:h-10 rounded-lg border text-xs font-mono transition-all ${style.bg} ${style.border} ${
          isSelected ? 'ring-2 ring-primary ring-offset-1 scale-105 font-bold shadow-sm' : 'opacity-90'
        }`}
      >
        <span className="text-[10px] font-bold">{toothNum}</span>
        <span className={`text-[8px] leading-tight ${style.text}`}>
          {status === 'healthy' ? 'S' : status === 'treated' ? 'D' : status === 'planned' ? 'R' : 'X'}
        </span>
      </button>
    )
  }
}
