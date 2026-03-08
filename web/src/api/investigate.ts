import { api } from './client'
import type { ThreadResponse, InvestigationMode, AgentEvent } from './types'

type StartResult = { threadId: string; status: string }
type ApiEnvelope<T> = { data: T }

type ThreadListItem = {
  threadId: string
  status: string
  request: { url: string; hint?: string; mode: string }
  report: import('@ai-debug/shared').InvestigationReport | null
  error: string | null
  createdAt: number
}

export const listThreads = async (): Promise<ThreadListItem[]> => {
  const res = await api.get('investigate').json<ApiEnvelope<ThreadListItem[]>>()
  return res.data
}

export const getThreadEvents = async (threadId: string): Promise<AgentEvent[]> => {
  const res = await api.get(`investigate/${threadId}/events`).json<ApiEnvelope<AgentEvent[]>>()
  return res.data
}

export const startInvestigation = async (
  url: string,
  hint: string,
  mode: InvestigationMode,
): Promise<StartResult> => {
  const res = await api.post('investigate', { json: { url, hint, mode } }).json<ApiEnvelope<StartResult>>()
  return res.data
}

export const getThread = async (threadId: string): Promise<ThreadResponse> => {
  const res = await api.get(`investigate/${threadId}`).json<ApiEnvelope<ThreadResponse>>()
  return res.data
}

/** SSE via EventSource — sends API key via query param (EventSource lacks header support). */
export const createSSE = (threadId: string): EventSource => {
  const apiKey = localStorage.getItem('ai-debug-api-key') ?? ''
  return new EventSource(`/api/investigate/${threadId}/stream${apiKey ? `?apiKey=${encodeURIComponent(apiKey)}` : ''}`)
}

export const sendMessage = async (threadId: string, message: string): Promise<void> => {
  await api.post(`investigate/${threadId}/message`, { json: { message } }).json()
}

export type ArtifactRecord = {
  id: number
  threadId: string
  type: string
  name: string
  content: string
  toolCallId: string | null
  createdAt: string
}

export const getArtifacts = async (threadId: string): Promise<ArtifactRecord[]> => {
  const res = await api.get(`investigate/${threadId}/artifacts`).json<ApiEnvelope<ArtifactRecord[]>>()
  return res.data
}
