import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TickerStore {
  /** Whether the bottom market ticker is shown. Nothing is subscribed while off. */
  visible: boolean
  setVisible: (visible: boolean) => void
  /** Whether the index ticker under the navbar is shown. Nothing is subscribed while off. */
  indexVisible: boolean
  setIndexVisible: (indexVisible: boolean) => void
}

export const useTickerStore = create<TickerStore>()(
  persist(
    (set) => ({
      visible: true,
      setVisible: (visible) => set({ visible }),
      // Stored settings from before this existed lack the key; persist merges
      // them over these defaults, so the strip starts on for everyone.
      indexVisible: true,
      setIndexVisible: (indexVisible) => set({ indexVisible }),
    }),
    { name: 'openalgo-ticker' }
  )
)
