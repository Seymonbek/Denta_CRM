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
} from 'lucide-react'

export interface NavSubItem {
  title: string
  url: string
  icon?: any
}

export interface NavItem {
  title: string
  url?: string
  icon?: any
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
        },
        {
          title: 'Bemorlar',
          url: '/patients',
          icon: Users,
        },
        {
          title: 'Navbatlar',
          url: '/appointments',
          icon: Calendar,
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
          title: 'Bo’limlar',
          url: '/departments',
          icon: Building2,
          roles: ['bosh_shifokor'],
        },
        {
          title: 'Shifokorlar',
          url: '/doctors',
          icon: Stethoscope,
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
          roles: ['bosh_shifokor', 'doctor'],
        },
        {
          title: 'To’lovlar & Komissiya',
          url: '/payments',
          icon: CreditCard,
        },
      ],
    },
    {
      title: 'Tahlil va Statistika',
      items: [
        {
          title: 'Reyting va Nishonlar',
          url: '/ratings',
          icon: Trophy,
        },
        {
          title: 'Hisobotlar',
          url: '/reports',
          icon: BarChart3,
          roles: ['bosh_shifokor'],
        },
        {
          title: 'Bildirishnomalar',
          url: '/notifications',
          icon: Bell,
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
        },
      ],
    },
  ],
}
