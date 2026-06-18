# Audit Refactor Top 3

Date : 2026-06-18

## Perimetre et methode

Cet audit identifie les 3 fichiers maintenus les plus volumineux du repo, en lignes de code utiles.

Perimetre compte :

- fichiers sous `src/` ;
- extensions prises en compte : `.ts`, `.tsx`, `.js`, `.mjs`, `.css`, `.html` ;
- fichiers de tests exclus : `*.test.ts`, `*.test.tsx` ;
- dossiers generes ou non pertinents exclus : `dist`, `coverage`, `node_modules` ;
- fichiers de documentation, configs et lockfile exclus.

Comptage :

- lignes vides exclues ;
- commentaires ligne et blocs exclus autant que possible ;
- CSS, HTML et declarations TypeScript inclus, car ce sont des fichiers maintenus qui portent de la complexite.

Top 3 mesure :

| Rang | Fichier | LOC utiles |
| --- | --- | ---: |
| 1 | `src/renderer/styles.css` | 2102 |
| 2 | `src/main/ipcHandlers.ts` | 1259 |
| 3 | `src/renderer/referenceDataPanel.ts` | 871 |

Le fichier suivant est `src/rules/namingSuggestions.ts` avec 764 LOC utiles. Il n'entre pas dans le top 3, mais il reste un candidat naturel pour un audit ulterieur.

## 1. `src/renderer/styles.css`

### Diagnostic

`styles.css` est devenu le point unique de style pour toute l'application renderer :

- layout global ;
- file d'attente ;
- preview PDF/image ;
- panneau details ;
- suggestion v2 ;
- diagnostics ;
- referentiels locaux ;
- OCR ;
- IA locale ;
- regles ;
- historique ;
- renommage.

Le fichier est lisible par sections, mais il a depasse le seuil ou les modifications locales restent vraiment previsibles. Les styles recents de l'assistant referentiels et du panneau IA cohabitent avec les styles historiques de layout, preview et queue.

### Risques actuels

- Forte probabilite de regression CSS par cascade involontaire.
- Selecteurs transverses repetes, notamment pour boutons, statuts, formulaires et panels.
- Difficulte a relire les impacts d'un changement UX local.
- Toute modification de style declenche une revue mentale du fichier complet.
- La separation fonctionnelle des modules renderer n'est pas refletee dans les styles.

### Refactor recommande

Objectif : remplacer le fichier unique par des fichiers CSS par domaine, charges dans un ordre explicite depuis `src/renderer/index.html`.

Decoupe proposee :

| Nouveau fichier | Contenu |
| --- | --- |
| `src/renderer/styles/base.css` | variables `:root`, reset, typography, boutons generiques, inputs generiques |
| `src/renderer/styles/layout.css` | shell app, header, grille principale, panneaux |
| `src/renderer/styles/queue-preview.css` | file d'attente, filtres, navigation, preview PDF/image |
| `src/renderer/styles/document-details.css` | document actif, historique, doublons, classification, renommage |
| `src/renderer/styles/suggestion-v2.css` | proposition de tri, diagnostics, options de dossiers |
| `src/renderer/styles/reference-data.css` | modale referentiels, assistant, JSON brut |
| `src/renderer/styles/ai-ocr-rules.css` | IA locale, OCR, regles utilisateur |

Alternative plus prudente : garder `styles.css` comme point d'entree avec des `@import`, puis deplacer les blocs un par un. Avantage : `index.html` change peu. Inconvenient : ordre d'import a surveiller.

### Ordre de refactor par petits lots

1. Extraire `reference-data.css`.
   C'est le bloc le plus autonome et celui qui change souvent en ce moment.

2. Extraire `ai-ocr-rules.css`.
   Les panneaux IA/OCR/regles sont deja bien bornes visuellement.

3. Extraire `suggestion-v2.css`.
   A faire apres stabilisation du flux v2, car les diagnostics et options de dossiers bougent encore.

4. Extraire `queue-preview.css`.
   Risque moyen : ces styles influencent fortement la stabilite du layout.

5. Extraire `base.css`, `layout.css` et `document-details.css`.
   A faire en dernier, car les selecteurs generiques et la grille principale ont le plus fort rayon d'impact.

### Cible de taille

- Aucun fichier CSS au-dessus de 600 LOC utiles.
- `base.css` et `layout.css` devraient rester sous 250 LOC chacun.
- `reference-data.css` risque d'etre le plus grand, mais doit rester sous 500 LOC si les boutons/formulaires generiques sont bien factorises.

### Tests et validation

- Ajouter ou garder des tests DOM seulement si la structure HTML change.
- Apres chaque extraction :
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - verification manuelle renderer : layout global, file scrollable, preview, panneau droit, referentiels, IA/OCR.

## 2. `src/main/ipcHandlers.ts`

### Diagnostic

`ipcHandlers.ts` concentre presque tout le contrat main process :

