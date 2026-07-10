import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUploadAccess, apiError, json } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { retrieveEvidence, askQuestion } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ question: z.string().min(3).max(2000) });

// POST /api/uploads/[id]/ai/question
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;
  if (!canWrite(access.user.role)) {
    return apiError("Viewers have read-only access and cannot ask AI questions.", 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("Question must be 3-2000 characters", 422);

  // Pull indexed content for retrieval (evidence is redacted inside askQuestion).
  const files = await prisma.extractedFile.findMany({
    where: { uploadId: id, indexed: true },
    select: { path: true, content: true },
  });

  const evidence = retrieveEvidence(parsed.data.question, files);
  const result = await askQuestion(parsed.data.question, evidence, {
    // Reports/AI redact secrets always; IP/FQDN follow upload preference (default off here).
  });

  const conversation = await prisma.aIConversation.create({
    data: {
      uploadId: id,
      userId: access.user.id,
      question: parsed.data.question,
      answer: result.answer,
      evidenceJson: result.evidence as object,
    },
  });

  return json({
    id: conversation.id,
    answer: result.answer,
    evidence: result.evidence,
    noEvidence: result.noEvidence,
  });
}
