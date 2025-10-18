// Firebase Firestore Database Module
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let db = null;
let app = null;

// Initialiser Firestore
async function initFirestore() {
    try {
        // Charger la configuration depuis le serveur
        const response = await fetch('/api/firebase-config');
        const firebaseConfig = await response.json();
        
        // Vérifier si Firebase est déjà initialisé
        const { getApps } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js");
        const existingApps = getApps();
        
        if (existingApps.length > 0) {
            app = existingApps[0];
        } else {
            app = initializeApp(firebaseConfig);
        }
        
        db = getFirestore(app);
        console.log('Firestore initialisé avec succès');
        return db;
    } catch (error) {
        console.error('Erreur lors de l\'initialisation de Firestore:', error);
        throw error;
    }
}

// Obtenir l'ID de l'utilisateur connecté (pour isoler les données par utilisateur)
function getUserId() {
    const auth = window.firebaseAuth || null;
    if (!auth || !auth.currentUser) {
        throw new Error('Utilisateur non authentifié. Veuillez vous connecter.');
    }
    return auth.currentUser.uid;
}

// Sauvegarder un document
async function saveDocument(collectionName, documentId, data) {
    try {
        const userId = getUserId();
        const docRef = doc(db, `users/${userId}/${collectionName}`, documentId);
        await setDoc(docRef, {
            ...data,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        return { success: true };
    } catch (error) {
        console.error('Erreur de sauvegarde:', error);
        return { success: false, error: error.message };
    }
}

// Ajouter un nouveau document
async function addDocument(collectionName, data) {
    try {
        const userId = getUserId();
        const colRef = collection(db, `users/${userId}/${collectionName}`);
        const docRef = await addDoc(colRef, {
            ...data,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Erreur d\'ajout:', error);
        return { success: false, error: error.message };
    }
}

// Charger un document
async function loadDocument(collectionName, documentId) {
    try {
        const userId = getUserId();
        const docRef = doc(db, `users/${userId}/${collectionName}`, documentId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            return { success: true, data: { id: docSnap.id, ...docSnap.data() } };
        } else {
            return { success: false, error: 'Document non trouvé' };
        }
    } catch (error) {
        console.error('Erreur de chargement:', error);
        return { success: false, error: error.message };
    }
}

// Charger tous les documents d'une collection
async function loadCollection(collectionName) {
    try {
        const userId = getUserId();
        const colRef = collection(db, `users/${userId}/${collectionName}`);
        const querySnapshot = await getDocs(colRef);
        
        const documents = [];
        querySnapshot.forEach((doc) => {
            documents.push({ id: doc.id, ...doc.data() });
        });
        
        return { success: true, data: documents };
    } catch (error) {
        console.error('Erreur de chargement de la collection:', error);
        return { success: false, error: error.message };
    }
}

// Supprimer un document
async function deleteDocument(collectionName, documentId) {
    try {
        const userId = getUserId();
        const docRef = doc(db, `users/${userId}/${collectionName}`, documentId);
        await deleteDoc(docRef);
        return { success: true };
    } catch (error) {
        console.error('Erreur de suppression:', error);
        return { success: false, error: error.message };
    }
}

// Écouter les changements en temps réel sur une collection
function listenToCollection(collectionName, callback) {
    const userId = getUserId();
    const colRef = collection(db, `users/${userId}/${collectionName}`);
    
    return onSnapshot(colRef, (snapshot) => {
        const documents = [];
        snapshot.forEach((doc) => {
            documents.push({ id: doc.id, ...doc.data() });
        });
        callback(documents);
    }, (error) => {
        console.error('Erreur d\'écoute:', error);
    });
}

// Migrer les données de IndexedDB vers Firestore
async function migrateFromIndexedDB() {
    try {
        // Ouvrir IndexedDB
        const dbRequest = indexedDB.open('TontineDatabase', 1);
        
        return new Promise((resolve, reject) => {
            dbRequest.onsuccess = async (event) => {
                const indexedDB = event.target.result;
                
                try {
                    // Migrer les membres
                    const membersTransaction = indexedDB.transaction(['members'], 'readonly');
                    const membersStore = membersTransaction.objectStore('members');
                    const membersRequest = membersStore.getAll();
                    
                    membersRequest.onsuccess = async () => {
                        const members = membersRequest.result;
                        for (const member of members) {
                            await saveDocument('members', member.id, member);
                        }
                    };
                    
                    // Migrer les tontines
                    const tontinesTransaction = indexedDB.transaction(['tontines'], 'readonly');
                    const tontinesStore = tontinesTransaction.objectStore('tontines');
                    const tontinesRequest = tontinesStore.getAll();
                    
                    tontinesRequest.onsuccess = async () => {
                        const tontines = tontinesRequest.result;
                        for (const tontine of tontines) {
                            await saveDocument('tontines', tontine.id, tontine);
                        }
                    };
                    
                    // Migrer les paiements
                    const paymentsTransaction = indexedDB.transaction(['payments'], 'readonly');
                    const paymentsStore = paymentsTransaction.objectStore('payments');
                    const paymentsRequest = paymentsStore.getAll();
                    
                    paymentsRequest.onsuccess = async () => {
                        const payments = paymentsRequest.result;
                        for (const payment of payments) {
                            await saveDocument('payments', payment.id, payment);
                        }
                        
                        console.log('Migration vers Firestore terminée avec succès');
                        resolve(true);
                    };
                } catch (error) {
                    console.error('Erreur lors de la migration:', error);
                    reject(error);
                }
            };
            
            dbRequest.onerror = () => {
                console.log('Pas de données IndexedDB à migrer');
                resolve(false);
            };
        });
    } catch (error) {
        console.error('Erreur de migration:', error);
        return false;
    }
}

export {
    initFirestore,
    saveDocument,
    addDocument,
    loadDocument,
    loadCollection,
    deleteDocument,
    listenToCollection,
    migrateFromIndexedDB
};
