# Confidentialité, sécurité et exploitation

Document technique et aide à la préparation du traitement, version du 8 novembre 2026. Il décrit le code livré ; il ne constitue pas une certification de conformité RGPD ni un audit externe de sécurité.

## Ce qui est public et ce qui est privé

| Élément | Emplacement | Accès |
| --- | --- | --- |
| Présentation, notice, interface et code de saisie | GitHub Pages, `docs/` | Public |
| Algorithme de génération et de correction | Code serveur du dépôt | Peut être public ; ne contient aucune série réelle |
| Série fixe et ordre des 100 items | Table D1 `protocols` | Serveur / propriétaire du compte Cloudflare |
| Invitations générées | Fichier local `private/` ; empreintes dans D1 | Organisateur ; chaque participant reçoit un seul code |
| Réponses, frappes utiles, délais, consentement | Tables D1 `participants` et `trials` | Serveur ; export authentifié de l’organisateur ; copie personnelle via une clé dédiée |
| Secret administrateur | Secret Cloudflare `ADMIN_TOKEN` et gestionnaire de mots de passe local | Organisateur uniquement |
| CSV téléchargés | Dossier local `private/` | À protéger et purger par l’organisateur |

Les réponses ne sont pas envoyées par mail. Aucune adresse de participant n’est demandée. `CONTACT_EMAIL` est laissé vide conformément au choix de l’organisateur. Si ce champ facultatif est renseigné plus tard, il affichera une adresse publique de contact, pas un secret d’envoi.

## Protection mise en œuvre

