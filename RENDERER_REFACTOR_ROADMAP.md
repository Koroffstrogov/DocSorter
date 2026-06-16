# Renderer Refactor Roadmap

Etat mesure le 2026-06-16 apres R1/R2.

Objectif : ramener chaque fichier TypeScript sous 600 lignes de code non vides,
sans changer le comportement utilisateur et sans introduire de bundling renderer.

## Mesure actuelle

Commande de mesure :

```powershell
$files = Get-ChildItem -Path src -Recurse -File -Include *.ts
$files | ForEach-Object {
  $content = Get-Content -LiteralPath $_.FullName
  [PSCustomObject]@{
    Path = $_.FullName.Substring((Get-Location).Path.Length + 1)
    NonBlankLines = ($content | Where-Object { $_.Trim().Length -gt 0 }).Count
  }
} | Sort-Object NonBlankLines -Descending
```

Fichiers a traiter ou surveiller :

| Fichier | Lignes totales | Lignes non vides | Etat |
| --- | ---: | ---: | --- |
| `src/renderer/renderer.ts` | 3630 | 3126 | A decouper en priorite |
| `src/rules/namingSuggestions.ts` | 829 | 715 | A decouper apres le renderer |
| `src/main/ipcHandlers.ts` | 630 | 584 | Sous le seuil hors whitespace, a surveiller |
| `src/file-ops/classifyFile.ts` | 620 | 568 | Sous le seuil hors whitespace, a surveiller |
| `src/renderer/queuePanel.ts` | 402 | 344 | OK |
| `src/renderer/duplicatePanel.ts` | 205 | 172 | OK |

## Etat de `renderer.ts`

`renderer.ts` reste le coordinateur principal de l'interface, mais concentre
encore trop de responsabilites :

- types renderer, etat global, create/reset state ;
- bootstrap DOM et binding des evenements ;
- coordination IPC source/cible/refresh ;
- selection de document et chargement preview ;
- rendu preview PDF/image et controles zoom/pages ;
- panneau details document ;
- extraction texte PDF et panneau texte extrait ;
- suggestions locales et panneau suggestions ;
- panneau regles utilisateur et formulaire minimal ;
- renommage propose ;
- controle destination ;
- simulation, classement reel, annulation ;
- historique recent ;
- raccourcis clavier et helpers transverses.

Deja extrait :

- `src/documents/documentQueueView.ts` : logique pure recherche/filtre/tri/navigation ;
- `src/renderer/queuePanel.ts` : DOM et interactions de la file ;
- `src/renderer/duplicatePanel.ts` : DOM et interactions du panneau doublons ;
- `src/renderer/keyboardShortcuts.ts` : resolution pure des raccourcis.

## Regles de refactor

- Garder le modele actuel de scripts globaux dans `index.html`.
- Ne pas ajouter `import` / `export` runtime dans les scripts renderer charges par le navigateur.
- Verifier apres chaque lot que le JS compile ne contient pas `exports`, `Object.defineProperty` ou `require(`.
- Injecter les dependances par callbacks et `getState()`, comme `queuePanel` et `duplicatePanel`.
- Garder `renderer.ts` coordinateur tant que possible : IPC, decisions de flux, mutations d'etat global.
- Extraire d'abord le rendu DOM et les helpers UI, puis seulement ensuite les petits controleurs.
- Chaque nouveau fichier doit viser 450 lignes non vides maximum pour garder une marge.
- Aucun lot de refactor ne doit modifier IPC, preload, main process, file-ops, journal ou CSS sauf besoin explicite.

## Lots recommandes

### R3 - Extraire l'historique recent

Creer `src/renderer/historyPanel.ts`.

Deplacer :

- `renderHistory`;
- `createHistoryItem`;
- `historyEntryTitle`;
- `historyNamesLabel`;
- `historyActionLabel`;
- `historyStatusLabel`.

Garder dans `renderer.ts` :

