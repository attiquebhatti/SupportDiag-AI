import "server-only";
import OpenAI from "openai";
import { config } from "./config";
import { redactText, type RedactionOptions } from "./redaction";

export interface EvidenceChunk {
  filePath: string;
  snippet: string;
  score: number;
}

export interface AIAnswer {
  answer: string;
  evidence: EvidenceChunk[];
  raw: string;
  noEvidence: boolean;
}

const NO_EVIDENCE_MESSAGE =
  "I could not find evidence for this in the uploaded support file.";

const SYSTEM_PROMPT = `You are FirewallLens AI, an independent assistant that analyzes Palo Alto Networks PAN-OS tech support files.

STRICT RULES:
- Answer ONLY from the provided EVIDENCE. Never use outside knowledge to state facts about this device.
- Never hallucinate. If the evidence does not contain the answer, reply exactly: "${NO_EVIDENCE_MESSAGE}"
- You are NOT Palo Alto Networks TAC. Never claim official TAC confirmation.
- Clearly separate facts (from evidence) from assumptions (label assumptions explicitly).

You MUST format every answer exactly as:

Answer:
[Direct answer]

Evidence:
- [Evidence snippet with file path]

Interpretation:
[Explain what it means]

Recommended Next Steps:
1. Step one
2. Step two
3. Step three

Confidence:
High / Medium / Low

Missing Information:
[Only include this section when relevant information is absent from the evidence]`;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: config.ai.apiKey,
      baseURL: config.ai.baseUrl,
    });
  }
  return client;
}

export function aiEnabled(): boolean {
  return config.ai.enabled && !!config.ai.apiKey;
}

/**
 * Simple keyword-overlap retrieval over indexed file contents. Returns the
 * best-matching line windows as evidence chunks. Runs entirely locally — no
 * data leaves the server here.
 */
export function retrieveEvidence(
  question: string,
  files: Array<{ path: string; content: string | null }>,
  maxChunks = 6
): EvidenceChunk[] {
  const terms = Array.from(
    new Set(
      question
        .toLowerCase()
        .replace(/[^a-z0-9./:_-]+/g, " ")
        .split(" ")
        .filter((t) => t.length >= 3)
    )
  );
  if (terms.length === 0) return [];

  const chunks: EvidenceChunk[] = [];
  for (const file of files) {
    if (!file.content) continue;
    const lines = file.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      let score = 0;
      for (const t of terms) if (line.includes(t)) score++;
      if (score > 0) {
        const start = Math.max(0, i - 1);
        const end = Math.min(lines.length, i + 2);
        chunks.push({
          filePath: file.path,
          snippet: lines.slice(start, end).join("\n").trim().slice(0, 600),
          score,
        });
      }
    }
  }

  chunks.sort((a, b) => b.score - a.score);
  // De-duplicate near-identical snippets and cap the result.
  const seen = new Set<string>();
  const result: EvidenceChunk[] = [];
  for (const c of chunks) {
    const key = `${c.filePath}:${c.snippet.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(c);
    if (result.length >= maxChunks) break;
  }
  return result;
}

/** Ask a question grounded in the retrieved evidence. */
export async function askQuestion(
  question: string,
  evidence: EvidenceChunk[],
  redaction: RedactionOptions = {}
): Promise<AIAnswer> {
  if (evidence.length === 0) {
    return {
      answer: `Answer:\n${NO_EVIDENCE_MESSAGE}\n\nConfidence:\nHigh`,
      evidence: [],
      raw: NO_EVIDENCE_MESSAGE,
      noEvidence: true,
    };
  }

  // Redact evidence before it leaves the server.
  const redactedEvidence = evidence.map((e) => ({
    ...e,
    snippet: redactText(e.snippet, redaction),
  }));

  const evidenceBlock = redactedEvidence
    .map((e, i) => `[${i + 1}] (${e.filePath})\n${e.snippet}`)
    .join("\n\n");

  if (!aiEnabled()) {
    // AI-disabled mode: return the evidence deterministically without an LLM.
    const answer = [
      "Answer:",
      "AI answering is disabled on this deployment. The most relevant evidence is shown below for manual review.",
      "",
      "Evidence:",
      ...redactedEvidence.map((e) => `- (${e.filePath}) ${e.snippet.split("\n")[0]}`),
      "",
      "Interpretation:",
      "Enable AI (ENABLE_AI=true with an OpenAI-compatible key) for an evidence-grounded interpretation.",
      "",
      "Confidence:",
      "Low",
    ].join("\n");
    return { answer, evidence: redactedEvidence, raw: answer, noEvidence: false };
  }

  const completion = await getClient().chat.completions.create({
    model: config.ai.model,
    temperature: 0.1,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `QUESTION:\n${question}\n\nEVIDENCE (only source of truth):\n${evidenceBlock}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? NO_EVIDENCE_MESSAGE;
  return {
    answer: raw,
    evidence: redactedEvidence,
    raw,
    noEvidence: raw.includes(NO_EVIDENCE_MESSAGE),
  };
}

/** Generate a short evidence-based executive summary for the overview page. */
export async function generateSummary(
  deviceLine: string,
  findingsLines: string[],
  redaction: RedactionOptions = {}
): Promise<string> {
  const fallback = `${deviceLine}. ${findingsLines.length} finding(s) detected. Review the findings dashboard for prioritized issues.`;
  if (!aiEnabled()) return fallback;

  const context = redactText(
    `DEVICE: ${deviceLine}\nFINDINGS:\n${findingsLines.join("\n")}`,
    redaction
  );
  try {
    const completion = await getClient().chat.completions.create({
      model: config.ai.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are FirewallLens AI. Write a concise, factual 2-4 sentence executive summary of a PAN-OS firewall's health based ONLY on the supplied device info and findings. Do not invent issues. Do not claim TAC confirmation.",
        },
        { role: "user", content: context },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() || fallback;
  } catch {
    return fallback;
  }
}
