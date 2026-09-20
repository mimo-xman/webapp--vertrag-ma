# Workflows de postulations - Guide complet

Ce document explique comment les postulations sont envoyées, et comment
lancer les exécutions de **trois façons** : en ligne de commande (VM Oracle
Cloud), via **GitHub Actions**, ou directement depuis le **panneau admin**
(mode serveur).

---

## 1. Comment ça marche (architecture)

```
Postulations (en_attente / re_execute)
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  VAGUE D'EXÉCUTION (startExecutionWave)                  │
│                                                          │
│  1. Récupère TOUS les mail senders actifs disponibles    │
│     (claim atomique : findOneAndUpdate in_use=true)      │
│  2. Crée UNE exécution PAR mail sender (parallèles)      │
│  3. Chaque exécution traite des postulations :           │
│     - claim atomique de la postulation                    │
│       (status → "executing" → jamais 2 envois)           │
│     - téléchargement du dossier PDF (Cloudinary)          │
│     - envoi de l'email (message fixe + PDF joint)         │
│     - succès  → status "envoyee"                          │
│       échec   → status "echouee" + motif enregistré       │
│  4. Si l'ENVOI échoue à cause du sender (SMTP/API) :     │
│     → sender désactivé (active=false)                    │
│     → erreur sauvegardée (last_error)                    │
│     → l'admin corrige, ré-active, re-teste               │
└─────────────────────────────────────────────────────────┘
        │
        ▼
Collection `executions` (1 doc par exécution)
  + Postulation.executions[] (historique par postulation)
  + vue LIVE dans Admin → Exécutions (polling 3 s)
```

Points clés :

- **exécution ↔ postulations = plusieurs-à-plusieurs** : une exécution
  traite plusieurs postulations ; une postulation peut être exécutée
  plusieurs fois (N1 échouée, N2 échouée, … N~ réussie).
- **Anti-double-exécution** : une postulation en cours d'exécution a le
  statut `executing` : impossible de la reprendre (bouton admin compris).
- **Récupération des crashes** : au démarrage de chaque vague, les
  exécutions bloquées (> 1 h) sont clôturées, les postulations abandonnées
  (> 10 min en `executing`) sont remises en attente, les senders coincés
  sont libérés.

---

## 2. Ligne de commande (VM Oracle Cloud)

Le dossier `workflow/` contient des scripts autonomes (tsx + mongoose),
partageant les models de l'app. Ils se lancent depuis la VM où l'app tourne
(ou depuis n'importe quelle machine avec accès à la base).

### Installation (une seule fois)

```bash
cd ~/github/other-repos/webapp--vertrag-ma/workflow
npm install
```

### Variables d'environnement

```bash
export MONGO_URI="mongodb://localhost:27017"      # ou votre URI Atlas
export MONGO_DB_NAME="vertrag_ma"
```

### Envoi quotidien (postulations dues aujourd'hui)

```bash
cd workflow
MONGO_URI="..." MONGO_DB_NAME="vertrag_ma" npx tsx send-postulations.ts
```

Codes de sortie : `0` = il reste des postulations à traiter (relancer),
`1` = file vide. Les exécutions créées portent le trigger `github` (mode
script autonome) : à ajuster via le champ trigger si besoin.

### Relance des postulations échouées

```bash
cd workflow
MONGO_URI="..." MONGO_DB_NAME="vertrag_ma" npx tsx re-execute-postulations.ts
```

Marquez d'abord les échouées « à relancer » (fait automatiquement par le
bouton admin `Lancer la relance`, ou manuellement) :

```bash
# Optionnel : marquer manuellement echouee → re_execute (mongo shell)
mongosh "$MONGO_URI/vertrag_ma" --eval \
  'db.postulations.updateMany({status:"echouee"},{$set:{status:"re_execute"}})'
```

### Vérifier ce qui reste à traiter

```bash
cd workflow
MONGO_URI="..." MONGO_DB_NAME="vertrag_ma" npx tsx check-postulations.ts
```

### Cron quotidien sur la VM (alternative à GitHub Actions)

```bash
crontab -e
# Envoi quotidien à 07:00 (heure de la VM), log dans /var/log/vertragsend.log
0 7 * * * cd /home/ubuntu/github/other-repos/webapp--vertrag-ma/workflow && \
  MONGO_URI="mongodb://localhost:27017" MONGO_DB_NAME="vertrag_ma" \
  npx tsx send-postulations.ts >> /var/log/vertrag-send.log 2>&1
```

