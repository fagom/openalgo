import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TickerStore {
  /** Whether the bottom market ticker is shown. Nothing is subscribed while off. */
  visible: boolean
  setVisible: (visible: boolean) => void
}

export const useTickerStore = create<TickerStore>()(
  persist(
    (set) => ({
      visible: true,
      setVisible: (visible) => set({ visible }),
    }),
    { name: 'openalgo-ticker' }
  )
)
