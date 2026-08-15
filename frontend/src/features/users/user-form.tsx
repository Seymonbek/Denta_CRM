import { z } from 'zod'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useCreateUser, useUpdateUser } from '@/api/hooks/use-users'
import { useDoctors, useCreateDoctor, useUpdateDoctor, DOCTORS_QUERY_KEY } from '@/api/hooks/use-doctors'
import { useDepartments } from '@/api/hooks/use-departments'
import { type User } from '@/types/api'

const userFormSchema = z.object({
  firstName: z.string().min(1, 'Ism kiritish majburiy.'),
  lastName: z.string().min(1, 'Familiya kiritish majburiy.'),
  phoneNumber: z.string().min(9, 'Telefon raqam noto\'g\'ri.'),
  role: z.enum(['bosh_shifokor', 'doctor', 'administrator']),
  password: z.string().optional(),
  departmentIds: z.array(z.string()).optional(),
  commissionBasis: z.enum(['from_total', 'from_profit', 'fixed']).optional(),
  defaultCommissionRate: z.string().optional(),
  specialization: z.string().optional(),
})

type UserFormValues = z.infer<typeof userFormSchema>

interface UserFormProps {
  user?: User
  onSuccess: () => void
  onCancel: () => void
}

export function UserForm({ user, onSuccess, onCancel }: UserFormProps) {
  const queryClient = useQueryClient()
  
  const createUserMutation = useCreateUser()
  const updateUserMutation = useUpdateUser()
  
  const createDoctorMutation = useCreateDoctor()
  const updateDoctorMutation = useUpdateDoctor()
  
  const { data: doctorsData } = useDoctors()
  const doctors = Array.isArray(doctorsData) ? doctorsData : []
  
  const { data: departmentsData } = useDepartments()
  const departments = Array.isArray(departmentsData) ? departmentsData : []

  const [isSubmitting, setIsSubmitting] = useState(false)

  // Find existing doctor profile if editing
  const existingDoctorProfile = user ? doctors.find(d => d.user?.id === user.id) : null

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      phoneNumber: user?.phoneNumber || '',
      role: user?.role || 'administrator',
      password: '',
      departmentIds: existingDoctorProfile?.departments?.map(d => d.id) || [],
      commissionBasis: (existingDoctorProfile?.commissionBasis as Record<string, unknown>) || 'from_total',
      defaultCommissionRate: existingDoctorProfile?.defaultCommissionRate || '30.00',
      specialization: existingDoctorProfile?.specialization || '',
    },
  })

  const watchRole = useWatch({
    control: form.control,
    name: 'role',
  })
  const isDoctorRole = watchRole === 'doctor' || watchRole === 'bosh_shifokor'

  useEffect(() => {
    if (user) {
      form.reset({
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        password: '',
        departmentIds: existingDoctorProfile?.departments?.map(d => d.id) || [],
        commissionBasis: (existingDoctorProfile?.commissionBasis as Record<string, unknown>) || 'from_total',
        defaultCommissionRate: existingDoctorProfile?.defaultCommissionRate || '30.00',
        specialization: existingDoctorProfile?.specialization || '',
      })
    }
  }, [user, existingDoctorProfile, form])

  const onSubmit = async (data: UserFormValues) => {
    try {
      setIsSubmitting(true)
      
      const isDoctor = data.role === 'doctor' || data.role === 'bosh_shifokor'
      
      if (user) {
        // --- UPDATE ---
        const updateData: Record<string, unknown> = {
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber,
          role: data.role,
        }
        if (data.password) {
          updateData.password = data.password
        }
        
        // 1. Update User
        await updateUserMutation.mutateAsync({ id: user.id, data: updateData })
        
        // 2. Manage Doctor Profile if needed
        if (isDoctor) {
          const doctorPayload = {
            departmentIds: data.departmentIds || [],
            commissionBasis: data.commissionBasis,
            defaultCommissionRate: data.defaultCommissionRate,
            specialization: data.specialization,
          }
          
          if (existingDoctorProfile) {
            await updateDoctorMutation.mutateAsync({ 
              id: existingDoctorProfile.id, 
              data: doctorPayload 
            })
          } else {
            await createDoctorMutation.mutateAsync({
              userId: user.id,
              ...doctorPayload
            })
          }
        }
        toast.success("Xodim muvaffaqiyatli yangilandi!")
      } else {
        // --- CREATE ---
        if (isDoctor) {
          // Create User and Doctor Profile together
          const payload = {
            user: {
              firstName: data.firstName,
              lastName: data.lastName,
              phoneNumber: data.phoneNumber,
              role: data.role,
              password: data.password || 'password123', // require password
            },
            departmentIds: data.departmentIds || [],
            commissionBasis: data.commissionBasis,
            defaultCommissionRate: data.defaultCommissionRate,
            specialization: data.specialization,
          }
          await createDoctorMutation.mutateAsync(payload)
        } else {
          // Create standard user
          await createUserMutation.mutateAsync({
            firstName: data.firstName,
            lastName: data.lastName,
            phoneNumber: data.phoneNumber,
            role: data.role,
            password: data.password || 'password123',
          } as Record<string, unknown>)
        }
        toast.success("Yangi xodim qo'shildi!")
      }
      
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: DOCTORS_QUERY_KEY })
      onSuccess()
      
    } catch (_error) {
      toast.error("Xatolik yuz berdi. Iltimos tekshirib qayta urinib ko'ring.")
      // console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
        <div className='grid grid-cols-2 gap-4'>
          <FormField
            control={form.control}
            name='firstName'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ism</FormLabel>
                <FormControl>
                  <Input placeholder='Ism' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='lastName'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Familiya</FormLabel>
                <FormControl>
                  <Input placeholder='Familiya' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className='grid grid-cols-2 gap-4'>
          <FormField
            control={form.control}
            name='phoneNumber'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Telefon raqam</FormLabel>
                <FormControl>
                  <Input placeholder='+998901234567' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='role'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rol</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Rolni tanlang' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value='administrator'>Administrator</SelectItem>
                    <SelectItem value='doctor'>Shifokor</SelectItem>
                    <SelectItem value='bosh_shifokor'>Bosh Shifokor</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Parol {user && '(O\'zgartirish uchun kiriting)'}</FormLabel>
              <FormControl>
                <Input type='password' placeholder='********' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {isDoctorRole && (
          <div className='space-y-4 border-t pt-4 mt-4'>
            <h4 className='font-semibold text-sm'>Shifokor sozlamalari</h4>
            
            <FormField
              control={form.control}
              name='specialization'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mutaxassislik</FormLabel>
                  <FormControl>
                    <Input placeholder='Masalan: Ortodont, Xirurg' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='commissionBasis'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Komissiya Asosi</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Tanlang' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='from_total'>Umumiy tushumdan</SelectItem>
                        <SelectItem value='from_profit'>Sof foydadan</SelectItem>
                        <SelectItem value='fixed'>Qat'iy narx</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='defaultCommissionRate'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Foiz / Miqdor (%)</FormLabel>
                    <FormControl>
                      <Input type='number' placeholder='30' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='departmentIds'
              render={() => (
                <FormItem>
                  <FormLabel>Bo'limlar</FormLabel>
                  <div className='grid grid-cols-2 gap-2 mt-2'>
                    {departments.map((dept) => (
                      <FormField
                        key={dept.id}
                        control={form.control}
                        name='departmentIds'
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={dept.id}
                              className='flex flex-row items-start space-x-3 space-y-0'
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(dept.id)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...(field.value || []), dept.id])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== dept.id
                                          )
                                        )
                                  }}
                                />
                              </FormControl>
                              <FormLabel className='font-normal cursor-pointer'>
                                {dept.name}
                              </FormLabel>
                            </FormItem>
                          )
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <div className='flex justify-end gap-2 pt-4'>
          <Button type='button' variant='outline' onClick={onCancel} disabled={isSubmitting}>
            Bekor qilish
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting ? 'Saqlanmoqda...' : 'Saqlash'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
