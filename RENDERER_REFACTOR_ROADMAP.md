# Renderer Refactor Roadmap

Etat mesure le 2026-06-16 sur le worktree courant.

Objectif du document : formaliser l'etat de `src/renderer/renderer.ts` et
les options de refactor pour garder chaque fichier sous 600 lignes non vides
hors whitespace.

Ce document est volontairement consultatif. Il ne valide pas fonctionnellement
les changements en cours dans le worktree et ne remplace pas `npm run
typecheck`, `npm test`, `npm run build` ou un test manuel Electron.

## Synthese

`src/renderer/renderer.ts` est deja sous le seuil cible.

| Fichier | Lignes totales | Lignes non vides | Etat |
| --- | ---: | ---: | --- |
| `src/renderer/renderer.ts` | 315 | 271 | OK |
| `src/renderer/rendererDocumentFlow.ts` | 316 | 267 | OK |
| `src/renderer/rendererClassificationFlow.ts` | 290 | 257 | OK |
| `src/renderer/rendererDuplicateTextSuggestionsFlow.ts` | 340 | 288 | OK |
| `src/renderer/rendererNamingDestinationFlow.ts` | 190 | 160 | OK |
| `src/renderer/rendererRulesFlow.ts` | 204 | 173 | OK |
| `src/renderer/rendererQueueFlow.ts` | 69 | 54 | OK |
| `src/renderer/rendererShortcutFlow.ts` | 103 | 93 | OK |
| `src/renderer/rendererResetFlow.ts` | 27 | 22 | OK |

La cible "chaque fichier < 600 lignes non vides" n'est pas encore respectee
repo-wide :

| Fichier | Lignes totales | Lignes non vides | Priorite |
| --- | ---: | ---: | --- |
| `src/renderer/styles.css` | 1539 | 1324 | Haute |
| `src/rules/namingSuggestions.ts` | 829 | 715 | Haute |
| `src/main/ipcHandlers.ts` | 707 | 659 | Haute |

Fichiers proches du seuil, a surveiller :

| Fichier | Lignes totales | Lignes non vides | Risque |
| --- | ---: | ---: | --- |
| `src/file-ops/classifyFile.ts` | 622 | 570 | Croissance probable avec annulation/journal |
| `src/classification/classificationPlan.ts` | 593 | 541 | Croissance probable avec controles cible |

## Etat de `renderer.ts`

`renderer.ts` joue actuellement le role d'assembleur applicatif renderer :

- creation de l'etat global `AppState` ;
- compteurs de requetes asynchrones ;
- references DOM de haut niveau ;
- creation des panneaux via factories globales ;
- cablage des callbacks entre panneaux, flux et etat global ;
- listeners des boutons principaux ;
- point d'entree `render()` ;
- activation/desactivation des controles principaux.

Il ne contient plus directement :

- le rendu de la file d'attente ;
- le rendu de l'aperçu PDF/image ;
- le rendu du panneau doublons ;
- le rendu details, historique, suggestions, regles, renommage et classification ;
- les flux source/cible/refresh/preview ;
- les flux doublons, extraction texte et suggestions ;
- les flux regles utilisateur ;
- les flux renommage, controle cible, classement, historique et annulation ;
- les fabriques d'etat renderer.

Conclusion : il n'y a pas d'urgence a reduire `renderer.ts`. La prochaine
pression de taille est ailleurs.

## Architecture Renderer Actuelle

