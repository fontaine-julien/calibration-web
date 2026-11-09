# Étalonnage PyStats — version web

© 2026 Julien Fontaine · Code sous licence MIT.

Application indépendante du programme Python : 50 copies, une pause, puis 50 multiplications, une personne par invitation. Le site explique la démarche, recueille un consentement explicite et affiche le bilan individuel. Les réponses et la série commune sont conservées dans Cloudflare D1 ; GitHub Pages ne sert que les fichiers publics de `docs/`.

**Le Worker est déployé par l’organisateur** à `https://pystats-calibration-api.julien-fontaine.workers.dev` ; sa route publique `/config` a été vérifiée le 9 novembre 2026. Adresse prévue pour le site : `https://fontaine-julien.github.io/calibration-web/`. Choix confirmés : adultes uniquement, conservation 180 jours (environ six mois), aucun contact public. Le mail est techniquement facultatif ; la notice indique cette absence. Cela ne supprime pas les obligations d’information et de droits du RGPD : voir le document de confidentialité. Le réglage local `PRIVACY_REVIEWED` est maintenant à `true` pour ouvrir les invitations après redéploiement ; lors de la dernière vérification, le serveur indiquait encore `ready: false`. Aucun envoi automatique de mail n’est effectué.

Commencer par [MISE_EN_LIGNE.md](MISE_EN_LIGNE.md). Lire aussi [CONFIDENTIALITE_ET_SECURITE.md](CONFIDENTIALITE_ET_SECURITE.md).

## Aperçu sur cet ordinateur

Depuis ce dossier, avec Node.js 24 ou ultérieur :

```powershell
node tools/preview.mjs
```

Ouvrir l’adresse affichée : `http://127.0.0.1:8787`. Le terminal fournit trois invitations fictives. La base de démonstration vit uniquement en mémoire et disparaît à l’arrêt (Ctrl+C). Elle ne contacte ni Cloudflare ni GitHub pour enregistrer des réponses. Le lien vers le projet ouvre toutefois GitHub si vous cliquez dessus.

Ne pas ouvrir directement `index.html` en double-cliquant : les modules JavaScript et l’API nécessitent un serveur HTTP. Ne pas utiliser le serveur d’aperçu pour une collecte réelle ; il écoute uniquement sur l’ordinateur local.

## Fichiers

| Emplacement | Usage |
| --- | --- |
| `docs/` | Seul dossier publié comme site GitHub Pages : présentation, notice, formulaire, test et gestion de ses données |
| `worker/` | Serveur Cloudflare : invitations, contrôle des sessions, série, correction, stockage, suppression |
| `migrations/` | Structure de la base, sans aucune donnée de participant |
| `wrangler.jsonc` | Réglages de déploiement ; aucune clé secrète |
| `tools/admin.mjs` | Console locale de l’organisateur : invitations et export CSV privé |
| `tools/preview.mjs` | Aperçu local jetable |
| `private/` | Créé uniquement à l’usage : invitations, secret local et CSV, exclu de Git |
| `tests/` | Vérifications du protocole et des accès avec SQLite réel |

## Passation

1. Le participant lit la présentation et la notice. Les deux cases ne sont jamais précochées.
2. Il saisit son invitation, confirme sa majorité et consent. Le serveur réserve l’invitation une seule fois.
3. Il reçoit une clé de gestion des données à enregistrer dans un fichier privé. Il vérifie son pavé numérique avec un exemple distinct du test.
4. Il passe les 50 copies en plein écran. Chiffres et Entrée du pavé, Retour arrière ; autres saisies et clics ignorés pendant le bloc. Les répétitions automatiques de touches sont ignorées.
5. Il prend une pause, vérifie de nouveau le pavé et démarre explicitement les 50 multiplications.
6. Le bilan donne les moyennes copie/tables et l’écart sur les paires réussies dans les deux blocs. Un bouton permet de télécharger directement ses données en JSON. Elles restent également accessibles dans l’espace « Mes données » avec la clé personnelle, jusqu’à leur suppression ou leur expiration. Aucun corrigé n’est affiché en cours de test.

Deux chiffres maximum, sauf le produit 100 (trois chiffres). Une réponse plus courte reste autorisée. L’application n’injecte aucune réponse attendue dans la page de multiplication.

Une sortie de plein écran, un changement d’onglet ou une perte de focus pendant un bloc l’interrompt définitivement. **Échap reste libre** : un navigateur ne permet pas de garantir le verrouillage Windows ni d’imposer systématiquement un appui de trois secondes. La participation volontaire doit pouvoir être interrompue. Il n’y a aucun arrêt automatique pour lenteur ou erreurs.

En cas de problème réseau lors de l’envoi, le même envoi peut être retenté sans doublon ; le bloc n’est pas repris après interruption. Un simple rechargement ne recommence pas le test. Les essais incomplets ont un statut distinct.

## Protocole et limites de mesure

La première création d’invitations génère côté serveur une série aléatoire unique `campaign-1`, ensuite inchangée. Les 50 couples sont distincts ; chaque terme de 1 à 10 apparaît cinq fois à gauche et cinq fois à droite. Les deux blocs utilisent les mêmes couples, mélangés dans deux ordres. Le bloc de copie présente leurs produits, avec les répétitions nécessaires. Chaque participant reçoit exactement les mêmes ordres.

Le navigateur chronomètre localement, depuis l’insertion du stimulus dans une trame de rendu, avec `performance.now()`. L’envoi réseau et l’attente du prochain item sont hors du temps de réponse. Les pauses réseau entre items peuvent néanmoins affecter le rythme et la comparabilité avec le programme Python ; elles ne doivent pas être assimilées à une expérience de laboratoire à cadence fixe. L’affichage physique à l’écran et la latence du clavier ne sont pas étalonnés.

La durée principale se termine à la dernière modification effective de la saisie, y compris après correction. Les temps du premier chiffre et d’Entrée sont également conservés. Les paires sont appariées par multiplication ordonnée (`a × b`), comme dans le mini-test Python. Les erreurs sont exclues du calcul des moyennes appariées, mais conservées dans les données. Aucun résultat n’est calculable si aucune paire n’est réussie dans les deux blocs.

Le surcoût n’est pas un temps neuronal pur de rappel ; l’ordre fixe copie puis tables, les effets de lecture, la fatigue et les stratégies peuvent jouer. Aucun seuil d’intelligence ou de « par cœur » n’est inféré.

## Tests

```powershell
node --test tests/worker.test.mjs
```

Les tests utilisent SQLite réel en mémoire derrière une interface D1. Ils couvrent le plan équilibré, la mesure après correction, l’absence de consentement, les accès refusés, les invitations concurrentes, l’idempotence, le parcours complet, la pause, les exports, les suppressions et la conservation. Ils ne remplacent pas un essai final dans le véritable environnement Cloudflare et avec le clavier physique du participant.

## Licence

Le code peut être copié, modifié et redistribué, y compris commercialement, sous les conditions de la [licence MIT](LICENSE), avec conservation de la notice © Julien Fontaine. Il ne s’agit donc pas d’une licence interdisant la réutilisation. Les données des participants et les secrets ne font pas partie des éléments destinés à être distribués.
