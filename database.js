// database.js - Gestionnaire IndexedDB pour la persistance des données
class TontineDB {
    constructor() {
        this.dbName = 'TontineDatabase';
        this.version = 1;
        this.db = null;
    }

    // Initialiser la base de données
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Créer les tables si elles n'existent pas
                if (!db.objectStoreNames.contains('members')) {
                    db.createObjectStore('members', { keyPath: 'id' });
                }
                
                if (!db.objectStoreNames.contains('tontines')) {
                    db.createObjectStore('tontines', { keyPath: 'id' });
                }
                
                if (!db.objectStoreNames.contains('payments')) {
                    db.createObjectStore('payments', { keyPath: 'id' });
                }
                
                if (!db.objectStoreNames.contains('appState')) {
                    db.createObjectStore('appState', { keyPath: 'key' });
                }
            };
        });
    }

    // Sauvegarder des données
    async saveData(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            if (Array.isArray(data)) {
                // Sauvegarder un tableau d'éléments
                data.forEach(item => store.put(item));
            } else {
                // Sauvegarder un seul élément
                store.put(data);
            }
            
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    // Charger toutes les données d'une table
    async loadData(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Supprimer un élément
    async deleteData(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Migrer les données du localStorage vers IndexedDB
    async migrateFromLocalStorage() {
        try {
            const localData = localStorage.getItem('tontineData');
            if (localData) {
                const parsedData = JSON.parse(localData);
                
                // Migrer les membres
                if (parsedData.members && parsedData.members.length > 0) {
                    await this.saveData('members', parsedData.members);
                }
                
                // Migrer les tontines
                if (parsedData.tontines && parsedData.tontines.length > 0) {
                    await this.saveData('tontines', parsedData.tontines);
                }
                
                // Migrer les paiements
                if (parsedData.payments && parsedData.payments.length > 0) {
                    await this.saveData('payments', parsedData.payments);
                }
                
                // Marquer la migration comme terminée
                await this.saveData('appState', { key: 'migrated', value: true });
                
                // Supprimer les anciennes données
                localStorage.removeItem('tontineData');
                
                console.log('Migration des données terminée avec succès');
                return true;
            }
        } catch (error) {
            console.error('Erreur lors de la migration:', error);
            return false;
        }
        return false;
    }
}

// Instance globale de la base de données
const tontineDB = new TontineDB();
