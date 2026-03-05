import { create } from 'zustand'

type SettingsState = {
  apiKey: string
  mode: 'interactive' | 'autonomous'
  setApiKey: (key: string) => void
  setMode: (mode: 'interactive' | 'autonomous') => void
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
