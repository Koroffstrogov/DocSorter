# DocSorter Local

Application desktop locale pour trier, prévisualiser, renommer et déplacer des documents personnels depuis Windows.

## Lot actuel

Socle Electron + TypeScript minimal :

- application Electron locale ;
- logique de proposition de renommage séparée dans `src/core` ;
- IPC limité à une prévisualisation, sans écriture disque ;
- tests unitaires sur la logique de renommage.

## Commandes

```bash
npm install
npm run build
npm test
npm run dev
```

## Principes

- aucun upload serveur ;
- aucun tracking ;
- aucune suppression automatique ;
- pas de renommage ni déplacement sans validation explicite ;
- logs sobres pour limiter l'exposition de documents sensibles.

## Hors lot de démarrage

OCR, IA, détection de doublons, packaging avancé et support DOCX.
