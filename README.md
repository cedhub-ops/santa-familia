# 🎄 Santa Familia

Application de Secret Santa en famille : chacun crée son compte, remplit sa liste d'envies, propose des idées secrètes pour les autres, puis un tirage au sort désigne à qui offrir un cadeau.

- **Application** (installable sur téléphone, utilisable aussi sur ordinateur) : https://cedhub-ops.github.io/santa-familia/
- **Serveur et données** : un Google Sheet + Google Apps Script ([`apps-script/Code.gs`](apps-script/Code.gs)).

## Mise en place côté Google

1. Dans le Google Sheet, ouvre **Extensions → Apps Script**. Remplace le contenu de `Code.gs` par [`apps-script/Code.gs`](apps-script/Code.gs), puis clique sur 💾.
2. Ouvre **⚙️ Paramètres du projet → Propriétés du script** et ajoute `ADMIN_CODE` = ton code organisateur (6 caractères minimum).
3. Va dans **Déployer** :
   - **Première fois** : *Nouveau déploiement → Application Web*, puis *Exécuter en tant que : Moi* et *Qui a accès : Tout le monde*. Copie l'URL `…/exec` dans [`config.js`](config.js).
   - **Mise à jour du code** : *Gérer les déploiements → ✏️ → Version : Nouvelle version → Déployer*. L'URL ne change pas.

Les données existantes sont conservées. Les nouvelles colonnes (famille, couleur) et l'onglet `Notifications` sont créés automatiquement.

## Fonctionnalités

| Pour qui | Quoi |
|---|---|
| Participants | Choisir son prénom (ou ouvrir son **lien perso**), créer un code, remplir **Ma liste**, proposer des idées **Pour les autres**, découvrir sa personne après le tirage |
| Participants | 🔔 **Cloche** : tâches à faire, annonce du tirage, nouvelles idées pour sa personne secrète (sans dévoiler qui), messages de l'organisateur, compte à rebours |
| Organisateur | **⚙︎ Espace organisateur** (sur téléphone ou ordinateur) : participants, familles, couleurs, exclusions, date et budget, messages, tirage |
| Organisateur | **Inviter** : QR code, bouton Partager (WhatsApp, SMS…), lien perso par participant |

## Règles du tirage

- 🏠 **Familles** : les membres d'une même famille ne se tirent jamais entre eux.
- 🚫 **Exclusions** : entre deux personnes, entre une personne et toute une famille, ou entre deux familles.
- ✅ L'espace organisateur indique en direct si le tirage est possible et qui a peu de choix.
- 🎨 **Couleurs** : une couleur par famille, et éventuellement une couleur perso par membre.

## Qui voit quoi ?

| Information | Visible par |
|---|---|
| Ma liste d'envies | Moi + mon Secret Santa |
| Une idée proposée pour Paul | Son auteur + le Secret Santa de Paul (jamais Paul) |
| Le tirage | Chacun ne voit que sa propre personne (l'organisateur non plus ne voit rien dans l'app) |

## Modifier l'application

- **Avec Claude Code** : ouvre une session sur ce dépôt et décris ce que tu veux changer.
- **À la main** : ouvre un fichier sur GitHub, clique sur ✏️, puis sur **Commit changes**. Le site se met à jour en une à deux minutes.

## Tests (développeurs)

```bash
node test/run-tests.js   # serveur : règles, tirage, confidentialité, notifications
node test/ui-test.js     # parcours complet sur téléphone et ordinateur simulés (captures dans captures/)
```
