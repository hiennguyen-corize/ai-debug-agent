import { create } from 'zustand'
import type { InvestigationMode } from '#api/types'

type SettingsState = {
  apiKey: string
  mode: InvestigationMode
  setApiKey: (key: string) => void
  setMode: (mode: InvestigationMode) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  apiKey: localStorage.getItem('ai-debug-api-key') ?? '',
  mode: 'autonomous',
  setApiKey: (apiKey) => {
    localStorage.setItem('ai-debug-api-key', apiKey)
    set({ apiKey })
  },
  setMode: (mode) => set({ mode }),
}))
