# GIC — Fichier d'avancement

**Projet :** Gestion Immobilière & Chantier  
**Client :** Expertise & Consulting Company (ECC)  
**Devise :** MAD · **Langue :** Français · **V1 :** Super Administrateur  
**Mise à jour :** 23 août 2026 — Session 11

---

## Légende

| Symbole | Signification |
|--------|----------------|
| ✅ | Fait et utilisable |
| 🔄 | En cours / partiel |
| ⏳ | À faire |
| ❌ | Hors V1 / reporté |

---

## Phase 1 — Socle technique ✅

Structure frontend/backend, API Express, Prisma, JWT, upload, export/import CSV, seed.

## Phase 2 — Design & shell ✅

Design premium, sidebar icônes macOS, navbar menus déroulants groupés.

## Phase 3 — Tableau de bord

| Élément | Statut |
|---------|--------|
| KPI immobilier / finance / chantiers | ✅ |
| **Graphiques ventes / encaissements (12 mois)** | ✅ |
| Filtres projet / chantier / période | ✅ |
| Alertes cliquables (ventes, achats, engins, docs) | ✅ |
| Tendance clients réelle (30 jours) | ✅ |
| Chargement, erreurs, actualiser, réinitialiser filtres | ✅ |
| Raccourcis modules + liens fiche client / ventes | ✅ |

## Phase 4 — Relation client

| Élément | Statut |
|---------|--------|
| Clients CRUD + fiche 360° onglets | ✅ |
| Module Clients complet (CDC §4) | ✅ |
| **Fiche Client 360° — Vue générale 3 colonnes** | ✅ |
| **Champ source client + référentiel** | ✅ |
| **Archivage / restauration client** | ✅ |
| **Filtre clients archivés + KPI** | ✅ |
| Agents, Mandants + liaison client | ✅ |
| **Fiche Agent 360° (clients, stats, historique)** | ✅ |
| Module Mandants complet (liste + fiche détail) | ✅ |
| Export / Import CSV + Excel | ✅ |
| Pagination liste clients | ✅ |
| Historique changements agent | ✅ |
| Email / SMS / WhatsApp client | ✅ |

## Phase 5 — Patrimoine immobilier

| Élément | Statut |
|---------|--------|
| Projets CRUD + hiérarchie Tranche→Bloc→Lot→Étage | ✅ |
| Module Projets complet (liste + fiche 360°) | ✅ |
| KPI, filtres, tri, pagination projets | ✅ |
| Actions icônes (voir, modifier, supprimer) | ✅ |
| Export CSV + impression liste | ✅ |
| Fiche projet 360° (Infos, Structure, Biens, Historique) | ✅ |
| CRUD hiérarchie (renommer / supprimer niveaux) | ✅ |
| Module Biens complet (liste + fiche 360°) | ✅ |
| KPI, filtres, pagination, export biens | ✅ |
| Actions icônes biens + photo + hiérarchie étage | ✅ |

## Phase 6 — Transactions

| Élément | Statut |
|---------|--------|
| Ventes CRUD + paiements + résiliation | ✅ |
| Module Ventes complet (liste + fiche détail) | ✅ |
| KPI, filtres, pagination, export CSV ventes | ✅ |
| Actions icônes : voir, modifier, paiement, imprimer, résilier | ✅ |
| Locations, paiements, reçu imprimable | ✅ |
| Module Locations complet (liste + fiche détail) | ✅ |
| KPI, filtres, pagination, export CSV locations | ✅ |
| Actions icônes : voir, modifier, paiement, imprimer, résilier | ✅ |

## Phase 7 — Finance ✅

| Élément | Statut |
|---------|--------|
| Caisse, pièces justificatives | ✅ |
| KPI, filtres, pagination, export CSV | ✅ |
| Actions icônes : voir, modifier, imprimer, supprimer | ✅ |
| Fiche mouvement 360° (Infos, Historique) | ✅ |
| Totaux débit/crédit/solde (global + filtrés) | ✅ |
| **Module Paiements** (`/paiements`) | ✅ |
| **Module Comptabilité** (`/comptabilite`) + journal + export CSV | ✅ |
| **KPI TVA estimée (20 %)** | ✅ |

## Phase 8 — Fournisseurs & achats

