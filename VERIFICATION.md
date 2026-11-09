# Vérification de la version locale

Date : 8 novembre 2026.

- **17 tests automatisés réussis** avec Node.js 24.22.1 et une base SQLite réelle en mémoire : protocole équilibré, erreurs/corrections, paires retenues, configuration fermée, accès privés, consentement exigé, consommation concurrente des invitations, rejouabilité des envois sans doublon, série commune, contrôle des items, parcours de 100 réponses avec pause, exports, isolement des participants, interruption, suppression et conservation.
- Vérification syntaxique des modules serveur, de la page et des outils locaux réussie.
- Page d’accueil et formulaire observés dans le navigateur avec le serveur local de démonstration ; aucune erreur JavaScript relevée pendant cette observation. Les cases étaient décochées.
- La soumission du consentement dans le navigateur n’a pas été exécutée. Après la demande d’autorisation du contrôle automatique, Julien Fontaine a choisi de tester lui-même le formulaire. Aucun nouvel essai de soumission par l’agent n’est effectué. Le parcours HTTP serveur est testé, mais la passation visuelle complète au pavé numérique reste à vérifier par l’utilisateur.
- Mise à jour selon les choix confirmés : adresse `https://fontaine-julien.github.io/calibration-web/`, majorité obligatoire, conservation 180 jours, mail facultatif avec absence de contact explicitée dans la notice. Un bouton de téléchargement personnel est disponible sur le bilan final. La suite automatisée vérifie aussi l’ouverture possible sans mail et le refus d’une adresse mal formée si elle est renseignée.
- L’agent n’a effectué aucun déploiement. Le 9 novembre, le journal fourni par l’utilisateur confirme la création du Worker `pystats-calibration-api` et l’enregistrement du secret `ADMIN_TOKEN`. Il ne confirme pas encore le déploiement du code applicatif. Les bindings, la tâche de purge et le comportement dans le véritable environnement Cloudflare doivent être vérifiés lors du déploiement avec le guide fourni.
- Aucun test n’utilise de réponses réelles de l’étalonnage des deux adultes, de la classe ou de la base PyStats.

Le programme Python principal et le mini-test Python ne sont pas modifiés par cette version web.
