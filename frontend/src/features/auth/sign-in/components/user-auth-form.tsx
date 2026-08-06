import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, LogIn, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { useLogin, useVerify2FA } from '@/api/hooks/use-auth'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

const loginSchema = z.object({
  phoneNumber: z
    .string()
    .min(1, 'Telefon raqamini kiriting.')
    .regex(/^\+?[0-9]{9,13}$/, "Telefon raqami noto'g'ri formata (masalan: +998901234567)"),
  password: z.string().min(1, 'Parolni kiriting.'),
  code: z.string().optional(),
})

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

export function UserAuthForm({ className, redirectTo, ...props }: UserAuthFormProps) {
  const [twoFactorRequired, setTwoFactorRequired] = useState(false)
  const navigate = useNavigate()
  const loginMutation = useLogin()
  const verify2FAMutation = useVerify2FA()

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      phoneNumber: '+998',
      password: '',
      code: '',
    },
  })

  const isLoading = loginMutation.isPending || verify2FAMutation.isPending

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    try {
      if (twoFactorRequired) {
        if (!values.code || values.code.length < 6) {
          toast.error('6 xonali tasdiqlash kodini kiriting.')
          return
        }
        await verify2FAMutation.mutateAsync({
          phoneNumber: values.phoneNumber,
          password: values.password,
          code: values.code,
        })
        toast.success('Tizimga muvaffaqiyatli kirildi!')
        navigate({ to: redirectTo || '/', replace: true })
      } else {
        const result = await loginMutation.mutateAsync({
          phoneNumber: values.phoneNumber,
          password: values.password,
        })

        if (result.twoFactorRequired) {
          setTwoFactorRequired(true)
          toast.info(result.detail || 'Telegram orqali kelgan 2FA kodini kiriting.')
        } else {
          toast.success('Tizimga muvaffaqiyatli kirildi!')
          navigate({ to: redirectTo || '/', replace: true })
        }
      }
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Kirishda xatolik yuz berdi.'
      toast.error(errorMsg)
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-4', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='phoneNumber'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Telefon raqami</FormLabel>
              <FormControl>
                <Input
                  placeholder='+998901234567'
                  disabled={isLoading || twoFactorRequired}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Parol</FormLabel>
              <FormControl>
                <PasswordInput
                  placeholder='********'
                  disabled={isLoading || twoFactorRequired}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {twoFactorRequired && (
          <FormField
            control={form.control}
            name='code'
            render={({ field }) => (
              <FormItem className='flex flex-col items-center space-y-2 rounded-lg border bg-muted/30 p-4'>
                <FormLabel className='text-center font-medium'>
                  Telegram 2FA tasdiqlash kodi
                </FormLabel>
                <FormControl>
                  <InputOTP maxLength={6} {...field}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <Button className='mt-2 w-full' disabled={isLoading}>
          {isLoading ? (
            <Loader2 className='me-2 h-4 w-4 animate-spin' />
          ) : twoFactorRequired ? (
            <KeyRound className='me-2 h-4 w-4' />
          ) : (
            <LogIn className='me-2 h-4 w-4' />
          )}
          {twoFactorRequired ? 'Kod bilan kirish' : 'Tizimga kirish'}
        </Button>
      </form>
    </Form>
  )
}
