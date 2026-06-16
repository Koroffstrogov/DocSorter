# Règles de suggestions de nommage

DocSorter utilise un catalogue de règles locales pour proposer une date, un sujet, un type de document et des mots-clés à partir du texte PDF extrait en mémoire et du nom de fichier.

Le catalogue par défaut est livré avec l'application. La personnalisation utilisateur est préparée par le schéma, mais aucun fichier utilisateur n'est encore lu, écrit ou chargé automatiquement.

## Structure

```json
{
  "version": 1,
  "documentTypeRules": [],
  "subjectRules": [],
  "keywordRules": [],
  "stopWords": []
}
```

- `documentTypeRules` : règles pouvant produire `documentType` et éventuellement des `keywords`.
- `subjectRules` : règles pouvant produire `subject` et éventuellement des `keywords`.
- `keywordRules` : alias simples produisant un mot-clé normalisé.
- `stopWords` : mots ignorés lors du fallback prudent depuis le nom de fichier.

## Exemple

```json
{
  "id": "vehicle-maintenance-invoice",
  "label": "Facture entretien véhicule",
  "match": {
    "allOf": ["facture"],
    "anyOf": ["vidange", "revision", "entretien", "garage"]
  },
  "output": {
    "documentType": "facture-entretien",
    "keywords": ["entretien"]
  },
  "confidence": 80
}
```

## Conditions

- `allOf` : tous les termes doivent être présents.
- `anyOf` : au moins un terme doit être présent.
- `noneOf` : aucun terme ne doit être présent.
- `confidence` : score indicatif entre `0` et `100`.
- `source` optionnel : `text`, `filename` ou `filename+text`.

Les termes sont comparés sans tenir compte de la casse ni des accents. Les apostrophes, tirets et espaces multiples sont normalisés.

## Confidentialité

Les règles ne doivent pas contenir de texte OCR complet, de contenu documentaire sensible, de chemins locaux, de vrais noms de proches ou de données personnelles. Elles doivent rester des alias courts et génériques.

Dans le Lot 6C, aucun éditeur de règles, aucun cache, aucune persistance utilisateur et aucun chargement de fichier JSON utilisateur ne sont disponibles.
