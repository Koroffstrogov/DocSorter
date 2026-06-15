# DocSorter Local

Application desktop locale pour trier, prévisualiser, renommer et déplacer des documents personnels depuis Windows.

## Statut

Lot 2 : source, cible, file d'attente réelle, document actif et prévisualisation locale PDF/image en lecture seule.

## Commandes

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

## Ce qui fonctionne

- application Electron locale avec `contextIsolation: true` et `nodeIntegration: false` ;
- choix d'un dossier source pendant la session ;
- choix d'un dossier cible pendant la session ;
- scan non récursif du dossier source ;
- file d'attente réelle pour `.pdf`, `.jpg`, `.jpeg` et `.png` ;
- exclusion des sous-dossiers, fichiers non supportés et fichiers temporaires Office `~$...` ;
- sélection d'un document actif ;
- affichage des métadonnées de base en lecture seule ;
- prévisualisation locale des images JPG/JPEG/PNG ;
- prévisualisation locale des PDF via canvas ;
- zoom borné entre 50 % et 300 % ;
- navigation page précédente/suivante pour PDF multipages ;
- rotation visuelle des images.

## Dépendances

- `pdfjs-dist` : utilisé pour rendre localement les PDF dans un canvas. Cette dépendance est limitée au Lot 2 et ne fait pas d'OCR, d'extraction texte, d'upload ou d'analyse distante.

## Ce qui ne fonctionne pas encore

- pas de renommage ;
- pas de déplacement ;
- pas de suppression ;
- pas de configuration persistée ;
- pas de cache ni historique ;
- pas d'OCR, IA, doublons probables, packaging avancé ou DOCX.

## Validations manuelles

- l'application démarre avec `npm run dev` ;
- aucun faux document n'est affiché au démarrage ;
- le bouton `Choisir source` permet de sélectionner un dossier ;
- les PDF/JPG/JPEG/PNG du dossier apparaissent dans la file d'attente ;
- les fichiers non supportés et les sous-dossiers n'apparaissent pas ;
- le bouton `Choisir cible` affiche le chemin cible sélectionné ;
- une image sélectionnée s'affiche réellement ;
- les contrôles zoom image fonctionnent ;
- la rotation image est seulement visuelle ;
- un PDF sélectionné affiche sa première page ;
- les boutons page précédente/suivante fonctionnent sur un PDF multipage ;
- les contrôles zoom PDF fonctionnent ;
- si un fichier est déplacé ou supprimé après le scan, une erreur propre s'affiche ;
- aucun fichier n'est modifié, renommé, déplacé ou supprimé.

## Principes

- aucun upload serveur ;
- aucun tracking ;
- aucune suppression automatique ;
- pas de renommage ni déplacement sans validation explicite ;
- logs sobres pour limiter l'exposition de documents sensibles.