- interfaces main process ;
- etat applicatif main ;
- table des IPC sensibles ;
- services par defaut ;
- enregistrement de tous les handlers ;
- selection source/cible ;
- gestion target folder ;
- renommage et collision ;
- classement et annulation ;
- extraction texte ;
- OCR ;
- IA ;
- suggestion v2 et diagnostic ;
- regles utilisateur ;
- referentiels ;
- preview ;
- historique ;
- doublons ;
- helpers de parsing IPC.

Le fichier joue trois roles en meme temps : composition de dependances, registre de securite IPC, et orchestration des handlers.

### Risques actuels

- Fichier critique securite : une modification locale peut toucher indirectement des garanties `sourcePath`, `targetPath`, `userDataPath` ou queue scannee.
- Le registre `SENSITIVE_IPC_HANDLERS` est utile, mais il grossit dans le meme fichier que les handlers.
- Les handlers sensibles sont nombreux et heterogenes ; leur revue devient lente.
- Les tests existent, mais ils doivent couvrir une surface trop large dans un meme module.
- Le risque principal d'un refactor est de perdre un garde-fou : ne pas accepter un chemin renderer, verifier la file scannee, utiliser uniquement la cible stockee cote main.

### Refactor recommande

Objectif : garder une entree centrale `registerIpcHandlers(...)`, mais deleguer l'enregistrement par domaines avec un contexte explicite.

Nouveaux modules proposes :

| Fichier | Role |
| --- | --- |
| `src/main/mainProcessState.ts` | `MainProcessAppState`, `createMainProcessAppState` |
| `src/main/ipcHandlerServices.ts` | `IpcHandlerServices`, `defaultIpcHandlerServices` |
| `src/main/sensitiveIpcContracts.ts` | `SensitiveIpcHandlerContract`, `SENSITIVE_IPC_HANDLERS` |
| `src/main/ipcHandlerContext.ts` | type commun `{ app, dialog, shell, state, services }` |
| `src/main/ipcHandlers/directories.ts` | source/cible, refresh source |
| `src/main/ipcHandlers/targetFolders.ts` | list/set/create sous-dossier cible |
| `src/main/ipcHandlers/namingClassification.ts` | naming, destination, plan, execute, undo |
| `src/main/ipcHandlers/extractionOcrAi.ts` | extraction PDF, OCR, IA |
| `src/main/ipcHandlers/suggestionDiagnostics.ts` | suggestion v2, diagnostic suggestions/IA |
| `src/main/ipcHandlers/rulesReferenceData.ts` | regles et referentiels |
| `src/main/ipcHandlers/previewHistoryDuplicates.ts` | preview, historique, doublons |

`src/main/ipcHandlers.ts` deviendrait alors un fichier de composition :

- construit le contexte ;
- appelle les registrars de domaines ;
- retourne l'etat ;
- ne contient plus la logique detaillee de chaque handler.

### Ordre de refactor par petits lots

1. Extraire uniquement les types et services :
   - `mainProcessState.ts`
   - `ipcHandlerServices.ts`
   - `sensitiveIpcContracts.ts`
   Aucun changement comportemental.

2. Extraire les helpers purs de parsing :
   - `readAiDocumentTextContext`
   - `readSuggestionV2TextContext`
   - `getQueuedDocumentName`
   - `getSelectedTargetFolderCandidates`

3. Extraire un domaine faible risque : `targetFolders.ts`.
   Les handlers sont courts et bien bornes.

4. Extraire `rulesReferenceData.ts`.
   Domaine local-first, peu couple au flux de classement.

5. Extraire `extractionOcrAi.ts`.
   Risque moyen, car depend de `userDataPath`, queue scannee et dossiers cible connus.

6. Extraire `namingClassification.ts` en dernier.
   C'est le domaine le plus critique : mutation disque, journal, annulation.

### Cible de taille

- `src/main/ipcHandlers.ts` sous 250 LOC utiles.
- Chaque registrar sous 300 LOC utiles.
- Aucun fichier main process au-dessus de 600 LOC utiles.

### Tests et validation

- Maintenir les tests de surface IPC existants.
- Ajouter des tests ciblant chaque registrar seulement si l'extraction cree une nouvelle surface publique.
- Verifier explicitement :
  - aucun IPC generique ;
  - aucun chemin cible transmis par renderer pour mutation ;
  - queue scannee toujours utilisee cote main ;
  - `SENSITIVE_IPC_HANDLERS` reste complet.

Commandes :

- `npm run typecheck`
- `npm test`
- `npm run build`
- `git diff --check`

## 3. `src/renderer/referenceDataPanel.ts`

### Diagnostic

`referenceDataPanel.ts` porte toute l'interface du panneau Referentiels locaux :

- creation du panel global `DocSorterReferenceDataPanel` ;
- collecte des elements DOM ;
- rendu des onglets de fichiers ;
- mode JSON brut ;
- mode assistant formulaire ;
- liste d'entrees ;
- details de l'entree selectionnee ;
- configuration des champs par referentiel ;
- aides de champs ;
- gestion des boutons ;
- preservation/restauration du focus ;
- parsing JSON local ;
- affichage des erreurs.

