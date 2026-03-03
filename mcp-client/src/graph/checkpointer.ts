/**
 * SQLite checkpointer for LangGraph state persistence.
 */

import { MemorySaver } from '@langchain/langgraph';

export const createCheckpointer = (): MemorySaver => new MemorySaver();
