# DocSorter Local

Application desktop locale pour trier, prévisualiser, renommer et déplacer des documents personnels depuis Windows.

## Statut

Lot 1 : source, cible, file d'attente réelle et document actif en lecture seule stricte.

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
- affichage des métadonnées de base en lecture seule.

## Ce qui ne fonctionne pas encore

- pas de vraie prévisualisation PDF ou image ;
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
- un document peut être sélectionné ;
- ses métadonnées s'affichent dans le panneau `Document actif` ;
- aucun fichier n'est modifié, renommé, déplacé ou supprimé.

## Principes

- aucun upload serveur ;
- aucun tracking ;
- aucune suppression automatique ;
- pas de renommage ni déplacement sans validation explicite ;
- logs sobres pour limiter l'exposition de documents sensibles.
