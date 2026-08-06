import { Link } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import useDialogState from '@/hooks/use-dialog-state'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SignOutDialog } from '@/components/sign-out-dialog'
import { Badge } from '@/components/ui/badge'

const ROLE_LABELS: Record<string, string> = {
  bosh_shifokor: 'Bosh shifokor',
  doctor: 'Shifokor',
  administrator: 'Administrator',
}

export function ProfileDropdown() {
  const [open, setOpen] = useDialogState()
  const user = useAuthStore((s) => s.user)

  const fullName = user ? `${user.firstName} ${user.lastName}`.trim() || 'Foydalanuvchi' : 'Foydalanuvchi'
  const initials = user ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'DC' : 'DC'
  const roleLabel = user?.role ? ROLE_LABELS[user.role] || user.role : ''

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='relative h-9 w-9 rounded-full bg-primary/10'>
            <Avatar className='h-9 w-9'>
              <AvatarFallback className='bg-primary/20 text-primary font-bold'>
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className='w-60' align='end' forceMount>
          <DropdownMenuLabel className='font-normal'>
            <div className='flex flex-col gap-1'>
              <div className='flex items-center justify-between'>
                <p className='text-sm font-semibold leading-none'>{fullName}</p>
                {roleLabel && (
                  <Badge variant='outline' className='text-[10px] px-1.5 py-0'>
                    {roleLabel}
                  </Badge>
                )}
              </div>
              <p className='text-xs text-muted-foreground font-mono'>
                {user?.phoneNumber}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link to='/settings'>Profil va Sozlamalar</Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant='destructive' onClick={() => setOpen(true)}>
            Tizimdan chiqish
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
