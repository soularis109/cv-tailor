import { anthropic, MODEL } from "./config.js";
import {
  analyzeJobTool,
  tailorCvTool,
  masterCvTool,
  type JobAnalysis,
  type TailoredCv,
  type MasterCvData,
} from "./schemas.js";
import { ANALYZE_SYSTEM, TAILOR_SYSTEM, tailorUserMessage } from "./prompts.js";
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
): Promise<TailoredCv> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    temperature: 0.3,
    system: TAILOR_SYSTEM,
    tools: [tailorCvTool],
    tool_choice: { type: "tool", name: tailorCvTool.name },
    messages: [
      { role: "user", content: tailorUserMessage(masterCv, analysis) },
    ],
  });
  return extractToolInput<TailoredCv>(message, tailorCvTool.name);
}