- Invitations aléatoires de 256 bits, valables 30 jours, conservées uniquement en empreinte SHA-256 dans D1. Une invitation donne droit à une session, pas à un compte général.
- Réservation transactionnelle. Le couple invitation/session permet de réessayer une requête dont la réponse réseau a été perdue. Une autre session ne peut pas réutiliser le code.
- Jeton de session et clé de gestion distincts, également conservés en empreinte. Ils transitent dans le corps de la réservation ou l’en-tête Authorization, jamais dans une URL.
- Validation côté serveur de l’item courant et de son nonce, du nombre de chiffres, de l’ordre et des bornes des temps. Les corrections et la justesse sont calculées côté serveur.
- Réponse unique par participant et item, requêtes identiques réessayables, modification d’une réponse déjà reçue refusée.
- Aucun endpoint public de liste des participants, de série complète ou de corrigé. Les routes `/admin/*` requièrent un secret de forte entropie.
- La clé de gestion donne accès uniquement à la passation qui lui correspond. La clé de session ne permet pas d’appeler les routes de gestion des données.
- Requêtes SQL paramétrées, corps JSON bornés à 40 Kio, nombre de frappes borné, pas de journalisation applicative des requêtes, des codes ou des réponses.
- En-têtes `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, CORS limité à l’origine configurée. La restriction CORS n’est pas utilisée comme un mécanisme d’authentification.
- Politique de contenu du site : scripts locaux, pas de script publicitaire, pas de police distante, pas de JavaScript inline. Les messages sont rendus avec `textContent`, pas comme du HTML fourni par les utilisateurs.
- Données expirées refusées avant même le passage de la tâche quotidienne. Suppression des essais associée en cascade aux participants.
- Le retrait du consentement supprime les réponses et la fiche de participation de la base active. Un journal minimal de demandes d’effacement permet de purger les anciens exports. L’empreinte d’une invitation consommée peut rester jusqu’à son expiration initiale pour empêcher sa réutilisation ; elle ne contient plus les réponses.

Les clés du participant sont dans le stockage **de session** de son onglet, pour gérer les erreurs réseau et les rechargements, et peuvent être effacées par un bouton. Elles ne sont pas des cookies publicitaires. Le participant est invité à enregistrer sa clé de gestion dans un fichier privé. Comme toute clé d’accès, sa possession permet d’exercer les opérations correspondantes ; éviter tout partage ou capture contenant la clé.

## Ce qu’un site web ne peut pas garantir

La multiplication en cours doit être visible pour être résolue. Son résultat peut donc toujours être calculé par la personne, une calculatrice, une extension ou un programme. Le bloc de copie montre nécessairement les produits à recopier. Le code public ne contient pas de tableau de réponses ni de graine déterminant la série de production, mais la série peut être reconstituée en observant une passation autorisée. Un participant peut aussi la photographier et la transmettre.

Les temps sont mesurés dans un navigateur contrôlé par le participant. Les vérifications du serveur détectent certaines incohérences, pas toutes les fabrications. Un attaquant disposant d’une invitation pourrait automatiser les réponses et falsifier les temps. Il n’y a ni identité certifiée, ni dispositif anti-triche inviolable. Cette version convient à une collecte exploratoire auprès de volontaires ; elle ne justifie pas une décision à fort enjeu.

Le navigateur peut quitter le plein écran avec Échap et conserver des raccourcis réservés au système. Le site bloque les clics et les touches ordinaires pendant le bloc et signale une perte de focus, mais ne prend pas le contrôle global de Windows. Une interruption est définitive pour le bloc. Il n’est pas possible de promettre le verrouillage de l’application Python depuis une page web.

Le contrôle d’accès ne garantit pas la disponibilité face à une attaque : les quotas gratuits peuvent être consommés. Surveiller les métriques et compléter, si nécessaire, par les protections offertes par Cloudflare sans exposer la base ni ouvrir les exports.

## Réglages de confidentialité à finaliser avant collecte

La collecte est volontairement fermée par défaut. Les choix confirmés sont : adultes uniquement, 180 jours de conservation (environ six mois), aucun contact public. Le serveur accepte techniquement un champ `CONTACT_EMAIL` vide. Relire la notice et vérifier les réglages avant de passer `PRIVACY_REVIEWED` à `true`. Ce réglage atteste seulement la relecture par l’exploitant, pas une validation par une autorité.

**Limite juridique non résolue : aucun canal de contact n’est prévu.** La pseudonymisation ne rend pas les données anonymes et ne les soustrait pas au RGPD. Le téléchargement et la suppression automatisés ne remplacent pas les coordonnées du responsable/point de contact ni les moyens d’exercer les autres droits, notamment rectification et limitation. Le site décrit honnêtement les seules fonctions disponibles et ne doit pas être présenté comme pleinement conforme dans cette configuration. Il n’est pas nécessaire de publier une adresse mail personnelle : un autre moyen de contact approprié pourrait être mis en place ultérieurement. [Information et transparence — CNIL](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence), [Anonymisation et pseudonymisation — CNIL](https://www.cnil.fr/fr/technologies/lanonymisation-de-donnees-personnelles).

Le site vise des adultes volontaires, hors évaluation scolaire obligatoire. Le consentement n’est pas précoché et peut être retiré en ligne. Une invitation inutilisée ne produit aucun résultat. La date du consentement et une empreinte de la version de notice/configuration sont enregistrées. Conserver les versions du texte publié ; incrémenter `NOTICE_VERSION` dans `worker/index.mjs` si le texte juridique change substantiellement. Un changement de finalité ou de destinataires peut exiger une nouvelle information et un nouvel accord ; ne pas réutiliser les anciennes données automatiquement.

La notice précise le responsable, la finalité, la base légale, les données, les destinataires, la durée, les droits et la réclamation auprès de la CNIL. Elle distingue les données pseudonymisées de l’anonymat et indique que les prestataires techniques peuvent traiter l’adresse IP. L’application ne conserve aucune IP dans D1.

Choisir la juridiction **eu** à la création de D1 et vérifier les contrats/conditions Cloudflare et GitHub correspondant à l’usage. Le stockage de D1 en UE ne garantit pas que tous les traitements de réseau, de support et de journalisation se produisent exclusivement dans l’UE. Ne pas présenter la simple case de consentement comme une garantie générale de conformité.

L’organisateur reste responsable des réponses aux demandes de droits, de la protection de son ordinateur, de ses comptes et de ses sauvegardes. Les exports locaux doivent respecter l’échéance `expires_at` et les demandes du journal d’effacement. Consulter ce journal avant chaque analyse et régulièrement pendant la conservation. Si une ancienne sauvegarde est restaurée, réappliquer les suppressions avant toute remise en service. Documenter les modalités effectives de sauvegarde du prestataire et les délais de disparition résiduelle.

Si des statistiques sont rendues publiques, utiliser uniquement des agrégats qui ne permettent pas d’identifier une personne, notamment dans les petits groupes. Ne pas publier les lignes individuelles sous prétexte que les noms ont été retirés.

## Registre de traitement : base à compléter

- Responsable : Julien Fontaine ; aucune coordonnée ni canal de contact prévu dans la configuration retenue (limite juridique décrite ci-dessus).
- Finalité : étalonnage exploratoire comparant copie et restitution des tables, amélioration du protocole.
- Personnes concernées : adultes volontaires invités.
- Base légale proposée : consentement ; aucune participation obligatoire.
- Catégories de données : mesures de passation, réponses, identifiants pseudonymes et preuve de consentement ; détails dans la notice.
- Destinataires : responsable et prestataires d’hébergement nécessaires.
- Durée : réglage `RETENTION_DAYS`, justifié par l’objectif de collecte/analyse ; exports soumis à la même règle.
- Mesures : accès authentifiés, minimisation, données séparées du dépôt public, tâche de purge, droits en ligne, protection des comptes.
- Transferts et sous-traitants : examiner et archiver les conditions applicables aux comptes GitHub et Cloudflare utilisés.
- Procédure d’incident : fermer les nouvelles inscriptions, révoquer les accès compromis, analyser l’étendue, suivre les obligations applicables et documenter l’incident. Ne pas conserver les secrets ou données dans un ticket public.

## Sources consultées

- [CNIL — Recueillir le consentement](https://www.cnil.fr/fr/les-bases-legales/consentement).
- [CNIL — Information et transparence](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence).
- [Cloudflare — Juridiction des données D1](https://developers.cloudflare.com/d1/configuration/data-location/).
- [Cloudflare — Accord de traitement des données](https://www.cloudflare.com/cloudflare-customer-dpa/).
- [GitHub — Déclaration de confidentialité](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
- [Cloudflare — Transactions D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/).

Ces sources guident les choix du logiciel ; elles ne remplacent pas la vérification des conditions réelles d’exploitation.
