import { z, type ZodTypeAny } from 'zod';

// Mirror of agent/triage_agent output. Add one entry per agent: { appName (ADK folder name), schema }.
export const TriageResult = z
  .object({
    status: z.enum(['ok', 'needs_info', 'out_of_scope']),
    category: z.enum(['network', 'access_identity', 'application', 'infrastructure', 'security', 'data', 'hardware', 'other']).optional(),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
    summary: z.string().min(1).max(400),
    suggested_team: z.string().min(1).max(80).optional(),
    next_steps: z.array(z.string().min(1).max(200)).max(5),
    missing_info: z.array(z.string().min(1).max(200)).max(5),
    evidence: z.array(z.object({ source: z.string().min(1).max(80), detail: z.string().min(1).max(300) }).strict()).max(8),
    confidence: z.number().min(0).max(1),
    reason: z.string().max(200).optional()
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status !== 'ok') return;
    for (const f of ['category', 'severity', 'suggested_team'] as const) {
      if (v[f] === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [f], message: `${f} is required when status is "ok"` });
    }
  });

export interface AgentSpec { appName: string; schema: ZodTypeAny }

export const agents: Record<string, AgentSpec> = {
  triage: { appName: 'triage_agent', schema: TriageResult }
};
