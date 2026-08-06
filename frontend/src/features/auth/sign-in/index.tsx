import { useSearch } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { UserAuthForm } from './components/user-auth-form'

export function SignIn() {
  const { redirect } = useSearch({ from: '/(auth)/sign-in' })

  return (
    <AuthLayout>
      <Card className='w-full max-w-md gap-4 shadow-xl border-border/50'>
        <CardHeader className='space-y-1 text-center'>
          <div className='mb-2 flex justify-center'>
            <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-2xl shadow-lg'>
              🦷
            </div>
          </div>
          <CardTitle className='text-2xl font-bold tracking-tight'>
            DentaCRM Tizimi
          </CardTitle>
          <CardDescription>
            Klinika boshqaruv tizimiga kirish uchun telefon raqam va parolingizni kiriting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserAuthForm redirectTo={redirect} />
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
