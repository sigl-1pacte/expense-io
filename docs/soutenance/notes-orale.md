# Notes d'oral — soutenance Expense.io (vendredi 30/10/2026)

15 minutes d'audit et de choix d'architecture, puis 15 minutes de live coding. Total visé pour les slides 1 à 8 : environ 14 min 30, pour garder une marge avant les questions.

Les phrases en *italique* sont à dire presque telles quelles. Le reste est un repère : si tu perds le fil, lis seulement la ligne « Message » et la phrase de transition.

## Le fil rouge

Une seule phrase, dite à la slide 2 et répétée à la fin : ***« Vendable sans craindre la fuite, évolutif sans tout casser. »***

Chaque slide prouve l'une des deux promesses, et le live coding prouve la seconde. Le surtitre de chaque slide dit où on en est :

| Étape | Slides | Ce qu'on montre |
|---|---|---|
| 1 · Ce qu'on a trouvé | 3, 4 | Les failles, et pourquoi l'architecture les rendait possibles |
| 2 · Ce qu'on a décidé | 5, 6 | Trois besoins tirés de l'audit, l'option qui y répond, comment elle marche |
| 3 · La preuve | 7 | Chaque faille critique de la slide 3, fermée et tenue par un test |
| 4 · La démonstration | 8 + live | Une fonctionnalité ajoutée en direct, sans casser l'architecture |

**Les trois besoins** (slide 5, repris en 1-2-3 sur la slide 6) : **isoler les clients**, **ne rien casser chez eux**, **prévenir sans bloquer**. Ils viennent de l'audit, pas du cours : c'est ce qui fait de l'audit une base de décision.