> ⚠️ Le dossier `workflow/node_modules` doit exister (npm install). Avec
> une base MongoDB locale protégée par iptables (accessible seulement via
> 100.100.1.1), utilisez `MONGO_URI="mongodb://100.100.1.1:27017"` si le
> script tourne hors de la VM.

---

## 3. GitHub Actions

Deux workflows (`.github/workflows/`) :

| Workflow | Déclencheur | Rôle |
|---|---|---|
| `send-postulations.yml` | cron `0 6 * * *` + manuel | Envoi quotidien des postulations dues |
| `re-execute-postulations.yml` | manuel uniquement | Relance des postulations « à relancer » |

### Secrets à configurer (Settings → Secrets → Actions)

| Secret | Valeur |
|---|---|
| `MONGO_URI` | URI MongoDB (accessible depuis GitHub · Atlas recommandé) |
| `MONGO_DB_NAME` | `vertrag_ma` |

Chaque run crée une vague : une exécution parallèle par mail sender
disponible, chaque exécution traitant jusqu'à 5 000 postulations. S'il en
reste après le run, le job `re-trigger` relance automatiquement le workflow
(auto-drainage, sans dépasser la limite de 6 h par job).

### Lancement depuis le panneau admin (« Workflow GitHub »)

Le bouton **Lancer la relance → Workflow GitHub** appelle l'API GitHub
(`workflow_dispatch`). Variables d'environnement de l'app :

```bash
GITHUB_WORKFLOW_TOKEN=ghp_xxx           # PAT avec droits actions:write
GITHUB_WORKFLOW_REPO=mimo-xman/webapp--vertrag-ma
```

---

## 4. Mode serveur (backend, VM Oracle Cloud)

Le bouton **Lancer la relance → Serveur backend** exécute la vague
**directement dans le processus Node de l'app** (votre VM) :

- une exécution parallèle par mail sender actif ;
- progress visible **en direct** dans Admin → Exécutions (polling 3 s) ;
- réponse immédiate avec les ids d'exécutions créées ;
- garde anti-doublon : une seconde vague du même type est refusée tant
  qu'une exécution du même type est active (< 1 h).

Via l'API (utile pour un cron côté app) :

```bash
curl -X POST http://100.100.1.1:4000/api/admin/postulations/re-execute \
  -H "Content-Type: application/json" \
  -H "Cookie: vertrag_token=<JWT admin>" \
  -d '{"target":"server"}'
```

---

## 5. Exécution manuelle d'UNE postulation (admin)

Admin → Postulations → bouton ▶ (visible quand le statut est
`en_attente` ou `re_execute`) :

- popup de sélection du mail sender (uniquement les actifs non utilisés) ;
- vérifie que la postulation n'est pas déjà en cours d'exécution ;
- crée une exécution dédiée (trigger `admin`) ;
- résultat immédiat (succès/échec + motif) ;
- si le sender est en cause : il est désactivé et l'erreur est
  enregistrée dans Admin → Services email.

---

## 6. Données de test

### Jeu de données volumétrique

```bash
# 1. Générer les JSON (déjà commités dans seed/) - déterministe
node scripts/generate-seed-data.mjs
#    → seed/categories.json  (1 000 catégories)
#    → seed/companies.json   (20 000 entreprises, emails de test rotatifs
#      sur zakariaaznagui{0,1,2,55}@gmail.com via plus-addressing)

# 2. Les importer en base (+ aligner les minimums 500→100)
cd workflow && npm install
MONGO_URI="..." MONGO_DB_NAME="vertrag_ma" npx tsx seed-data.ts
```

Le script est idempotent (relancer ne crée pas de doublons).

### Test du moteur d'exécution (sans base ni emails réels)

```bash
# Depuis la racine du repo - MongoDB en mémoire + faux serveur SMTP.
npx tsx workflow/test-executor.ts
# → 39 vérifications : parallélisme, anti-double-envoi, désactivation
#   sender en échec, exécution manuelle, récupération de crashes,
#   création automatique des postulations, pricing min 100.
```

---

## 7. Suivi & audit

- **Admin → Exécutions** : liste live (par date, filtre trigger, compteurs
  du jour), détail par exécution avec le résultat de chaque postulation.
- **Admin → Postulations** : colonne « Exécutions » = nombre de tentatives
  (+ popup d'historique par postulation).
- **Admin → Services email** : compteur `in_use` (en cours d'utilisation)
  et dernière erreur de chaque sender.
- **Journal d'audit** : chaque action (relance, exécution manuelle,
  suspension, clôture de message…) est tracée.
