// Script pour charger les variables d'environnement Firebase côté client
async function loadFirebaseConfig() {
    try {
        const response = await fetch('/api/firebase-config');
        const config = await response.json();
        return config;
    } catch (error) {
        console.error('Erreur lors du chargement de la configuration Firebase:', error);
        return null;
    }
}

export { loadFirebaseConfig };
