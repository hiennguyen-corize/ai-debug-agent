import { api } from './client'
import type { ThreadResponse } from './types'

type StartResult = { threadId: string; status: string }

export const startInvestigation = async (
  url: string,
  hint: string,
  mode: 'interactive' | 'autonomous',
): Promise<StartResult> => {
  return api.post('investigate', { json: { url, hint, mode } }).json<StartResult>()
}

export const getThread = async (threadId: string): Promise<ThreadResponse> => {
  return api.get(`investigate/${threadId}`).json<ThreadResponse>()
}

export const createSSE = (threadId: string): EventSource => {
  const apiKey = localStorage.getItem('ai-debug-api-key') ?? ''
  return new EventSource(`/api/investigate/${threadId}/stream?apiKey=${apiKey}`)
}
