import { create } from 'zustand'
import type { AgentEvent, InvestigationReport } from '#api/types'

export type ChatMessage = {
  id: string
  role: 'user' | 'system' | 'agent'
  content: string
  timestamp: number
  agent?: string
  event?: AgentEvent
}

export type Investigation = {
  id: string
  threadId: string | null
  url: string
  hint: string
  mode: 'interactive' | 'autonomous'
  status: 'pending' | 'running' | 'done' | 'error'
  messages: ChatMessage[]
  report: InvestigationReport | null
  error: string | null
  createdAt: number
}

type InvestigationState = {
  investigations: Investigation[]
  activeId: string | null
  setActive: (id: string) => void
  addInvestigation: (inv: Investigation) => void
  updateInvestigation: (id: string, patch: Partial<Investigation>) => void
  addMessage: (investigationId: string, msg: ChatMessage) => void
  getActive: () => Investigation | undefined
}

let counter = 0
export const createMessageId = (): string => `msg-${Date.now()}-${++counter}`

export const useInvestigationStore = create<InvestigationState>((set, get) => ({
  investigations: [],
  activeId: null,

  setActive: (id) => set({ activeId: id }),

  addInvestigation: (inv) =>
    set((s) => ({
      investigations: [inv, ...s.investigations],
      activeId: inv.id,
    })),

  updateInvestigation: (id, patch) =>
    set((s) => ({
      investigations: s.investigations.map((inv) =>
        inv.id === id ? { ...inv, ...patch } : inv,
      ),
    })),

  addMessage: (investigationId, msg) =>
    set((s) => ({
      investigations: s.investigations.map((inv) =>
        inv.id === investigationId
          ? { ...inv, messages: [...inv.messages, msg] }
          : inv,
      ),
    })),

  getActive: () => {
    const state = get()
    return state.investigations.find((inv) => inv.id === state.activeId)
  },
}))
