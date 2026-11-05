# 🎅 Santa Familia

Application de Secret Santa : chacun crée son compte, remplit sa liste d'envies, propose des idées pour les autres, puis un tirage au sort désigne à qui offrir un cadeau.

- **Application** (installable sur téléphone) : hébergée par GitHub Pages depuis ce dépôt.
- **Serveur et données** : un Google Sheet + Google Apps Script (`apps-script/Code.gs`).

## Mise en place côté Google (une seule fois, environ 10 min)

1. Va sur https://sheets.new et nomme le fichier « Santa Familia ».
2. Ouvre le menu **Extensions → Apps Script**. Remplace le contenu de `Code.gs` par [`apps-script/Code.gs`](apps-script/Code.gs), puis clique sur 💾.
3. Ouvre **⚙️ Paramètres du projet → Propriétés du script → Ajouter** :
   - Propriété : `ADMIN_CODE`
   - Valeur : ton code organisateur secret (6 caractères minimum)
4. Clique sur **Déployer → Nouveau déploiement → ⚙️ Application Web** et règle :
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**

   Clique sur **Déployer** et autorise l'accès. Si Google affiche « Application non validée », clique sur *Paramètres avancés*, puis *Accéder au projet*.
5. Copie l'URL `…/exec` et colle-la dans [`config.js`](config.js).

## Utilisation

| Qui | Quoi |
|---|---|
| Organisateur | **🔧 Espace organisateur** : ajouter les prénoms, les exclusions (couples), puis lancer le tirage quand tout le monde est inscrit |
| Participants | Choisir son prénom, créer un code (4 à 6 chiffres), remplir **Ma liste**, proposer des idées **Pour les autres** |
| Installation | Android : bouton « Installer » dans l'app. iPhone : **Partager → Sur l'écran d'accueil** |

## Qui voit quoi ?

| Information | Visible par |
|---|---|
| Ma liste d'envies | Moi + mon Secret Santa |
| Une idée proposée pour Paul | Son auteur + le Secret Santa de Paul (jamais Paul) |
| Le tirage | Chacun ne voit que sa propre personne (l'organisateur non plus ne voit rien dans l'app) |

## Modifier l'application

- **Avec Claude Code** : ouvre une session sur ce dépôt et décris ce que tu veux changer.
- **À la main** : ouvre un fichier sur GitHub, clique sur ✏️, puis sur **Commit changes**. Le site se met à jour en une à deux minutes.
- Si tu modifies `apps-script/Code.gs`, recopie-le dans Apps Script, puis va dans **Déployer → Gérer les déploiements → ✏️ → Nouvelle version**. L'URL ne change pas.

## Dépannage

| Message | Solution |
|---|---|
| « API non configurée » | L'URL `/exec` manque dans `config.js` |
| « Le serveur ne répond pas correctement » | L'accès Apps Script doit être réglé sur **Tout le monde** |
| « Code organisateur non configuré » | Il manque la propriété `ADMIN_CODE` (étape 3) |
| Quelqu'un a oublié son code | Espace organisateur → « Code oublié » |

## Tests (développeurs)

```bash
node test/run-tests.js
```