| Élément | Statut |
|---------|--------|
| Module Fournisseurs complet (liste + fiche détail) | ✅ |
| KPI, filtres, pagination, export CSV, impression | ✅ |
| Actions icônes : voir, modifier, portail, supprimer | ✅ |
| Fiche fournisseur 360° (Infos, Achats, Historique) | ✅ |
| Module Achats complet (liste + fiche détail) | ✅ |
| KPI achats, workflow, pagination, export CSV filtré | ✅ |
| Actions icônes achats : voir, modifier, workflow, docs, supprimer | ✅ |
| Fiche achat 360° (Infos, Documents, Historique workflow) | ✅ |
| Fournisseurs complets (registre de base) | ✅ |
| Workflow achats (brouillon → validé → visé → contrôlé) | ✅ |
| Catalogue familles/désignations | ✅ |
| Export achats | ✅ |
| Portail fournisseur (login + achats) | ✅ |
| Mot de passe portail depuis fiche fournisseur | ✅ |
| Docs fournisseur (devis, factures, BL) | ✅ |
| Vue docs côté admin (Achats) | ✅ |

## Phase 9 — Chantiers & RH ✅

| Élément | Statut |
|---------|--------|
| Module Chantiers complet (liste + fiche 360°) | ✅ |
| KPI, filtres, pagination, export CSV, impression | ✅ |
| Actions icônes : voir, modifier, supprimer | ✅ |
| Fiche 360° : Infos, Personnel, Achats, Avancement, Engins, Documents, Historique | ✅ |
| Affectation ouvriers, avancement 19 tâches réf. | ✅ |
| Main-d'œuvre complet (liste + fiche 360°) | ✅ |
| KPI, filtres, pagination, export CSV main-d'œuvre | ✅ |
| Fiche ouvrier : Infos, Affectations, Pointages, Salaire, Historique | ✅ |
| Main-d'œuvre, pointage, salaires | ✅ |
| Module Pointage complet (saisie + historique) | ✅ |
| Module Salaires complet (calcul, KPI, export, fiche détail) | ✅ |
| KPI pointage, export CSV, validation, historique paginé | ✅ |
| Caméras chantier | ✅ |

## Phase 10 — Engins ✅

| Élément | Statut |
|---------|--------|
| Module Engins complet (liste + fiche 360°) | ✅ |
| KPI parc, missions, alertes papiers | ✅ |
| 3 onglets : Parc, Missions, Rappels papiers | ✅ |
| Filtres, pagination, export CSV, impression | ✅ |
| Actions icônes : 👁 Voir · ✏️ Modifier · 🔧 Maintenance · 🗑 Supprimer | ✅ |
| Fiche 360° : Infos, Missions, Maintenance, Rappels, Historique | ✅ |
| GPS temps réel | ⏳ |
| **Module Avancement global** (`/avancement`) | ✅ |
| **Module Maintenance** (`/maintenance`) | ✅ |
| **Module Missions** (`/missions`) | ✅ |

## Phase 11 — Documents & pilotage

