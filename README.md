# DocSorter Local

Application desktop locale pour trier, prévisualiser, renommer et déplacer des documents personnels depuis Windows.

## Statut

Lot 7 + 8A + OCR-2 + IA-2.5 : source, racine cible avec sous-dossier relatif, file d'attente réelle, prévisualisation locale PDF/image, classement réel sécurisé, journal local, historique récent, annulation persistante, doublons exacts, recherche/tri/navigation, raccourcis clavier sûrs, extraction locale du texte PDF natif, suggestions locales de nommage et de sous-dossier cible, règles utilisateur locales avec éditeur minimal, création explicite de sous-dossier cible, cache local minimal d'analyse, configuration locale de Tesseract CLI, OCR manuel des images JPG/JPEG/PNG, contrat de classification IA, configuration/test Ollama local optionnel désactivé par défaut, suggestion IA locale explicite sur document actif et gestion du chargement/libération du modèle Ollama.

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
- cible utilisée comme racine de classement ;
- sélection d'un sous-dossier cible relatif, vide si classement à la racine ;
- liste locale des sous-dossiers existants de la racine cible, limitée à trois niveaux ;
- refus côté main process des sous-dossiers absolus, trop profonds ou avec traversée `..` ;
- scan non récursif du dossier source ;
- rafraîchissement manuel du dossier source déjà sélectionné ;
- file d'attente réelle pour `.pdf`, `.jpg`, `.jpeg` et `.png` ;
- exclusion des sous-dossiers, fichiers non supportés et fichiers temporaires Office `~$...` ;
- sélection d'un document actif ;
- affichage des métadonnées de base en lecture seule ;
- prévisualisation locale des images JPG/JPEG/PNG ;
- prévisualisation locale des PDF via canvas ;
- refus sobre de prévisualisation pour les fichiers trop volumineux ;
- zoom borné entre 50 % et 300 % ;
- navigation page précédente/suivante pour PDF multipages ;
- rotation visuelle des images ;
- marquage visuel `Indisponible` si un fichier disparaît avant sa prévisualisation ;
- conservation du dossier cible pendant les rafraîchissements ;
- panneau `Renommage proposé` en prévisualisation uniquement ;
- proposition de nom recalculée depuis les champs Date documentaire, Sujet, Type et Mots-clés ;
- détection prudente d'une date dans le nom de fichier existant ;
- validation visuelle des champs nécessaires avant futur classement ;
- contrôle en lecture seule de la disponibilité du nom proposé dans le dossier cible sélectionné ;
- contrôle de collision dans le sous-dossier cible relatif choisi ;
- proposition d'un suffixe `_2` à `_99` si le nom existe déjà dans la cible ;
- application visuelle du suffixe proposé sans renommage ni déplacement ;
- bouton `Vérifier avant classement` pour préparer un plan de classement simulé ;
- re-check au clic du document source, de la file scannée, de la cible, du nom proposé et de la collision ;
- récapitulatif de simulation affichant source, cible, nom proposé, chemin final prévu et contrôles OK/bloquants ;
- message explicite `Simulation uniquement — aucun fichier n'a été modifié` avant validation réelle ;
- bouton `Valider et classer` après plan prêt ;
- re-check complet juste avant mutation ;
- renommage puis déplacement par `fs.rename` uniquement ;
- refus des collisions et de l'écrasement ;
- journal local sobre des actions de classement ;
- historique récent des dernières actions utiles ;
- rechargement de la dernière action annulable depuis le journal au démarrage ;
- annulation de la dernière action réussie, même après redémarrage, si les chemins et le hash restent sûrs ;
- bouton `Analyser les doublons exacts` déclenché explicitement par l'utilisateur ;
- calcul local SHA-256 des fichiers de la dernière file scannée, sans upload ;
- détection des doublons exacts entre fichiers présents dans la source ;
- détection des doublons exacts avec les classements `completed` du journal, uniquement si l'action n'a pas été annulée et si le fichier classé existe encore avec le hash attendu ;
- marquage visuel `Doublon exact` dans la file d'attente ;
- panneau de détail des doublons exacts pour le document actif ;
- avertissement avant classement réel si le document actif est un doublon exact ;
- boutons de session `Ignorer pour l'instant` et `Conserver quand même`, sans suppression ni remplacement ;
- recherche locale dans la file courante par nom, extension, statut, taille lisible et chemin ;
- filtres visuels `Tous`, `PDF`, `Images`, `Doublons`, `Indisponibles` et `À traiter` ;
- tri stable de la file affichée par nom, date, taille, type ou statut ;
- navigation précédent/suivant dans la file actuellement filtrée et triée ;
- sélection rapide d'un autre fichier doublon présent dans la file source depuis le panneau `Doublons exacts` ;
- raccourcis clavier pour naviguer, rechercher, filtrer, rafraîchir, vérifier, classer après plan prêt et annuler hors saisie ;
- panneau d'aide `Raccourcis (?)` listant les touches disponibles ;
- protection des champs de saisie : les raccourcis globaux ne se déclenchent pas pendant la saisie, sauf `Ctrl+F` et `Escape` dans la recherche ;
- bouton explicite `Extraire le texte PDF` pour le PDF actif ;
- extraction locale du texte natif des PDF via `pdfjs-dist`, sans OCR ;
- refus sobre d'extraction texte pour les PDF trop volumineux ;
- analyse texte PDF limitée aux premières pages pour éviter les blocages sur gros fichiers ou NAS ;
- affichage d'un extrait limité, du nombre de caractères et du nombre de pages analysées ;
- message clair si aucun texte exploitable n'est détecté dans un PDF scanné ;
- texte extrait conservé uniquement en mémoire pendant la session ;
- bouton explicite `Analyser les suggestions` après extraction texte d'un PDF ;
- suggestions locales de date, sujet, type et mots-clés depuis l'extrait texte et le nom de fichier ;
- suggestions locales de sous-dossier cible depuis les règles, sans application automatique ;
- bouton explicite pour appliquer le sous-dossier suggéré au champ cible ;
- message `Dossier inexistant` et bouton `Créer ce dossier` si le sous-dossier choisi n'existe pas ;
- création du sous-dossier cible uniquement après confirmation explicite, sous la racine cible ;
- règles de suggestion par défaut externalisées dans un catalogue typé ;
- moteur de suggestions capable de consommer un catalogue de règles injecté ;
- fichier local de règles utilisateur créé automatiquement si absent ;
- validation, sauvegarde prudente et fusion règles par défaut + règles utilisateur ;
- panneau `Règles de suggestion` pour ajouter, modifier, désactiver ou supprimer une règle utilisateur simple ;
- score indicatif et raisons sobres pour contrôler les suggestions ;
- bouton `Appliquer aux champs vides` qui ne remplace jamais une saisie déjà présente ;
- recalcul du nom proposé et du contrôle cible après application des suggestions ;
- cache local minimal d'analyse sous `app.getPath("userData")/cache` ;
- cache utilisé pour éviter de refaire l'extraction texte et les suggestions si taille et date de modification du PDF n'ont pas changé ;
- indication `issu du cache` quand un texte PDF est restauré depuis le cache ;
- tests légers des handlers IPC sensibles côté main process pour vérifier source, cible, journal, file scannée et règles utilisateur contrôlés côté main.
- panneau `OCR local` pour configurer `tesseract.exe`, le dossier `tessdata`, la langue par défaut `fra` et le mode PSM ;
- sauvegarde de la configuration OCR uniquement sous `app.getPath("userData")/config/ocr-settings.json` ;
- détection locale prudente de Tesseract depuis la configuration, un futur dossier embarqué `resources/tesseract/tesseract.exe`, puis le `PATH` ;
- test manuel de Tesseract limité à `--version` et `--list-langs`, sans document source, sans conversion PDF/image et sans cache OCR ;
- vérification explicite de `fra.traineddata` et message sobre si les données de langue manquent.
- bouton explicite `Lancer OCR sur cette image` pour les documents JPG/JPEG/PNG actifs ;
- OCR image via Tesseract CLI uniquement après configuration et test du moteur local ;
- commande OCR limitée à `tesseract <imagePath> stdout -l <lang> --psm <psm>` avec timeout et sorties bornées ;
- refus des images trop volumineuses pour OCR ;
- affichage borné du texte OCR et réutilisation manuelle pour les suggestions locales ;
- cache local des résultats OCR image sous `userData/cache/analysis`, invalidé par chemin, taille, date de modification, moteur, version Tesseract, langue et PSM.
- contrat IA local strict pour proposer date, type, sujet, mots-clés, dossier, score et raisons ;
- provider IA simulé déterministe, sans modèle réel, sans réseau et sans prompt modèle ;
- validation stricte des sorties IA : score borné, date valide, dossier cible relatif, listes bornées et source contrôlée ;
- orchestrateur IA pur qui borne l'entrée, valide la sortie et n'applique jamais automatiquement les suggestions.
- panneau `IA locale` pour activer optionnellement Ollama local, renseigner l'URL, le modèle et le timeout ;
- configuration IA stockée uniquement sous `app.getPath("userData")/config/ai-settings.json` ;
- IA locale désactivée par défaut avec URL par défaut `http://localhost:11434/` ;
- validation main process des URL Ollama : seuls `localhost`, `127.0.0.1` et `::1` sont acceptés, sans chemin API ;
- test manuel Ollama limité à `/api/version` et `/api/tags`, sans document, sans prompt et sans mutation ;
- détection sobre d'un modèle absent, d'une erreur réseau ou d'un timeout ;
- bouton explicite `Analyser avec IA locale` après extraction PDF native ou OCR image du document actif ;
- appel Ollama documentaire uniquement si l'IA est activée, sauvegardée, testée OK et si le document appartient encore à la dernière file scannée ;
- chargement du modèle Ollama uniquement à la première analyse IA utile ;
- conservation du modèle via `keep_alive: "30m"` et réutilisation pour les documents suivants ;
- statut discret du modèle IA : prêt, chargement, absent, Ollama indisponible ou erreur locale ;
- bouton avancé `Libérer le modèle IA`, sans effet sur les documents ;
- tentative sobre de libération du modèle à la fermeture de l'application avec timeout court ;
- prompt Ollama borné à partir du nom de fichier, de l'extension, de l'extrait PDF/OCR, des règles locales et des dossiers relatifs connus, sans chemin Windows complet, sans journal, sans cache complet, sans autres documents et sans texte intégral ;
- génération Ollama locale via `/api/generate` avec sortie JSON demandée strictement ;
- validation IA-0 obligatoire de toute réponse Ollama, avec refus sobre des JSON invalides et des dossiers cible dangereux ;
- affichage séparé de la suggestion IA : date, type, sujet, mots-clés, dossier, score, raisons, avertissements et conflit avec les règles locales ;
- bouton `Appliquer aux champs vides` pour la suggestion IA, sans remplacement des champs déjà saisis ;
- application éventuelle du dossier IA uniquement dans le champ de sous-dossier cible vide, puis relance des contrôles dossier/collision existants ;
- action `Ignorer` pour masquer la suggestion IA courante, sans mutation fichier.

