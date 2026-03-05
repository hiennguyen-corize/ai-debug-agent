import type { AgentEvent } from '#api/types'

export function PhaseEvent({ event }: { event: Extract<AgentEvent, { type: 'investigation_phase' }> }) {
  // Tufte: phase info is redundant with AgentGroup header. Render minimal.
  return null
}
