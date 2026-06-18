import { anthropic, MODEL } from "./config.js";
import {
  analyzeJobTool,
  tailorCvTool,
  masterCvTool,
  type JobAnalysis,
  type TailoredCv,
  type MasterCvData,
} from "./schemas.js";
import { ANALYZE_SYSTEM, TAILOR_SYSTEM, tailorUserMessage, FOLLOWUP_SYSTEM, COVER_LETTER_SYSTEM } from "./prompts.js";
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
  customInstructions?: string,
): Promise<TailoredCv> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    temperature: 0.3,
    system: TAILOR_SYSTEM,
    tools: [tailorCvTool],
    tool_choice: { type: "tool", name: tailorCvTool.name },
    messages: [
      { role: "user", content: tailorUserMessage(masterCv, analysis, customInstructions) },
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
