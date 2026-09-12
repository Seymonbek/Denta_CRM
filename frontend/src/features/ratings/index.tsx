import { useState, useMemo, useEffect } from 'react'
import {
  Trophy,
  Search,
  Crown,
  Award,
  Star,
  Download,
  Zap,
  Sparkles,
} from 'lucide-react'
import {
  useLeaderboard,
  useRatingStats,
  useAllBadges,
  useDoctorBadges,
} from '@/api/hooks/use-ratings'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
} from '@/components/ui/dialog'
import { TablePagination } from '@/components/ui/table-pagination'
import { format, subMonths } from 'date-fns'
import { toast } from 'sonner'
import { type LeaderboardEntry, type Badge as BadgeType } from '@/types/api'

function DoctorBadgesModal({
  doctorId,
  doctorName,
  open,
  onOpenChange,
}: {
  doctorId: string | null
  doctorName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: badges = [], isLoading } = useDoctorBadges(doctorId || '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Award className="w-5 h-5 text-amber-500" />
            Dr. {doctorName} nishonlari
          </DialogTitle>
        </DialogHeader>
        <div className="py-2">
          {isLoading ? (
            <p className="text-center py-6 text-xs text-muted-foreground">Yuklanmoqda...</p>
          ) : badges.length === 0 ? (
            <p className="text-center py-6 text-xs text-muted-foreground">
              Ushbu shifokorda hali taqdirlangan nishonlar yo'q
            </p>
          ) : (
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto">
              {badges.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 p-3 rounded-xl border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-xl shrink-0">
                    🏅
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-foreground">{b.badge?.name}</p>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {b.period}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {b.badge?.description || "A'lo darajadagi kasbiy faollik uchun"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function BadgesCatalogModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: badges = [], isLoading } = useAllBadges()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Trophy className="w-5 h-5 text-amber-500" />
            Klinika Gamifikatsiya Nishonlari
          </DialogTitle>
        </DialogHeader>
        <div className="py-2">
          {isLoading ? (
            <p className="text-center py-6 text-xs text-muted-foreground">Yuklanmoqda...</p>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 max-h-[65vh] overflow-y-auto pr-1">
              {badges.map((b: BadgeType) => (
                <div
                  key={b.id}
                  className="p-3 rounded-xl border bg-card hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg">🎖️</span>
                    <h4 className="text-xs font-bold text-foreground">{b.name}</h4>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{b.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function RatingsList() {
  const [searchTerm, setSearchTerm] = useState('')
  const [period, setPeriod] = useState<string>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Modals state
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [selectedDoctorForBadges, setSelectedDoctorForBadges] = useState<{
    id: string
    name: string
  } | null>(null)

  const currentMonthStr = format(new Date(), 'yyyy-MM')
  const prevMonthStr = format(subMonths(new Date(), 1), 'yyyy-MM')

  const { data: leaderboardData = [], isLoading } = useLeaderboard(period || undefined)
  const { data: stats } = useRatingStats(period || undefined)

  const leaderboard: LeaderboardEntry[] = Array.isArray(leaderboardData) ? leaderboardData : []

  const filteredLeaderboard = useMemo(() => {
    return leaderboard.filter((entry: LeaderboardEntry) => {
      const firstName = entry.firstName || entry.doctor?.user?.firstName || ''
      const lastName = entry.lastName || entry.doctor?.user?.lastName || ''
      const specialization = entry.specialization || entry.doctor?.specialization || ''
      const name = `${firstName} ${lastName} ${specialization}`
      return name.toLowerCase().includes(searchTerm.toLowerCase())
    })
  }, [leaderboard, searchTerm])

  useEffect(() => {
    setPage(1)
  }, [searchTerm, period])

  const paginatedLeaderboard = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredLeaderboard.slice(start, start + pageSize)
  }, [filteredLeaderboard, page, pageSize])

  // Top 3 Podium Doctors
  const top1 = leaderboard[0]
  const top2 = leaderboard[1]
  const top3 = leaderboard[2]

  const handleExportCSV = () => {
    if (filteredLeaderboard.length === 0) {
      toast.info('Eksport qilish uchun reyting ma\'lumotlari topilmadi')
      return
    }

    const headers = [
      'O\'rin',
      'Shifokor F.I.Sh',
      'Mutaxassisligi',
      'Bemorlar Bahosi (Rating)',
      'Sharhlar Soni',
      'Bajarilgan Amallar',
      'Nishonlar Soni',
      'Jami Jamg\'arilgan Ball (Points)',
    ]

    const rows = filteredLeaderboard.map((e, idx) => {
      const rank = e.rank || idx + 1
      const firstName = e.firstName || e.doctor?.user?.firstName || 'Shifokor'
      const lastName = e.lastName || e.doctor?.user?.lastName || ''
      const spec = e.specialization || e.doctor?.specialization || 'Stomatolog'
      const rating = e.averageRating || 5.0
      const reviews = e.reviewsCount || 0
      const entries = e.entries || 0
      const badges = e.badgesCount ?? e.badgeCount ?? 0
      const points = e.totalPoints ?? 0

      return [
        `"#${rank}"`,
        `"Dr. ${firstName} ${lastName}".trim()`,
        `"${spec}"`,
        `"${rating} / 5.0"`,
        `"${reviews}"`,
        `"${entries}"`,
        `"${badges}"`,
        `"${points}"`,
      ]
    })

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Klinika_Shifokorlar_Reytingi_${format(new Date(), 'yyyy-MM-dd')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Shifokorlar reyting jadvali CSV faylga yuklab olindi!')
  }

  return (
    <>
      <Header>
        <div className="flex items-center gap-2 me-auto font-bold text-lg tracking-tight">
          <Trophy className="h-5 w-5 text-amber-500" />
          <span>Shifokorlar Reytingi va Gamifikatsiya</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main className="space-y-6">
        {/* Top Header & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Klinika Mutaxassislari Reytingi</h1>
            <p className="text-xs text-muted-foreground">
              Bajarilgan muolajalar, bemorlar baholari va sifat ko'rsatkichlari bo'yicha hisoblangan ballar ({filteredLeaderboard.length} ta shifokor)
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Period Quick Select */}
            <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border">
              <Button
                variant={period === '' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setPeriod('')}
              >
                Barcha vaqtlar
              </Button>
              <Button
                variant={period === currentMonthStr ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setPeriod(currentMonthStr)}
              >
                Shu Oy
              </Button>
              <Button
                variant={period === prevMonthStr ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setPeriod(prevMonthStr)}
              >
                O'tgan Oy
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => setCatalogOpen(true)}
            >
              <Award className="w-3.5 h-3.5 text-amber-500" />
              Nishonlar
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleExportCSV}
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              CSV
            </Button>
          </div>
        </div>

        {/* 4 Gamification KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-amber-500 shadow-sm bg-linear-to-br from-amber-500/5 to-transparent">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Oylik Chempion (MVP)
              </CardTitle>
              <Crown className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-amber-700 dark:text-amber-400 truncate" title={stats?.topDoctorName}>
                {stats?.topDoctorName || 'Mavjud emas'}
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-mono font-semibold">
                🏆 {stats?.topDoctorPoints || 0} ball to'pladi
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                O'rtacha Klinika Reytingi
              </CardTitle>
              <Star className="h-4 w-4 text-emerald-500 fill-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600 font-mono flex items-center gap-1.5">
                <span>⭐ {stats?.averageClinicRating || '5.0'}</span>
                <span className="text-xs font-normal text-muted-foreground">/ 5.0</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Jami {stats?.totalReviewsCount || 0} ta bemor sharhlari
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Berilgan Nishonlar
              </CardTitle>
              <Award className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600 font-mono">
                {stats?.totalBadgesCount || 0} ta
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Shifokorlarga taqdirlangan nishonlar
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Jami Jamg'arilgan Ballar
              </CardTitle>
              <Zap className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600 font-mono">
                {Number(stats?.totalPointsEarned || 0).toLocaleString()} XP
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Muolajalar va qabullar bo'yicha
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Top-3 Podium Showcase */}
        {leaderboard.length >= 2 && (
          <div className="rounded-2xl border bg-card/60 backdrop-blur-sm p-4 sm:p-6 shadow-sm">
            <div className="text-center mb-6">
              <h3 className="text-base font-bold tracking-tight flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Yetakchilar Shohsupasi (Top 3 Shifokor)
                <Sparkles className="w-4 h-4 text-amber-500" />
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Klinikaning eng yuqori natija ko'rsatgan bosh mutaxassislari
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end max-w-4xl mx-auto">
              {/* 2nd Place (Silver) */}
              {top2 && (
                <div className="flex flex-col items-center p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-500/5 hover:scale-[1.02] transition-transform">
                  <div className="relative mb-2">
                    <div className="w-14 h-14 rounded-full bg-linear-to-b from-slate-200 to-slate-400 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center text-xl font-bold shadow-inner">
                      {(top2.firstName || top2.doctor?.user?.firstName || '2')[0]}
                    </div>
                    <span className="absolute -bottom-1 -right-1 bg-slate-400 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow-sm">
                      🥈
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-foreground mt-1 text-center">
                    Dr. {top2.firstName || top2.doctor?.user?.firstName} {top2.lastName || top2.doctor?.user?.lastName}
                  </h4>
                  <p className="text-[11px] text-muted-foreground text-center">
                    {top2.specialization || top2.doctor?.specialization || 'Stomatolog'}
                  </p>
                  <div className="mt-2 flex items-center gap-1 text-xs font-bold text-amber-500">
                    <Star className="w-3.5 h-3.5 fill-amber-500" />
                    <span>{top2.averageRating || 5.0}</span>
                  </div>
                  <div className="mt-2 bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-full text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                    {top2.totalPoints} pts
                  </div>
                </div>
              )}

              {/* 1st Place (Gold / Center) */}
              {top1 && (
                <div className="flex flex-col items-center p-5 rounded-2xl border-2 border-amber-400 bg-linear-to-b from-amber-500/10 via-amber-500/5 to-transparent relative shadow-md hover:scale-[1.03] transition-transform md:-translate-y-2">
                  <div className="absolute -top-3">
                    <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 gap-1 shadow-sm">
                      <Crown className="w-3 h-3" /> 1-O'rin Chempion
                    </Badge>
                  </div>
                  <div className="relative my-2">
                    <div className="w-16 h-16 rounded-full bg-linear-to-b from-amber-300 to-amber-500 flex items-center justify-center text-2xl font-bold text-white shadow-md">
                      {(top1.firstName || top1.doctor?.user?.firstName || '1')[0]}
                    </div>
                    <span className="absolute -bottom-1 -right-1 bg-amber-500 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold shadow-sm">
                      👑
                    </span>
                  </div>
                  <h4 className="font-bold text-base text-foreground mt-1 text-center">
                    Dr. {top1.firstName || top1.doctor?.user?.firstName} {top1.lastName || top1.doctor?.user?.lastName}
                  </h4>
                  <p className="text-xs text-muted-foreground text-center">
                    {top1.specialization || top1.doctor?.specialization || 'Bosh Mutaxassis'}
                  </p>
                  <div className="mt-2 flex items-center gap-1 text-xs font-bold text-amber-500">
                    <Star className="w-4 h-4 fill-amber-500" />
                    <span>{top1.averageRating || 5.0} / 5.0</span>
                  </div>
                  <div className="mt-2 bg-amber-500 text-white px-4 py-1 rounded-full text-sm font-mono font-bold shadow-sm">
                    {top1.totalPoints} pts
                  </div>
                </div>
              )}

              {/* 3rd Place (Bronze) */}
              {top3 && (
                <div className="flex flex-col items-center p-4 rounded-xl border border-amber-700/30 bg-amber-900/5 hover:scale-[1.02] transition-transform">
                  <div className="relative mb-2">
                    <div className="w-14 h-14 rounded-full bg-linear-to-b from-amber-600 to-amber-800 flex items-center justify-center text-xl font-bold text-white shadow-inner">
                      {(top3.firstName || top3.doctor?.user?.firstName || '3')[0]}
                    </div>
                    <span className="absolute -bottom-1 -right-1 bg-amber-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow-sm">
                      🥉
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-foreground mt-1 text-center">
                    Dr. {top3.firstName || top3.doctor?.user?.firstName} {top3.lastName || top3.doctor?.user?.lastName}
                  </h4>
                  <p className="text-[11px] text-muted-foreground text-center">
                    {top3.specialization || top3.doctor?.specialization || 'Stomatolog'}
                  </p>
                  <div className="mt-2 flex items-center gap-1 text-xs font-bold text-amber-500">
                    <Star className="w-3.5 h-3.5 fill-amber-500" />
                    <span>{top3.averageRating || 5.0}</span>
                  </div>
                  <div className="mt-2 bg-amber-700/20 px-3 py-1 rounded-full text-xs font-mono font-bold text-amber-800 dark:text-amber-400">
                    {top3.totalPoints} pts
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Leaderboard Table Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Reyting Jadvali</CardTitle>
                <Badge variant="secondary" className="text-xs font-mono">
                  {filteredLeaderboard.length} ta
                </Badge>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Shifokor yoki mutaxassislik..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="ps-8 text-xs h-8"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="rounded-md border overflow-x-auto w-full">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-16 text-center text-xs font-bold">O'rin</TableHead>
                    <TableHead className="text-xs font-bold">Shifokor</TableHead>
                    <TableHead className="text-xs font-bold">Mutaxassislik</TableHead>
                    <TableHead className="text-center text-xs font-bold">Bemorlar Bahosi</TableHead>
                    <TableHead className="text-center text-xs font-bold">Amallar Soni</TableHead>
                    <TableHead className="text-center text-xs font-bold">Nishonlar</TableHead>
                    <TableHead className="text-end text-xs font-bold">Jami Ball</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                        Yuklanmoqda...
                      </TableCell>
                    </TableRow>
                  ) : filteredLeaderboard.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                        Reyting ma'lumotlari topilmadi.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedLeaderboard.map((entry: LeaderboardEntry, idx: number) => {
                      const actualIdx = (page - 1) * pageSize + idx
                      const rank = entry.rank || actualIdx + 1
                      const doctorId = entry.doctorId || entry.doctor?.id || String(actualIdx)
                      const firstName = entry.firstName || entry.doctor?.user?.firstName || 'Shifokor'
                      const lastName = entry.lastName || entry.doctor?.user?.lastName || ''
                      const specialization = entry.specialization || entry.doctor?.specialization || 'Stomatolog'
                      const totalPoints = entry.totalPoints ?? 0
                      const badgeCount = entry.badgesCount ?? entry.badgeCount ?? 0
                      const avgRating = entry.averageRating || 5.0
                      const reviewsCount = entry.reviewsCount || 0
                      const entriesCount = entry.entries || 0

                      return (
                        <TableRow key={doctorId} className="hover:bg-muted/20 transition-colors">
                          <TableCell className="text-center font-bold text-sm">
                            {rank === 1 ? (
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold">
                                🥇 1
                              </span>
                            ) : rank === 2 ? (
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-400/20 text-slate-600 dark:text-slate-300 font-bold">
                                🥈 2
                              </span>
                            ) : rank === 3 ? (
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-700/20 text-amber-800 dark:text-amber-500 font-bold">
                                🥉 3
                              </span>
                            ) : (
                              <span className="text-muted-foreground font-mono">#{rank}</span>
                            )}
                          </TableCell>

                          <TableCell className="font-medium text-xs">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                                {firstName[0]}
                              </div>
                              <div>
                                <p className="font-bold text-foreground">
                                  Dr. {firstName} {lastName}
                                </p>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="text-xs text-muted-foreground">
                            {specialization}
                          </TableCell>

                          <TableCell className="text-center">
                            <div className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-md text-xs font-semibold">
                              <Star className="w-3 h-3 fill-amber-500" />
                              <span>{avgRating}</span>
                              <span className="text-[10px] text-muted-foreground">({reviewsCount})</span>
                            </div>
                          </TableCell>

                          <TableCell className="text-center font-mono text-xs text-muted-foreground">
                            {entriesCount} ta
                          </TableCell>

                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs font-mono gap-1 hover:bg-amber-500/10 hover:text-amber-600"
                              onClick={() =>
                                setSelectedDoctorForBadges({
                                  id: doctorId,
                                  name: `${firstName} ${lastName}`.trim(),
                                })
                              }
                            >
                              🏅 {badgeCount} ta
                            </Button>
                          </TableCell>

                          <TableCell className="text-end font-bold font-mono text-sm text-amber-600 dark:text-amber-400">
                            {totalPoints.toLocaleString()} pts
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
              totalCount={filteredLeaderboard.length}
              onPageChange={setPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize)
                setPage(1)
              }}
              className="mt-4"
            />
          </CardContent>
        </Card>

        {/* Doctor Badges Modal */}
        <DoctorBadgesModal
          doctorId={selectedDoctorForBadges?.id || null}
          doctorName={selectedDoctorForBadges?.name || ''}
          open={!!selectedDoctorForBadges}
          onOpenChange={(open) => !open && setSelectedDoctorForBadges(null)}
        />

        {/* Badges Catalog Modal */}
        <BadgesCatalogModal open={catalogOpen} onOpenChange={setCatalogOpen} />
      </Main>
    </>
  )
}
