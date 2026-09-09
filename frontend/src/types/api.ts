export type UserRole = 'bosh_shifokor' | 'doctor' | 'administrator'

export interface User {
  id: string
  firstName: string
  lastName: string
  phoneNumber: string
  role: UserRole
  twoFactorEnabled: boolean
  telegramChatId: number | null
}

export interface AuthTokens {
  access: string
  refresh: string
}

export interface LoginResponse {
  access?: string
  refresh?: string
  twoFactorRequired?: boolean
  detail?: string
}

export interface Department {
  id: string
  name: string
  description: string
  isActive: boolean
  createdAt: string
}

export type CommissionBasis = 'from_total' | 'from_net'

export interface DoctorProfile {
  id: string
  user: User
  departments: Department[]
  specialization: string
  bio: string
  commissionBasis: CommissionBasis
  defaultCommissionRate: string
  canViewOtherDoctors: boolean
}

export interface WorkingHours {
  id: string
  userId: string
  weekday: number // 0-6 (Monday-Sunday)
  weekdayLabel?: string
  startTime: string
  endTime: string
}

export interface TimeOff {
  id: string
  userId: string
  dateStart: string
  dateEnd: string
  reason: string
}

export interface AvailableSlot {
  start: string
  end: string
}

export interface ProcedureType {
  id: string
  name: string
  department: string
  departmentName?: string
  defaultDurationMinutes: number
  defaultPrice: string
  commissionRateOverride: string | null
}

export type Gender = 'male' | 'female' | 'other'

export interface Patient {
  id: string
  firstName: string
  lastName: string
  phoneNumber: string
  gender: Gender | null
  address: string | null
  birthDate?: string | null
  age?: number | null
  bloodGroup?: string
  allergies?: string
  notes: string | null
  telegramChatId: number | null
  createdAt: string
  firstVisitDate?: string | null
  lastVisitDate?: string | null
}

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export interface Appointment {
  id: string
  patient: Patient | string
  patientName?: string
  doctor: DoctorProfile | string
  doctorName?: string
  department: Department | string
  departmentName?: string
  procedureType: ProcedureType | string | null
  procedureTypeName?: string
  scheduledStart: string
  scheduledEnd: string
  status: AppointmentStatus
  notes?: string | null
  createdBy?: string
}

export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type TreatmentStage = 'in_progress' | 'completed'

export interface Treatment {
  id: string
  appointment: string
  appointmentId?: string
  doctor: string
  doctorId?: string
  doctorName?: string
  patient: string
  patientId?: string
  patientName?: string
  department: string
  departmentId?: string
  procedureType: string
  procedureTypeId?: string
  procedureTypeName?: string
  diagnosis: string
  description: string
  price: string
  paymentStatus: PaymentStatus
  stage: TreatmentStage
  photos?: TreatmentPhoto[]
  toothRecords?: ToothRecord[]
  createdAt: string
}

export type PhotoType = 'before' | 'after' | 'xray'

export interface TreatmentPhoto {
  id: string
  treatment?: string
  treatmentId?: string
  photoType: PhotoType
  image?: string
  imageUrl?: string
  thumbnailPath?: string | null
  caption?: string
  uploadedAt?: string
}

export type ToothProcedure =
  | 'filling'
  | 'root_canal'
  | 'extraction'
  | 'crown'
  | 'implant'
  | 'cleaning'
  | 'other'

export type ToothStatus = 'healthy' | 'treated' | 'missing' | 'planned'

export interface ToothRecord {
  id: string
  treatment?: string | null
  patient?: string | null
  toothNumber: number // FDI: 11-48 (adult) & 51-85 (primary)
  procedure: ToothProcedure
  status: ToothStatus
  surfaces?: string[]
  notes: string
  updatedAt?: string
}

export interface OdontogramHistoryRecord {
  id: string
  toothNumber: number
  procedure: ToothProcedure | null
  status: ToothStatus
  surfaces?: string[]
  notes: string
  createdAt: string
  treatmentId?: string | null
  doctorName: string | null
}

export interface PrescriptionTemplate {
  id: string
  name: string
  content: string
  createdBy: string
}

export interface Prescription {
  id: string
  treatment: string
  template: string | null
  content: string
  sentToTelegramAt: string | null
}

