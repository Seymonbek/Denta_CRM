import { useState } from 'react'
import { Plus, Building2, Trash2, Edit2 } from 'lucide-react'
import {
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
} from '@/api/hooks/use-departments'
import { Department } from '@/types/api'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { toast } from 'sonner'

export function DepartmentsList() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const { data: departments = [], isLoading } = useDepartments()

  const createDeptMutation = useCreateDepartment()
  const updateDeptMutation = useUpdateDepartment()
  const deleteDeptMutation = useDeleteDepartment()

  const handleOpenCreate = () => {
    setEditingDept(null)
    setName('')
    setDescription('')
    setIsModalOpen(true)
  }

  const handleOpenEdit = (dept: Department) => {
    setEditingDept(dept)
    setName(dept.name)
    setDescription(dept.description || '')
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) {
      toast.error('Bo’lim nomini kiriting.')
      return
    }

    try {
      if (editingDept) {
        await updateDeptMutation.mutateAsync({
          id: editingDept.id,
          data: { name, description },
        })
        toast.success('Bo’lim yangilandi!')
      } else {
        await createDeptMutation.mutateAsync({ name, description })
        toast.success('Yangi bo’lim qo’shildi!')
      }
      setIsModalOpen(false)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Amalni bajarishda xatolik.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Haqiqatdan ham ushbu bo'limni o'chirmoqchimisiz?")) return
    try {
      await deleteDeptMutation.mutateAsync(id)
      toast.success("Bo'lim o'chirildi.")
    } catch (err: any) {
      toast.error("O'chirishda xatolik.")
    }
  }

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <span>🏥 Bo'limlar Boshqaruvi</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <div className='mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Klinika Bo'limlari</h1>
            <p className='text-xs text-muted-foreground'>
              Terapiya, Ortopediya, Jarrohlik va boshqa bo'limlar hamda ularning tavsifi.
            </p>
          </div>
          <Button onClick={handleOpenCreate} className='shadow'>
            <Plus className='me-2 h-4 w-4' /> Yangi Bo'lim Qo'shish
          </Button>
        </div>

        {/* Table */}
        <div className='rounded-xl border bg-card shadow-sm overflow-hidden'>
          <Table>
            <TableHeader>
              <TableRow className='bg-muted/30'>
                <TableHead className='text-xs font-semibold'>Bo'lim Nomi</TableHead>
                <TableHead className='text-xs font-semibold'>Tavsifi</TableHead>
                <TableHead className='text-xs font-semibold'>Holati</TableHead>
                <TableHead className='text-xs font-semibold'>Yaratilgan Sana</TableHead>
                <TableHead className='text-xs font-semibold text-end'>Amallar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className='text-center py-8 text-xs text-muted-foreground animate-pulse'>
                    Bo'limlar yuklanmoqda...
                  </TableCell>
                </TableRow>
              ) : departments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className='text-center py-8 text-xs text-muted-foreground'>
                    Bo'limlar topilmadi.
                  </TableCell>
                </TableRow>
              ) : (
                departments.map((dept: Department) => (
                  <TableRow key={dept.id} className='hover:bg-muted/20'>
                    <TableCell className='font-semibold text-xs'>
                      <div className='flex items-center gap-2'>
                        <Building2 className='h-4 w-4 text-primary' />
                        <span>{dept.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className='text-xs text-muted-foreground max-w-xs truncate'>
                      {dept.description || '—'}
                    </TableCell>
                    <TableCell className='text-xs'>
                      <Badge variant={dept.isActive ? 'default' : 'secondary'} className='text-[10px]'>
                        {dept.isActive ? 'Faol' : 'Nofaol'}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-xs font-mono text-muted-foreground'>
                      {new Date(dept.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className='text-end space-x-1'>
                      <Button
                        size='sm'
                        variant='ghost'
                        className='h-8 w-8 p-0'
                        onClick={() => handleOpenEdit(dept)}
                      >
                        <Edit2 className='h-3.5 w-3.5' />
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        className='h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                        onClick={() => handleDelete(dept.id)}
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>{editingDept ? "Bo'limni Tahrirlash" : "Yangi Bo'lim Qo'shish"}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className='space-y-3 py-2'>
              <div className='space-y-1'>
                <label className='text-xs font-medium'>Bo'lim nomi *</label>
                <Input
                  placeholder='Masalan: Terapiya'
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-medium'>Tavsifi</label>
                <Textarea
                  placeholder='Bo’lim xizmatlari va faoliyat sohasi...'
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <DialogFooter className='pt-2'>
                <Button type='button' variant='outline' onClick={() => setIsModalOpen(false)}>
                  Bekor qilish
                </Button>
                <Button type='submit' disabled={createDeptMutation.isPending || updateDeptMutation.isPending}>
                  {editingDept ? 'Yangilash' : 'Qo’shish'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Main>
    </>
  )
}
