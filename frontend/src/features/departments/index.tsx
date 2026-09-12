import { useState, useMemo, useEffect } from 'react'
import { Plus, Building2, Trash2, Edit2, Search, Download, Layers, CheckCircle2 } from 'lucide-react'
import { confirmSwal } from '@/lib/sweetalert'
import {
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
} from '@/api/hooks/use-departments'
import { type Department } from '@/types/api'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { format } from 'date-fns'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TablePagination } from '@/components/ui/table-pagination'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/get-error-message'

export function DepartmentsList() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const { data: departmentsData = [], isLoading } = useDepartments()
  const departments: Department[] = Array.isArray(departmentsData) ? departmentsData : []

  const filteredDepartments = departments.filter((d: Department) => {
    const text = String(d.name || '') + ' ' + String(d.description || '')
    return text.toLowerCase().includes(searchTerm.toLowerCase())
  })

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    setPage(1)
  }, [searchTerm])

  const paginatedDepartments = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredDepartments.slice(start, start + pageSize)
  }, [filteredDepartments, page, pageSize])

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
    setName(dept.name || '')
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
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Amalni bajarishda xatolik.'))
    }
  }

  const handleDelete = async (id: string) => {
    const isConfirmed = await confirmSwal({
      title: "Bo'limni o'chirmoqchimisiz?",
      text: "Ushbu bo'lim o'chiriladi va unga biriktirilgan ma'lumotlar yangilanadi.",
      confirmButtonText: "Ha, o'chiraman",
    })
    if (!isConfirmed) return

    try {
      await deleteDeptMutation.mutateAsync(id)
      toast.success("Bo'lim o'chirildi.")
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "O'chirishda xatolik."))
    }
  }

  const handleExportCSV = () => {
    if (departments.length === 0) {
      toast.info("Eksport qilish uchun bo'lim ma'lumotlari topilmadi.")
      return
    }

    const headers = ['ID', "Bo'lim Nomi", 'Tavsifi', 'Holati', 'Yaratilgan Sana']
    const rows = filteredDepartments.map((d) => {
      const isAct = d.isActive ?? true
      const dateStr = d.createdAt ? format(new Date(d.createdAt), 'dd.MM.yyyy HH:mm') : ''
      return [
        d.id || '',
        `"${(d.name || '').replace(/"/g, '""')}"`,
        `"${(d.description || '').replace(/"/g, '""')}"`,
        isAct ? 'Faol' : 'Nofaol',
        dateStr,
      ].join(',')
    })

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Klinika_Bolimlari_${format(new Date(), 'yyyy-MM-dd')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success("Bo'limlar ro'yxati CSV faylga muvaffaqiyatli yuklab olindi!")
  }

  const activeCount = departments.filter((d) => (d.isActive ?? true)).length

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <Building2 className='h-5 w-5 text-primary' />
          <span>Bo'limlar Boshqaruvi</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <div className='mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight flex items-center gap-2'>
              <Building2 className='h-6 w-6 text-primary' /> Klinika Bo'limlari
            </h1>
            <p className='text-xs text-muted-foreground mt-1'>
              Terapiya, Ortopediya, Jarrohlik va boshqa bo'limlar hamda ularning tavsifi.
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              onClick={handleExportCSV}
              className='text-xs font-semibold'
            >
              <Download className='me-1.5 h-4 w-4 text-emerald-600' /> Eksport (CSV)
            </Button>
            <Button onClick={handleOpenCreate} className='shadow text-xs font-bold gap-1.5'>
              <Plus className='h-4 w-4' /> Yangi Bo'lim Qo'shish
            </Button>
          </div>
        </div>

        {/* 3 KPI Summary Cards */}
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6'>
          <Card className='border-l-4 border-l-blue-500 shadow-sm'>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>
                Jami Bo'limlar
              </CardTitle>
              <Building2 className='h-4 w-4 text-blue-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-blue-600 font-mono'>
                {departments.length}
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                Klinikada mavjud mutaxassisliklar
              </p>
            </CardContent>
          </Card>

          <Card className='border-l-4 border-l-emerald-500 shadow-sm'>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>
                Faol Bo'limlar
              </CardTitle>
              <CheckCircle2 className='h-4 w-4 text-emerald-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-emerald-600 font-mono'>
                {activeCount}
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                Amalda xizmat ko'rsatayotgan bo'limlar
              </p>
            </CardContent>
          </Card>

          <Card className='border-l-4 border-l-purple-500 shadow-sm'>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>
                Qidiruv Natijasi
              </CardTitle>
              <Layers className='h-4 w-4 text-purple-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-purple-600 font-mono'>
                {filteredDepartments.length}
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                Filtrlangan bo'limlar soni
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search Toolbar */}
        <div className='mb-4 relative w-full sm:w-80'>
          <Search className='absolute left-3 top-2.5 h-4 w-4 text-muted-foreground' />
          <Input
            placeholder="Bo'lim nomi bo'yicha qidiruv..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className='ps-9 text-xs h-9'
          />
        </div>

        {/* Table */}
        <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
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
              ) : filteredDepartments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className='text-center py-8 text-xs text-muted-foreground'>
                    Hech qanday bo'lim topilmadi.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedDepartments.map((dept: Department) => {
                  const isActive = dept.isActive ?? true
                  const createdAt = dept.createdAt || ''

                  return (
                    <TableRow key={dept.id} className='hover:bg-muted/20'>
                      <TableCell className='font-semibold text-xs'>
                        <div className='flex items-center gap-2'>
                          <Building2 className='h-4 w-4 text-primary' />
                          <span>{dept.name || 'Bo’lim'}</span>
                        </div>
                      </TableCell>
                      <TableCell className='text-xs text-muted-foreground max-w-xs truncate'>
                        {dept.description || '—'}
                      </TableCell>
                      <TableCell className='text-xs'>
                        <Badge variant={isActive ? 'default' : 'secondary'} className='text-[10px]'>
                          {isActive ? 'Faol' : 'Nofaol'}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-xs font-mono text-muted-foreground'>
                        {formatDateSafely(createdAt)}
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
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <TablePagination
          page={page}
          pageSize={pageSize}
          totalItems={filteredDepartments.length}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize)
            setPage(1)
          }}
        />

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

function formatDateSafely(dateStr: string) {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return String(dateStr)
    return d.toLocaleDateString()
  } catch {
    return String(dateStr)
  }
}
