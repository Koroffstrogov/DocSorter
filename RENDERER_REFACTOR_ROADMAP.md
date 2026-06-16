# Renderer Refactor State

Etat mesure le 2026-06-16 apres refactor R1 a R11 et extraction des flux
renderer.

Objectif du document : formaliser l'etat de `src/renderer/renderer.ts`,
les modules crees, les validations realisees et les pistes restantes pour
maintenir chaque fichier sous 600 lignes non vides.

## Synthese

`src/renderer/renderer.ts` est repasse sous le seuil cible.

| Fichier | Lignes totales | Lignes non vides | Etat |
| --- | ---: | ---: | --- |
| `src/renderer/renderer.ts` | 315 | 271 | OK |
| `src/renderer/rulesPanel.ts` | 374 | 329 | OK |
| `src/renderer/rendererTypes.d.ts` | 381 | 338 | OK |
| `src/renderer/rendererDuplicateTextSuggestionsFlow.ts` | 340 | 288 | OK |
| `src/renderer/namingPanel.ts` | 323 | 289 | OK |
| `src/renderer/rendererDocumentFlow.ts` | 316 | 267 | OK |
| `src/renderer/rendererClassificationFlow.ts` | 290 | 257 | OK |
| `src/renderer/previewPanel.ts` | 262 | 214 | OK |
| `src/renderer/classificationPanel.ts` | 247 | 211 | OK |

Point hors renderer a traiter separement si l'objectif devient repo-wide :

| Fichier | Lignes non vides | Remarque |
| --- | ---: | --- |
| `src/rules/namingSuggestions.ts` | 715 | Au-dessus de 600, candidat prioritaire hors renderer |
| `src/main/ipcHandlers.ts` | 584 | Sous le seuil, a surveiller |
| `src/file-ops/classifyFile.ts` | 568 | Sous le seuil, a surveiller |

## Etat de `renderer.ts`

`renderer.ts` est maintenant un assembleur :

- etat global renderer ;
- references DOM de haut niveau ;
- creation des panneaux et flux ;
- listeners des actions principales ;
- `render()` et `renderControls()`.

Il ne contient plus directement :

- le rendu des panneaux details, historique, doublons, texte extrait, suggestions, renommage, classification, regles ;
- les flux source/cible/refresh/preview ;
- les flux doublons, extraction texte, suggestions ;
- les flux regles utilisateur ;
- les flux renommage/destination ;
- les flux classification/historique/annulation ;
- les helpers de types et fabriques d'etat.

## Modules renderer crees

Panneaux UI :

- `src/renderer/queuePanel.ts`
- `src/renderer/duplicatePanel.ts`
- `src/renderer/historyPanel.ts`
- `src/renderer/textExtractionPanel.ts`
- `src/renderer/namingSuggestionsPanel.ts`
- `src/renderer/previewPanel.ts`
- `src/renderer/documentDetailsPanel.ts`
- `src/renderer/namingPanel.ts`
- `src/renderer/classificationPanel.ts`
- `src/renderer/rulesPanel.ts`

Flux renderer :

- `src/renderer/rendererDocumentFlow.ts`
- `src/renderer/rendererQueueFlow.ts`
- `src/renderer/rendererDuplicateTextSuggestionsFlow.ts`
- `src/renderer/rendererRulesFlow.ts`
- `src/renderer/rendererNamingDestinationFlow.ts`
- `src/renderer/rendererClassificationFlow.ts`
- `src/renderer/rendererShortcutFlow.ts`
- `src/renderer/rendererResetFlow.ts`

Support :

- `src/renderer/rendererTypes.d.ts`
- `src/renderer/rendererState.ts`

Tous les scripts renderer restent charges comme scripts globaux dans
`src/renderer/index.html`. Aucun bundling ni `import` / `export` runtime n'a
ete introduit.

## Risques et conventions

- Les modules de flux partagent le meme scope global renderer. C'est coherent
  avec le modele actuel sans bundling, mais il faut eviter d'y ajouter des noms
  generiques.
- Les panneaux UI utilisent des factories globales explicites et des callbacks.
- Les flux renderer conservent les noms de fonctions historiques pour limiter
  le risque de regression.
- Aucun changement IPC, preload, main process, file-ops, journal ou CSS n'a ete
  introduit dans ce refactor.

## Pistes restantes

1. Renforcer progressivement les flux en factories explicites.
   Les fichiers `rendererDocumentFlow.ts`, `rendererRulesFlow.ts` et
   `rendererClassificationFlow.ts` pourraient recevoir un `create...Flow(...)`
   avec `getState`, setters et callbacks, comme les panneaux UI. Ce serait plus
   verbeux mais mieux borne.

2. Scinder `src/rules/namingSuggestions.ts`.
   C'est le seul fichier mesure au-dessus de 600 lignes non vides. Decoupage
   possible :
   - normalisation et matching texte ;
   - scoring ;
   - construction des suggestions ;
   - application des suggestions au brouillon ;
   - helpers de dates et mots-cles.

3. Surveiller `src/main/ipcHandlers.ts`.
   Il reste sous 600 nonblank mais proche du seuil. Si de nouveaux IPC sont
   ajoutes, extraire les handlers par domaine.

4. Surveiller `src/file-ops/classifyFile.ts`.
   Il reste sous 600 nonblank. Si l'annulation ou le journal evoluent, extraire
   les controles pre-mutation et la journalisation dans des modules dedies.

## Commandes de validation

Commandes executees apres refactor :

```powershell
npm run typecheck
npm test
npm run build
git diff --check
npm run dev
```

Controle supplementaire :

```powershell
rg -n "exports|Object\.defineProperty|require\(" dist\renderer\*.js
```

Resultat attendu : aucune sortie pour les scripts renderer crees.