Le fichier est coherent fonctionnellement, mais il melange orchestration, configuration, composants DOM et helpers purs. Les evolutions UX recentes l'ont fait grossir rapidement.

### Risques actuels

- Chaque changement de formulaire peut impacter la liste, le JSON brut ou le focus.
- La configuration par referentiel est enfouie dans le rendu.
- Les helpers purs sont difficiles a tester sans charger tout le module DOM.
- Les callbacks restent explicites, ce qui est bon, mais le fichier approche la limite ou les responsabilites deviennent floues.
- Le mode scripts globaux doit etre conserve pour eviter le retour de problemes `exports is not defined`.

### Refactor recommande

Objectif : conserver un module global sans bundling, mais separer l'assistant en sous-modules globaux charges avant `referenceDataPanel.js`.

Decoupe proposee :

| Nouveau fichier | Role |
| --- | --- |
| `src/renderer/referenceDataPanelModel.ts` | configuration des champs, aides, labels, parsing/formatage de valeurs |
| `src/renderer/referenceDataEntryList.ts` | rendu liste, carte d'entree, details selectionnes |
| `src/renderer/referenceDataForm.ts` | rendu formulaire assistant, champs, actions formulaire |
| `src/renderer/referenceDataJsonView.ts` | mode JSON brut, actions validation/enregistrement |
| `src/renderer/referenceDataPanel.ts` | orchestration, recuperation DOM, etat busy, rendu global |

Chaque fichier expose un namespace global explicite, par exemple :

```ts
globalThis.DocSorterReferenceDataPanelModel
globalThis.DocSorterReferenceDataEntryList
globalThis.DocSorterReferenceDataForm
globalThis.DocSorterReferenceDataJsonView
```

Puis `index.html` charge ces scripts avant `referenceDataPanel.js`.

### Ordre de refactor par petits lots

1. Extraire les helpers purs et la configuration :
   - `getReferenceDataFormFields`
   - `getReferenceDataFieldHelp`
   - `stringValue`
   - `arrayValue`
   - `parseReferenceEntries`
   Tests unitaires legers possibles sans DOM lourd.

2. Extraire le mode JSON brut :
   - `createJsonView`
   - actions validate/save/cancel.
   Risque faible.

3. Extraire la liste d'entrees :
   - `createNewEntryButton`
   - `createEntryCard`
   - `createSelectedEntryDetails`
   Risque moyen : propagation des clics, selection, suppression.

4. Extraire le formulaire assistant :
   - `createSimpleForm`
   - `createSimpleField`
   - `createTextField`
   - `createTextAreaField`
   - `createCheckboxField`
   - `createFieldLabel`
   Risque moyen/fort : focus et champs visibles selon type de referentiel.

5. Garder `referenceDataPanel.ts` comme orchestrateur :
   - rendu shell ;
   - statut ;
   - selection fichier ;
   - appels aux sous-modules.

### Cible de taille

- `referenceDataPanel.ts` sous 300 LOC utiles.
- `referenceDataForm.ts` sous 250 LOC utiles.
- `referenceDataEntryList.ts` sous 220 LOC utiles.
- `referenceDataPanelModel.ts` sous 220 LOC utiles.

### Tests et validation

- Conserver et adapter `src/renderer/referenceDataPanel.test.ts`.
- Ajouter des tests purs pour `referenceDataPanelModel` si extrait.
- Verifier manuellement :
  - Personnes : date visible, domaines masques ;
  - Fournisseurs : domaines visibles, date masquee ;
  - Types documentaires : editables en assistant ;
  - suppression seulement dans le brouillon ;
  - aucune ecriture avant `Enregistrer` ;
  - focus conserve pendant saisie.

## Priorite recommandee

1. `referenceDataPanel.ts`
   - meilleur ratio gain/risque ;
   - concerne une zone UX active ;
   - peut etre decoupe sans toucher au main process ni au classement.

2. `styles.css`
   - gros gain de maintenabilite ;
   - commencer par extraire les blocs referentiels et IA/OCR, deja proches des demandes recentes.

3. `ipcHandlers.ts`
   - impact architectural important ;
   - a faire par lots tres courts avec tests IPC systematiques ;
   - ne pas commencer par les handlers de classement reel.

## Critere global de fin

Le refactor est considere termine quand :

- aucun fichier de production du top 3 ne depasse 600 LOC utiles ;
- le mode scripts globaux renderer reste fonctionnel ;
- aucun IPC/preload/main contract n'est elargi ;
- aucun comportement de classement reel n'est modifie ;
- `npm run typecheck`, `npm test`, `npm run build` et `git diff --check` passent ;
- une validation manuelle confirme : demarrage app, selection source/cible, preview, proposition de tri, IA locale, referentiels.

