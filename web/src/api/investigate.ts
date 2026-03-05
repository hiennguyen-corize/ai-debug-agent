import { api } from './client'
import type { ThreadResponse } from './types'

type StartResult = { threadId: string; status: string }
type ApiEnvelope<T> = { data: T }

export const startInvestigation = async (
  url: string,
  hint: string,
  mode: 'interactive' | 'autonomous',
): Promise<StartResult> => {
  const res = await api.post('investigate', { json: { url, hint, mode } }).json<ApiEnvelope<StartResult>>()
  return res.data
}

export const getThread = async (threadId: string): Promise<ThreadResponse> => {
  const res = await api.get(`investigate/${threadId}`).json<ApiEnvelope<ThreadResponse>>()
  return res.data
}

export const createSSE = (threadId: string): EventSource => {
  const apiKey = localStorage.getItem('ai-debug-api-key') ?? ''
  return new EventSource(`/api/investigate/${threadId}/stream?apiKey=${apiKey}`)
}
