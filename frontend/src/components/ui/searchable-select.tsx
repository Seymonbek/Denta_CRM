import { useState } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

export interface SelectOption {
  value: string
  label: string
  sublabel?: string
}

interface SearchableSelectProps {
  options: SelectOption[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  className?: string
}

export function SearchableSelect({
  options = [],
  value,
  onValueChange,
  placeholder = 'Tanlang...',
  searchPlaceholder = 'Qidirish...',
  emptyMessage = 'Natija topilmadi.',
  disabled = false,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)

  const selectedOption = options.find((opt) => opt.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          role='combobox'
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal text-xs h-9 px-3 truncate bg-background',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <span className='truncate'>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className='ms-2 h-3.5 w-3.5 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[300px] sm:w-[350px] p-0' align='start'>
        <Command>
          <CommandInput placeholder={searchPlaceholder} className='h-9 text-xs' />
          <CommandList className='max-h-[220px] overflow-y-auto'>
            <CommandEmpty className='p-3 text-center text-xs text-muted-foreground'>
              {emptyMessage}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.sublabel || ''} ${option.value}`}
                  onSelect={() => {
                    onValueChange(option.value)
                    setOpen(false)
                  }}
                  className='text-xs flex items-center justify-between py-2 cursor-pointer'
                >
                  <div className='flex flex-col truncate me-2'>
                    <span className='font-medium text-foreground truncate'>
                      {option.label}
                    </span>
                    {option.sublabel && (
                      <span className='text-[10px] text-muted-foreground truncate'>
                        {option.sublabel}
                      </span>
                    )}
                  </div>
                  <Check
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 text-primary',
                      value === option.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