## Convention de nommage

Format prévisualisé :

```text
AAAA-MM-JJ_Sujet_Type_MotsCles.ext
```

Une année seule est acceptée si la date documentaire complète n'est pas connue :

```text
AAAA_Sujet_Type_MotsCles.ext
```

Règles principales :

- underscores entre les grands blocs ;
- tirets dans les mots d'un même bloc ;
- accents et caractères Windows interdits normalisés ;
- extension conservée en minuscule ;
- date documentaire et sujet requis pour générer un nom final ;
- le classement réel renomme et déplace uniquement après validation explicite.

## Journal local

Les actions sont journalisées au format JSONL dans le dossier utilisateur Electron :

```text
app.getPath("userData")/history/actions.jsonl
```

Le journal contient les chemins source/cible nécessaires à l'annulation, les noms avant/après, le statut `started`/`completed`/`failed` et un hash SHA-256 du fichier avant déplacement. Il ne contient pas d'OCR, pas de contenu documentaire et pas de métadonnées inutiles.

Le journal est relu au démarrage pour retrouver la dernière action `classify completed` non déjà annulée. L'annulation refait les contrôles au clic : fichier classé présent, ancien chemin source libre, hash inchangé si disponible, puis déplacement inverse par `fs.rename`.

## Sécurité IPC / preload

