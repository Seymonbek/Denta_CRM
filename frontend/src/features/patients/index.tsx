import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Plus, Search, User, Phone, Calendar, ArrowRight } from 'lucide-react'
import { usePatients, useCreatePatient } from '@/api/hooks/use-patients'
import { Patient } from '@/types/api'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

export function PatientsList() {
  const [searchTerm, setSearchTerm] = useState('')
  const [genderFilter, setGenderFilter] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Form State
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('+998')
  const [gender, setGender] = useState<string>('male')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')

  const { data, isLoading } = usePatients({
    search: searchTerm || undefined,
    gender: genderFilter || undefined,
  })

  const createPatientMutation = useCreatePatient()

  const patients = data?.results || []

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!firstName || !lastName || !phoneNumber) {
      toast.error('Ism, familiya va telefon raqamini kiriting.')
      return
    }

    try {
      await createPatientMutation.mutateAsync({
        firstName,
        lastName,
        phoneNumber,
        gender,
        address,
        notes,
      })
      toast.success('Yangi bemor muvaffaqiyatli ro’yxatga olindi!')
      setIsModalOpen(false)
      // Reset form
      setFirstName('')
      setLastName('')
      setPhoneNumber('+998')
      setAddress('')
      setNotes('')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Bemor qo’shishda xatolik yuz berdi.')
    }
  }

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <span>👤 Bemorlar Ro'yxati</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <div className='mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Klinika Bemorlari</h1>
            <p className='text-xs text-muted-foreground'>
              Ro'yxatdan o'tgan barcha bemorlar va ularning tibbiy kartalari.
            </p>
          </div>
          <Button onClick={() => setIsModalOpen(true)} className='shadow'>
            <Plus className='me-2 h-4 w-4' /> Yangi Bemor Ro'yxatga Olish
          </Button>
        </div>

        {/* Filter Toolbar */}
        <div className='mb-4 flex flex-col sm:flex-row items-center gap-3'>
          <div className='relative flex-1 w-full'>
            <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
            <Input
              placeholder='Ism, familiya yoki telefon raqami bo’yicha qidiruv...'
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className='ps-9 text-xs'
            />
          </div>
          <Select value={genderFilter} onValueChange={setGenderFilter}>
            <SelectTrigger className='w-full sm:w-40 text-xs'>
              <SelectValue placeholder='Jins (Hamma)' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>Barchasi</SelectItem>
              <SelectItem value='male'>Erkak</SelectItem>
              <SelectItem value='female'>Ayol</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Data Table */}
        <div className='rounded-xl border bg-card shadow-sm overflow-hidden'>
          <Table>
            <TableHeader>
              <TableRow className='bg-muted/30'>
                <TableHead className='text-xs font-semibold'>Bemor Ismi</TableHead>
                <TableHead className='text-xs font-semibold'>Telefon Raqami</TableHead>
                <TableHead className='text-xs font-semibold'>Jinsi</TableHead>
                <TableHead className='text-xs font-semibold'>Manzili</TableHead>
                <TableHead className='text-xs font-semibold'>Ro'yxatdan o'tgan sana</TableHead>
                <TableHead className='text-xs font-semibold text-end'>Amallar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className='text-center py-8 text-xs text-muted-foreground animate-pulse'>
                    Bemorlar ro'yxati yuklanmoqda...
                  </TableCell>
                </TableRow>
              ) : patients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className='text-center py-8 text-xs text-muted-foreground'>
                    Hech qanday bemor topilmadi.
                  </TableCell>
                </TableRow>
              ) : (
                patients.map((patient: Patient) => (
                  <TableRow key={patient.id} className='hover:bg-muted/20'>
                    <TableCell className='font-medium text-xs'>
                      <div className='flex items-center gap-2'>
                        <div className='flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs'>
                          {patient.firstName[0]}
                        </div>
                        <span>{patient.firstName} {patient.lastName}</span>
                      </div>
                    </TableCell>
                    <TableCell className='text-xs font-mono'>{patient.phoneNumber}</TableCell>
                    <TableCell className='text-xs'>
                      <Badge variant='outline' className='text-[10px] uppercase'>
                        {patient.gender === 'male' ? 'Erkak' : patient.gender === 'female' ? 'Ayol' : 'Noma’lum'}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-xs text-muted-foreground truncate max-w-[150px]'>
                      {patient.address || '—'}
                    </TableCell>
                    <TableCell className='text-xs text-muted-foreground font-mono'>
                      {new Date(patient.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className='text-end'>
                      <Button asChild size='sm' variant='ghost' className='h-8 text-xs'>
                        <Link to='/patients/$id' params={{ id: patient.id }}>
                          Karta <ArrowRight className='ms-1.5 h-3.5 w-3.5' />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Create Patient Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>Yangi Bemor Ro'yxatga Olish</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreatePatient} className='space-y-3 py-2'>
              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Ismi *</label>
                  <Input
                    placeholder='Ali'
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Familiyasi *</label>
                  <Input
                    placeholder='Valiyev'
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Telefon raqami *</label>
                  <Input
                    placeholder='+998901234567'
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    required
                  />
                </div>
                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Jinsi</label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='male'>Erkak</SelectItem>
                      <SelectItem value='female'>Ayol</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-medium'>Manzili</label>
                <Input
                  placeholder='Toshkent sh., Yunusobod t.'
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-medium'>Eslatmalar (Allergiya, surunkali kasalliklar)</label>
                <Textarea
                  placeholder='Penitsillinga allergiya va h.k.'
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <DialogFooter className='pt-2'>
                <Button type='button' variant='outline' onClick={() => setIsModalOpen(false)}>
                  Bekor qilish
                </Button>
                <Button type='submit' disabled={createPatientMutation.isPending}>
                  {createPatientMutation.isPending ? 'Saqlanmoqda...' : 'Ro’yxatga olish'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Main>
    </>
  )
}
