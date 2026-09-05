import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TablePagination } from '@/components/ui/table-pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { useAuditLogs, type AuditLog } from '@/api/hooks/use-audit-logs'

function ChangesModal({ changes, open, onOpenChange }: { changes: Record<string, { old: unknown; new: unknown }> | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>O'zgarishlar tarixi</DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          {!changes || Object.keys(changes).length === 0 ? (
            <p>Hech qanday o'zgarish saqlanmagan.</p>
          ) : (
            <div className="rounded-md border bg-card text-card-foreground overflow-x-auto w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Maydon</TableHead>
                    <TableHead>Eski qiymat</TableHead>
                    <TableHead>Yangi qiymat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(changes).map(([field, vals]) => (
                    <TableRow key={field}>
                      <TableCell className="font-medium font-mono text-sm">{field}</TableCell>
                      <TableCell className="text-red-600 bg-red-50 dark:bg-red-900/20 max-w-[250px] break-words">
                        {typeof vals.old === 'object' ? JSON.stringify(vals.old) : String(vals.old)}
                      </TableCell>
                      <TableCell className="text-green-600 bg-green-50 dark:bg-green-900/20 max-w-[250px] break-words">
                        {typeof vals.new === 'object' ? JSON.stringify(vals.new) : String(vals.new)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function AuditLogFeature() {
  const [searchTerm, setSearchTerm] = useState('')
  const [actionFilter, setActionFilter] = useState<string>('')
  const [modelFilter, setModelFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    setPage(1)
  }, [searchTerm, actionFilter, modelFilter])
  
  const { data, isLoading } = useAuditLogs({
    search: searchTerm.trim() || undefined,
    action: actionFilter || undefined,
    model_name: modelFilter || undefined,
    page,
    page_size: pageSize,
  })

  const logs = data?.results ?? []
  const totalCount = data?.count ?? logs.length
  
  const [selectedChanges, setSelectedChanges] = useState<Record<string, { old: unknown; new: unknown }> | null>(null)

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'create':
        return <Badge className="bg-green-500 hover:bg-green-600">Yaratildi</Badge>
      case 'update':
        return <Badge className="bg-blue-500 hover:bg-blue-600">O'zgartirildi</Badge>
      case 'delete':
        return <Badge className="bg-red-500 hover:bg-red-600">O'chirildi</Badge>
      case 'login':
        return <Badge variant="secondary">Tizimga Kirdi</Badge>
      case 'logout':
        return <Badge variant="outline">Tizimdan Chiqdi</Badge>
      default:
        return <Badge variant="outline">{action}</Badge>
    }
  }

  return (
    <>
      <Header>
        <div className='flex flex-col md:flex-row items-stretch md:items-center justify-between w-full gap-3'>
          <h2 className='text-2xl font-bold tracking-tight'>Tizim Jurnali (Audit Log)</h2>
          <div className='flex items-center space-x-2 flex-wrap'>
            <div className="relative min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Foydalanuvchi, model..."
                className="pl-8 h-9 text-xs"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <select
              className="flex h-9 w-[140px] rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="">Barcha amallar</option>
              <option value="create">Yaratildi</option>
              <option value="update">O'zgartirildi</option>
              <option value="delete">O'chirildi</option>
              <option value="login">Tizimga Kirdi</option>
              <option value="logout">Tizimdan Chiqdi</option>
            </select>
            
            <select
              className="flex h-9 w-[140px] rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
            >
              <option value="">Barcha modellar</option>
              <option value="Patient">Bemorlar</option>
              <option value="Treatment">Davolash</option>
              <option value="Payment">To'lovlar</option>
              <option value="DoctorProfile">Shifokorlar</option>
              <option value="Material">Sklad (Material)</option>
            </select>

            {(searchTerm || actionFilter || modelFilter) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSearchTerm('')
                  setActionFilter('')
                  setModelFilter('')
                }}
              >
                <X className="me-1 h-3.5 w-3.5" /> Tozalash
              </Button>
            )}
            
            <ProfileDropdown />
          </div>
        </div>
      </Header>
      <Main>
        <div className='rounded-md border bg-card text-card-foreground overflow-x-auto w-full'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vaqti</TableHead>
                <TableHead>Foydalanuvchi</TableHead>
                <TableHead>Amal</TableHead>
                <TableHead>Obyekt (Model)</TableHead>
                <TableHead>IP Manzil</TableHead>
                <TableHead className="text-right">Tafsilotlar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className='text-center py-4'>Yuklanmoqda...</TableCell>
                </TableRow>
              ) : data?.results?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className='text-center py-4'>Jurnal yozuvlari topilmadi.</TableCell>
                </TableRow>
              ) : (
                data?.results?.map((log: AuditLog) => (
                  <TableRow key={log.id}>
                    <TableCell>{format(new Date(log.timestamp), 'dd.MM.yy HH:mm:ss')}</TableCell>
                    <TableCell>
                      {log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Tizim / Noma\'lum'}
                      {log.user && <span className="block text-xs text-muted-foreground">{log.user.role}</span>}
                    </TableCell>
                    <TableCell>{getActionBadge(log.action)}</TableCell>
                    <TableCell>
                      {log.model_name || '-'} 
                      {log.object_id && <span className="block text-xs font-mono text-muted-foreground">{log.object_id.slice(0, 8)}...</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.ip_address || '-'}</TableCell>
                    <TableCell className="text-right">
                      {log.changes && Object.keys(log.changes).length > 0 ? (
                        <button 
                          onClick={() => setSelectedChanges(log.changes)}
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
                          Ko'rish
                        </button>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Table Pagination */}
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          className='mt-2'
        />
        
        <ChangesModal 
          changes={selectedChanges} 
          open={!!selectedChanges} 
          onOpenChange={(o) => !o && setSelectedChanges(null)} 
        />
      </Main>
    </>
  )
}