Le renderer n'a pas d'accès direct au système de fichiers. Toutes les actions passent par une API preload limitée et testée, exposée sous `window.docSorter`.

Les canaux IPC sont listés dans un contrat explicite. Toute nouvelle méthode preload ou tout nouveau canal IPC doit être ajouté volontairement au contrat et aux tests de surface. Les chemins sensibles sont re-vérifiés côté main process avant lecture, extraction, classement ou annulation.

Les handlers IPC sensibles sont enregistrés via une couche testable côté main process. Les tests vérifient que le renderer ne fournit pas de chemin source, cible, journal ou fichier de règles arbitraire aux services métier.

## Doublons exacts

L'analyse des doublons est volontairement explicite : elle ne se lance pas automatiquement au choix de la source. Elle calcule des empreintes SHA-256 localement et compare :

- les fichiers actuellement présents dans la file scannée ;
- les fichiers déjà classés présents dans le journal local, si le fichier classé existe encore et que son hash correspond au hash enregistré au moment du classement.

Les entrées d'historique anciennes ou non fiables sont ignorées. L'application ne supprime rien, ne remplace rien et ne fusionne aucun fichier.

## File d'attente

La recherche et les filtres s'appliquent uniquement aux documents déjà présents dans la file courante. Ils ne relancent pas de scan, ne lisent pas le contenu des documents, ne parcourent pas les fichiers classés et ne consultent pas le journal complet.

