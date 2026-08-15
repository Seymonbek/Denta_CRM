import {
  LayoutDashboard,
  Users,
  Calendar,
  Building2,
  Stethoscope,
  Activity,
  FileText,
  Package,
  CreditCard,
  Trophy,
  BarChart3,
  Bell,
  Settings,
  Sparkles,
  ClipboardCheck,
  Briefcase,
  ShieldAlert,
  Wallet,
  Banknote,
} from 'lucide-react'

export interface NavSubItem {
  title: string
  url: string
  icon?: Record<string, unknown>
}

export interface NavItem {
  title: string
  url?: string
  icon?: Record<string, unknown>
  badge?: string
  items?: NavSubItem[]
  roles?: string[]
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export interface SidebarData {
  navGroups: NavGroup[]
}

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: 'Asosiy',
      items: [
        {
          title: 'Bosh sahifa',
          url: '/',
          icon: LayoutDashboard,
          roles: ['bosh_shifokor', 'doctor', 'administrator'],
        },
        {
          title: 'Bemorlar',
          url: '/patients',
          icon: Users,
          roles: ['bosh_shifokor', 'doctor', 'administrator'],
        },
        {
          title: 'Navbatlar',
          url: '/appointments',
          icon: Calendar,
          roles: ['bosh_shifokor', 'doctor', 'administrator'],
        },
        {
          title: 'Davolash yozuvlari',
          url: '/treatments',
          icon: Activity,
          roles: ['bosh_shifokor', 'doctor'],
        },
      ],
    },
    {
      title: 'Klinika Boshqaruvi',
      items: [
        {
          title: 'Xodimlar',
          url: '/users',
          icon: Users,
          roles: ['bosh_shifokor'],
        },
        {
          title: 'Bo’limlar',
          url: '/departments',
          icon: Building2,
          roles: ['bosh_shifokor'],
        },
        {
          title: 'Ish Jadvali va Ta’tillar',
          url: '/doctors',
          icon: Stethoscope,
          roles: ['bosh_shifokor', 'doctor'],
        },
        {
          title: 'Retseptlar',
          url: '/prescriptions',
          icon: FileText,
          roles: ['bosh_shifokor', 'doctor'],
        },
        {
          title: 'Sklad (Materiallar)',
          url: '/inventory',
          icon: Package,
          roles: ['bosh_shifokor'],
        },
        {
          title: 'To’lovlar & Komissiya',
          url: '/payments',
          icon: CreditCard,
          roles: ['bosh_shifokor', 'administrator'],
        },
        {
          title: 'Kassa Smenalari',
          url: '/cash-shifts',
          icon: Briefcase,
          roles: ['bosh_shifokor', 'administrator'],
        },
        {
          title: 'Xarajatlar',
          url: '/expenses',
          icon: Wallet,
          roles: ['bosh_shifokor'],
        },
        {
          title: 'Maosh va Ish Haqi',
          url: '/payroll',
          icon: Banknote,
          roles: ['bosh_shifokor', 'administrator'],
        },
        {
          title: 'Chegirma Tasdiqlash',
          url: '/approvals',
          icon: ClipboardCheck,
          roles: ['bosh_shifokor'],
        },
      ],
    },
    {
      title: 'AI & Statistika',
      items: [
        {
          title: 'Audit Log (Tarix)',
          url: '/audit-log',
          icon: ShieldAlert,
          roles: ['bosh_shifokor'],
        },
        {
          title: 'AI Yordamchi (Gemini)',
          url: '/ai-assistant',
          icon: Sparkles,
          badge: 'AI',
          roles: ['bosh_shifokor', 'doctor'],
        },
        {
          title: 'Reyting va Nishonlar',
          url: '/ratings',
          icon: Trophy,
          roles: ['bosh_shifokor', 'doctor'],
        },
        {
          title: 'Hisobotlar',
          url: '/reports',
          icon: BarChart3,
          roles: ['bosh_shifokor', 'doctor'],
        },
        {
          title: 'Bildirishnomalar',
          url: '/notifications',
          icon: Bell,
          roles: ['bosh_shifokor', 'administrator'],
        },
      ],
    },
    {
      title: 'Sozlamalar',
      items: [
        {
          title: 'Profil va Xavfsizlik',
          url: '/settings',
          icon: Settings,
          roles: ['bosh_shifokor', 'doctor', 'administrator'],
        },
      ],
    },
  ],
}