**Les bandeaux noirs** ne disent que deux choses : « Pour nos clients » (ce que vivent l'employé, le manager, les RH) ou « Pour l'entreprise » (vendre, exploiter, faire évoluer). Lis-les à voix haute.

## Consignes du coaching (27/10) — priment sur le reste

- **Poser le décor :** toute la soutenance se joue *comme en entreprise*. Le jury joue le CTO d'Expense.io : on reste technique, surtout sur le **résultat de l'audit** (il juge si l'audit a de la valeur). Dis « notre audit », pas « notre TP ».
- **Architecture :** expliquer *pourquoi* ce choix (« parce que… »), et dire que l'architecture est faite **pour accueillir de nouvelles fonctionnalités** (animation « Demain » de la slide 6). Si un détail les choque, ils poseront la question : sois prêt à défendre chaque choix.
- **Process de dev :** ne pas l'expliquer. Garde la slide 8 très courte ; l'outillage n'est là que pour justifier le live.
- **Performance :** pas obligatoire, plus sur les slides. Une phrase si on demande (voir slide 7).
- **Tests d'origine :** mesuré le 27/10, voir slide 7 (« 10 → 0 »).
- **Toujours penser à l'utilisateur :** pour chaque défaut ou choix, une phrase sur ce que ça change pour l'employé, le manager ou les RH.
- **Partie IA (live) :** **une personne fait le vibe coding, les autres continuent d'expliquer** (ce qui se passe, pourquoi l'architecture guide l'agent, le résultat). Le temps de rédiger le prompt compte ; la fonctionnalité demandée devrait rester assez simple. Les systèmes déjà dans le dépôt (AGENTS.md, skills, revue) sont là, tu les utilises comme dans une vraie équipe.

| Slide | Durée | Message en une phrase |
|---|---|---|
| 1 Couverture | 0:30 | Le format, et le fil rouge |
| 2 Synthèse | 1:30 | Le risque, ce qu'on a fait, ce que ça apporte |
| 3 Audit | 2:30 | L'isolation des clients d'abord, et le salarié jamais prévenu |
| 4 État de départ | 2:00 | La sécurité ne tenait qu'à la discipline de chaque route |
| 5 Choix | 2:30 | Trois besoins, une option qui y répond sans distribuer |
| 6 Architecture cible | 2:30 | Comment elle répond aux trois besoins, et accueille la suite |
| 7 Résultats | 2:30 | Les 4 failles de la slide 3 fermées, preuves à l'appui |
| 8 Live coding | 0:30 | Pourquoi l'agent ne peut pas casser l'architecture |

---

## Slide 1 — Couverture (0:30)

**Message :** on présente un audit et une refacto, puis on prouve en direct que le résultat évolue sans casser.

*« Bonjour. On est l'équipe 1Pacte. Expense.io est une application de notes de frais développée à toute vitesse, avec de l'IA. On l'a auditée et refactorée avec un objectif : qu'on puisse la vendre sans craindre la fuite, et la faire évoluer sans tout casser. Les 15 premières minutes portent sur l'audit et nos décisions, les 15 suivantes sur une démonstration en direct. »*

**Transition :** *« L'essentiel en trois phrases. »*

---

## Slide 2 — Synthèse exécutive (1:30)

**Message :** une application qui marchait mais qui exposait nos clients, rendue sûre et évolutive sans rien changer pour eux.

Ici tu parles **à notre CTO** : risque, réponse, valeur métier. Pas de jargon, la technique vient après.

1. **Le risque métier.** *« Chez nous, une entreprise cliente pouvait lire les justificatifs d'une autre. Pour un SaaS B2B, c'est la perte de confiance, des données personnelles exposées et des contrats en jeu. L'audit relève 46 constats, dont 4 critiques. »*
2. **Ce qu'on a fait.** *« L'isolation des clients est maintenant garantie par la base de données, l'application est découpée en modules, et les e-mails partent de façon fiable même si le serveur mail tombe. Aucun client n'a quoi que ce soit à réécrire : l'API ne change pas. »*
3. **Ce que ça apporte.** *« Le risque critique est éliminé : 12 failles critiques et élevées corrigées, prouvées par 620 tests. Et les évolutions deviennent plus rapides et moins risquées : on va ajouter une fonctionnalité complète devant vous. »*

*« En une phrase : vendable sans craindre la fuite, évolutif sans tout casser. »*

**Plan, en une phrase :** *« On vous montre ce qu'on a trouvé, ce qu'on a décidé, la preuve, puis la démonstration. »*

**Transition :** *« Ce qu'on a trouvé. »*

---

## Slide 3 — Audit (2:30)

**Message :** les failles les plus graves exposent les données d'un client à un autre ; et côté usage, le salarié n'est jamais prévenu.

**Méthode, en 20 secondes :** *« On a lu le code, rejoué l'application avec les vrais cookies de chaque rôle (employé, manager, RH), puis figé le comportement existant dans plus de 140 tests de caractérisation. C'est notre filet avant de toucher quoi que ce soit. »*

**Critère de gravité :** *« Gravité = impact métier × facilité d'exploitation. »* Dis-le : c'est ce qui rend la hiérarchie « claire et réfléchie ».

**Les 4 critiques, chacune dite comme une conséquence pour Expense.io** (pas comme une règle OWASP) :

- *Un manager ouvre le justificatif d'un salarié d'une autre entreprise.*
- *L'application se connecte à la base en superuser : le filet d'isolation de la base ne s'applique jamais. Combiné au premier, la seule barrière était le filtre de chaque route.*
- *Le paramètre de tri de la liste des notes exécute du SQL, et avec les droits superuser.*
- *Le secret des sessions est dans le dépôt : qui le lit peut fabriquer une session RH de n'importe quelle entreprise.*

**Les 8 élevés, par familles (carte orange) :** rôles usurpables (le premier inscrit d'un domaine devient RH, une RH rattache un manager d'une autre entreprise, cycle dans l'organigramme) ; double décision acceptée (approuvée et rejetée en même temps) ; OCR qui sature le serveur (synchrone, sans limite de taille, pas d'index) ; chemins serveur exposés dans les erreurs.

**Le cadre violet, à ne pas sauter :** *« Et côté utilisateur, le salarié n'est jamais prévenu de la décision : les e-mails sont codés mais jamais envoyés. Et un employé sans manager, c'est le cas par défaut à l'inscription, n'a personne pour valider ses notes. »* C'est ce qui justifie la file d'e-mails de la slide 6.

**Bandeau :** *« Pour nos clients : le justificatif d'un salarié pouvait être lu par une autre entreprise. »*

**Si on te demande la méthode ou la frontière critique/élevé :** annexes 11 (méthode en cinq étapes, niveau de preuve de chaque constat) et 12 (critique = exploitable sans condition ; élevé = grave mais sous condition : un rôle, un moment, une charge). L'exemple à donner : F1 et F5 exposent tous deux une autre entreprise, mais F1 ne demande qu'un compte manager, alors que F5 exige qu'une RH agisse.

**Transition :** *« Pourquoi c'était possible ? À cause de la forme même de l'application. »*

---

## Slide 4 — État de départ (2:00)

**Message :** la sécurité ne tenait qu'à la discipline de chaque route.

*« Tout se passe dans les route handlers : du SQL brut, les règles d'accès recopiées, l'OCR et l'envoi vers S3 dans le même process. Les dossiers `domain`, `ports` et `adapters` existent, mais personne ne les importe. »*

**Les trois chiffres (colonne de droite) :**

- **7×** : les règles d'accès sont recopiées dans 7 routes. Un seul oubli, et c'est une faille.
- **0 filet** dans la base : l'application s'y connecte en superuser, donc l'isolation par entreprise ne s'applique jamais.
- **0 e-mail** envoyé : les notifications existent dans le code, rien ne les appelle.

**Bandeau :** *« Une règle oubliée dans une route : un client voit les données d'un autre. »*

**Lien avec le cours :** *« On retrouve les idées d'une architecture propre, mais pas bien implémentées. »*

**Performance, seulement si on demande :** *« On a mesuré le débit avec k6 sur 15 000 notes : 360 à 560 requêtes par seconde, sans erreur. C'est ce chiffre qui nous fait écarter les microservices. »*

**Transition :** *« De l'audit, on a tiré trois besoins. »*

---

## Slide 5 — Choix d'architecture (2:30)

**Message :** trois besoins tirés de l'audit ; une seule option y répond sans distribuer.

**Les trois besoins, avant le tableau :** *« Isoler les clients, c'est la slide 3. Ne rien casser chez eux : l'API reste la même. Prévenir le salarié sans bloquer le manager. »*

**Le tableau, ligne par ligne :**

- **A, monolithe en couches nettoyé :** léger, mais les règles d'accès restent éparpillées.
- **B, monolithe modulaire hexagonal :** frontières nettes, métier testable ; mais l'e-mail partirait dans la requête, donc un serveur mail en panne bloquerait la validation.
- **C, B + file d'e-mails, retenue :** répond aux trois besoins. Coût : un process de plus à exploiter, le worker.
- **D, microservices :** déploiement indépendant, mais réseau, déploiements et monitoring multipliés, pour un besoin de charge qu'on n'a pas.

**Les quatre repères du bas :** *isoler, c'est la base qui l'impose ; ne rien casser, l'API est figée ; la charge mesurée, 360 à 560 requêtes par seconde, suffit ; et le choix est écrit dans l'ADR 0002.*

**Bandeau :** *« Pour l'entreprise : une seule application à exploiter, découpée pour accueillir la suite. »*

**Si on te demande pourquoi pas les microservices :** *« Une architecture distribuée ajoute des déploiements, du réseau et du monitoring. Nos modules ont déjà des frontières nettes : le jour où un besoin le justifie, on pourra en extraire un. »*

**Transition :** *« Voyons comment C répond aux trois besoins. »*

---

## Slide 6 — Architecture cible (2:30)

**Message :** l'architecture répond aux trois besoins, et elle est faite pour accueillir la suite.

**Comment lire le schéma (20 s) :** *« Au centre, le cœur métier, deux modules. Les ronds sur le bord sont les ports ; tout ce qui est dehors est un adapter, qu'on remplace sans toucher au métier. En bas, un second process qui ne fait qu'envoyer les e-mails. »*

**Les trois pastilles, dans l'ordre de l'audit :**

1. **Isoler les clients** (pastille sur la base, cadre vert) : *« Chaque requête passe par la base, qui ne rend que les données de l'entreprise de l'utilisateur. Si une route oublie un contrôle, la base ne laisse rien fuir. »* Si on creuse : l'application se connecte avec un rôle soumis à la RLS (`expense_app`), et chaque transaction fixe l'entreprise de l'acteur.
2. **Évoluer sans casser** (pastille sur `index.ts`) : *« Un module ne voit l'autre que par une seule porte, et la CI refuse tout import interdit. »* **Animation, c'est ici :** premier clic (ou Espace / flèche droite), « module billing + nouvelle notification » se branchent ; dis *« demain, la facturation se branche ici, sans toucher au cœur »*. Second clic : le port de paiement. La facturation Stripe était déjà prévue dans l'existant, et son emplacement est écrit dans l'ADR 0002.
3. **Prévenir sans bloquer** (pastille sur le lien entre les process) : *« La décision et l'e-mail sont enregistrés ensemble. Un worker séparé envoie. Si le serveur mail tombe, la validation passe et l'e-mail part plus tard. Un doublon est possible, une perte jamais. »*

**Bandeau :** *« Pour nos clients : leurs données restent chez eux, et le salarié est toujours prévenu. »*

**Attention aux clics :** il faut deux clics de plus sur cette slide avant de passer à la 7 ; flèche gauche retire les blocs. Le schéma détaillé (scénario en 6 étapes, noms des ports) est la **slide 10 (annexe)** : n'y va que si on te questionne (touche G).

**Si on creuse :** réservation de 5 lignes à la fois (`SKIP LOCKED`), bail de 2 minutes (s'il expire, la ligne est reprise), essais à 10 secondes puis 1 minute, puis `dead` après 3 échecs. Le worker a son propre rôle Postgres, limité à `mail_outbox`.

**Transition :** *« Et la preuve que ça tient ? »*

---

## Slide 7 — Résultats et limites (2:30)

**Message :** les 4 failles de la slide 3 sont fermées, chacune tenue par un test.

**Le tableau, une ligne par faille** (ce sont les 4 cartes de la slide 3, dans le même ordre) :

- *Reçus d'une autre entreprise : l'accès est vérifié par le module, puis par la base. Le test essaie chaque rôle, et un utilisateur d'une autre entreprise reçoit 404.*
- *Filet de la base : l'application utilise un rôle soumis à l'isolation. Le test vérifie que sans entreprise, rien n'est visible.*
- *Injection dans le tri : liste blanche des colonnes. Un `?sort=` inconnu donne le tri par défaut.*
- *Secret : il est obligatoire à l'environnement, et l'application refuse de démarrer sans.*

**Les chiffres de droite :**

- **12/12** : les 4 critiques et les 8 élevés sont corrigés, 29 défauts au total.
- **10 → 0** : *« On a lancé nos 37 parcours E2E contre l'application d'origine : 10 échouaient, sur des défauts réels. Aujourd'hui, 37 sur 37. »*
- **99,8 %** : *« Nos 620 tests couvrent 99,8 % des lignes du cœur métier et de l'API. SonarQube affiche 75 %, parce qu'il compte aussi l'interface, testée par nos parcours E2E, qui ne mesurent pas la couverture. »* Détail en annexe 13. SonarQube par ailleurs : 0 bug, 0 smell, 0 % de duplication (run local du 20/10).

**Moyens et faibles (cadre sous le tableau) :** *« Sur les 34 moyens et faibles, 17 sont corrigés : 11 moyens, dont l'e-mail et les notes sans validateur, et 6 faibles. Les 15 autres sont écartés pour une raison écrite : changer l'API, une simple validation, une fonctionnalité nouvelle ou de l'infrastructure. Aucun critique ni élevé n'est écarté. »* Détail en annexe 14. Les fonctionnalités manquantes (motif de rejet, modifier ou annuler une note) sont des candidates au live coding.

**Comment on a mesuré le « 10 → 0 » (si on demande) :** le 27/10, les 37 E2E de `main` (boîte noire, en HTTP) contre l'application du commit d'origine `265924b`. 11 échecs ; l'un ne tient qu'à un titre de section renommé, on ne le compte pas. Les 10 restants : 5 contrôles d'accès (401/403 incohérents, erreurs sans format), l'injection du tri, un corps JSON qui fait une 500 avec la stack, l'e-mail de décision jamais envoyé, la note d'un employé sans manager et celle d'une RH sans validateur. Une seule adaptation pour faire tourner l'original sur le schéma actuel : `company_id` rempli à l'insertion. La fuite de reçus n'est pas couverte par un E2E : elle est prouvée en intégration.

**À expliquer sur la couverture (la question va venir) :** mesurée le 27/10 sur le code de `main` : 620 tests, 564 lignes couvertes sur 565, 97,4 % des branches, 100 % des fonctions, sur le périmètre fixé dans `vitest.config.ts` (modules, shared, routes API, server actions). SonarQube lit le même rapport mais analyse tout `src/` : 15 fichiers hors périmètre comptent pour 0 % (7 pages, 4 composants, l'authentification, le worker). *« On n'a pas exclu l'interface de Sonar pour gonfler le chiffre : on montre les deux. »* Si on insiste : le worker a des tests Vitest mais n'est pas dans le périmètre mesuré ; l'y ajouter est la prochaine étape.

**La limite, à dire sans gêne :** *« L'OCR reste synchrone : le passer en asynchrone changerait l'API, ce qu'on s'est interdit. On a plafonné la taille et la concurrence. »*

**Si on creuse l'OCR (annexe 16) :** *« Le risque n'était pas la lenteur, environ 450 millisecondes par reçu, mais la saturation : un moteur neuf à chaque requête et aucune limite de taille. Aujourd'hui, les moteurs sont réutilisés, deux analyses au plus tournent en parallèle, les fichiers sont plafonnés à 10 Mio. Au-delà, l'utilisateur reçoit "réessaie dans quelques secondes" au lieu d'un serveur qui tombe. Et si l'OCR échoue, la suggestion est vide : le salarié saisit à la main. Demain, si la charge l'exige, l'OCR est derrière un port : on le passe en file d'attente sans toucher au métier. »* Si on pousse sur « pourquoi pas tout de suite » : rien ne le justifie à la charge mesurée, et ça ajoute un process et un état à exploiter.

**Performance, seulement si on demande :** *« Les temps de réponse suivent le besoin utilisateur. On n'a pas refait la mesure sur la machine de référence, donc on ne revendique pas de gain. »* Ne dis jamais que la performance s'est améliorée.

**Si on te demande ce qui n'est pas corrigé :** *« Aucun critique ni élevé. Le reste aurait changé le contrat d'API, relève de simples validations, de fonctionnalités nouvelles ou d'infrastructure. »*

**Si on te demande pourquoi il y a plus de lignes de code (1 970 → 2 809) :** *« C'est le coût annoncé dans l'ADR : plus de fichiers, mais chacun petit et testable. La duplication, elle, passe à zéro. »*

**Transition :** *« Vendable sans craindre la fuite, c'est prouvé. Évolutif sans tout casser, on va vous le montrer. »*

---

## Slide 8 — Live coding (0:30)

**Message :** chaque outil ferme un risque précis, donc l'agent intègre au lieu d'improviser.

*« Le dépôt est prêt pour un agent de code. Quatre outils, chacun contre un risque. »*

- **AGENTS.md** : l'architecture et les règles sont chargées à chaque session. *Évite du code posé au mauvais endroit.*
- **Skills** : une recette TDD en 10 étapes pour ajouter une fonctionnalité. *Évite un test, le contrat d'API ou la doc oubliés.*
- **Revue** : un sous-agent relit le diff contre l'architecture. *Évite une règle contournée qui compile quand même.*
- **Garde-fous** : `npm run verify` lance le lint, les types, depcruise et les tests. *Évite un import interdit ou une régression.*

*« Et le tout est lisible par un humain : les ADR disent pourquoi, les conventions disent où va chaque fichier, les runbooks et le CHANGELOG du contrat sont à jour. »*

**Répartition pendant le live (coaching) :** une personne tape le prompt et pilote l'agent ; l'autre commente à voix haute (quel module est touché, quelle règle l'agent respecte, ce que la revue a vérifié, ce que l'utilisateur y gagne). Décidez qui fait quoi avant vendredi, et préparez un prompt court et simple.

**Le bandeau « Déjà testé » :** *« On a déjà fait l'exercice une fois, sur une vraie fonctionnalité : environ 12 minutes jusqu'aux tests verts, sans intervention humaine. »* Le « ≈ 12 min » date de cet essai. Rechronomètre avant vendredi, ou ne cite pas le chiffre.

**Transition vers le live :** *« Merci. On passe aux questions, puis à la démonstration. »*

---

## Ce qu'il faut retenir

- **La phrase à ne pas rater :** vendable sans craindre la fuite, évolutif sans tout casser.
- **Trois faits à ne pas rater :** les 4 critiques de la slide 3 sont fermées et testées ; 10 parcours échouaient sur l'original, 37/37 aujourd'hui ; le contrat d'API n'a pas changé.
- **Ne pas dire :** « 29 sur 46 ». Le 46 est notre décompte, pas un chiffre officiel ; parle de « 29 corrections ». Ne pas dire non plus que la performance s'est améliorée.
- **Garder en réserve (annexes, touche G pour y sauter) :** 9 séparateur « Annexes » · 10 architecture détaillée · 11 méthode d'audit · 12 critique ou élevé · 13 couverture 99,8 % contre 75 % · 14 moyens et faibles · 15 ADR 0002 · 16 OCR synchrone. Et la fiche questions-réponses dans les notes de la slide 8 (touche **N**).
- **Avant vendredi :** relancer `npm run verify` et les E2E sur `main`, confirmer les chiffres SonarQube « après » sur `main`, vérifier le HTML en plein écran (touche **F**), et répéter le chronomètre à la main.