Le compteur de file affiche le nombre de documents visibles sur le total scanné. Si le document actif est masqué par la recherche ou un filtre, il reste sélectionné dans l'état réel et l'interface l'indique sobrement.

Découpage interne : la logique pure recherche/filtre/tri/navigation est dans `src/documents/documentQueueView.ts`, tandis que le rendu DOM du panneau de file est isolé dans `src/renderer/queuePanel.ts`. `renderer.ts` reste le coordinateur principal.

## Texte PDF natif

L'extraction texte est déclenchée manuellement sur le document PDF actif. Elle vérifie côté main process que le document appartient à la dernière file scannée, existe encore et possède l'extension `.pdf`.

Le texte extrait n'est pas persisté et pas ajouté au journal. Les PDF scannés sans couche texte affichent un message indiquant qu'un OCR sera nécessaire plus tard.

Garde-fous MVP :

- la prévisualisation locale refuse les fichiers de plus de 50 Mo ;
- l'extraction texte PDF refuse les PDF de plus de 30 Mo ;
- l'extraction texte PDF analyse au maximum les 50 premières pages ;
- l'extrait affiché reste limité à 5 000 caractères.

## Suggestions locales

L'affichage et l'application des suggestions restent déclenchés manuellement après extraction du texte PDF natif. Les suggestions utilisent uniquement l'extrait local borné et le nom du fichier actif comme signal secondaire.

L'application peut proposer une date documentaire, un sujet, un type, un sous-dossier cible relatif et jusqu'à cinq mots-clés. Le bouton `Appliquer aux champs vides` remplit seulement les champs encore vides, puis relance le calcul du nom proposé et le contrôle cible. Les champs déjà saisis par l'utilisateur ne sont pas remplacés.

La suggestion de sous-dossier cible utilise un bouton séparé. Elle ne crée jamais de dossier automatiquement et ne déclenche aucun classement réel.

Les règles par défaut sont structurées dans un catalogue local : types de documents, sujets, alias de mots-clés et stop words. Le format est documenté dans [docs/naming-suggestion-rules.md](docs/naming-suggestion-rules.md).

Les règles utilisateur sont stockées localement dans :

```text
app.getPath("userData")/config/naming-suggestion-rules.json
```

L'application crée ce fichier s'il est absent avec un catalogue vide. Le renderer ne reçoit pas d'accès `fs` et ne fournit jamais le chemin du fichier au main process.

Ces règles restent prudentes : elles n'écrivent pas dans le journal, ne modifient aucun fichier et ne lancent ni OCR, ni IA, ni appel réseau.

## Cache local d'analyse

Le cache d'analyse est stocké localement dans :

```text
app.getPath("userData")/cache/analysis
```

Il sert uniquement à éviter de relire un PDF déjà analysé si son chemin résolu, sa taille et sa date de modification n'ont pas changé. Il peut contenir l'extrait texte borné déjà affichable, les suggestions locales calculées, la date d'analyse et des erreurs sobres. Il ne contient pas d'OCR, n'est pas écrit dans la source ou la cible et n'est pas ajouté au journal.

Si le cache est absent, illisible, invalide ou obsolète, DocSorter relance simplement l'analyse locale.

## OCR local

Le panneau `OCR local` permet de choisir un exécutable `tesseract.exe`, un dossier `tessdata`, une langue et un PSM, puis de tester le moteur avec les commandes Tesseract de diagnostic.

La configuration est stockée localement dans :

```text
app.getPath("userData")/config/ocr-settings.json
```

Le test moteur ne lance pas d'OCR sur les documents, ne lit aucun fichier de la source, ne convertit aucun PDF ou image, n'écrit pas dans la source ou la cible et ne télécharge pas de données de langue.

Les erreurs OCR principales sont volontairement explicites : moteur non configuré ou introuvable, dossier `tessdata` absent, langue manquante, échec version, échec liste de langues, timeout processus, configuration illisible ou non sauvegardable.

OCR-2 ajoute l'OCR manuel du document image actif uniquement pour `.jpg`, `.jpeg` et `.png`. L'action passe par le main process, vérifie que le document appartient à la dernière file scannée, que le fichier existe encore, qu'il ne dépasse pas 20 Mo et que Tesseract a été testé.

Le texte OCR est borné à 20 000 caractères et l'extrait affiché à 5 000 caractères. Il peut être utilisé pour `Analyser les suggestions`, puis `Appliquer aux champs vides`, sans application automatique.

Le cache OCR image utilise le dossier existant :

```text
app.getPath("userData")/cache/analysis
```

Une entrée OCR image contient l'empreinte du document, le moteur `tesseract-cli`, la version Tesseract détectée, la langue, le PSM, le texte OCR borné, l'extrait affichable, les suggestions locales calculées et la date d'analyse. Elle n'est pas écrite dans la source, la cible ou le journal. Si le cache est corrompu, il est ignoré et l'OCR est relancé.

