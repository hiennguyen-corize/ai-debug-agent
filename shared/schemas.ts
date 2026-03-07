import { z } from 'zod';

/**
 * Investigation request — input to the service.
 */
export const InvestigationRequestSchema = z.object({
  url: z.string().url(),
  hint: z.string().optional(),
  mode: z.enum(['interactive', 'autonomous']).default('autonomous'),
  callbackUrl: z.string().url().optional(),
  sourcemapDir: z.string().optional(),

  config: z
    .object({
      llm: z
        .object({
          default: z
            .object({
              provider: z.string(),
              model: z.string(),
              baseURL: z.string().optional(),
              apiKey: z.string().optional(),
            })
            .partial()
            .optional(),
        })
        .partial()
        .optional(),
      agent: z
        .object({
          maxIterations: z.number().optional(),
          maxRetries: z.number().optional(),
        })
        .partial()
        .optional(),
      output: z
        .object({
          streamLevel: z.enum(['summary', 'verbose']).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type InvestigationRequest = z.infer<typeof InvestigationRequestSchema>;

export const UserMessageSchema = z.object({
  message: z.string().min(1),
});