- `refreshRecentHistory`;
- appel IPC `getRecentHistory`;
- etat `state.history`;
- action `undoLastClassificationAction`.

Interface cible :

```ts
DocSorterHistoryPanel.createHistoryPanel({
  getState,
  formatDate
}).render()
```

Gain estime : 80 a 120 lignes non vides.

### R4 - Extraire le panneau texte PDF

Creer `src/renderer/textExtractionPanel.ts`.

Deplacer :

- `renderTextExtractionPanel`;
- `createTextExtractionMeta`;
- `createTextExtractionExcerpt`;
- `createTextExtractionLimitNoticeNodes`;
- `textExtractionQueueLabel` si le module expose aussi un helper de label.

Garder dans `renderer.ts` :

- `extractTextFromActivePdf`;
- appel IPC `extractTextFromActivePdf`;
- state `textExtraction`;
- `canExtractTextFromActivePdf` si utilise par `renderControls`.

Interface cible :

```ts
DocSorterTextExtractionPanel.createTextExtractionPanel({
  getState,
  canExtract,
  onExtract,
  formatDate
})
```

Gain estime : 120 a 180 lignes non vides.

### R5 - Extraire le panneau suggestions locales

Creer `src/renderer/namingSuggestionsPanel.ts`.

Deplacer :

- `renderNamingSuggestionsPanel`;
- `createNamingSuggestionsSummary`;
- `createSuggestionGrid`;
- `createSuggestionRow`;
- `createKeywordsSuggestion`;
- `formatSuggestionConfidence`;
- `suggestionSourceLabel`;
- helpers UI associes.

Garder dans `renderer.ts` :

- `analyzeNamingSuggestionsForActiveDocument`;
- `applyNamingSuggestionsToEmptyFields`;
- mutations des champs de renommage ;
- state `namingSuggestions`.

Gain estime : 180 a 260 lignes non vides.

### R6 - Extraire l'aperçu PDF/image

Creer `src/renderer/previewPanel.ts`.

Deplacer :

- rendu preview ;
- controles zoom/pages/rotation ;
- `renderPdfPage`;
- `updatePreviewZoom`;
- `clearPreviewResources`;
- `clampPreviewZoom`;
- `previewErrorMessage`.

Garder dans `renderer.ts` au premier passage :

- `loadActivePreview`;
- appel IPC `getPreviewData`;
- decision de marquer un document indisponible.

Interface cible :

```ts
DocSorterPreviewPanel.createPreviewPanel({
  getState,
  setPreviewState,
  nextPdfRenderRequestId,
  imagePreview: window.docSorterImagePreview,
  pdfPreview: window.docSorterPdfPreview
})
```

Risque : plus eleve que R3-R5, car ce panneau gere des ressources canvas/blob,
des requetes asynchrones et des IDs de rendu.

Gain estime : 250 a 350 lignes non vides.

### R7 - Extraire le document actif

Creer `src/renderer/documentDetailsPanel.ts`.

Deplacer :

- `renderDetails` pour la partie details document ;
- `createDetailRow`;
- coordination locale d'affichage des panneaux enfants si possible.

Garder dans `renderer.ts` :

- orchestration globale `render`;
- selection et chargement du document actif.

Gain estime : 60 a 100 lignes non vides.

### R8 - Extraire renommage et controle destination

Creer deux modules plutot qu'un seul gros fichier :

- `src/renderer/namingPanel.ts`;
- `src/renderer/destinationCheckPanel.ts`.

Deplacer dans `namingPanel.ts` :

- rendu du formulaire de renommage ;
- synchronisation des inputs ;
- rendu messages de nommage.

Deplacer dans `destinationCheckPanel.ts` :

- `renderDestinationCheck`;
- `destinationErrorLabel`;
- rendu cible / chemin final / alternative.

Garder dans `renderer.ts` :

- appels IPC `createInitialNamingDraft`, `buildNamingProposal`, `checkDestinationAvailability`;
- debouncing `scheduleDestinationCheck`;
- mutations `state.naming` et `state.destination`.