## IA locale

IA-0 prépare un contrat de classification pour une IA locale. IA-1 ajoute la configuration et le test de connexion d'un Ollama local optionnel. IA-2 branche Ollama sur le document actif, uniquement via le bouton explicite `Analyser avec IA locale`. IA-2.5 gère le cycle de vie du modèle Ollama : chargement à la première analyse, conservation temporaire et libération contrôlée.

Aucune analyse IA n'est lancée automatiquement au changement de document, au scan, à l'extraction texte ou à l'OCR. L'IA propose seulement : elle ne renomme pas, ne déplace pas, ne classe pas, ne crée pas de dossier et ne remplace pas les champs déjà saisis.

L'entrée IA est volontairement bornée et ne contient pas de chemins Windows complets, pas de journal, pas de cache complet, pas d'autres documents et pas de texte intégral. Elle peut contenir seulement le nom de fichier, l'extension, des extraits texte/OCR bornés, les suggestions de règles locales déjà calculées, les dossiers relatifs connus, la convention de nommage et une date ou année détectée.

La sortie IA validée peut proposer uniquement :

```text
date?, documentType?, subject?, keywords[], targetFolder?, confidence, reasons[], warnings[], source="simulated-ai"|"ollama"
```

Le validateur refuse les objets non JSON, les champs inconnus, les scores hors `0..100`, les dates invalides et les dossiers absolus, trop profonds ou avec traversée `..`. Les types, sujets et mots-clés sont normalisés avec la logique de nommage existante.

Le provider simulé est déterministe et sert aux tests : Renault Captur, avis d'imposition, assurance habitation, certificat de scolarité, puis suggestion faible pour les cas inconnus. Les suggestions IA restent séparées des règles utilisateur, ne modifient aucun fichier et ne déclenchent jamais de classement.

La configuration Ollama est stockée localement dans :

```text
app.getPath("userData")/config/ai-settings.json
```

Elle contient seulement `enabled`, `provider`, `baseUrl`, `model`, `timeoutMs`, `lastTestAt`, `lastStatus` et `lastError`. Elle ne stocke pas de texte documentaire, pas de prompt, pas d'OCR, pas de cache, pas de journal et pas de chemin de document.

Les URL Ollama sont refusées si elles pointent vers une machine externe, une IP LAN, un domaine public, des identifiants, une query string, un fragment ou un chemin comme `/api/generate`. Les codes principaux sont `AI_URL_NOT_LOCAL`, `AI_PROVIDER_DISABLED` et `AI_CONFIG_INVALID`.

Le bouton `Tester Ollama` appelle seulement `/api/version` puis `/api/tags`. Il peut afficher connexion OK, modèle absent, erreur réseau ou timeout.

Le bouton `Analyser avec IA locale` envoie à Ollama un prompt borné, construit depuis l'extrait PDF/OCR du document actif. La réponse doit être un JSON strict conforme au contrat IA-0. Si la sortie est invalide, dangereuse ou trop éloignée du contrat, l'interface affiche `Suggestion IA invalide` sans crash et sans application automatique.

Avant l'envoi du prompt, DocSorter vérifie que le modèle configuré est disponible puis le charge via Ollama sans contenu documentaire. Un seul chargement peut être actif à la fois. Si le modèle est déjà prêt dans la session, les documents suivants réutilisent ce modèle et l'interface n'affiche plus `Chargement du modèle IA...`.

La conservation utilise `keep_alive: "30m"`. L'action avancée `Libérer le modèle IA` envoie une requête de déchargement `keep_alive: 0`. À la fermeture, l'application tente aussi de libérer le modèle avec un timeout court, sans bloquer indéfiniment.

Le bouton `Appliquer aux champs vides` peut recopier date, sujet, type et mots-clés uniquement quand les champs correspondants sont vides. Si le dossier cible IA est appliqué, l'application relance les contrôles existants de dossier et de collision. La fusion intelligente entre règles locales et IA est volontairement reportée.

## Raccourcis clavier

Les raccourcis globaux sont désactivés dans les champs de saisie, les listes de sélection et les zones `contenteditable`. `Ctrl+Z` dans un champ texte reste l'annulation native de saisie.

