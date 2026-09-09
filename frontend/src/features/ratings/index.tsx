import { useState, useMemo, useEffect } from 'react'
import { Trophy, Search } from 'lucide-react'
import { useLeaderboard } from '@/api/hooks/use-ratings'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TablePagination } from '@/components/ui/table-pagination'
import { type LeaderboardEntry } from '@/types/api'

export function RatingsList() {
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const { data: leaderboardData = [], isLoading } = useLeaderboard()

  const leaderboard: LeaderboardEntry[] = Array.isArray(leaderboardData) ? leaderboardData : []

  const filteredLeaderboard = useMemo(() => {
    return leaderboard.filter((entry: LeaderboardEntry) => {
      const name = `${entry.doctor?.user?.firstName || ''} ${entry.doctor?.user?.lastName || ''} ${entry.doctor?.specialization || ''}`
      return name.toLowerCase().includes(searchTerm.toLowerCase())
    })
  }, [leaderboard, searchTerm])

  useEffect(() => {
    setPage(1)
  }, [searchTerm])

  const paginatedLeaderboard = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredLeaderboard.slice(start, start + pageSize)
  }, [filteredLeaderboard, page, pageSize])

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <Trophy className='h-5 w-5 text-amber-500' />
          <span>Shifokorlar Reytingi va Nishonlar</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main className='space-y-4'>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-xl font-bold tracking-tight'>Gamifikatsiya & Shifokorlar Reytingi</h1>
            <p className='text-xs text-muted-foreground'>
              Bajarilgan muolajalar, o'z vaqtida qabul va bemorlar sharhlari asosida hisoblangan ballar ({filteredLeaderboard.length} ta)
            </p>
          </div>

          <div className='relative w-full sm:w-72'>
            <Search className='absolute left-3 top-2.5 h-4 w-4 text-muted-foreground' />
            <Input
              placeholder='Shifokor yoki mutaxassislik...'
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className='ps-9 text-xs h-9'
            />
          </div>
        </div>

        <div className='rounded-xl border bg-card shadow-xs overflow-hidden'>
          <Table>
            <TableHeader className='bg-muted/40'>
              <TableRow>
                <TableHead className='w-16 text-center text-xs font-bold'>O'rin</TableHead>
                <TableHead className='text-xs font-bold'>Shifokor</TableHead>
                <TableHead className='text-xs font-bold'>Mutaxassislik</TableHead>
                <TableHead className='text-center text-xs font-bold'>Nishonlar (Badges)</TableHead>
                <TableHead className='text-end text-xs font-bold'>Jami Ball (Points)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className='text-center py-8 text-xs text-muted-foreground'>
                    Yuklanmoqda...
                  </TableCell>
                </TableRow>
              ) : filteredLeaderboard.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className='text-center py-8 text-xs text-muted-foreground'>
                    Reyting ma'lumotlari topilmadi.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLeaderboard.map((entry: LeaderboardEntry, idx: number) => {
                  const actualIdx = (page - 1) * pageSize + idx
                  const rank = entry.rank || actualIdx + 1
                  const doctorId = entry.doctor?.id || String(actualIdx)
                  const firstName = entry.doctor?.user?.firstName || 'Shifokor'
                  const lastName = entry.doctor?.user?.lastName || ''
                  const specialization = entry.doctor?.specialization || 'Stomatolog'
                  const totalPoints = entry.totalPoints ?? 0
                  const badgeCount = entry.badgeCount ?? 0

                  return (
                    <TableRow key={doctorId} className='hover:bg-muted/20'>
                      <TableCell className='text-center font-bold text-sm'>
                        {rank === 1 ? (
                          <span className='inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold'>
                            🥇 1
                          </span>
                        ) : rank === 2 ? (
                          <span className='inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-400/20 text-slate-600 dark:text-slate-300 font-bold'>
                            🥈 2
                          </span>
                        ) : rank === 3 ? (
                          <span className='inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-700/20 text-amber-800 dark:text-amber-500 font-bold'>
                            🥉 3
                          </span>
                        ) : (
                          <span className='text-muted-foreground font-mono'>#{rank}</span>
                        )}
                      </TableCell>

                      <TableCell className='font-medium text-xs'>
                        <div className='flex items-center gap-2'>
                          <div className='flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs'>
                            {firstName[0]}
                          </div>
                          <div>
                            <p className='font-bold'>
                              Dr. {firstName} {lastName}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className='text-xs font-medium text-muted-foreground'>
                        {specialization}
                      </TableCell>

                      <TableCell className='text-center'>
                        <Badge variant='outline' className='font-mono text-xs'>
                          🏅 {badgeCount} ta nishon
                        </Badge>
                      </TableCell>

                      <TableCell className='text-end font-bold font-mono text-base text-amber-600 dark:text-amber-400'>
                        {totalPoints} pts
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
          totalItems={filteredLeaderboard.length}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize)
            setPage(1)
          }}
        />
      </Main>
    </>
  )
}
