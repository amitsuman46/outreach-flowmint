/**
 * OpenAI calls for the desk. Every call returns JSON that matches a strict schema,
 * using the Responses API with structured outputs.
 */

export class AiNotConfiguredError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not set");
    this.name = "AiNotConfiguredError";
  }
}

function apiKey(): string {
  // OPEN_AI_API_KEY is accepted too, since that is how it was first added to .env.
  const key = (process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY || "").trim();
  if (!key) throw new AiNotConfiguredError();
  return key;
}

export function aiReady(): boolean {
  return Boolean((process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY || "").trim());
}

/** Fit checks and site reviews. */
function workModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";
}

/** Anything the lead reads: the email, the proposal, the concept page copy. */
function writingModel(): string {
  return process.env.OPENAI_WRITING_MODEL?.trim() || "gpt-5.4";
}

export interface JsonSchema {
  name: string;
  schema: Record<string, unknown>;
}

class OpenAiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OpenAiError";
  }
}

type ResponseBody = {
  status?: string;
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{ type: string; content?: Array<{ type: string; text?: string; refusal?: string }> }>;
};

export async function generateObject<T>(options: {
  system: string;
  prompt: string;
  schema: JsonSchema;
  imagePng?: Buffer;
  /** Use the stronger writing model, for text the lead will read. */
  writing?: boolean;
}): Promise<T> {
  const key = apiKey();
  const content: Array<Record<string, string>> = [{ type: "input_text", text: options.prompt }];
  if (options.imagePng) {
    content.push({ type: "input_image", image_url: `data:image/png;base64,${options.imagePng.toString("base64")}` });
  }
  const body = JSON.stringify({
    model: options.writing ? writingModel() : workModel(),
    instructions: options.system,
    input: [{ role: "user", content }],
    reasoning: { effort: options.writing ? "medium" : "low" },
    text: {
      format: { type: "json_schema", name: options.schema.name, strict: true, schema: options.schema.schema },
    },
  });

  let lastError: unknown;
  const waits = [2_000, 5_000, 12_000, 25_000];
  for (let attempt = 0; attempt <= waits.length; attempt += 1) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(120_000),
      });
      const data = (await response.json().catch(() => ({}))) as ResponseBody;
      if (!response.ok) {
        throw new OpenAiError(`OpenAI ${response.status}: ${data.error?.message ?? response.statusText}`, response.status);
      }
      const parts = data.output?.find((item) => item.type === "message")?.content ?? [];
      const refusal = parts.find((part) => part.type === "refusal")?.refusal;
      if (refusal) throw new OpenAiError(`The model declined: ${refusal}`, 400);
      const text = parts.find((part) => part.type === "output_text")?.text;
      if (!text || data.status === "incomplete") {
        throw new OpenAiError(
          `The model returned no answer${data.incomplete_details?.reason ? ` (${data.incomplete_details.reason})` : ""}.`,
          502,
        );
      }
      return JSON.parse(text) as T;
    } catch (error) {
      lastError = error;
      const status = error instanceof OpenAiError ? error.status : 0;
      // Rate limits and overloads usually clear within half a minute, so back off rather than fail the lead.
      const retry = status === 429 || status >= 500 || status === 0;
      if (attempt < waits.length && retry) {
        await new Promise((resolve) => setTimeout(resolve, waits[attempt]));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/** Strict structured outputs need every property listed as required and no extra keys. */
function object(properties: Record<string, unknown>): Record<string, unknown> {
  return { type: "object", additionalProperties: false, properties, required: Object.keys(properties) };
}

const text = { type: "string" };
const titled = object({ title: text, text });
const list = (items: Record<string, unknown>) => ({ type: "array", items });

export const fitSchema: JsonSchema = {
  name: "fit_check",
  schema: object({ fit: { type: "boolean" }, reason: text }),
};

export const auditSchema: JsonSchema = {
  name: "site_review",
  schema: object({
    findings: list(object({ area: { type: "string", enum: ["seo", "color", "ux"] }, observation: text, suggestion: text })),
  }),
};

export const draftSchema: JsonSchema = {
  name: "email_draft",
  schema: object({ subject: text, body: text }),
};

export const proposalSchema: JsonSchema = {
  name: "website_proposal",
  schema: object({
    summary: text,
    drawbacks: list(
      object({
        area: { type: "string", enum: ["seo", "design", "ux", "mobile", "conversion", "content"] },
        title: text,
        detail: text,
        impact: text,
      }),
    ),
    improvements: list(object({ title: text, detail: text, fixes: text })),
    results: list(titled),
  }),
};

/** A practice entry for the concept template. help is limited to the template's own topic keys. */
export function practiceSchema(helpKeys: string[]): JsonSchema {
  return {
    name: "practice_entry",
    schema: object({
      name: text,
      eyebrow: text,
      heroSub: text,
      aboutTitle: text,
      aboutLead: text,
      aboutBody: text,
      location: text,
      phone: text,
      email: text,
      hours: text,
      chips: list(text),
      funding: list(text),
      feeNote: text,
      help: list({ type: "string", enum: helpKeys }),
      assessments: { type: "boolean" },
      footerTag: text,
    }),
  };
}
