/**
 * Artifact repository — CRUD for investigation artifacts.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '#db/client.js';
import { artifacts, type Artifact } from '#db/schema.js';
import type { ArtifactType } from '@ai-debug/shared';

type InsertArtifact = {
  threadId: string;
  type: ArtifactType;
  name: string;
  content: string;
  toolCallId?: string | undefined;
};

export const insertArtifact = (data: InsertArtifact): void => {
  getDb().insert(artifacts).values({
    threadId: data.threadId,
    type: data.type,
    name: data.name,
    content: data.content,
    toolCallId: data.toolCallId ?? null,
  }).run();
};

export const getArtifactsByThread = (threadId: string): Artifact[] =>
  getDb().select().from(artifacts).where(eq(artifacts.threadId, threadId)).all();
