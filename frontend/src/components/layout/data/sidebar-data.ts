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
        },
        {
          title: 'Sklad (Materiallar)',
          url: '/inventory',
          icon: Package,
        },
        {
          title: 'To’lovlar & Komissiya',
          url: '/payments',
          icon: CreditCard,
        },
      ],
    },
    {
      title: 'AI & Statistika',
      items: [
        {
          title: 'AI Yordamchi (Gemini)',
          url: '/ai-assistant',
          icon: Sparkles,
          badge: 'AI',
        },
        {
          title: 'Reyting va Nishonlar',
          url: '/ratings',
          icon: Trophy,
        },
        {
          title: 'Hisobotlar',
          url: '/reports',
          icon: BarChart3,
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
