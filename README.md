# DocSorter Local

Application desktop locale pour trier, prévisualiser, renommer et déplacer des documents personnels depuis Windows.

## Statut

Lot 7 + 8A : source, racine cible avec sous-dossier relatif, file d'attente réelle, prévisualisation locale PDF/image, classement réel sécurisé, journal local, historique récent, annulation persistante, doublons exacts, recherche/tri/navigation, raccourcis clavier sûrs, extraction locale du texte PDF natif sans OCR, suggestions locales de nommage et de sous-dossier cible, règles utilisateur locales avec éditeur minimal, création explicite de sous-dossier cible et cache local minimal d'analyse.

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
- pas de configuration persistée ;
- pas de watcher automatique du dossier source ;
- pas d'annulation multiple ;
- pas de fallback `copy + delete` pour les déplacements entre volumes ;
- pas de suppression, remplacement ou fusion de doublons ;
- pas de doublons probables ou similaires ;
- pas de recherche globale dans les documents classés ;
- pas de recherche plein texte dans les PDF ou images ;
- pas d'extraction texte pour les images ;
- pas d'application automatique des suggestions ;
- pas d'éditeur JSON avancé ;
- pas de gestion multi-profils de règles ;
- pas d'OCR, IA, doublons probables, packaging avancé ou DOCX.

## Recommandation de test

Tester le Lot 6D d'abord avec des dossiers temporaires, jamais directement sur un dossier personnel important.
Pour le classement réel et l'annulation, tester aussi la fermeture puis relance de l'application avant d'annuler.

## Passage futur recommandé

Un prochain lot pourra ajouter :

- annulation multiple si le journal et les chemins restent cohérents ;
- OCR local optionnel pour PDF scannés, dans un lot séparé et explicitement validé ;
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
