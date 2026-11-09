# Mise en ligne gratuite — GitHub Pages + Cloudflare

Guide du 8 novembre 2026 pour **ce dossier livré**, et non pour le logiciel Python. Les intitulés des services peuvent évoluer.

Noms harmonisés le 9 novembre 2026 :

| Élément | Nom retenu |
| --- | --- |
| Worker Cloudflare (`name`) | `pystats-calibration-api` |
| Base D1 (`database_name`) | `pystats-calibration` |
| Liaison de la base dans le code (`binding`) | `DB`, utilisée comme `env.DB` |
| Secret du Worker | `ADMIN_TOKEN` |
| Dépôt et chemin GitHub Pages | `calibration-web` |

Ces noms désignent des éléments différents. Ne pas renommer le binding `DB` pour lui donner le nom de la base.

## 1. Préparer les comptes et les outils

Vous avez déjà GitHub. Créez un compte sur [Cloudflare](https://dash.cloudflare.com/sign-up), confirmez votre mail et utilisez **Workers Free**. Aucun domaine à acheter : une adresse `workers.dev` est fournie.

Installez si nécessaire [Node.js](https://nodejs.org/) version 24 ou ultérieure avec npm. Dans un nouveau terminal PowerShell :

```powershell
node --version
npm.cmd --version
Set-Location -LiteralPath 'C:\Users\Famille\Documents\PyStats_REAL\methode\GitHub_web'
node --test tests/worker.test.mjs
```

Le suffixe `.cmd` évite certains blocages de scripts PowerShell. Les outils d’aperçu et d’administration utilisent uniquement Node, sans installation de bibliothèque. Wrangler, l’outil officiel Cloudflare, sera utilisé avec `npx.cmd` pour le déploiement.

## 2. Créer la base privée dans l’Union européenne

Dans Cloudflare : **Storage & databases → D1 SQL Database → Create database**.

- Nom : `pystats-calibration` (base Cloudflare existante).
- **Data location → Specify jurisdiction → European Union**.
- Créer, puis relever l’identifiant de la base.

Il faut choisir la **juridiction**, pas seulement une préférence de localisation. Elle se fixe à la création et ne peut pas être ajoutée après coup. Si une base vide a déjà été créée sans cette option, créer une nouvelle base avec un autre nom et adapter le fichier de configuration. La restriction UE porte sur D1, pas sur l’ensemble du réseau mondial Cloudflare. [Documentation officielle](https://developers.cloudflare.com/d1/configuration/data-location/)

Dans `wrangler.jsonc`, remplacer `REMPLACER_PAR_ID_D1` par l’identifiant fourni. Conserver le binding `DB` et corriger `database_name` si vous avez choisi un autre nom.

Dans la configuration locale actuelle, l’identifiant est déjà renseigné : `becdeeb8-bc78-455b-8960-b8ab6e6358f6`.

## 3. Configurer l’information des participants

Dans `wrangler.jsonc`, partie `vars` :

- `PUBLIC_ORIGIN` : `https://fontaine-julien.github.io` si le site est publié sous ce compte. Il s’agit de l’origine seule, **sans chemin de dépôt ni barre finale**.
- `CONTACT_EMAIL` : laisser vide conformément au choix de ne pas afficher de contact public. Ce champ est techniquement facultatif ; si une adresse y est ajoutée ultérieurement, elle sera affichée dans la notice.
- `RETENTION_DAYS` : conserver `180`, soit environ six mois, durée retenue pour cette version. C’est une durée en jours, pas en mois calendaires.
- `PRIVACY_REVIEWED` : laisser `false` jusqu’à la relecture de la notice et la configuration effective du stockage. Passer à `true` lorsque ces informations correspondent à votre organisation.

Le site ne collecte pas le mail des participants et n’utilise aucun service d’email. Les données sont téléchargeables depuis le bilan et l’espace « Mes données ». **Le fait de rendre le mail facultatif dans le code ne règle pas l’obligation de fournir les coordonnées du responsable ou d’un point de contact.** Les données pseudonymisées restent personnelles ; l’accès et la suppression automatiques ne couvrent pas à eux seuls tous les droits. Cette limite est détaillée dans `CONFIDENTIALITE_ET_SECURITE.md`. [Information des personnes — CNIL](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence)

Relire la notice dans `docs/index.html` et le document `CONFIDENTIALITE_ET_SECURITE.md`. La version est destinée à des adultes volontaires. Un usage avec des enfants nécessite de revoir le protocole de participation et sa base légale, pas simplement d’enlever la case « 18 ans ».

Le code ne certifie pas à lui seul la conformité juridique de l’exploitation. Vérifier les conditions des prestataires, les accords de traitement et la gestion des exports locaux avant d’ouvrir la collecte.

## 4. Déployer le serveur Cloudflare

Dans le terminal, toujours à la racine de `GitHub_web` :

```powershell
npx.cmd wrangler@latest login
npx.cmd wrangler@latest d1 migrations apply pystats-calibration --remote
npx.cmd wrangler@latest deploy
```

La première commande ouvre la connexion Cloudflare. La seconde crée les tables vides dans **la base distante nommée**, sans importer de résultats de démonstration. Si la base porte un autre nom, adapter la commande.

Le déploiement affiche une adresse de ce type :

```text
https://pystats-calibration-api.julien-fontaine.workers.dev
```

Le serveur ne propose pas de page web à sa racine : un refus sans clé sur `/` est normal. Son adresse `/config` fournit uniquement la configuration publique et l’état d’ouverture.

Créer ensuite le secret d’administration :

```powershell
node tools/admin.mjs secret
npx.cmd wrangler@latest secret put ADMIN_TOKEN
```

La première commande écrit un secret aléatoire dans `private/admin-secret.txt`. Ouvrez ce fichier localement, puis collez sa valeur **dans l’invite masquée de Wrangler**. Ne mettez pas le secret dans une commande, un commit, `docs/config.js` ou un fichier destiné au site. Conservez-le dans un gestionnaire de mots de passe. Le dossier `private/` est exclu de Git ; l’exclusion ne protège pas un glisser-déposer manuel sur GitHub.

Si `secret put` a proposé de créer `pystats-calibration-api`, puis confirmé l’enregistrement du secret, cette étape est réussie. Elle ne confirme pas le déploiement du code de ce dossier. Exécuter ensuite `npx.cmd wrangler@latest deploy` depuis `GitHub_web`, puis relever l’URL affichée pour remplir `docs/config.js`. Ne pas recréer le secret simplement parce que le Worker vient d’être créé.

Wrangler configure aussi la tâche quotidienne de suppression à 03 h 17 UTC. Vérifiez sa présence dans les réglages du Worker. La conservation est en outre contrôlée lors des accès et des exports : les données expirées ne sont plus accessibles même si la tâche quotidienne n’a pas encore tourné.

Sources : [D1 et migrations](https://developers.cloudflare.com/d1/reference/migrations/), [secrets Workers](https://developers.cloudflare.com/workers/configuration/secrets/), [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

## 5. Relier la page au serveur

Dans `docs/config.js`, renseigner `apiBase` avec l’adresse HTTPS du Worker, sans barre finale. Les liens vers PyStats et le profil GitHub sont déjà renseignés d’après le README officiel du projet.

```javascript
apiBase: 'https://pystats-calibration-api.julien-fontaine.workers.dev',
```

Cette adresse n’est pas secrète. Les mots de passe et les réponses le sont, et ne doivent jamais être ajoutés à ce fichier.

Le sous-domaine Cloudflare est **`julien-fontaine`**, alors que le compte GitHub est **`fontaine-julien`**. Ne pas les intervertir. Si l’outil indique une erreur DNS (`ENOTFOUND`), vérifier cette adresse. L’administration teste désormais `/config` sans secret avant de demander `ADMIN_TOKEN` et distingue les problèmes de connexion des refus d’authentification.

État local au 9 novembre : `apiBase` est renseigné avec l’adresse ci-dessus, dont `/config` répond HTTP 200. `PRIVACY_REVIEWED` est passé à `true` pour permettre la création des invitations demandée par l’organisateur ; **un nouveau `wrangler deploy` est nécessaire** pour appliquer ce changement. Le serveur interrogé avant ce redéploiement annonçait encore `ready: false`.

La politique de sécurité de `docs/index.html` autorise les API `workers.dev`. Si vous changez pour un domaine personnalisé, il faudra adapter précisément `connect-src`. L’adresse locale autorisée dans la version de développement peut être retirée lors de la publication.

## 6. Publier le site sur GitHub Pages

Créer un dépôt **public distinct nommé `calibration-web`** sous le compte `fontaine-julien`. Ne pas utiliser le dépôt complet PyStats_REAL comme source du site : il contient d’autres fichiers et potentiellement des données locales. La base Cloudflare se nomme `pystats-calibration` : ce nom est indépendant du nom du dépôt.

Envoyer les éléments de code de ce dossier : `docs`, `worker`, `migrations`, `tools`, `tests`, `package.json`, `wrangler.jsonc`, `.gitignore`, `LICENSE` et les documents `.md`. Le code serveur peut être public : il ne contient ni la série tirée en production ni de clés ni de résultats. Ne jamais envoyer `private`, `.wrangler`, `.dev.vars`, des CSV ou des bases.

Dans le dépôt :

1. **Settings → Pages**.
2. **Source → Deploy from a branch**.
3. Branche **main**, dossier **/docs** (et non la racine).
4. **Save**.

L’adresse retenue est `https://fontaine-julien.github.io/calibration-web/`. Vérifier l’adresse effectivement affichée par GitHub après publication. [Documentation GitHub](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

Seul `docs/` devient le site. La racine du dépôt reste consultable comme code source public. Garder `docs/.nojekyll` et `docs/LICENSE.txt` dans l’envoi.

## 7. Faire un essai avant diffusion

Une fois la notice finalisée et `PRIVACY_REVIEWED` à `true`, redéployer le Worker :

```powershell
npx.cmd wrangler@latest deploy
node tools/admin.mjs
```

L’outil d’administration demande le secret **sans l’afficher**, puis propose un menu. Créer d’abord une invitation de contrôle. Les invitations sont enregistrées localement dans `private/invitations-DATE.json`. Leur code n’est affiché qu’à la création et n’est conservé qu’en empreinte dans la base.

Faire une passation réelle de contrôle sur le site publié : vérifier le pavé, le plein écran, les 50 copies, la pause, les 50 multiplications, le bilan et le CSV. Vérifier aussi le refus d’un code inventé, d’un code réutilisé et des routes d’export sans authentification. Réserver une invitation distincte à l’essai d’interruption et une à la suppression. Supprimer les données de contrôle avant la collecte.

Une invitation ne suffit pas à certifier l’identité physique du participant. Il faut demander une seule participation par adulte et éviter de redistribuer des invitations à une même personne. Si quelqu’un partage son code ou ses clés, le serveur ne peut pas reconnaître sa personne physique.

## 8. Envoyer des invitations et récupérer les réponses

Lancer `node tools/admin.mjs` :

- **1** : créer 1 à 100 invitations. Envoyer à chaque adulte l’adresse du site et un code différent, par votre messagerie habituelle.
- **2** : consulter les passations et le journal des suppressions.
- **3** : télécharger deux CSV dans `private/` : les réponses détaillées et les bilans individuels. La console affiche aussi l’écart moyen des participants complets ayant au moins une paire retenue, avec le même poids pour chacun. Les essais incomplets restent dans les fichiers, avec leur statut, mais sont exclus de cette moyenne globale.
- **4** : supprimer les données d’une passation identifiée.

Ne pas mettre les codes dans l’URL : les participants les collent dans le formulaire. Ne pas publier de CSV, même avec des identifiants aléatoires. Les participants téléchargent leur propre copie via leur clé de gestion ; ils n’ont pas accès aux autres.

Les colonnes `first_ms`, `last_ms` et `enter_ms` sont en **millisecondes**, les dates `*_at` sont des horodatages Unix en millisecondes. `last_ms` est la durée principale ; `enter_ms` reste diagnostique. `phase` vaut `copy` ou `tables`, `correct` vaut 0 ou 1. `pair_id` sert à l’appariement. Un index d’item commence à 0.

Dans le fichier `bilans`, `copySeconds`, `tablesSeconds` et `differenceSeconds` sont en **secondes**. Pour une passation interrompue, tout bilan partiel éventuel reste explicitement associé au statut `interrupted` ; ne pas le confondre avec un résultat sur 100 items.

Avant chaque analyse, consulter le journal des suppressions et retirer les identifiants concernés de toutes les copies précédemment exportées. Supprimer aussi les lignes arrivées à `expires_at`. Cloudflare ne peut pas effacer un CSV déjà téléchargé sur votre ordinateur.

## 9. Gratuité et entretien

Les offres vérifiées le 8 novembre 2026 comprennent 100 000 requêtes Worker/jour, et pour D1 100 000 lignes écrites/jour et 5 Go de stockage total. Ces quotas ne sont pas un nombre équivalent de participants : une passation effectue plusieurs centaines de requêtes/opérations. Surveillez l’utilisation et restez sur **Free**. En cas de quota atteint, le service peut devenir indisponible. [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/)

Pour fermer les nouvelles participations, remettre `PRIVACY_REVIEWED` à `false` et redéployer. Cela ne bloque pas les droits sur les données déjà enregistrées. Maintenir cet accès tant que les données existent. Conserver les informations d’accès Cloudflare et GitHub sous protection forte et ne pas partager le secret administrateur.

Une mise à jour du code ne retire pas la série en base : tous continuent à recevoir `campaign-1`. Ne pas supprimer/modifier cette série au milieu d’une collecte. Pour un nouveau protocole, prévoir une campagne/version distincte.
