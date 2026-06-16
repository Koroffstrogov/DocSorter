async function refreshAiStatus(): Promise<void> {
  const requestId = ++aiRequestId;
  state.ai = {
    ...state.ai,
    panelStatus: "loading",
    message: "Chargement de la configuration IA locale...",
    error: null
  };
  renderAiPanel();

  const result = await window.docSorter.getAiStatus();
  if (requestId !== aiRequestId) {
    return;
  }

  if (!result.ok) {
    applyAiError(result.error as RendererAiError);
    return;
  }

  applyAiStatus(result.value as RendererAiStatus);
}

async function saveAiSettingsFromPanel(): Promise<void> {
  if (isAiBusy()) {
    return;
  }

  const settings = aiDraftToSettings(state.ai.draft);
  if (!settings) {
    applyAiError({
      code: "AI_CONFIG_INVALID",
      message: "Configuration IA locale incomplète ou invalide."
    });
    return;
  }

  const requestId = ++aiRequestId;
  state.ai = {
    ...state.ai,
    panelStatus: "saving",
    message: "Sauvegarde de la configuration IA locale...",
    error: null
  };
  renderAiPanel();

  const result = await window.docSorter.saveAiSettings(settings);
  if (requestId !== aiRequestId) {
    return;
  }

  if (!result.ok) {
    applyAiError(result.error as RendererAiError);
    return;
  }

  applyAiStatus(result.value as RendererAiStatus);
}

async function testAiConnectionFromPanel(): Promise<void> {
  if (isAiBusy() || state.ai.dirty) {
    return;
  }

  const requestId = ++aiRequestId;
  state.ai = {
    ...state.ai,
    panelStatus: "testing",
    message: "Test local d'Ollama sans envoi de document...",
    error: null
  };
  renderAiPanel();

  const result = await window.docSorter.testAiConnection();
  if (requestId !== aiRequestId) {
    return;
  }

  if (!result.ok) {
    applyAiError(result.error as RendererAiError);
    void refreshAiStatus();
    return;
  }

  applyAiStatus(result.value as RendererAiStatus);
}

function updateAiDraft(draft: AiSettingsDraft): void {
  state.ai = {
    ...state.ai,
    draft,
    dirty: true,
    panelStatus: "ready",
    message: "Configuration IA modifiée. Sauvegardez avant de tester Ollama.",
    error: null
  };
  renderAiPanel();
}

function renderAiPanel(): void {
  aiPanel.render();
}

function applyAiStatus(status: RendererAiStatus): void {
  state.ai = {
    panelStatus: "ready",
    status,
    draft: aiStatusToDraft(status),
    message: status.message,
    error: status.error,
    dirty: false
  };
  render();
}

function applyAiError(error: RendererAiError): void {
  state.ai = {
    ...state.ai,
    panelStatus: "error",
    message: error.message,
    error
  };
  render();
}

function aiStatusToDraft(status: RendererAiStatus): AiSettingsDraft {
  return {
    enabled: status.settings.enabled,
    baseUrl: status.settings.baseUrl || "http://localhost:11434/",
    model: status.settings.model,
    timeoutMs: String(status.settings.timeoutMs || 30000)
  };
}

function aiDraftToSettings(draft: AiSettingsDraft): RendererAiSettings | null {
  const timeoutMs = Number(draft.timeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    return null;
  }

  return {
    enabled: draft.enabled,
    provider: "ollama",
    baseUrl: draft.baseUrl.trim(),
    model: draft.model.trim(),
    timeoutMs,
    lastTestAt: null,
    lastStatus: draft.enabled ? null : "disabled",
    lastError: null
  };
}

function isAiBusy(): boolean {
  return (
    state.ai.panelStatus === "loading" ||
    state.ai.panelStatus === "saving" ||
    state.ai.panelStatus === "testing" ||
    isClassificationBusy()
  );
}
