const form = document.querySelector<HTMLFormElement>("#rename-form");
const version = document.querySelector<HTMLElement>("#app-version");
const proposedName = document.querySelector<HTMLElement>("#proposed-name");
const warnings = document.querySelector<HTMLUListElement>("#warnings");
const statusText = document.querySelector<HTMLElement>("#status-text");

void window.docSorter.getVersion().then((value) => {
  if (version) {
    version.textContent = `v${value}`;
  }
});

form?.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  statusText?.replaceChildren("Calcul en cours");

  void window.docSorter
    .previewRename({
      originalName: getFormValue(formData, "originalName"),
      documentDate: getFormValue(formData, "documentDate"),
      category: getFormValue(formData, "category"),
      title: getFormValue(formData, "title")
    })
    .then((draft) => {
      proposedName?.replaceChildren(draft.proposedName);
      warnings?.replaceChildren(
        ...draft.warnings.map((warning) => {
          const item = document.createElement("li");
          item.textContent = warning;
          return item;
        })
      );
      statusText?.replaceChildren(draft.changed ? "Proposition prête" : "Nom inchangé");
    })
    .catch(() => {
      statusText?.replaceChildren("Prévisualisation impossible");
    });
});

function getFormValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
