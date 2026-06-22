import { anthropic, MODEL } from "./config.js";
import {
  analyzeJobTool,
  tailorCvTool,
  masterCvTool,
  atsCheckTool,
  type JobAnalysis,
  type TailoredCv,
  type MasterCvData,
  type AtsCheckResult,
} from "./schemas.js";
import {
  ANALYZE_SYSTEM,
  tailorUserMessage,
  FOLLOWUP_SYSTEM,
  COVER_LETTER_SYSTEM,
  COMPANY_BRIEF_SYSTEM,
  ATS_CHECK_SYSTEM,
  atsCheckUserMessage,
} from "./prompts.js";
import { buildTailorSystemPrompt, type CandidateLevel } from "./prompt-builder.js";
import type Anthropic from "@anthropic-ai/sdk";

/** Pull the forced tool_use input out of a Messages response. */
function extractToolInput<T>(message: Anthropic.Messages.Message, toolName: string): T {
  const block = message.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock =>
      b.type === "tool_use" && b.name === toolName,
  );
  if (!block) {
    throw new Error(
      `Model did not call ${toolName}. Stop reason: ${message.stop_reason}.`,
    );
  }
  return block.input as T;
}

/** Step 1 — read the posting into a structured analysis. */
export async function analyzeJob(jobText: string): Promise<JobAnalysis> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    temperature: 0,
    system: ANALYZE_SYSTEM,
    tools: [analyzeJobTool],
    tool_choice: { type: "tool", name: analyzeJobTool.name },
    messages: [
      {
        role: "user",
        content: `Analyze this job posting:\n\n"""\n${jobText}\n"""`,
      },
    ],
  });
  return extractToolInput<JobAnalysis>(message, analyzeJobTool.name);
}

/** Extract structured CV data from a base64-encoded PDF. */
export async function extractCvFromPdf(pdfBase64: string): Promise<MasterCvData> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [masterCvTool],
    tool_choice: { type: "tool", name: masterCvTool.name },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          } as Anthropic.Messages.ContentBlockParam,
          { type: "text", text: "Extract all CV data from this document." },
        ],
      },
    ],
  });
  return extractToolInput<MasterCvData>(message, masterCvTool.name);
}

/** Step 2 — rewrite the master CV for the analyzed role. */
export async function tailorCv(
  masterCv: unknown,
  analysis: JobAnalysis,
  options?: { customInstructions?: string; role?: string; level?: CandidateLevel },
): Promise<TailoredCv> {
  const role = options?.role ?? "Software Engineer";
  const level = options?.level ?? "middle";
  const systemPrompt = buildTailorSystemPrompt(role, level);
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    temperature: 0.3,
    system: systemPrompt,
    tools: [tailorCvTool],
    tool_choice: { type: "tool", name: tailorCvTool.name },
    messages: [
      { role: "user", content: tailorUserMessage(masterCv, analysis, options?.customInstructions) },
    ],
  });
  return extractToolInput<TailoredCv>(message, tailorCvTool.name);
}

export async function generateFollowupEmail(
  application: { company: string; role: string; dateAdded: string },
  data: { tailored: { headline: string; coverage: Array<{ requirement: string; status: string }> } },
  candidateName: string,
  daysWaited: number
): Promise<string> {
  const strengths = data.tailored.coverage
    .filter((c) => c.status === "strong")
    .slice(0, 3)
    .map((c) => c.requirement)
    .join(", ");

  const userMessage = `Company: ${application.company}
Role: ${application.role}
Days since applying: ${daysWaited}
My headline: ${data.tailored.headline}
Key strengths for this role: ${strengths || "strong technical background"}
My name: ${candidateName}`.trim();

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: FOLLOWUP_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text.trim();
}

export async function generateCoverLetter(
  masterCv: { name: string; email?: string; phone?: string },
  application: { company: string; role: string },
  analysis: { must_have: string[]; seniority: string },
  tailored: { headline: string; summary: string; coverage: Array<{ requirement: string; status: string }> }
): Promise<string> {
  const strengths = tailored.coverage
    .filter((c) => c.status === "strong")
    .slice(0, 5)
    .map((c) => c.requirement)
    .join("\n- ");

  const userMessage = `
Name: ${masterCv.name}
Email: ${masterCv.email ?? ""}
Company: ${application.company}
Role: ${application.role}
Seniority: ${analysis.seniority}
My headline: ${tailored.headline}
My summary: ${tailored.summary}
Key requirements I strongly match:
- ${strengths}
Top must-have requirements for the role:
- ${analysis.must_have.slice(0, 5).join("\n- ")}
  `.trim();

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: COVER_LETTER_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text.trim();
}

/** Run ATS compatibility check on a tailored CV against the job's keywords. */
export async function runAtsCheck(
  analysis: JobAnalysis,
  tailored: TailoredCv,
): Promise<AtsCheckResult> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    temperature: 0,
    system: ATS_CHECK_SYSTEM,
    tools: [atsCheckTool],
    tool_choice: { type: "tool", name: atsCheckTool.name },
    messages: [
      {
        role: "user",
        content: atsCheckUserMessage(analysis, tailored),
      },
    ],
  });
  return extractToolInput<AtsCheckResult>(message, atsCheckTool.name);
}

export async function generateCompanyBrief(
  companyName: string,
  pageContent: string
): Promise<string> {
  const truncated = pageContent.slice(0, 8_000);
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    system: COMPANY_BRIEF_SYSTEM,
    messages: [{
      role: "user",
      content: `Company: ${companyName}\n\nWebsite/job page content:\n${truncated}`,
    }],
  });
  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected");
  return block.text.trim();
}
