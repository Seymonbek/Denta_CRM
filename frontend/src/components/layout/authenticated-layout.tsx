import { Outlet } from '@tanstack/react-router'
import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'
import { useMe } from '@/api/hooks/use-auth'
import { useSettings } from '@/api/hooks/use-settings'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SkipToMain } from '@/components/skip-to-main'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const defaultOpen = getCookie('sidebar_state') !== 'false'
  // Auto-fetch current user profile when authenticated
  const { data: me } = useMe()
  const { data: settings } = useSettings()

  return (
    <SearchProvider>
      <LayoutProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <SkipToMain />
          <AppSidebar />
          <SidebarInset
            className={cn(
              '@container/content',
              'has-data-[layout=fixed]:h-svh',
              'peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]'
            )}
          >
            {me?.role === 'bosh_shifokor' && settings?.inn === '123456789' && (
              <div className="p-4 bg-red-50 dark:bg-red-950">
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Diqqat!</AlertTitle>
                  <AlertDescription>
                    Klinika rekvizitlari (Nomi, INN, Manzil) to'ldirilmagan. Iltimos, sozlamalar bo'limidan to'ldiring, aks holda PDF hujjatlarda xato ma'lumotlar chiqadi.
                  </AlertDescription>
                </Alert>
              </div>
            )}
            {children ?? <Outlet />}
          </SidebarInset>
        </SidebarProvider>
      </LayoutProvider>
    </SearchProvider>
  )
}
