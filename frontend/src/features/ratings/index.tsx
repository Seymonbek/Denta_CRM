import { Trophy, Award, Medal, Star } from 'lucide-react'
import { useLeaderboard } from '@/api/hooks/use-ratings'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function RatingsList() {
  const { data: leaderboardData = [], isLoading } = useLeaderboard()

  const leaderboard = Array.isArray(leaderboardData?.results)
    ? leaderboardData.results
    : Array.isArray(leaderboardData)
    ? leaderboardData
    : []

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

      <Main>
        <div className='mb-6'>
          <h1 className='text-2xl font-bold tracking-tight flex items-center gap-2'>
            <Trophy className='h-6 w-6 text-amber-500' /> Klinika Shifokorlari Leaderboardi
          </h1>
          <p className='text-xs text-muted-foreground mt-1'>
            Faollik ballari, muolajalar va bemorlar minnatdorchilik nishonlari.
          </p>
        </div>

        {/* Leaderboard Table with Mobile Responsive Horizontal Scroll */}
        <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
          <Table className='min-w-[600px] sm:min-w-full'>
            <TableHeader>
              <TableRow className='bg-muted/30'>
                <TableHead className='text-xs font-semibold w-16 text-center'>O'rin</TableHead>
                <TableHead className='text-xs font-semibold'>Shifokor</TableHead>
                <TableHead className='text-xs font-semibold'>Mutaxassislik</TableHead>
                <TableHead className='text-xs font-semibold text-center'>Nishonlar Soni</TableHead>
                <TableHead className='text-xs font-semibold text-end'>Jami Ballar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className='text-center py-8 text-xs text-muted-foreground animate-pulse'>
                    Leaderboard yuklanmoqda...
                  </TableCell>
                </TableRow>
              ) : leaderboard.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className='text-center py-8 text-xs text-muted-foreground'>
                    Reyting ma'lumotlari topilmadi.
                  </TableCell>
                </TableRow>
              ) : (
                leaderboard.map((entry: any, idx: number) => {
                  const rank = entry?.rank || idx + 1
                  const doctorId = entry?.doctorId || entry?.doctor?.id || String(idx)
                  const firstName = entry?.firstName || entry?.first_name || entry?.doctor?.user?.firstName || entry?.doctor?.user?.first_name || 'Shifokor'
                  const lastName = entry?.lastName || entry?.last_name || entry?.doctor?.user?.lastName || entry?.doctor?.user?.last_name || ''
                  const specialization = entry?.specialization || entry?.doctor?.specialization || 'Stomatolog'
                  const totalPoints = entry?.totalPoints ?? entry?.points ?? 0
                  const badgeCount = entry?.badgeCount ?? entry?.badgesCount ?? entry?.badges_count ?? 0

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
      </Main>
    </>
  )
}
