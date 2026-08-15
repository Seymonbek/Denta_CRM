import { useNavigate, useRouter } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type GeneralErrorProps = React.HTMLAttributes<HTMLDivElement> & {
  minimal?: boolean
}

export function GeneralError({
  className,
  minimal = false,
}: GeneralErrorProps) {
  const _navigate = useNavigate()
  const { _history } = useRouter()
  return (
    <div className={cn('h-svh w-full', className)}>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        {!minimal && (
          <h1 className='text-[7rem] leading-tight font-bold'>500</h1>
        )}
        <span className='font-medium'>Oops! Something went wrong {`:')`}</span>
        <p className='text-center text-muted-foreground'>
          We apologize for the inconvenience. <br /> Please try again later.
        </p>
        {!minimal && (
          <div className='mt-6 flex gap-4'>
            <Button
              variant='outline'
              onClick={() => {
                if (window._history.length > 1) {
                  window._history.back()
                } else {
                  window.location.href = '/'
                }
              }}
            >
              Go Back
            </Button>
            <Button
              onClick={() => {
                window.location.href = '/'
              }}
            >
              Back to Home
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
