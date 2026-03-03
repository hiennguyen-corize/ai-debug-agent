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
          investigator: z
            .object({
              provider: z.string(),
              model: z.string(),
              baseURL: z.string().optional(),
              apiKey: z.string().optional(),
            })
            .partial()
            .optional(),
          explorer: z
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

/**
 * Finish investigation — output from the service.
 */
export const FinishInvestigationSchema = z.object({
  rootCause: z.string(),
  severity: z.enum(['critical', 'major', 'minor', 'cosmetic']),
  confidence: z.number().min(0).max(1),
  codeLocation: z
    .object({
      file: z.string(),
      line: z.number(),
      column: z.number().optional(),
      snippet: z.string().optional(),
      uiComponent: z.string().optional(),
    })
    .optional(),
  dataFlow: z.string().optional(),
  suggestedFix: z.string().optional(),
  reproSteps: z.array(z.string()),
  assumptions: z.array(z.string()).default([]),
});

export type FinishInvestigation = z.infer<typeof FinishInvestigationSchema>;
