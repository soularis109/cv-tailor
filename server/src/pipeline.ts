import { anthropic, MODEL } from "./config.js";
import {
  analyzeJobTool,
  tailorCvTool,
  type JobAnalysis,
  type TailoredCv,
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