export type MaterialUnit = 'gram' | 'piece' | 'ml'

export interface Material {
  id: string
  name: string
  unit: MaterialUnit
  quantityInStock: string
  minimumThreshold: string
  unitCost: string | null
}

export interface MaterialUsage {
  id: string
  treatment: string
  material: string
  materialName?: string
  quantityUsed: string
}

export interface ProcedureBOM {
  id: string
  procedureType: string
  material: string
  materialName?: string
  materialUnit?: string
  defaultQuantity: string
}

export type PaymentMethod = 'cash' | 'card' | 'payme' | 'click' | 'bank_transfer'

export interface Payment {
  id: string
  shortId: string
  treatmentId: string | null
  patientId: string
  patientName: string
  procedureName: string
  doctorName: string
  amount: string
  method: PaymentMethod
  note: string
  receivedBy: { id: string; firstName: string; lastName: string } | null
  refundStatus: 'none' | 'pending' | 'approved' | 'rejected'
  isActive: boolean
  createdAt: string
}

export interface CommissionRecord {
  id: string
  doctor: string
  doctorName?: string
  treatment: string
  amount: string
  basis: CommissionBasis
  calculatedAt: string
}

export interface PatientBalance {
  totalBilled: string
  totalPaid: string
  balanceDue: string
}

export interface LeaderboardEntry {
  doctor: DoctorProfile
  totalPoints: number
  rank: number
  badgeCount: number
}

export interface Badge {
  id: string
  name: string
  description: string
  icon: string
}

export interface DoctorBadge {
  id: string
  doctor: string
  badge: Badge
  period: string
  awardedAt: string
}

export interface DashboardReport {
  period: string
  range?: { start: string; end: string }
  kpi?: {
    revenue?: string | number
    expenses?: string | number
    netProfit?: string | number
    appointmentsTotal?: number
    appointmentsCompleted?: number
    newPatients?: number
    lowStockCount?: number
  }
  totalRevenue?: string | number
  total_revenue?: string | number
  totalPatients?: number
  total_patients?: number
  newPatientsCount?: number
  new_patients_count?: number
  completedAppointments?: number
  completed_appointments?: number
  totalAppointments?: number
  total_appointments?: number
  cancelledAppointments?: number
  cancelled_appointments?: number
  appointmentsByStatus?: {
    total?: number
    scheduled?: number
    confirmed?: number
    in_progress?: number
    completed?: number
    cancelled?: number
    no_show?: number
  }
  topProcedures?: Array<{
    procedureTypeId?: string
    name?: string
    procedureTypeName?: string
    count?: number
    revenue?: string | number
  }>
  top_procedures?: Array<{
    procedureTypeId?: string
    name?: string
    procedureTypeName?: string
    count?: number
    revenue?: string | number
  }>
  departmentBreakdown?: Array<{
    departmentId?: string
    name?: string
    departmentName?: string
    revenue?: string | number
    treatments?: number
    patientCount?: number
  }>
  department_breakdown?: Array<{
    departmentId?: string
    name?: string
    departmentName?: string
    revenue?: string | number
    treatments?: number
    patientCount?: number
  }>
  expensesByCategory?: Array<{
    categoryId?: string | null
    name?: string
    amount?: string | number
    count?: number
  }>
  expenses_by_category?: Array<{
    categoryId?: string | null
    name?: string
    amount?: string | number
    count?: number
  }>
  pnl?: {
    grossRevenue?: string | number
    totalExpenses?: string | number
    netProfit?: string | number
    profitMarginPercent?: number
    collectionRatePercent?: number
    billedTotal?: string | number
    treatmentsCount?: number
    distinctPatients?: number
    averageRevenuePerPatient?: string | number
  }
  timeline?: Array<{
    date: string
    label: string
    revenue: string | number
    expense: string | number
    netProfit: string | number
  }>
  topDoctors?: Array<{
    doctorId: string
    firstName: string
    lastName: string
    specialization?: string
    treatments: number
    revenue: string | number
    averageTicket?: string | number
  }>
}

export interface NotificationLog {
  id: string
  type: string
  channel: string
  message: string
  status: 'pending' | 'sent' | 'failed'
  sentAt: string | null
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface ApiErrorResponse {
  code?: string
  detail?: string
  message?: string
  errors?: Record<string, string[]>
}
