---
name: envoyer-un-email
description: À utiliser quand une fonctionnalité d'Expense.io doit prévenir quelqu'un par e-mail (décision, rappel, invitation…) — explique où composer l'e-mail, comment l'envoyer dans l'unité de travail, et pourquoi ne jamais toucher au worker.
---

# Envoyer un e-mail

Le cœur décide **à qui** et **quoi** écrire ; le worker de livraison ne fait que livrer ([ADR 0003](../../../docs/adrs/0003-notification-par-outbox-d-e-mails.md)).

## Recette

1. **Composer** l'e-mail dans le module, dans `application/<objet>-email.ts`, sur le modèle de `src/modules/expenses/application/decision-email.ts` : une fonction pure qui renvoie un `Email` (`to`, `subject`, `text`, `correlationId`). Montants avec `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })`, dates civiles avec `timeZone: 'UTC'`. Test unitaire du texte.
2. **Lire ce qui vient d'`iam`** (contact du destinataire, droits) par son API publique, via un port du module appelant, **hors de `uow.run`** : `iam` ouvre sa propre connexion, l'imbriquer dans une unité de travail tiendrait deux connexions du pool à la fois.
3. **Envoyer dans l'unité de travail** : dans `uow.run(actor, async (ctx) => …)`, après l'écriture métier, `await ctx.mailer.send(email)`. L'e-mail est écrit dans `mail_outbox` dans la même transaction : si l'écriture échoue, l'opération est annulée. Modèle : `src/modules/expenses/application/decide-expense-note.ts`.
4. **Tester** : unitaire avec `InMemoryMailer` (`uow.mailer.sent`) ; intégration en lisant `mail_outbox` ; E2E avec `waitForMail` (Mailpit).

## Interdits

- Appeler nodemailer ou SMTP depuis un module ou une route.
- Modifier `src/worker/` pour une fonctionnalité : il livre n'importe quel e-mail sans rien savoir du métier.
- Envoyer hors de l'unité de travail (l'e-mail pourrait partir pour une opération annulée, ou se perdre).
- Lire `iam` dans `uow.run` (deux connexions du pool tenues en même temps).

Exploitation (e-mail en échec, `dead`) : [runbook](../../../docs/runbooks/mail-outbox-rejouer.md).