Gain estime : 300 a 450 lignes non vides.

### R9 - Extraire classification et historique d'action

Creer `src/renderer/classificationPanel.ts`.

Deplacer :

- `renderClassificationSummary`;
- rendu details/checks/messages ;
- `classificationCheckStatusLabel`;
- `journalWarningQueueMessage`;
- helpers UI classification.

Garder dans `renderer.ts` :

- `prepareClassificationSimulation`;
- `executeClassificationAction`;
- `undoLastClassificationAction`;
- `refreshLastUndoableAction`;
- `applySuccessfulClassification`.

Gain estime : 250 a 350 lignes non vides.

### R10 - Extraire regles utilisateur

Creer deux modules pour rester sous 600 lignes :

- `src/renderer/rulesPanel.ts` pour rendu statut, liste et boutons ;
- `src/renderer/userRuleFormPanel.ts` pour formulaire, sync inputs et edition.

Garder dans `renderer.ts` :

- appels IPC `getRulesStatus`, `saveUserRulesCatalog`, `reloadNamingRules`;
- decisions de reset des suggestions ;
- state `namingRules`.

Gain estime : 500 a 700 lignes non vides, probablement le plus gros gain apres l'aperçu.

### R11 - Extraire types et etat initial

Creer :

- `src/renderer/rendererTypes.d.ts` pour les interfaces/types globaux renderer ;
- `src/renderer/rendererState.ts` pour factories d'etat initial/reset, exposees via `DocSorterRendererState`.

Garder dans `renderer.ts` :

- l'instance `state`;
- les fonctions de haut niveau qui mutent l'etat.

Raison : cette etape rend possible le passage final de `renderer.ts` sous 600 lignes.

Gain estime : 400 a 550 lignes non vides.

## Cible finale

Structure visee :

| Fichier | Cible non vide |
| --- | ---: |
| `src/renderer/renderer.ts` | 450-580 |
| `src/renderer/rendererTypes.d.ts` | 250-400 |
| `src/renderer/rendererState.ts` | 180-260 |
| `src/renderer/previewPanel.ts` | 300-450 |
| `src/renderer/namingPanel.ts` | 250-400 |
| `src/renderer/destinationCheckPanel.ts` | 180-300 |
| `src/renderer/classificationPanel.ts` | 250-400 |
| `src/renderer/rulesPanel.ts` | 250-400 |
| `src/renderer/userRuleFormPanel.ts` | 250-450 |
| `src/renderer/textExtractionPanel.ts` | 180-300 |
| `src/renderer/namingSuggestionsPanel.ts` | 250-400 |
| `src/renderer/historyPanel.ts` | 120-220 |
| `src/renderer/documentDetailsPanel.ts` | 120-220 |
| `src/renderer/queuePanel.ts` | 344 actuel, OK |
| `src/renderer/duplicatePanel.ts` | 172 actuel, OK |

Avec cette sequence, chaque fichier renderer peut rester sous 600 lignes non vides.

## Validation obligatoire a chaque lot

```bash
npm run typecheck
npm test
npm run build
npm run dev
git diff --check
```

Controle supplementaire pour chaque nouveau script renderer :

```powershell
rg -n "exports|Object\\.defineProperty|require\\(" dist\\renderer\\NOUVEAU_FICHIER.js
```

Le resultat attendu est vide.

## Autres fichiers hors renderer

`src/rules/namingSuggestions.ts` depasse aussi le seuil avec environ 715 lignes non vides.
Le traiter apres la stabilisation du renderer :

- extraire scoring/date/keywords dans des modules purs ;
- garder l'API publique `DocSorterNamingSuggestions` compatible ;
- conserver les tests existants et ajouter des tests sur les modules purs si necessaire.

`src/main/ipcHandlers.ts` et `src/file-ops/classifyFile.ts` sont sous 600 lignes non vides
mais proches du seuil. Eviter d'y ajouter de nouvelles responsabilites sans extraction.