Le renderer conserve un modele sans bundling. Les scripts sont charges dans
`src/renderer/index.html` comme scripts globaux, dans un ordre explicite. Cette
approche a ete retenue pour eviter le retour d'erreurs du type `exports is not
defined` dans le renderer.

Panneaux UI deja isoles :

- `src/renderer/queuePanel.ts`
- `src/renderer/previewPanel.ts`
- `src/renderer/duplicatePanel.ts`
- `src/renderer/documentDetailsPanel.ts`
- `src/renderer/historyPanel.ts`
- `src/renderer/textExtractionPanel.ts`
- `src/renderer/suggestionV2Panel.ts`
- `src/renderer/namingPanel.ts`
- `src/renderer/classificationPanel.ts`
- `src/renderer/rulesPanel.ts`

Flux renderer deja isoles :

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
- `src/renderer/global.d.ts`

## Regles de Refactor a Conserver

- Garder `renderer.ts` comme coordinateur, pas comme module metier.
- Ne pas introduire de `fs` dans le renderer.
- Ne pas ajouter d'IPC generique.
- Ne pas affaiblir preload, main process, `contextIsolation` ou CSP.
- Ne pas introduire de bundler pour ce seul objectif.
- Pour les scripts renderer globaux, eviter `import` / `export` runtime.
- Preferer des factories explicites : `createXPanel({ getState, callbacks })`.
- Garder la logique metier testable hors DOM.
- Extraire par petits lots validables, un domaine a la fois.
- Apres chaque lot : verifier les compteurs de lignes et lancer les commandes de validation.

## Refactor Prioritaire 1 : CSS

Probleme : `src/renderer/styles.css` contient 1324 lignes non vides. C'est le
plus gros fichier du repo.

Objectif : descendre chaque fichier CSS sous 600 lignes, sans changer le rendu.

Option recommandee : scinder en feuilles de style chargees explicitement dans
`index.html`, dans cet ordre approximatif :

- `src/renderer/styles/base.css` : variables, reset local, typographie, boutons generiques ;
- `src/renderer/styles/layout.css` : header, path bar, workspace, panneaux ;
- `src/renderer/styles/queue.css` : file d'attente, filtres, tri, navigation ;
- `src/renderer/styles/preview.css` : aperçu image/PDF, zoom, toolbar ;
- `src/renderer/styles/details.css` : panneau droit, details, sections communes ;
- `src/renderer/styles/naming.css` : renommage, destination, classification ;
- `src/renderer/styles/rules.css` : editeur minimal des regles utilisateur ;
- `src/renderer/styles/history.css` : historique et annulation ;
- `src/renderer/styles/responsive.css` : media queries et ajustements viewport.

Risque principal : regression visuelle par changement d'ordre CSS. Mitigation :
deplacer les blocs sans les modifier, conserver l'ordre relatif, puis verifier
manuellement l'application sur desktop et fenetre reduite.

Tests : pas de test unitaire utile si le lot est un deplacement CSS pur. Faire
au minimum `npm run build`, `npm run dev` et une verification visuelle.

## Refactor Prioritaire 2 : Suggestions de Nommage

Probleme : `src/rules/namingSuggestions.ts` contient 715 lignes non vides. Il
mele API publique globale, detection de date, matching de regles, scoring,
construction de suggestions, mots-cles et application au brouillon.

Objectif : isoler les sous-domaines purs sans changer le contrat
`DocSorterNamingSuggestions`.

Decoupage possible :

- `src/rules/namingSuggestionText.ts` : normalisation texte, tokenisation, helpers accents/casse ;
- `src/rules/namingSuggestionDates.ts` : detection, validation et priorisation des dates ;
- `src/rules/namingSuggestionRuleMatching.ts` : matching `allOf` / `anyOf` / `noneOf`, selection des sorties ;
- `src/rules/namingSuggestionKeywords.ts` : extraction, dedoublonnage et limites de mots-cles ;
- `src/rules/namingSuggestionScoring.ts` : confiance globale et raisons ;
- `src/rules/namingSuggestionDraftApply.ts` : application aux champs vides ;
- `src/rules/namingSuggestions.ts` : facade publique `DocSorterNamingSuggestions`.

Point d'attention : ce fichier est utilise dans le renderer via scripts globaux.
Si des helpers sont exposes au runtime, les charger avant la facade dans
`index.html` ou garder les helpers purement TypeScript sans export runtime selon
le mode retenu. Le refactor ne doit pas reintroduire `exports` dans `dist`.

Tests a conserver ou completer :

- detection de date ;
- application aux champs vides sans ecraser les saisies ;
- priorisation des regles ;
- mots-cles limites et dedoublonnes ;
- comportement identique avec catalogue utilisateur.

## Refactor Prioritaire 3 : Handlers IPC Main

Probleme : `src/main/ipcHandlers.ts` contient 659 lignes non vides. Il centralise
contrats IPC sensibles, services par defaut, et enregistrement de nombreux
handlers.

Objectif : conserver la securite IPC tout en separant les domaines.

Decoupage possible :

- `src/main/ipcSensitiveContracts.ts` : table `SENSITIVE_IPC_HANDLERS` et types associes ;
- `src/main/ipcDefaultServices.ts` : `defaultIpcHandlerServices` ;
- `src/main/ipcAppState.ts` : `MainProcessAppState` et `createMainProcessAppState` ;
- `src/main/ipcDirectoryHandlers.ts` : source, cible, sous-dossier cible ;
- `src/main/ipcDocumentHandlers.ts` : refresh, preview, extraction texte, doublons ;
- `src/main/ipcNamingHandlers.ts` : brouillon nommage, proposition, collision cible, regles ;
- `src/main/ipcClassificationHandlers.ts` : plan, classement reel, annulation, historique ;
- `src/main/ipcHandlers.ts` : facade qui compose les groupes de handlers.

Risque principal : perdre les garde-fous qui imposent que le renderer ne fournit
pas de chemin source/cible/journal arbitraire. Mitigation : deplacer les tests
existants avec le code et garder un test de surface sur les contrats sensibles.

Tests a conserver ou completer :

- contrats sensibles : `acceptsRendererPath`, `usesMainSource`, `usesMainTarget`, `usesUserDataPath` ;
- handlers source/cible : l'etat main reste la source de verite ;
- handlers classification : le renderer ne transmet que document actif et nom propose ;
- handlers regles : le renderer ne transmet jamais le chemin du fichier de regles.

## Refactor a Surveiller : Classement Reel

`src/file-ops/classifyFile.ts` est a 570 lignes non vides. Il reste sous le
seuil, mais proche.

Decoupage possible si le fichier grandit :

- `src/file-ops/classificationExecution.ts` : execution `fs.rename` et re-checks ;
- `src/file-ops/classificationUndo.ts` : annulation de la derniere action ;
- `src/file-ops/classificationJournaling.ts` : ecriture started/completed/failed et warnings ;
- `src/file-ops/classificationGuards.ts` : collisions, hash, chemins libres ;
- `src/file-ops/classifyFile.ts` : facade publique.

Principe : ne jamais ajouter de fallback `copy + delete` dans ce refactor. Toute
mutation disque doit rester explicite, testee et journalisee.

## Refactor a Surveiller : Plan de Classement

`src/classification/classificationPlan.ts` est a 541 lignes non vides. Il reste
sous le seuil, mais les controles cible peuvent le faire grossir.

Decoupage possible si le fichier grandit :

- `src/classification/classificationPlanTypes.ts` : types publics ;
- `src/classification/classificationPlanChecks.ts` : construction ordonnee des checks ;
- `src/classification/classificationPlanErrors.ts` : mapping des erreurs ;
- `src/classification/classificationPlan.ts` : orchestration.

Principe : la preparation de plan reste en lecture seule. Le lot de refactor ne
doit pas deplacer, renommer, creer ou supprimer de fichier.

## Options Futures Pour `renderer.ts`

`renderer.ts` n'a pas besoin d'etre scinde maintenant. Si de nouveaux lots le
font remonter au-dessus de 450 lignes non vides, ces extractions sont possibles :

1. `src/renderer/rendererPanels.ts`
   - creation de toutes les factories de panneaux ;
   - callbacks passes explicitement depuis `renderer.ts` ;
   - `renderer.ts` garde l'etat et l'ordre de render.

2. `src/renderer/rendererControls.ts`
   - references DOM des controles globaux ;
   - `renderControls()` et `setControlsDisabled()` ;
   - aucune logique metier.

3. `src/renderer/rendererBootstrap.ts`
   - lancement version, historique, regles ;
   - cablage des listeners ;
   - appel initial `render()`.

4. `src/renderer/rendererRenderLoop.ts`
   - `render()` et delegation vers les panneaux ;
   - utile seulement si la coordination de rendu devient plus riche.

Ces extractions sont secondaires. Elles ne doivent pas passer avant les trois
fichiers deja au-dessus de 600 lignes non vides.

## Lots Recommandes

1. Lot R12 : scinder `styles.css` sans modifier les declarations.
2. Lot R13 : scinder `namingSuggestions.ts` en modules de logique pure et garder la facade globale.
3. Lot R14 : scinder `ipcHandlers.ts` par domaines avec tests de contrats sensibles.
4. Lot R15 : surveiller puis scinder `classifyFile.ts` si un nouveau lot le pousse au-dessus de 600.
5. Lot R16 : surveiller puis scinder `classificationPlan.ts` si les controles cible grossissent.
6. Lot R17 optionnel : extraire bootstrap/controls de `renderer.ts` seulement s'il grossit de nouveau.

## Commandes de Mesure

Compter les lignes non vides des fichiers les plus gros :

```powershell
Get-ChildItem -Path src -Recurse -File -Include *.ts,*.css,*.html |
  ForEach-Object {
    $content = Get-Content -LiteralPath $_.FullName
    $nonblank = ($content | Where-Object { $_.Trim().Length -gt 0 }).Count
    [PSCustomObject]@{
      NonBlank = $nonblank
      Total = $content.Count
      Path = $_.FullName.Substring((Get-Location).Path.Length + 1)
    }
  } |
  Sort-Object NonBlank -Descending |
  Select-Object -First 30 |
  Format-Table -AutoSize
