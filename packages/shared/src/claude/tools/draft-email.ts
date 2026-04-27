/**
 * Tool-use schema for the consolidated email-draft prompt
 * (CONSOLIDATE of v1 prompts #12 + #18 + #24 per PORT-MANIFEST).
 *
 * Single tool schema covers all three trigger variants
 * (`post_pipeline | on_demand | post_sale_outreach`); the trigger choice
 * is set by the caller via the prompt's `${triggerSection}` interpolation,
 * not by the model's tool input.
 *
 * Voice/generative task — exempt from 04C Principle 6's reasoning-first
 * requirement (mirrors 07-give-back's exemption). No `reasoning_trace`
 * field; the drafted email itself is the surface the rep evaluates.
 */

export const draftEmailTool = {
  name: "draft_email",
  description:
    "Draft an email in the rep's voice grounded in the trigger-specific input context.",
  input_schema: {
    type: "object" as const,
    properties: {
      subject: {
        type: "string" as const,
        description:
          "Subject line. Concrete, not generic. References the specific situation when possible.",
      },
      body: {
        type: "string" as const,
        description:
          "Full email body. 3-8 sentences for post_pipeline; 4-6 for on_demand; 3-4 paragraphs for post_sale_outreach. Use \\n for line breaks. Ends with the rep's first name only.",
      },
      recipient: {
        type: "string" as const,
        description:
          "Recipient name + title (e.g. 'Dr. Michael Chen, CMIO'). For post_sale_outreach, follow that trigger's own recipient discipline.",
      },
      notes_for_rep: {
        type: "string" as const,
        description:
          "One sentence — why you wrote it this way or what the rep should adjust before sending.",
      },
      attached_resources: {
        type: ["array", "null"] as const,
        items: {
          type: "object" as const,
          properties: {
            title: { type: "string" as const },
            type: {
              type: "string" as const,
              description: "e.g. 'doc', 'case-study', 'datasheet'",
            },
          },
          required: ["title", "type"],
        },
        description:
          "Resources the rep should attach. Only meaningful for post_pipeline + on_demand. Null when no attachments make sense.",
      },
    },
    required: ["subject", "body", "recipient", "notes_for_rep"],
  },
} as const;

export type EmailTrigger = "post_pipeline" | "on_demand" | "post_sale_outreach";

export interface DraftEmailAttachment {
  title: string;
  type: string;
}

export interface DraftEmailOutput {
  subject: string;
  body: string;
  recipient: string;
  notes_for_rep: string;
  attached_resources?: DraftEmailAttachment[] | null;
}
