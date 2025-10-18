// Firebase Authentication Module
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let auth = null;
let app = null;

// Initialiser Firebase Auth
async function initFirebaseAuth() {
    try {
        // Charger la configuration depuis le serveur
        const response = await fetch('/api/firebase-config');
        const firebaseConfig = await response.json();
        
        // Initialiser Firebase
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        
        // Exposer l'instance auth globalement pour firebase-db.js
        window.firebaseAuth = auth;
        
        console.log('Firebase Auth initialisé avec succès');
        return auth;
    } catch (error) {
        console.error('Erreur lors de l\'initialisation de Firebase Auth:', error);
        throw error;
    }
}

// Connexion avec email et mot de passe
async function loginWithEmail(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return {
            success: true,
            user: userCredential.user
        };
    } catch (error) {
        console.error('Erreur de connexion:', error);
        return {
            success: false,
            error: getErrorMessage(error.code)
        };
    }
}

// Inscription avec email et mot de passe
async function registerWithEmail(email, password) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        return {
            success: true,
            user: userCredential.user
        };
    } catch (error) {
        console.error('Erreur d\'inscription:', error);
        return {
            success: false,
            error: getErrorMessage(error.code)
        };
    }
}

// Connexion avec Google
async function loginWithGoogle() {
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        return {
            success: true,
            user: result.user
        };
    } catch (error) {
        console.error('Erreur de connexion Google:', error);
        return {
            success: false,
            error: getErrorMessage(error.code)
        };
    }
}

// Déconnexion
async function logout() {
    try {
        await signOut(auth);
        return { success: true };
    } catch (error) {
        console.error('Erreur de déconnexion:', error);
        return { success: false, error: error.message };
    }
}

// Vérifier l'état d'authentification
function checkAuthState(callback) {
    return onAuthStateChanged(auth, callback);
}

// Obtenir l'utilisateur actuel
function getCurrentUser() {
    return auth ? auth.currentUser : null;
}

// Messages d'erreur en français
function getErrorMessage(errorCode) {
    const errorMessages = {
        'auth/email-already-in-use': 'Cette adresse email est déjà utilisée.',
        'auth/invalid-email': 'L\'adresse email n\'est pas valide.',
        'auth/operation-not-allowed': 'Cette opération n\'est pas autorisée.',
        'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
        'auth/user-disabled': 'Ce compte a été désactivé.',
        'auth/user-not-found': 'Aucun compte ne correspond à cet email.',
        'auth/wrong-password': 'Mot de passe incorrect.',
        'auth/too-many-requests': 'Trop de tentatives. Veuillez réessayer plus tard.',
        'auth/network-request-failed': 'Erreur de connexion. Vérifiez votre connexion internet.',
        'auth/popup-closed-by-user': 'La fenêtre de connexion a été fermée.',
        'auth/cancelled-popup-request': 'Demande de connexion annulée.'
    };
    
    return errorMessages[errorCode] || 'Une erreur est survenue. Veuillez réessayer.';
}

export {
    initFirebaseAuth,
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    logout,
    checkAuthState,
    getCurrentUser
};
