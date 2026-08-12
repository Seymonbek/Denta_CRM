import { create } from 'zustand'

export interface ShiftState {
  isShiftOpen: boolean
  currentShiftId: string | null
  setShift: (isOpen: boolean, shiftId?: string | null) => void
}

export const useShiftStore = create<ShiftState>((set) => ({
  isShiftOpen: false,
  currentShiftId: null,
  setShift: (isOpen, shiftId = null) => set({ isShiftOpen: isOpen, currentShiftId: shiftId }),
}))
