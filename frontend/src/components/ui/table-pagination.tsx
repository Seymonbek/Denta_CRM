import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface TablePaginationProps {
  page: number
  totalCount?: number
  totalItems?: number
  pageSize: number
  onPageChange: (newPage: number) => void
  onPageSizeChange?: (newPageSize: number) => void
  pageSizeOptions?: number[]
  className?: string
}

export function TablePagination({
  page,
  totalCount,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  className = '',
}: TablePaginationProps) {
  const effectiveTotal = totalCount ?? totalItems ?? 0
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize))
  const fromIndex = effectiveTotal === 0 ? 0 : (page - 1) * pageSize + 1
  const toIndex = Math.min(page * pageSize, effectiveTotal)

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 py-3 px-1 text-xs text-muted-foreground ${className}`}
    >
      {/* Total records & visible range */}
      <div className='flex items-center gap-2'>
        <span>
          Jami:{' '}
          <strong className='font-semibold text-foreground'>
            {effectiveTotal.toLocaleString()}
          </strong>{' '}
          ta yozuv
        </span>
        {effectiveTotal > 0 && (
          <span className='text-[11px] text-muted-foreground/80'>
            ({fromIndex} - {toIndex} ko'rsatilmoqda)
          </span>
        )}
      </div>

      {/* Controls */}
      <div className='flex items-center gap-3 sm:gap-4 flex-wrap justify-center'>
        {/* Page size selector */}
        {onPageSizeChange && (
          <div className='flex items-center gap-1.5'>
            <span className='text-[11px] hidden sm:inline'>Qatorlar:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(val) => {
                onPageSizeChange(Number(val))
                onPageChange(1)
              }}
            >
              <SelectTrigger className='h-8 w-20 text-xs font-medium'>
                <SelectValue placeholder={String(pageSize)} />
              </SelectTrigger>
              <SelectContent side='top'>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)} className='text-xs'>
                    {size} ta
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Page navigation */}
        <div className='flex items-center gap-1'>
          <Button
            size='icon'
            variant='outline'
            className='h-8 w-8 text-xs'
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
            title='Birinchi sahifa'
          >
            <ChevronsLeft className='h-4 w-4' />
          </Button>
          <Button
            size='sm'
            variant='outline'
            className='h-8 px-2.5 text-xs gap-1'
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            title='Oldingi sahifa'
          >
            <ChevronLeft className='h-3.5 w-3.5' />
            <span className='hidden sm:inline'>Oldingi</span>
          </Button>

          <div className='px-2 font-mono font-medium text-xs text-foreground bg-muted/40 rounded-md py-1 border border-border/50'>
            {page} / {totalPages}
          </div>

          <Button
            size='sm'
            variant='outline'
            className='h-8 px-2.5 text-xs gap-1'
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            title='Keyingi sahifa'
          >
            <span className='hidden sm:inline'>Keyingi</span>
            <ChevronRight className='h-3.5 w-3.5' />
          </Button>
          <Button
            size='icon'
            variant='outline'
            className='h-8 w-8 text-xs'
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
            title='Oxirgi sahifa'
          >
            <ChevronsRight className='h-4 w-4' />
          </Button>
        </div>
      </div>
    </div>
  )
}