- `ArrowDown` / `ArrowUp` : document suivant / précédent dans la file visible ;
- `PageDown` / `PageUp` : avancer / reculer de plusieurs documents ;
- `Ctrl+F` : focaliser la recherche ;
- `Escape` dans la recherche : vider la recherche, puis retirer le focus si elle est déjà vide ;
- `D` : activer ou désactiver le filtre `Doublons` ;
- `T` : revenir au filtre `Tous` ;
- `R` : rafraîchir la source si disponible ;
- `V` : lancer `Vérifier avant classement` si disponible ;
- `Ctrl+Enter` : lancer le classement réel uniquement si un plan valide est affiché ;
- `Ctrl+Z` : annuler la dernière action uniquement hors champ de saisie ;
- `?` : afficher ou masquer l'aide des raccourcis.

## Dépendances

- `pdfjs-dist` : utilisé pour rendre localement les PDF dans un canvas et extraire le texte natif des PDF. Cette dépendance ne fait pas d'OCR, d'upload ou d'analyse distante.

## Ce qui ne fonctionne pas encore

- pas de suppression ;
- pas de persistance des chemins source/cible ni des préférences UI générales ;
- pas de watcher automatique du dossier source ;
- pas d'annulation multiple ;
- pas de fallback `copy + delete` pour les déplacements entre volumes ;
- pas de suppression, remplacement ou fusion de doublons ;
- pas de doublons probables ou similaires ;
- pas de recherche globale dans les documents classés ;
- pas de recherche plein texte globale dans les PDF ou images classés ;
- pas d'application automatique des suggestions ;
- pas d'éditeur JSON avancé ;
- pas de gestion multi-profils de règles ;
- pas d'OCR PDF, pas de fusion automatique IA/règles, pas de suggestion IA batch, pas de doublons probables, packaging avancé ou DOCX.

## Recommandation de test

Tester le Lot 6D d'abord avec des dossiers temporaires, jamais directement sur un dossier personnel important.
Pour le classement réel et l'annulation, tester aussi la fermeture puis relance de l'application avant d'annuler.

## Passage futur recommandé

Un prochain lot pourra ajouter :

- annulation multiple si le journal et les chemins restent cohérents ;
- OCR-3 pourra ajouter l'OCR limité des PDF scannés, dans un lot séparé et explicitement validé ;
- IA-3 pourra ajouter une fusion contrôlée entre suggestions IA et règles locales, avec arbitrage explicite des conflits ;
- amélioration des diagnostics modèles Ollama si certains modèles ne respectent pas le JSON mode attendu ;
- amélioration progressive des règles de suggestion à partir de cas réels validés manuellement ;
- audit du code avant d'élargir l'éditeur de règles ;
- persistance locale de préférences UI simples si l'usage le justifie ;
- amélioration progressive de l'aide au choix de dossier cible, sans OCR ni upload.

## Validations manuelles

