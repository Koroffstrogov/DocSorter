export type AiModelProfileId =
  | "gemma3-4b"
  | "gemma4-12b-nothink"
  | "gemma4-12b-thinking"
  | "gemma4-e4b";

export interface AiModelProfile {
  id: AiModelProfileId;
  label: string;
  model: string;
  think: boolean;
  exposed: boolean;
}

export const DEFAULT_AI_MODEL_PROFILE_ID: AiModelProfileId = "gemma3-4b";

const AI_MODEL_PROFILES: AiModelProfile[] = [
  {
    id: "gemma3-4b",
    label: "gemma3:4b",
    model: "gemma3:4b",
    think: false,
    exposed: true
  },
  {
    id: "gemma4-12b-nothink",
    label: "gemma4:12b no-think",
    model: "gemma4:12b",
    think: false,
    exposed: true
  },
  {
    id: "gemma4-12b-thinking",
    label: "gemma4:12b thinking",
    model: "gemma4:12b",
    think: true,
    exposed: true
  },
  {
    id: "gemma4-e4b",
    label: "gemma4:e4b",
    model: "gemma4:e4b",
    think: false,
    exposed: false
  }
];

export function getAiModelProfile(profileId: string | null | undefined): AiModelProfile {
  return AI_MODEL_PROFILES.find((profile) => profile.id === profileId) ??
    AI_MODEL_PROFILES.find((profile) => profile.id === DEFAULT_AI_MODEL_PROFILE_ID)!;
}

export function getExposedAiModelProfiles(): AiModelProfile[] {
  return AI_MODEL_PROFILES.filter((profile) => profile.exposed);
}

export function inferAiModelProfileId(model: string | null | undefined, think: boolean): AiModelProfileId {
  const normalizedModel = (model ?? "").trim().toLowerCase();
  const match = AI_MODEL_PROFILES.find(
    (profile) => profile.model.toLowerCase() === normalizedModel && profile.think === think
  );

  return match?.id ?? DEFAULT_AI_MODEL_PROFILE_ID;
}
