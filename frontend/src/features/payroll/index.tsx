import { useState } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Banknote } from 'lucide-react'
import { useDoctorBalances, type DoctorBalance } from '@/api/hooks/use-payroll'
import { PayrollFormModal } from './payroll-form-modal'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { formatMoney } from '@/utils/format'

export function PayrollFeature() {
  const { data: balances, isLoading } = useDoctorBalances()
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorBalance | null>(null)

  return (
    <div className="flex flex-col min-h-screen">
      <Header>
        <div className="flex items-center justify-between w-full">
          <h2 className="text-2xl font-bold tracking-tight">Maosh va Ish Haqi</h2>
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Shifokorlar Balansi</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center p-4">Yuklanmoqda...</div>
            ) : (
              <div className="overflow-x-auto w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Shifokor</TableHead>
                      <TableHead>Tel. Raqam</TableHead>
                      <TableHead className="text-right">Jami Ishlagan (so'm)</TableHead>
                      <TableHead className="text-right">Jami To'langan (so'm)</TableHead>
                      <TableHead className="text-right">Joriy Qoldiq (so'm)</TableHead>
                      <TableHead className="text-right">Harakatlar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {balances?.map((doc: DoctorBalance) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          {doc.firstName} {doc.lastName}
                        </TableCell>
                        <TableCell>{doc.phone}</TableCell>
                        <TableCell className="text-right">{formatMoney(doc.totalEarned)}</TableCell>
                        <TableCell className="text-right">{formatMoney(doc.totalPaid)}</TableCell>
                        <TableCell className="text-right font-bold text-primary">
                          {formatMoney(doc.balance)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="default" 
                            size="sm" 
                            onClick={() => setSelectedDoctor(doc)}
                          >
                            <Banknote className="w-4 h-4 mr-2" />
                            To'lash
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {balances?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center">
                          Ma'lumot topilmadi
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </Main>

      <PayrollFormModal
        isOpen={!!selectedDoctor}
        onClose={() => setSelectedDoctor(null)}
        doctor={selectedDoctor}
      />
    </div>
  )
}