- l'application démarre avec `npm run dev` ;
- aucun faux document n'est affiché au démarrage ;
- le bouton `Choisir source` permet de sélectionner un dossier ;
- le bouton `Rafraîchir` est désactivé tant qu'aucune source n'est sélectionnée ;
- les PDF/JPG/JPEG/PNG du dossier apparaissent dans la file d'attente ;
- un nouveau PDF ou PNG ajouté au dossier apparaît après `Rafraîchir` ;
- un fichier supprimé ou déplacé disparaît de la file après `Rafraîchir` ;
- les fichiers non supportés et les sous-dossiers n'apparaissent pas ;
- le bouton `Choisir cible` affiche le chemin cible sélectionné ;
- une image sélectionnée s'affiche réellement ;
- les contrôles zoom image fonctionnent ;
- la rotation image est seulement visuelle ;
- un PDF sélectionné affiche sa première page ;
- les boutons page précédente/suivante fonctionnent sur un PDF multipage ;
- les contrôles zoom PDF fonctionnent ;
- si un fichier est déplacé ou supprimé après le scan, une erreur propre s'affiche et le document peut être marqué `Indisponible` ;
- les champs de renommage apparaissent quand un document est sélectionné ;
- modifier date, sujet, type ou mots-clés met à jour le nom proposé ;
- les accents et caractères interdits sont normalisés dans la proposition ;
- date ou sujet manquant affiche un message de validation ;
- sans cible sélectionnée, le contrôle cible indique qu'aucune cible n'est disponible ;
- avec une cible sélectionnée, un nom absent indique `Nom disponible` ;
- si le nom proposé existe déjà dans la cible, une alternative suffixée est affichée ;
- le bouton `Appliquer le suffixe` modifie seulement la proposition affichée ;
- le bouton `Vérifier avant classement` devient disponible uniquement quand le document, la cible et le nom proposé sont prêts ;
- cliquer sur `Vérifier avant classement` affiche le récapitulatif de simulation ;
- le récapitulatif affiche `Simulation uniquement — aucun fichier n'a été modifié` ;
- le bouton `Valider et classer` devient disponible après un plan prêt ;
- cliquer sur `Valider et classer` déplace le fichier vers la cible avec le nom proposé ;
- le fichier classé disparaît de la source et apparaît dans la cible ;
- le journal local contient une action `classify` sobre ;
- l'historique récent affiche le classement ;
- après fermeture et relance, `Annuler dernière action` redevient disponible si la dernière action est sûre ;
- le bouton `Annuler dernière action` restaure le fichier si les chemins sont encore libres ;
- l'historique récent affiche l'annulation ;
- le journal local contient une action `undo-classify` après annulation ;
- le bouton `Analyser les doublons exacts` reste désactivé tant qu'aucune source scannée n'est disponible ;
- deux fichiers strictement identiques dans la source affichent `Doublon exact` dans la file ;
- sélectionner un fichier doublon affiche le panneau `Doublons exacts` dans la colonne droite ;
- un doublon avec un fichier déjà classé apparaît seulement si le fichier classé existe encore et si son hash n'a pas changé ;
- `Ignorer pour l'instant` masque l'alerte du document actif pour la session ;
- `Conserver quand même` masque aussi l'alerte du document actif pour la session, sans action disque ;
- préparer puis valider un classement sur un doublon affiche un avertissement, mais ne supprime ni ne remplace aucun fichier ;
- supprimer ou déplacer un fichier de la source avant l'analyse marque le document comme indisponible ;
- saisir une partie de nom dans la recherche filtre immédiatement la file courante ;
- la recherche ignore la casse et les accents simples ;
- vider la recherche restaure la file affichée ;
- les filtres `PDF`, `Images`, `Doublons`, `Indisponibles` et `À traiter` se combinent avec la recherche ;
- le compteur visible/total reste cohérent après recherche, filtre et tri ;
- le tri par nom, date, taille, type et statut ne modifie pas la vraie file scannée ;
- les boutons `Précédent` et `Suivant` suivent la liste actuellement filtrée et triée ;
- si le document actif est masqué par un filtre, un message l'indique sans le supprimer de l'état réel ;
- depuis le panneau `Doublons exacts`, cliquer un doublon présent dans la source sélectionne ce document ;
- `ArrowDown` et `ArrowUp` changent de document dans la file visible et l'aperçu suit ;
- `PageDown` et `PageUp` avancent ou reculent de plusieurs documents ;
- `Ctrl+F` focalise le champ de recherche ;
- `Escape` vide la recherche, puis retire le focus si elle est déjà vide ;
- `D` active ou désactive le filtre `Doublons` hors champ de saisie ;
- `T` revient au filtre `Tous` hors champ de saisie ;
- `R` rafraîchit la source si le bouton est disponible ;
- les touches lettres dans les champs date, sujet, type, mots-clés ou recherche ne déclenchent pas les raccourcis globaux ;
- `V` lance seulement la vérification avant classement ;
- une simple touche `Enter` ne lance jamais le classement réel ;
- `Ctrl+Enter` lance le classement réel uniquement quand un plan valide est affiché ;
- `Ctrl+Z` hors champ texte annule la dernière action si elle est disponible ;
- `Ctrl+Z` dans un champ texte n'annule pas le classement ;
- `?` affiche ou masque l'aide des raccourcis ;
- le bouton `Extraire le texte PDF` est disponible seulement pour un PDF actif ;
- cliquer sur `Extraire le texte PDF` affiche un extrait lisible pour un PDF contenant du texte natif ;
- l'extrait PDF affiche le nombre de caractères et de pages analysées ;
- un PDF scanné sans texte affiche `Aucun texte exploitable détecté — OCR nécessaire plus tard` ;
- après extraction texte, le bouton `Analyser les suggestions` devient disponible ;
- cliquer sur `Analyser les suggestions` affiche date, sujet, type, mots-clés, score et raisons sobres si des signaux sont trouvés ;
- le panneau `Règles de suggestion` affiche le nombre de règles par défaut et utilisateur ;
- si le fichier de règles utilisateur est absent, il est créé dans `userData/config` ;
- ajouter une règle utilisateur simple, sauvegarder, puis relancer les suggestions permet à la règle de contribuer ;
- désactiver ou supprimer une règle utilisateur puis sauvegarder retire sa contribution ;
- si le JSON utilisateur est invalide, l'application revient aux règles par défaut avec un avertissement sobre ;
- un PDF sans texte exploitable n'affiche aucune suggestion ;
- `Appliquer aux champs vides` remplit seulement les champs vides du panneau `Renommage proposé` ;
- les champs déjà saisis manuellement ne sont pas remplacés par une suggestion ;
- après application, le nom proposé et le contrôle cible sont recalculés ;
- les suggestions peuvent être relues depuis le cache local, ne modifient pas le journal et ne modifient aucun fichier ;
- le fichier de règles utilisateur ne contient pas de texte extrait, pas de chemins documentaires et pas de contenu OCR ;
- une image sélectionnée ne permet pas l'extraction texte PDF ;
- supprimer ou déplacer un PDF après scan puis lancer l'extraction affiche une erreur propre ;
- l'extraction texte peut alimenter le cache local d'analyse, ne modifie pas le journal et ne modifie aucun fichier source ou cible ;
- le panneau `OCR local` affiche l'état de configuration Tesseract ;
- choisir `tesseract.exe` et `tessdata` remplit seulement la configuration OCR locale ;
- sauvegarder la configuration OCR crée ou met à jour `userData/config/ocr-settings.json` ;
- si `fra.traineddata` manque, l'interface affiche une erreur sobre de langue manquante ;
- `Tester Tesseract` lit seulement la version et les langues disponibles ;
- sélectionner une image JPG/JPEG/PNG affiche le bouton `Lancer OCR sur cette image` si Tesseract est configuré et testé ;
- lancer l'OCR sur une image affiche le texte OCR, la langue, le PSM, la durée et l'état cache ;
- relancer l'OCR sur la même image non modifiée indique un résultat issu du cache ;
- une image trop volumineuse affiche une erreur sobre et ne lance pas Tesseract ;
- une image sans texte affiche `Aucun texte exploitable détecté` ;
- un PDF ne déclenche pas l'OCR image et garde l'extraction texte native ;
- après OCR image réussi, `Analyser les suggestions` puis `Appliquer aux champs vides` fonctionnent sans remplacer les champs déjà saisis ;
- aucun OCR batch, aucune conversion PDF/image et aucune écriture source/cible ne sont déclenchés depuis OCR-2 ;
- le panneau `IA locale` est visible et reste désactivé par défaut ;
- au premier démarrage, l'IA locale est désactivée par défaut ;
- activer l'IA locale avec `http://localhost:11434/`, saisir un modèle puis sauvegarder crée `userData/config/ai-settings.json` ;
- avec Ollama lancé, `Tester Ollama` affiche une connexion OK si le modèle est présent ;
- avec Ollama lancé mais modèle absent, `Tester Ollama` affiche un état modèle absent ;
- avec Ollama arrêté, `Tester Ollama` affiche une erreur sobre ou un timeout ;
- une URL externe ou LAN est refusée par la configuration IA ;
- après extraction texte PDF ou OCR image, le bouton `Analyser avec IA locale` devient disponible si Ollama est activé, sauvegardé et testé OK ;
- à la première analyse IA, le panneau peut afficher `Chargement du modèle IA...` ;
- une deuxième analyse IA sur un autre document réutilise le modèle déjà chargé sans nouveau préchargement visible ;
- le statut modèle affiche `IA locale prête` après chargement réussi ;
- `Libérer le modèle IA` décharge le modèle et repasse le statut à non chargé ;
- après libération manuelle, une nouvelle analyse recharge le modèle ;
- fermer l'application tente de libérer le modèle sans écrire de contenu documentaire dans les logs ;
- cliquer sur `Analyser avec IA locale` affiche une suggestion validée ou une erreur sobre, sans modifier le document ;
- la suggestion IA affiche date, type, sujet, mots-clés, dossier, score, raisons et avertissements ;
- si Ollama est arrêté ou si le modèle est absent, l'analyse IA affiche une erreur sobre ;
- une réponse Ollama non JSON ou hors contrat affiche `Suggestion IA invalide` sans crash ;
- `Appliquer aux champs vides` depuis la suggestion IA ne remplace pas les champs déjà saisis ;
- appliquer un dossier IA dans un champ cible vide relance les contrôles existants de dossier et collision ;
- changer de document ou relancer extraction/OCR efface la suggestion IA courante ;
- ignorer une suggestion IA ne modifie aucun fichier et ne modifie pas le journal ;
- modifier manuellement le fichier classé dans la cible bloque l'annulation ;
- recréer manuellement un fichier à l'ancien chemin source bloque l'annulation ;
- créer une collision dans la cible puis relancer la préparation bloque le plan ;
- créer une collision dans la cible entre simulation et validation bloque le classement réel ;
- supprimer ou déplacer le fichier source puis relancer la préparation bloque le plan proprement ;
- changer de document réinitialise proprement la proposition ;
- aucun fichier n'est écrasé ni supprimé automatiquement.

## Principes

- aucun upload serveur ;
- aucun tracking ;
- aucune suppression automatique ;
- pas de renommage ni déplacement sans validation explicite ;
- logs sobres pour limiter l'exposition de documents sensibles.