| Élément | Statut |
|---------|--------|
| Upload / bureau d'ordre | ✅ |
| Module Documents complet (KPI, filtres, export, bureau d'ordre CRUD) | ✅ |
| Recherche globale | ✅ |
| Notifications | ✅ |
| Notifications auto + email (SMTP) | ✅ |
| Journal audit `/audit` | ✅ |
| Module Audit complet (KPI, filtres, export, détail, liens entités) | ✅ |
| 2FA (TOTP Google Authenticator) | ✅ |
| Listes configurables `/referentiels` | ✅ |
| Module Référentiels complet (KPI, filtres, export, CRUD) | ✅ |
| Paramètres compte `/parametres` | ✅ |
| Module Paramètres complet (profil, 2FA, activité, export) | ✅ |

## Phase 12 — Livraison 🔄

| Élément | Statut |
|---------|--------|
| Docker Compose (backend + frontend) | ✅ |
| Script health check `/api/health` | ✅ |
| **Rôles multi-utilisateurs** (permissions API + garde routes + page Utilisateurs) | ✅ |
| **Bandeau backend offline** + `npm run dev` racine | ✅ |
| **Lazy-load pages** (code-splitting) | ✅ |
| Tests E2E complets | ⏳ |
| Déploiement HTTPS production | ⏳ |
| Formation utilisateurs | ⏳ |

---

## Nouveautés session 11

- **Graphiques dashboard** : courbes SVG ventes contractées + encaissements sur 12 mois (API `/dashboard` → `charts.months`)
- **Bandeau backend offline** : alerte si `/api/health` injoignable
- **`npm run dev` racine** : lance backend + frontend en parallèle (concurrently)
- **En-tête Mandant 360°** : harmonisé avec Client / Agent (avatar, KPI, actions)
- **Compte seed chef de chantier** : `chef@gic.ma` / `Chef@2026`
- **Dashboard par rôle** : raccourcis, alertes et boutons filtrés selon permissions
- **Lazy-load** : pages chargées à la demande (bundle initial allégé)

---

## Nouveautés session 10

- **Permissions backend** : modules par rôle (`COMPTABLE`, `COMMERCIAL`, `CHEF_CHANTIER`, …), middleware `requirePermission` sur toutes les routes API
- **Permissions frontend** : garde `RoleRoute`, filtrage sidebar + menus navbar selon le rôle, page « Accès refusé »
- **Gestion utilisateurs** : `/utilisateurs` (liste, création, modification rôle/statut) — réservé Admin / Super Admin
- **Badge rôle** : affiché dans l'en-tête (nom + libellé rôle)

---

## Nouveautés session 9

- **Chantier 360°** : en-tête enrichi, KPI cards, désaffectation personnel, upload documents, création mission engin
- **Projet 360°** : en-tête enrichi, onglets Ventes / Locations / Documents, upload plans
- **Nouveau bien contextualisé** : depuis fiche projet → `/biens?projectId=…&create=1` avec projet pré-rempli
- **Caméras chantier** : onglet surveillance, CRUD flux, aperçu snapshot/embed
- **Plan projet** : champ photo/plan, upload JPG/PDF, visuel en en-tête 360°

---

## Nouveautés session 8

- **Source client** : champ dédié `source` (plus dans remark) + référentiel + formulaire
- **Archivage clients** : API archive/unarchive, bouton fiche 360°, filtres Actifs/Archivés/Tous, KPI archivés
- **Fiche Agent 360°** : `/agents/:id` — KPI ventes/locations, liste clients, historique audit
- **Comptabilité** : KPI TVA estimée 20 % sur encaissements
- **Twilio** : support SMS/WhatsApp via variables d'environnement (fallback simulation)
- **Seed** : avatars SVG, comptes comptable/commercial, 3 clients archivés démo
- **Infra** : `docker-compose.yml`, Dockerfiles, script `npm run health`, `.env.example`

---

## Nouveautés session 7

- **Fiche Client 360°** : en-tête enrichi, badge « Dossier complet », vue générale 3 colonnes (infos / transactions / documents)
- **Navbar groupée** : menus déroulants CRM, Immobilier, Finance, Opérations, Logistique, Système (style macOS conservé)
- **Pages Finance** : Paiements, Comptabilité (journal + export CSV)
- **Pages Logistique** : Avancement global, Maintenance, Missions (pages dédiées)
- **Seed enrichi** : date naissance, source client, photos démo (12 premiers clients)
- **Route `/caisse`** : alias propre pour la caisse (redirect `/finance`)

---

## Nouveautés session 6

- **Module Locations complet** : KPI, pagination, filtres, export CSV, fiche détail (Infos, Paiements, Historique)
- **Module Ventes complet** : KPI, pagination, filtres statut/client, export CSV, fiche détail (Infos, Paiements, Historique)
- **Module Biens complet** : KPI, pagination, filtres statut/projet, export CSV, impression
- **Fiche bien 360°** : Infos, Transactions, Documents, Historique + photo + lien projet
- **Module Mandants complet** : KPI, pagination, export CSV, impression, fiche détail (Infos, Clients liés, Historique)
- **Actions icônes mandants** : 👁 Voir · ✏️ Modifier · 🗑 Supprimer (RG-MAN-001)
- **Tableau de bord complet** : actualiser, réinitialiser filtres, états chargement/erreur
- **KPI réels** : tendance clients calculée (30j), biens réservés, reste à encaisser, avancement chantiers
- **Alertes cliquables** → ventes, achats, engins, documents
- **Module Finance complet** : KPI, pagination, filtres compte/mode/type/dates, export CSV filtré, impression
- **Module Achats complet** : KPI, pagination, filtres statut/fournisseur/chantier, export CSV, workflow
- **Fiche achat 360°** : Infos, Documents fournisseur, Historique workflow + audit
- **Actions icônes achats** : 👁 Voir · ✏️ Modifier · ✅ Workflow · 📄 Docs · 🗑 Supprimer
- **Module Fournisseurs complet** : KPI, pagination, filtres actif/portail, export CSV, impression, fiche 360°
- **Fiche fournisseur 360°** : Infos, Achats liés, Historique, activation portail
- **Actions icônes fournisseurs** : 👁 Voir · ✏️ Modifier · 🔑 Portail · 🗑 Supprimer
- **Fiche mouvement 360°** : Infos, Historique, pièce justificative, CRUD avec motif suppression
- **Actions icônes finance** : 👁 Voir · ✏️ Modifier · 🖨 Imprimer · 🗑 Supprimer
- **Raccourcis** vers Clients, Projets, Biens, Ventes, Finance, Chantiers
- **Activité récente** et derniers clients avec liens fiche 360°
- **Module Projets complet** : KPI, pagination, export, fiche 360°, hiérarchie CRUD
- **Module Chantiers complet** : KPI, pagination, filtres statut, export CSV, barre avancement
- **Module Documents complet** : KPI, 2 onglets, pagination, upload, échéances, bureau d'ordre CRUD, export CSV
- **Module Paramètres complet** : profil éditable, KPI sécurité, 2FA QR code, mot de passe, activité paginée + export
- **Module Audit complet** : KPI journalier/hebdo, filtres action/entité/période, export CSV, détail + liens fiches
- **Module Référentiels complet** : KPI, pagination, filtres catégorie/statut, export CSV, CRUD avec audit
- **Module Engins complet** : KPI parc/missions/alertes, 3 onglets, pagination, export CSV, fiche 360°
- **Module Salaires complet** : KPI masse brute/nette, filtres période, pagination, export CSV, fiche détail par ouvrier
- **Formule GIC** : Net = (journées validées × salaire/j) + primes − avances
- **Module Pointage complet** : KPI jour/période, saisie journalière, historique paginé, export CSV
- **Validation pointage** : par ouvrier ou journée entière, statuts brouillon/validé
- **Fiche ouvrier 360°** : Infos, Affectations, Pointages, Salaire calculé, Historique
- **Actions icônes main-d'œuvre** : 👁 Voir · ✏️ Modifier · 🗑 Supprimer
- **Fiche chantier 360°** : Infos, Personnel, Achats, Avancement (19 tâches), Engins, Documents, Historique
- **Actions icônes chantiers** : 👁 Voir · ✏️ Modifier · 🗑 Supprimer · affectation ouvriers

---

## Nouveautés session 5

- **Import Excel clients** : upload `.xlsx` / `.xls` avec détection d'en-têtes
- **Portail fournisseur avancé** : dépôt devis, factures, bons de livraison par achat
- **Vue admin** : consultation des documents fournisseur depuis Achats
- **Email** : service SMTP (Nodemailer) + simulation en dev ; envoi aux admins sur notifications
- **SMS / WhatsApp** : couche simulation prête pour branchement API
- **Seed** : achat démo lié au fournisseur Béton Atlas

---

## Configuration email (optionnel)

Variables d'environnement backend :

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=GIC <noreply@gic.ma>
ADMIN_EMAIL=admin@gic.ma
```

Sans SMTP, les emails sont simulés dans la console.

---

## Démarrage

```bash
cd backend && npm install && npx prisma db push && npm run seed && npm run dev   # :4001
cd frontend && npm install && npm run dev  # :5173

# Ou depuis la racine (backend + frontend) :
npm install && npm run dev
npm run db:push && npm run seed
npm run health   # vérifie GET /api/health
docker compose up --build   # déploiement conteneurisé
```

**Compte admin :** `admin@gic.ma` / `Admin@2026`  
**Compte fournisseur :** `contact@beton-atlas.ma` / `Fournisseur@2026`  
**Compte comptable :** `comptable@gic.ma` / `Comptable@2026`  
**Compte commercial :** `commercial@gic.ma` / `Commercial@2026`  
**Compte chef chantier :** `chef@gic.ma` / `Chef@2026`

---

## Nouveautés session 6 — Complétion cahier des charges (sans IA)

### Exigences transverses
- **Champs uniques** : CIN (client, mandant, fournisseur, ouvrier), référence interne paiement, N° opération
- **Listes déroulantes modifiables** : module Référentiels (CRUD par catégorie)
- **Import / export** : CSV + Excel (clients, achats, fournisseurs) ; impression PDF via navigateur
- **Modification / suppression** : motif obligatoire sur suppressions sensibles
- **Email / SMS / WhatsApp** : API messaging + panneau **Échanges** (historique conversations)
- **Historique conversations** : Client, Agent, Mandant, Fournisseur

### Fournisseurs
- Champs **référence, source, 2 TEL, CIN**
- **Portail fournisseur** avec mot de passe et rôle achats
- Impression **Reçu, Facture, Devis, Bon de commande, Bon de livraison, Bon de caisse**

### Achats
- **Total filtré** en bas de liste + KPI montant global
- **Catalogue désignations** par famille d'achat (listes déroulantes)

### Chantiers
- **Caméras de surveillance** par chantier (URLs + zones)

### Main-d'œuvre
- Champs **Groupe** et **Passeport d'œuvre** sur fiche ouvrier

### Engins
- Champs **Groupe** et **Passeport d'œuvre**
- Onglets **Carburant** (journal pleins) et **GPS** (positions)
- **Rappels papiers** : assurance, vignette, visite, autorisation

### Ventes
- **Résiliation** avec réaffectation du bien à un autre client (vente résiliée conservée)

### Archives / Bureau d'ordre
- Registre virtuel avec filtres
- **Envoi par email** des courriers au destinataire concerné

### Authentification
- **Mot de passe oublié** : email + lien `/login?reset=…` + réinitialisation

---

## Prochaine session (suggéré)

1. Déploiement production HTTPS + recette E2E
2. Export PDF enrichi (mise en page tableaux)
3. Lien automatique échéance ↔ paiement enregistré
