/**
 * ArtifactRepository — data access for investigation artifacts.
 * Uses DI pattern consistent with ThreadRepository.
 */

import { eq } from 'drizzle-orm';
import { artifacts, type Artifact } from '#db/schema.js';
import type { AppDatabase } from '#db/client.js';
import type { ArtifactType } from '@ai-debug/shared';

type InsertArtifact = {
  threadId: string;
  type: ArtifactType;
  name: string;
  content: string;
  toolCallId?: string | undefined;
};

export type ArtifactRepository = {
  insert(data: InsertArtifact): void;
  findByThread(threadId: string): Artifact[];
};

export const createArtifactRepository = (db: AppDatabase): ArtifactRepository => ({
  insert(data: InsertArtifact): void {
    db.insert(artifacts).values({
      threadId: data.threadId,
      type: data.type,
      name: data.name,
      content: data.content,
      toolCallId: data.toolCallId ?? null,
    }).run();
  },

  findByThread(threadId: string): Artifact[] {
    return db.select().from(artifacts).where(eq(artifacts.threadId, threadId)).all();
  },
});
