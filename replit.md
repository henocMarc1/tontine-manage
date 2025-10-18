# Gestionnaire de Tontines

## Vue d'ensemble
Application web de gestion de tontines permettant de gérer les membres, les tontines, et les paiements. L'application utilise Firebase pour l'authentification et le stockage des données.

## État actuel (18 octobre 2025)
✅ **Firebase intégré avec succès**
- Authentification Firebase configurée
- Base de données Firestore opérationnelle
- Variables d'environnement sécurisées
- Migration depuis IndexedDB disponible

## Architecture du projet

### Fichiers principaux
- **index.html** : Page principale de l'application (dashboard, membres, tontines, paiements)
- **login.html** : Page de connexion/inscription avec Firebase Auth
- **app.js** : Logique métier de l'application
- **styles.css** : Styles CSS de l'application
- **server.py** : Serveur HTTP Python pour servir l'application

### Modules Firebase
- **firebase-auth.js** : Gestion de l'authentification Firebase
  - Connexion email/mot de passe
  - Inscription
  - Connexion Google
  - Gestion de session

- **firebase-db.js** : Gestion de la base de données Firestore
  - CRUD pour membres, tontines, paiements
  - Migration depuis IndexedDB
  - Isolation des données par utilisateur

- **firebase-config.js** : Configuration Firebase (placeholder)
- **load-env.js** : Chargement des variables d'environnement côté client

### Base de données (obsolète)
- **database.js** : Ancienne gestion IndexedDB (remplacée par Firestore)

## Variables d'environnement
Les clés Firebase sont stockées de manière sécurisée dans les secrets Replit :
- FIREBASE_API_KEY
- FIREBASE_AUTH_DOMAIN
- FIREBASE_PROJECT_ID
- FIREBASE_STORAGE_BUCKET
- FIREBASE_MESSAGING_SENDER_ID
- FIREBASE_APP_ID
- FIREBASE_MEASUREMENT_ID

Ces variables sont accessibles via l'endpoint `/api/firebase-config` du serveur Python.

## Fonctionnalités

### Authentification
- ✅ Connexion par email et mot de passe
- ✅ Inscription de nouveaux utilisateurs
- ⚠️ Connexion avec Google (nécessite configuration dans Firebase Console)
- ✅ Déconnexion
- ✅ Protection des routes (redirection vers login si non authentifié)
- ✅ Isolation complète des données par utilisateur

### Gestion des membres
- Ajout, modification, suppression de membres
- Informations : nom, CNI, téléphone, email, adresse
- Recherche de membres
- Validation des doublons (CNI unique)

### Gestion des tontines
- Création et modification de tontines
- Configuration : nom, description, montant, fréquence, date de début
- Affectation des membres avec positions
- Suivi des tours et des bénéficiaires
- Gestion des statuts (active, terminée)

### Gestion des paiements
- Enregistrement des cotisations
- Versements aux bénéficiaires
- Calcul automatique des pénalités de retard
- Génération de références de transaction
- Historique des paiements

### Tableau de bord
- Statistiques en temps réel
- Nombre de membres
- Tontines actives
- Paiements du mois
- Montant total
- Activités récentes
- Graphiques (Chart.js)

## Structure des données Firestore

Les données sont organisées par utilisateur :
```
users/{userId}/
  ├── members/{memberId}
  ├── tontines/{tontineId}
  └── payments/{paymentId}
```

Chaque utilisateur a ses propres données isolées.

## Développement

### Démarrer le serveur
Le serveur Python démarre automatiquement sur le port 5000 :
```bash
python3 server.py
```

### Configuration Firebase
Les clés Firebase sont chargées depuis les variables d'environnement et servies via `/api/firebase-config`.

### Migration des données
Lors de la première connexion, si des données IndexedDB existent, l'utilisateur peut choisir de les migrer vers Firestore.

## Changements récents (18 octobre 2025)

### Migration Firebase
- ✅ Remplacement de IndexedDB par Firebase Firestore
- ✅ Ajout de l'authentification Firebase
- ✅ Création de la page de connexion moderne
- ✅ Configuration des variables d'environnement sécurisées
- ✅ Mise à jour de toutes les fonctions CRUD pour utiliser Firestore
- ✅ Ajout du serveur Python pour servir les variables d'environnement

### Améliorations
- Authentification sécurisée avec Firebase
- Données synchronisées dans le cloud
- Support multi-utilisateurs
- Connexion Google disponible
- Migration automatique depuis IndexedDB

## Préférences utilisateur
- Language : Français
- Framework : Vanilla JavaScript avec Firebase
- Style : Interface moderne avec dégradés et animations
- Base de données : Firebase Firestore
- Authentification : Firebase Auth

## Notes techniques
- Pas de framework frontend (Vanilla JS)
- Firebase SDK version 10.7.1
- Python 3.11 pour le serveur
- Chart.js pour les graphiques
- Font Awesome pour les icônes
- Support du mode sombre (toggle disponible)

## Configuration Google Sign-In (Optionnel)

Pour activer la connexion Google, suivez ces étapes dans la Firebase Console :

1. Accédez à Firebase Console (https://console.firebase.google.com/)
2. Sélectionnez votre projet "tontine-manager-4ca6a"
3. Allez dans Authentication > Sign-in method
4. Activez le fournisseur "Google"
5. Configurez l'écran de consentement OAuth
6. La connexion Google fonctionnera automatiquement une fois activée

## Règles de sécurité Firestore recommandées

Pour sécuriser votre base de données Firestore, ajoutez ces règles dans Firebase Console :

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Permettre aux utilisateurs d'accéder uniquement à leurs propres données
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Prochaines étapes potentielles
- Ajouter la réinitialisation de mot de passe
- Implémenter les notifications en temps réel avec Firestore
- Configurer Google Sign-In dans Firebase Console
- Ajouter les règles de sécurité Firestore recommandées ci-dessus
- Optimiser les requêtes Firestore avec des index
- Ajouter des rapports PDF avancés
- Implémenter l'export Excel amélioré
