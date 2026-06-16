import {
  type AiClassificationInput,
  type AiClassificationOrchestratorResult,
  type AiClassificationProvider
} from "./aiClassificationTypes";
import {
  boundAiClassificationInput,
  validateAiClassificationSuggestion
} from "./aiClassificationValidator";
import { simulatedAiClassificationProvider } from "./simulatedAiClassificationProvider";

export async function buildAiClassificationSuggestion(
  input: AiClassificationInput,
  provider: AiClassificationProvider = simulatedAiClassificationProvider
): Promise<AiClassificationOrchestratorResult> {
  const boundedInput = boundAiClassificationInput(input);

  let rawSuggestion: unknown;
  try {
    rawSuggestion = await provider(boundedInput);
  } catch {
    return {
      status: "invalid",
      input: boundedInput,
      error: {
        code: "AI_PROVIDER_FAILED",
        message: "Provider IA indisponible."
      }
    };
  }

  const validation = validateAiClassificationSuggestion(rawSuggestion);
  if (validation.status === "invalid") {
    return {
      status: "invalid",
      input: boundedInput,
      error: validation.error
    };
  }

  return {
    status: "ready",
    input: boundedInput,
    suggestion: validation.suggestion
  };
}
