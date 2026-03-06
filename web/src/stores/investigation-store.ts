import { create } from 'zustand'
import type { AgentEvent, InvestigationReport } from '#api/types'
import { createSSE, sendMessage as apiSendMessage, getThread } from '#api/investigate'

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
  isWaitingForInput: boolean
}

type InvestigationState = {
  investigations: Investigation[]
  activeId: string | null
  hydrated: boolean
  setActive: (id: string) => void
  addInvestigation: (inv: Investigation) => void
  updateInvestigation: (id: string, patch: Partial<Investigation>) => void
  addMessage: (investigationId: string, msg: ChatMessage) => void
  getActive: () => Investigation | undefined
  hydrate: () => Promise<void>
  connectSSE: (investigationId: string, threadId: string) => void
  sendMessage: (investigationId: string, message: string) => Promise<void>
}

let counter = 0
export const createMessageId = (): string => `msg-${Date.now()}-${++counter}`

const API_BASE = '/api'

const eventToMessage = (event: AgentEvent, index: number): ChatMessage => ({
  id: `hydrated-${index}`,
  role: 'agent',
  content: '',
  timestamp: Date.now(),
  agent: 'agent' in event ? (event as { agent: string }).agent : undefined,
  event,
})

type ThreadListItem = {
  threadId: string
  status: string
  request: { url: string; hint?: string; mode: string }
  report: InvestigationReport | null
  error: string | null
  createdAt?: number
}

export const useInvestigationStore = create<InvestigationState>((set, get) => ({
  investigations: [],
  activeId: null,
  hydrated: false,

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

  connectSSE: (investigationId: string, threadId: string) => {
    const sse = createSSE(threadId)
    sse.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as AgentEvent
        const isWaiting = event.type === 'waiting_for_input'
        get().addMessage(investigationId, {
          id: createMessageId(),
          role: 'agent',
          content: '',
          timestamp: Date.now(),
          agent: 'agent' in event ? (event as { agent: string }).agent : undefined,
          event,
        })
        if (isWaiting) {
          get().updateInvestigation(investigationId, { isWaitingForInput: true })
        }
      } catch {
        // ignore parse errors
      }
    }
    sse.onerror = () => {
      sse.close()
      getThread(threadId)
        .then((t) => {
          get().updateInvestigation(investigationId, {
            status: (t.status === 'running' ? 'done' : t.status) as Investigation['status'],
            report: t.report,
            error: t.error,
          })
        })
        .catch(() => {
          get().updateInvestigation(investigationId, { status: 'done' })
        })
    }
  },

  sendMessage: async (investigationId: string, message: string) => {
    const inv = get().investigations.find((i) => i.id === investigationId)
    if (!inv?.threadId) return
    get().addMessage(investigationId, {
      id: createMessageId(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    })
    get().updateInvestigation(investigationId, { isWaitingForInput: false })
    await apiSendMessage(inv.threadId, message)
  },

  hydrate: async () => {
    if (get().hydrated) return
    try {
      const res = await fetch(`${API_BASE}/investigate`)
      if (!res.ok) return
      const json = (await res.json()) as { data: ThreadListItem[] }
      const threads = json.data

      const investigations: Investigation[] = []
      for (const t of threads) {
        const eventsRes = await fetch(`${API_BASE}/investigate/${t.threadId}/events`)
        const eventsJson = eventsRes.ok ? ((await eventsRes.json()) as { data: AgentEvent[] }) : null
        const events = eventsJson?.data ?? []

        const messages: ChatMessage[] = [
          {
            id: `hydrated-user-${t.threadId}`,
            role: 'user',
            content: `Investigating ${t.request.url}${t.request.hint ? `\n\nHint: ${t.request.hint}` : ''}`,
            timestamp: t.createdAt ?? Date.now(),
          },
          ...events.map(eventToMessage),
        ]

        investigations.push({
          id: t.threadId,
          threadId: t.threadId,
          url: t.request.url,
          hint: t.request.hint ?? '',
          mode: (t.request.mode as 'interactive' | 'autonomous') ?? 'interactive',
          status: t.status as Investigation['status'],
          messages,
          report: t.report,
          error: t.error,
          createdAt: t.createdAt ?? Date.now(),
          isWaitingForInput: false,
        })
      }

      set({ investigations, hydrated: true })

      // Auto-reconnect SSE for running investigations
      for (const inv of investigations) {
        if (inv.status === 'running' && inv.threadId) {
          get().connectSSE(inv.id, inv.threadId)
        }
      }
    } catch {
      set({ hydrated: true })
    }
  },
}))
