import type { AiClassificationValidationResult } from "./aiClassificationTypes";
import { validateAiClassificationSuggestion } from "./aiClassificationValidator";
import {
  testOllamaConnection,
  type OllamaConnectionTest,
  type TestOllamaConnectionOptions
} from "./ollamaClient";
import {
  aiFailure,
  createUpdatedAiSettingsAfterTest,
  getAiSettingsPath,
  loadAiSettings,
  writeAiSettings,
  type AiSettings,
  type AiSettingsResult,
  type AiStatus
} from "./ollamaSettings";

export interface OllamaProviderPreparation {
  provider: "ollama";
  enabled: boolean;
  baseUrl: string;
  model: string;
  validateOutput: (value: unknown) => AiClassificationValidationResult;
}

export interface AiConnectionTestStatus extends AiStatus {
  connection: OllamaConnectionTest | null;
}

export function prepareOllamaProvider(settings: AiSettings): OllamaProviderPreparation {
  return {
    provider: "ollama",
    enabled: settings.enabled,
    baseUrl: settings.baseUrl,
    model: settings.model,
    validateOutput: validateAiClassificationSuggestion
  };
}

export async function testAiConnection(
  userDataPath: string,
  options: TestOllamaConnectionOptions = {}
): Promise<AiSettingsResult<AiConnectionTestStatus>> {
  const settingsResult = await loadAiSettings(userDataPath);
  if (!settingsResult.ok) {
    return settingsResult;
  }

  const settings = settingsResult.value;
  if (!settings.enabled) {
    return aiFailure("AI_PROVIDER_DISABLED", "IA locale désactivée.");
  }

  const connection = await testOllamaConnection(settings, options);
  if (!connection.ok) {
    const testedAt = (options.now ?? (() => new Date()))().toISOString();
    const failedSettings = createUpdatedAiSettingsAfterTest(settings, {
      status: connection.error.code === "AI_CONNECTION_TIMEOUT" ? "timeout" : "error",
      testedAt,
      errorMessage: connection.error.message
    });
    await writeAiSettings(userDataPath, failedSettings);
    return connection;
  }

  const updatedSettings = createUpdatedAiSettingsAfterTest(settings, {
    status: connection.value.status,
    testedAt: connection.value.testedAt,
    errorMessage: connection.value.status === "model-missing" ? connection.value.message : null
  });
  const writeResult = await writeAiSettings(userDataPath, updatedSettings);
  if (!writeResult.ok) {
    return writeResult;
  }

  return {
    ok: true,
    value: {
      settingsPath: getAiSettingsPath(userDataPath),
      settings: updatedSettings,
      status: updatedSettings.lastStatus ?? "error",
      message: connection.value.message,
      error: updatedSettings.lastError
        ? {
            code: "AI_MODEL_NOT_FOUND",
            message: updatedSettings.lastError
          }
        : null,
      connection: connection.value
    }
  };
}
