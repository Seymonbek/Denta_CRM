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
  doctor: string
  weekday: number // 0-6 (Monday-Sunday)
  startTime: string
  endTime: string
}

export interface TimeOff {
  id: string
  doctor: string
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
  createdBy: string
}

export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type TreatmentStage = 'in_progress' | 'completed'

export interface Treatment {
  id: string
  appointment: string
  doctor: string
  doctorName?: string
  patient: string
  patientName?: string
  department: string
  procedureType: string
  procedureTypeName?: string
  diagnosis: string
  description: string
  price: string
  paymentStatus: PaymentStatus
  stage: TreatmentStage
  createdAt: string
}

export type PhotoType = 'before' | 'after' | 'xray'

export interface TreatmentPhoto {
  id: string
  treatment: string
  photoType: PhotoType
  image: string
  uploadedAt: string
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
  treatment: string
  toothNumber: number // FDI: 11-48
  procedure: ToothProcedure
  status: ToothStatus
  notes: string
  updatedAt?: string
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

export type PaymentMethod = 'cash' | 'card' | 'payme' | 'click' | 'bank_transfer'

export interface Payment {
  id: string
  treatment: string
  patient: string
  patientName?: string
  amount: string
  method: PaymentMethod
  receivedBy: string
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
  totalPatients: number
  newPatientsCount: number
  totalRevenue: string
  totalAppointments: number
  completedAppointments: number
  cancelledAppointments: number
  topProcedures: Array<{
    procedureTypeId: string
    procedureTypeName: string
    count: number
    revenue: string
  }>
  departmentBreakdown: Array<{
    departmentId: string
    departmentName: string
    revenue: string
    patientCount: number
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