```

Lister uniquement les fichiers hors seuil :

```powershell
Get-ChildItem -Path src -Recurse -File -Include *.ts,*.css,*.html |
  ForEach-Object {
    $content = Get-Content -LiteralPath $_.FullName
    $nonblank = ($content | Where-Object { $_.Trim().Length -gt 0 }).Count
    [PSCustomObject]@{
      NonBlank = $nonblank
      Total = $content.Count
      Path = $_.FullName.Substring((Get-Location).Path.Length + 1)
    }
  } |
  Where-Object { $_.NonBlank -ge 600 } |
  Sort-Object NonBlank -Descending |
  Format-Table -AutoSize
```

## Validation Apres Chaque Lot

Commandes minimales :

```powershell
npm run typecheck
npm test
npm run build
git diff --check
```

Pour les scripts renderer globaux, verifier que les fichiers generes ne
reintroduisent pas de runtime CommonJS dans `dist/renderer` :

```powershell
rg -n "exports|Object\.defineProperty|require\(" dist\renderer\*.js
```

Pour les lots UI ou CSS, ajouter un demarrage controle :

```powershell
npm run dev
```

## Limites Connues

- Les compteurs ci-dessus refletent le worktree courant, qui contient des
  modifications non committees hors document.
- Les fichiers CSS ne sont pas des fichiers TypeScript, mais ils comptent dans
  l'objectif pratique "chaque fichier < 600 lignes".
- Le modele scripts globaux evite un bundler, mais impose une discipline forte
  sur l'ordre de chargement et les noms exposes sur `globalThis`.
- Une extraction purement mecanique peut reduire les tailles sans ameliorer la
  maintenabilite. Chaque lot doit conserver une frontiere de responsabilite
  claire.
