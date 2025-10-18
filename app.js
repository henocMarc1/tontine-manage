
// Firebase imports - chargés dynamiquement
let firebaseAuth, firebaseDB;
let currentUser = null;

// Application State
let state = {
    members: [],
    tontines: [],
    payments: [],
    currentSection: 'dashboard'
};

// Initialiser Firebase
async function initFirebase() {
    try {
        const { initFirebaseAuth, checkAuthState, getCurrentUser } = await import('./firebase-auth.js');
        const { initFirestore, loadCollection, migrateFromIndexedDB } = await import('./firebase-db.js');
        
        // Initialiser Auth et Firestore
        await initFirebaseAuth();
        await initFirestore();
        
        console.log('Firebase initialisé avec succès');
        return true;
    } catch (error) {
        console.error('Erreur d\'initialisation de Firebase:', error);
        showNotification('Erreur de connexion à Firebase', 'error');
        return false;
    }
}

// Initialiser la base de données
async function initDatabase() {
    try {
        const { loadCollection, migrateFromIndexedDB } = await import('./firebase-db.js');
        
        // Vérifier si migration depuis IndexedDB nécessaire
        const hasIndexedData = await checkIndexedDBData();
        if (hasIndexedData) {
            const shouldMigrate = confirm('Des données locales ont été détectées. Voulez-vous les migrer vers Firebase ?');
            if (shouldMigrate) {
                await migrateFromIndexedDB();
                showNotification('Migration réussie !', 'success');
            }
        }
        
        // Charger les données depuis Firestore
        await loadDataFromDB();
        
    } catch (error) {
        console.error('Erreur d\'initialisation de la base de données:', error);
        showNotification('Erreur de chargement des données', 'error');
    }
}

// Vérifier si des données existent dans IndexedDB
async function checkIndexedDBData() {
    return new Promise((resolve) => {
        const request = indexedDB.open('TontineDatabase', 1);
        request.onsuccess = (event) => {
            const db = event.target.result;
            if (db.objectStoreNames.contains('members')) {
                const transaction = db.transaction(['members'], 'readonly');
                const store = transaction.objectStore('members');
                const countRequest = store.count();
                countRequest.onsuccess = () => {
                    resolve(countRequest.result > 0);
                };
            } else {
                resolve(false);
            }
        };
        request.onerror = () => resolve(false);
    });
}

// Charger toutes les données depuis Firestore
async function loadDataFromDB() {
    try {
        const { loadCollection } = await import('./firebase-db.js');
        
        const [membersResult, tontinesResult, paymentsResult] = await Promise.all([
            loadCollection('members'),
            loadCollection('tontines'),
            loadCollection('payments')
        ]);
        
        state.members = membersResult.success ? membersResult.data : [];
        state.tontines = tontinesResult.success ? tontinesResult.data : [];
        state.payments = paymentsResult.success ? paymentsResult.data : [];

        updateRecentActivities();
        
    } catch (error) {
        console.error('Erreur de chargement des données:', error);
        showNotification('Erreur de chargement des données', 'error');
    }
}

// Sauvegarder un membre dans Firestore
async function saveMemberToDB(member) {
    try {
        const { saveDocument } = await import('./firebase-db.js');
        await saveDocument('members', member.id, member);
    } catch (error) {
        console.error('Erreur de sauvegarde du membre:', error);
        throw error;
    }
}

// Sauvegarder une tontine dans Firestore
async function saveTontineToDB(tontine) {
    try {
        const { saveDocument } = await import('./firebase-db.js');
        await saveDocument('tontines', tontine.id, tontine);
    } catch (error) {
        console.error('Erreur de sauvegarde de la tontine:', error);
        throw error;
    }
}

// Sauvegarder un paiement dans Firestore
async function savePaymentToDB(payment) {
    try {
        const { saveDocument } = await import('./firebase-db.js');
        await saveDocument('payments', payment.id, payment);
    } catch (error) {
        console.error('Erreur de sauvegarde du paiement:', error);
        throw error;
    }
}

// Supprimer un document de Firestore
async function deleteFromDB(collection, id) {
    try {
        const { deleteDocument } = await import('./firebase-db.js');
        await deleteDocument(collection, id);
    } catch (error) {
        console.error('Erreur de suppression:', error);
        throw error;
    }
}

// Load data from localStorage (obsolète)
function loadData() {
    // Cette fonction est maintenant gérée par initDatabase()
}

// Save data to localStorage (obsolète)
function saveData() {
    // Les données sont sauvegardées individuellement dans Firestore
}
// Generate unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Generate transaction reference
function generateTransactionReference(date) {
    const d = new Date(date);
    return `REF${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${Date.now().toString(36).toUpperCase()}`;
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('fr-FR').format(amount);
}

// Calculate next payment date
function calculateNextPaymentDate(startDate, frequency, position) {
    const start = new Date(startDate);
    let nextDate = new Date(start);
    
    switch (frequency) {
        case 'Hebdomadaire':
            nextDate.setDate(start.getDate() + (position - 1) * 7);
            break;
        case 'monthly':
            nextDate.setMonth(start.getMonth() + (position - 1));
            break;
        case 'Trimestrielle':
            nextDate.setMonth(start.getMonth() + (position - 1) * 3);
            break;
    }
    
    return nextDate;
}

// Calculate payment amount with penalties
function calculatePaymentAmount(baseAmount, paymentDate, dueDate) {
    const payment = new Date(paymentDate);
    const due = new Date(dueDate);
    
    let amount = baseAmount;
    let penalty = 0;
    
    if (payment > due) {
        const daysLate = Math.ceil((payment - due) / (1000 * 60 * 60 * 24));
        penalty = Math.floor(baseAmount * 0.1); // 10% penalty for late payment
    }
    
    return { amount: amount + penalty, penalty, daysLate: Math.max(0, Math.ceil((payment - due) / (1000 * 60 * 60 * 24))) };
}

// Calculate due date for a specific round based on tontine frequency
function calculateRoundDueDate(tontine, round) {
    const startDate = new Date(tontine.startDate);
    let dueDate = new Date(startDate);
    
    switch (tontine.frequency) {
        case 'Hebdomadaire':
            dueDate.setDate(startDate.getDate() + (round - 1) * 7);
            break;
        case 'Mensuelle':
            dueDate.setMonth(startDate.getMonth() + (round - 1));
            break;
        case 'quarterly':
            dueDate.setMonth(startDate.getMonth() + (round - 1) * 3);
            break;
    }
    
    return dueDate;
}

// Get current round for tontine
function getCurrentRound(tontine) {
    if (!tontine.members || tontine.members.length === 0) return 1;
    
    const tontinePayments = state.payments.filter(p => p.tontineId === tontine.id && p.type !== 'payout');
    const totalPayments = tontinePayments.length;
    const membersCount = tontine.members.length;
    
    return Math.floor(totalPayments / membersCount) + 1;
}

// Get member name by ID
function getMemberName(memberId) {
    const member = state.members.find(m => m.id === memberId);
    return member ? member.name : 'Membre inconnu';
}

// Show notification
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // Choose icon based on type
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    
    notification.innerHTML = `
        <div class="notification-icon">
            <i class="${icons[type]}"></i>
        </div>
        <div class="notification-content">${message}</div>
        <button class="notification-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

// Theme management
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Update theme toggle icon
    const themeIcon = document.querySelector('.theme-toggle i');
    themeIcon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    
    showNotification(`Mode ${newTheme === 'dark' ? 'sombre' : 'clair'} activé`, 'info');
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    const themeIcon = document.querySelector('.theme-toggle i');
    if (themeIcon) {
        themeIcon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

async function initApp() {
    try {
        // Initialiser Firebase
        const firebaseInitialized = await initFirebase();
        if (!firebaseInitialized) {
            showNotification('Impossible de se connecter à Firebase', 'error');
            return;
        }
        
        // Vérifier l'authentification
        const { checkAuthState, getCurrentUser } = await import('./firebase-auth.js');
        
        checkAuthState(async (user) => {
            if (user) {
                // Utilisateur connecté
                currentUser = user;
                console.log('Utilisateur connecté:', user.email);
                
                // Initialiser la base de données et charger les données
                await initDatabase();
                
                initTheme();
                setupEventListeners();
                activateModalDarkMode();
                updateDashboard();
                updateRecentActivities();
                switchSection('dashboard');
                updateDashboardStats();
                
                setTimeout(() => {
                    initSalesChart();
                }, 100);
                
                // Mettre à jour l'affichage de l'utilisateur
                const userInfoSpan = document.querySelector('.user-info span');
                if (userInfoSpan) {
                    userInfoSpan.textContent = user.email || 'Utilisateur';
                }
            } else {
                // Utilisateur non connecté - rediriger vers la page de connexion
                window.location.href = 'login.html';
            }
        });
        
    } catch (error) {
        console.error('Erreur lors de l\'initialisation:', error);
        showNotification('Erreur d\'initialisation de l\'application', 'error');
    }
}

// Fonction de déconnexion
async function logout() {
    try {
        const { logout: firebaseLogout } = await import('./firebase-auth.js');
        const result = await firebaseLogout();
        
        if (result.success) {
            window.location.href = 'login.html';
        } else {
            showNotification('Erreur de déconnexion', 'error');
        }
    } catch (error) {
        console.error('Erreur de déconnexion:', error);
        showNotification('Erreur de déconnexion', 'error');
    }
}
// Setup event listeners
function setupEventListeners() {
    // Navigation buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const section = e.currentTarget.dataset.section;
            switchSection(section);
        });
    });

    // Modal close buttons
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.currentTarget.closest('.modal');
            modal.classList.remove('active');
        });
    });

    // Modal background clicks
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });

    // Forms
    document.getElementById('member-form').addEventListener('submit', handleMemberSubmit);
    document.getElementById('tontine-form').addEventListener('submit', handleTontineSubmit);
    document.getElementById('payment-form').addEventListener('submit', handlePaymentSubmit);

    // Search inputs
    document.getElementById('member-search').addEventListener('input', (e) => {
        renderMembers(e.target.value);
    });
    
    document.getElementById('tontine-search').addEventListener('input', (e) => {
        renderTontines(e.target.value);
    });
    
    document.getElementById('payment-search').addEventListener('input', (e) => {
        renderPayments(e.target.value);
    });

    // Action buttons
    document.getElementById('add-member-btn').addEventListener('click', () => openMemberModal());
    document.getElementById('add-tontine-btn').addEventListener('click', () => openTontineModal());
    document.getElementById('add-payment-btn').addEventListener('click', () => openPaymentModal());
    
    // Check if buttons exist before adding listeners
    const generateBtn = document.getElementById('monthly-report-btn');
    if (generateBtn) generateBtn.addEventListener('click', generateMonthlyReport);
    
    const exportBtn = document.getElementById('export-db-btn');
    if (exportBtn) exportBtn.addEventListener('click', exportDatabase);
    
    const importBtn = document.getElementById('import-db-btn');
    if (importBtn) importBtn.addEventListener('click', importDatabase);
}

// Switch between sections
function switchSection(sectionName) {
    // Update navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
    
    // Update sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionName).classList.add('active');
    
    state.currentSection = sectionName;
    
    // Update content based on section
    switch (sectionName) {
        case 'dashboard':
            updateDashboard();
            break;
        case 'members':
            renderMembers();
            break;
        case 'tontines':
            renderTontines();
            break;
        case 'payments':
            renderPayments();
            updatePaymentsSummary();
            updatePaymentFilters();
            break;
    }
}

// Update dashboard statistics
function updateDashboard() {
    document.getElementById('total-members').textContent = state.members.length;
    document.getElementById('active-tontines').textContent = state.tontines.filter(t => t.status === 'active').length;
    
    const totalAmount = state.tontines.reduce((sum, tontine) => {
        return sum + (tontine.amount * (tontine.members ? tontine.members.length : 0));
    }, 0);
    document.getElementById('total-amount').textContent = formatCurrency(totalAmount);
    
    const pendingPayments = state.payments.filter(p => p.status === 'pending').length;
    document.getElementById('pending-payments').textContent = pendingPayments;
    
    // Update recent lists
    updateRecentMembers();
    updateRecentTontines();
    updateRecentActivities();
}
// Fonction pour mettre à jour les activités récentes - AVEC TRI CORRECT
function updateRecentActivities() {
    const activitiesList = document.getElementById('recent-activities-list');
    if (!activitiesList) return;

    // Collecter TOUTES les activités sans limite par catégorie
    const activities = [];
    
    // Ajouter TOUS les paiements
    state.payments.forEach(payment => {
        const member = state.members.find(m => m.id === payment.memberId);
        const tontine = state.tontines.find(t => t.id === payment.tontineId);
        
        // Assurer une date valide
        const paymentDate = payment.date ? new Date(payment.date) : new Date();
        
        activities.push({
            type: 'payment',
            title: `Paiement de ${member?.name || 'Membre inconnu'}`,
            meta: `${formatCurrency(payment.amount)} FCFA - ${tontine?.name || 'Tontine'}`,
            date: paymentDate,
            timestamp: paymentDate.getTime(), // Ajouter timestamp pour tri plus fiable
            icon: 'fas fa-credit-card'
        });
    });
    
    // Ajouter TOUS les membres
    state.members.forEach(member => {
        // Assurer une date valide pour les membres
        const memberDate = member.dateJoined ? new Date(member.dateJoined) : new Date();
        
        activities.push({
            type: 'member',
            title: `Nouveau membre: ${member.name}`,
            meta: `Rejoint le ${memberDate.toLocaleDateString('fr-FR')}`,
            date: memberDate,
            timestamp: memberDate.getTime(),
            icon: 'fas fa-user-plus'
        });
    });
    
    // Ajouter TOUTES les tontines
    state.tontines.forEach(tontine => {
        // Assurer une date valide pour les tontines
        const tontineDate = tontine.startDate ? new Date(tontine.startDate) : new Date();
        
        activities.push({
            type: 'tontine',
            title: `Nouvelle tontine: ${tontine.name}`,
            meta: `${formatCurrency(tontine.amount)} FCFA - ${tontine.members?.length || 0} membres`,
            date: tontineDate,
            timestamp: tontineDate.getTime(),
            icon: 'fas fa-handshake'
        });
    });
    
    // Trier par timestamp (plus récent en premier)
    activities.sort((a, b) => b.timestamp - a.timestamp);
    
    // Prendre les 5 plus récentes
    const topActivities = activities.slice(0, 5);
    
    // Debug pour vérifier l'ordre
    console.log('Activités triées:', topActivities.map(a => ({ 
        title: a.title, 
        date: a.date.toLocaleDateString('fr-FR'),
        timestamp: a.timestamp
    })));
    
    // Générer le HTML
    if (topActivities.length > 0) {
        activitiesList.innerHTML = topActivities.map((activity, index) => `
            <div class="activity-item">
                <div class="activity-icon activity-${activity.type}">
                    <i class="${activity.icon}"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-title">${activity.title}</div>
                    <div class="activity-meta">
                        ${activity.meta}
                        <span style="margin-left: 10px; color: var(--text-secondary); font-size: 0.7rem;">
                            ${activity.date.toLocaleDateString('fr-FR')}
                        </span>
                    </div>
                </div>
            </div>
        `).join('');
    } else {
        activitiesList.innerHTML = `
            <div class="no-activities">
                <i class="fas fa-info-circle"></i>
                <p>Aucune activité récente</p>
            </div>
        `;
    }
}

function updateRecentTontines() {
    const recentTontines = [...state.tontines]
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 5);
    
    const container = document.getElementById('recent-tontines-list');
    
    if (recentTontines.length === 0) {
        container.innerHTML = '<div class="recent-item"><div class="recent-item-info">Aucune tontine créée</div></div>';
        return;
    }
    
    container.innerHTML = recentTontines.map(tontine => `
        <div class="recent-item" onclick="showTontineDetails('${tontine.id}')" style="cursor: pointer;">
            <div class="recent-item-info">
                <div class="recent-item-title">${tontine.name}</div>
                <div class="recent-item-subtitle">${formatCurrency(tontine.amount)} FCFA - ${getTontineStatusText(tontine)}</div>
            </div>
            <div class="recent-item-date">
                ${tontine.createdAt ? new Date(tontine.createdAt).toLocaleDateString('fr-FR') : 'N/A'}
            </div>
        </div>
    `).join('');
}


// Member Management Functions
function openMemberModal(memberId = null) {
    const modal = document.getElementById('member-modal');
    const form = document.getElementById('member-form');
    const title = document.getElementById('member-modal-title');
    
    if (memberId) {
        const member = state.members.find(m => m.id === memberId);
        if (member) {
            title.textContent = 'Modifier le membre';
            document.getElementById('member-name').value = member.name;
            document.getElementById('member-cni').value = member.cni;
            document.getElementById('member-phone').value = member.phone;
            document.getElementById('member-email').value = member.email || '';
            document.getElementById('member-address').value = member.address || '';
            form.dataset.memberId = memberId;
        }
    } else {
        title.textContent = 'Ajouter un membre';
        form.reset();
        delete form.dataset.memberId;
    }
    
    modal.classList.add('active');
}

function handleMemberSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const memberId = form.dataset.memberId;
    
    const memberData = {
        name: document.getElementById('member-name').value.trim(),
        cni: document.getElementById('member-cni').value.trim(),
        phone: document.getElementById('member-phone').value.trim(),
        email: document.getElementById('member-email').value.trim(),
        address: document.getElementById('member-address').value.trim()
    };
    
    // Validation
    if (!memberData.name || !memberData.cni || !memberData.phone) {
        showNotification('Veuillez remplir tous les champs obligatoires', 'error');
        return;
    }
    
    // Check for duplicate CNI
    const existingMember = state.members.find(m => m.cni === memberData.cni && m.id !== memberId);
    if (existingMember) {
        showNotification('Un membre avec ce numéro CNI existe déjà', 'error');
        return;
    }
    
    if (memberId) {
        // Update existing member
        const memberIndex = state.members.findIndex(m => m.id === memberId);
        state.members[memberIndex] = { ...state.members[memberIndex], ...memberData };
        saveMemberToDB(state.members[memberIndex]).then(() => {
            showNotification('Membre modifié avec succès', 'success');
        }).catch((error) => {
            showNotification('Erreur de sauvegarde', 'error');
        });
    } else {
        // Add new member
        const newMember = {
            id: generateId(),
            ...memberData,
            createdAt: new Date().toISOString()
        };
        state.members.push(newMember);
        saveMemberToDB(newMember).then(() => {
            showNotification('Membre ajouté avec succès', 'success');
        }).catch((error) => {
            showNotification('Erreur de sauvegarde', 'error');
        });
        updateRecentActivities();
    }
    
    closeModal('member-modal');
    
    if (state.currentSection === 'members') {
        renderMembers();
    }
    
    updateDashboard();
}

function renderMembers(searchTerm = '') {
    const container = document.getElementById('members-grid');
    
    let filteredMembers = state.members;
    if (searchTerm) {
        filteredMembers = state.members.filter(member => 
            member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            member.phone.includes(searchTerm) ||
            member.cni.includes(searchTerm)
        );
    }
    
    if (filteredMembers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>${searchTerm ? 'Aucun membre trouvé' : 'Aucun membre enregistré'}</p>
                <button class="btn btn-primary" onclick="openMemberModal()">
                    Ajouter le premier membre
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredMembers.map(member => `
        <div class="member-card">
            <div class="member-avatar">
                <i class="fas fa-user-circle"></i>
            </div>
            <div class="member-info">
                <h3>${member.name}</h3>
                <p class="member-phone">
                    <i class="fas fa-phone"></i>
                    ${member.phone}
                </p>
                <p class="member-cni">
                    <i class="fas fa-id-card"></i>
                    CNI: ${member.cni}
                </p>
                ${member.email ? `<p class="member-email"><i class="fas fa-envelope"></i> ${member.email}</p>` : ''}
            </div>
            <div class="member-actions">
                <button class="btn btn-sm btn-primary" onclick="showMemberDetails('${member.id}')">
                    <i class="fas fa-eye"></i>
                    Voir
                </button>
                <button class="btn btn-sm btn-secondary" onclick="openMemberModal('${member.id}')">
                    <i class="fas fa-edit"></i>
                    Modifier
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteMember('${member.id}')">
                    <i class="fas fa-trash"></i>
                    Supprimer
                </button>
            </div>
        </div>
    `).join('');
}

function showMemberDetails(memberId, activeTab = 'personal') {
    const member = state.members.find(m => m.id === memberId);
    if (!member) {
        showNotification('Membre non trouvé', 'error');
        return;
    }
    
    const modal = document.getElementById('member-details-modal');
    const title = document.getElementById('member-details-title');
    const content = document.getElementById('member-details-content');
    
    title.textContent = `Détails de ${member.name}`;
    
    // Get member's tontines with position information
    const memberTontines = state.tontines.filter(t => 
        t.membersWithPositions && t.membersWithPositions.some(mp => mp.memberId === memberId)
    ).map(tontine => {
        const memberPosition = tontine.membersWithPositions.find(mp => mp.memberId === memberId);
        return { ...tontine, memberPosition: memberPosition.position };
    });
    
    // Get member's payments
    const memberPayments = state.payments.filter(p => p.memberId === memberId);
    
    content.innerHTML = getTabContent(member, memberTontines, memberPayments, activeTab);
    
    modal.classList.add('active');
}

function switchMemberTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('#member-details-modal .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`#member-details-modal .tab-btn[onclick="switchMemberTab('${tabName}')"]`).classList.add('active');
    
    // Get current member data and update content
    const title = document.getElementById('member-details-title').textContent;
    const memberName = title.replace('Détails de ', '');
    const member = state.members.find(m => m.name === memberName);
    
    if (member) {
        const memberTontines = state.tontines.filter(t => 
            t.membersWithPositions && t.membersWithPositions.some(mp => mp.memberId === member.id)
        ).map(tontine => {
            const memberPosition = tontine.membersWithPositions.find(mp => mp.memberId === member.id);
            return { ...tontine, memberPosition: memberPosition.position };
        });
        
        const memberPayments = state.payments.filter(p => p.memberId === member.id);
        const content = document.getElementById('member-details-content');
        content.innerHTML = getTabContent(member, memberTontines, memberPayments, tabName);
    }
}

function getTabContent(member, memberTontines, memberPayments, activeTab) {
    switch (activeTab) {
        case 'personal':
            return `
                <div class="tab-content">
                    <div class="detail-section">
                        <h4><i class="fas fa-user"></i> Informations personnelles</h4>
                        <div class="info-grid">
                            <div class="info-row">
                                <strong>Nom complet:</strong>
                                <span>${member.name}</span>
                            </div>
                            <div class="info-row">
                                <strong>Numéro CNI:</strong>
                                <span>${member.cni}</span>
                            </div>
                            <div class="info-row">
                                <strong>Téléphone:</strong>
                                <span>${member.phone}</span>
                            </div>
                            ${member.email ? `
                            <div class="info-row">
                                <strong>Email:</strong>
                                <span>${member.email}</span>
                            </div>
                            ` : ''}
                            ${member.address ? `
                            <div class="info-row">
                                <strong>Adresse:</strong>
                                <span>${member.address}</span>
                            </div>
                            ` : ''}
                            <div class="info-row">
                                <strong>Date d'inscription:</strong>
                                <span>${member.createdAt ? new Date(member.createdAt).toLocaleDateString('fr-FR') : 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        
        case 'tontines':
            return `
                <div class="tab-content">
                    <div class="detail-section">
                        <h4><i class="fas fa-handshake"></i> Tontines (${memberTontines.length})</h4>
                        ${memberTontines.length === 0 ? 
                            '<p class="no-data">Ce membre ne participe à aucune tontine</p>' :
                            `<div class="tontines-grid">
                                ${memberTontines.map(tontine => `
                                    <div class="tontine-card" onclick="showTontineDetails('${tontine.id}')" style="cursor: pointer;">
                                        <div class="tontine-header">
                                            <h5>${tontine.name}</h5>
                                            <span class="status-badge ${tontine.status}">${getTontineStatusText(tontine)}</span>
                                        </div>
                                        <div class="tontine-details">
                                            <p><i class="fas fa-coins"></i> ${formatCurrency(tontine.amount)} FCFA</p>
                                            <p><i class="fas fa-calendar"></i> ${getFrequencyText(tontine.frequency)}</p>
                                            <p><i class="fas fa-sort-numeric-up"></i> Position: ${tontine.memberPosition}</p>
                                            <p><i class="fas fa-sync-alt"></i> ${tontine.totalRounds} tours</p>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>`
                        }
                    </div>
                </div>
            `;
        
        case 'payments':
            return `
                <div class="tab-content">
                    <div class="detail-section">
                        <h4><i class="fas fa-credit-card"></i> Historique des paiements (${memberPayments.length})</h4>
                        ${memberPayments.length === 0 ? 
                            '<p class="no-data">Aucun paiement enregistré</p>' :
                            `<div class="payments-summary">
                                <div class="summary-row">
                                    <span>Total payé:</span>
                                    <strong>${formatCurrency(memberPayments.reduce((sum, p) => sum + p.amount, 0))} FCFA</strong>
                                </div>
                                <div class="summary-row">
                                    <span>Cagnottes rapportées:</span>
                                    <strong>${formatCurrency(memberPayments.filter(p => p.type === 'cagnotte_rapportee').reduce((sum, p) => sum + p.amount, 0))} FCFA</strong>
                                </div>
                            </div>
                            <div class="payments-history">
                                ${memberPayments.map(payment => {
                                    const tontine = state.tontines.find(t => t.id === payment.tontineId);
                                    const isCagnotte = payment.type === 'cagnotte_rapportee';
                                    return `
                                        <div class="payment-item ${isCagnotte ? 'cagnotte-item' : ''}">
                                            <div class="payment-info">
                                                <span class="payment-date">${new Date(payment.date).toLocaleDateString('fr-FR')}</span>
                                                <span class="payment-tontine">${tontine ? tontine.name : 'Tontine inconnue'}</span>
                                                <span class="payment-round">
                                                    ${isCagnotte ? 
                                                        `<i class="fas fa-piggy-bank"></i> Cagnotte rapportée` :
                                                        `Tour ${payment.round || 'N/A'}`
                                                    }
                                                </span>
                                                ${isCagnotte && payment.receiver ? 
                                                    `<span class="payment-receiver">
                                                        <i class="fas fa-user"></i> Destinataire: ${payment.receiver}
                                                    </span>` : ''
                                                }
                                            </div>
                                            <div class="payment-amount ${isCagnotte ? 'cagnotte-amount' : ''}">
                                                ${formatCurrency(payment.amount)} FCFA
                                                ${isCagnotte ? '<i class="fas fa-star"></i>' : ''}
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>`
                        }
                    </div>
                </div>
            `;
        
        default:
            return '';
    }
}

function deleteMember(memberId) {
    const member = state.members.find(m => m.id === memberId);
    if (!member) {
        showNotification('Membre non trouvé', 'error');
        return;
    }
    
    // Check if member is in any active tontine
    const memberTontines = state.tontines.filter(t => 
        t.members && t.members.includes(memberId) && t.status === 'active'
    );
    
    if (memberTontines.length > 0) {
        showNotification('Impossible de supprimer ce membre car il participe à des tontines actives', 'error');
        return;
    }
    
    if (confirm(`Êtes-vous sûr de vouloir supprimer ${member.name} ?`)) {
        state.members = state.members.filter(m => m.id !== memberId);
        
        // Remove member from tontines
        state.tontines.forEach(tontine => {
            if (tontine.members) {
                tontine.members = tontine.members.filter(id => id !== memberId);
            }
        });
        
        // Supprimer de Firestore
        deleteFromDB('members', memberId).then(() => {
            showNotification('Membre supprimé avec succès', 'success');
        }).catch((error) => {
            showNotification('Erreur de suppression', 'error');
        });
        
        renderMembers();
        updateDashboard();
    }
}

// Tontine Management Functions
function openTontineModal(tontineId = null) {
    const modal = document.getElementById('tontine-modal');
    const form = document.getElementById('tontine-form');
    const title = document.getElementById('tontine-modal-title');
    
    if (tontineId) {
        const tontine = state.tontines.find(t => t.id === tontineId);
        if (tontine) {
            title.textContent = 'Modifier la tontine';
            document.getElementById('tontine-name').value = tontine.name;
            document.getElementById('tontine-description').value = tontine.description || '';
            document.getElementById('tontine-amount').value = tontine.amount;
            document.getElementById('tontine-frequency').value = tontine.frequency;
            document.getElementById('tontine-rounds').value = tontine.totalRounds || '';
            document.getElementById('tontine-start-date').value = tontine.startDate;
            
            form.dataset.tontineId = tontineId;
            
            // Update members selector with existing data
            updateMembersSelector(tontine);
        }
    } else {
        title.textContent = 'Créer une tontine';
        form.reset();
        delete form.dataset.tontineId;
        
        // Set default start date to today
        document.getElementById('tontine-start-date').value = new Date().toISOString().split('T')[0];
        
        // Clear members selector
        updateMembersSelector();
    }
    
    modal.classList.add('active');
}

// State for selected members in tontine creation
let selectedTontineMembers = [];

function updateMembersSelector(existingTontine = null, filteredMembers = null, currentSelections = []) {
    console.log('updateMembersSelector appelée avec:', { existingTontine, membersCount: state.members.length });
    
    const container = document.getElementById('members-selector');
    if (!container) {
        console.error('Container members-selector introuvable !');
        return;
    }
    
    // Initialize selected members from existing tontine
    if (existingTontine && existingTontine.membersWithPositions) {
        selectedTontineMembers = existingTontine.membersWithPositions.map(mp => ({
            memberId: mp.memberId,
            position: mp.position
        }));
    } else {
        selectedTontineMembers = [];
    }
    
    // Setup search functionality
    setupMemberSearch();
    
    // Display selected members
    displaySelectedMembers();
}

function setupMemberSearch() {
    const searchInput = document.getElementById('member-search-input');
    const searchResults = document.getElementById('search-results');
    
    if (!searchInput || !searchResults) return;
    
    // Remove previous event listeners
    searchInput.removeEventListener('input', handleMemberSearch);
    searchInput.addEventListener('input', handleMemberSearch);
    
    // Hide search results when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.member-search-container')) {
            searchResults.style.display = 'none';
        }
    });
}

function handleMemberSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    const searchResults = document.getElementById('search-results');
    
    if (query.length === 0) {
        searchResults.style.display = 'none';
        return;
    }
    
    // Filter members by name or CNI
    const filteredMembers = state.members.filter(member => {
        const nameMatch = member.name.toLowerCase().includes(query);
        const cniMatch = member.cni && member.cni.toLowerCase().includes(query);
        const phoneMatch = member.phone && member.phone.includes(query);
        
        // Don't show already selected members
        const isAlreadySelected = selectedTontineMembers.some(sm => sm.memberId === member.id);
        
        return (nameMatch || cniMatch || phoneMatch) && !isAlreadySelected;
    });
    
    if (filteredMembers.length === 0) {
        searchResults.innerHTML = '<div class="search-result-item"><div class="search-result-info">Aucun membre trouvé</div></div>';
        searchResults.style.display = 'block';
        return;
    }
    
    searchResults.innerHTML = filteredMembers.map(member => `
        <div class="search-result-item">
            <div class="search-result-info">
                <div class="search-result-name">${member.name}</div>
                <div class="search-result-details">
                    ${member.phone} ${member.cni ? `• CNI: ${member.cni}` : ''}
                </div>
            </div>
            <button class="search-result-add" onclick="addMemberToTontine('${member.id}')">
                <i class="fas fa-plus"></i> Ajouter
            </button>
        </div>
    `).join('');
    
    searchResults.style.display = 'block';
}

function addMemberToTontine(memberId) {
    const member = state.members.find(m => m.id === memberId);
    if (!member) return;
    
    // Check if member is already selected
    if (selectedTontineMembers.some(sm => sm.memberId === memberId)) {
        showNotification('Ce membre est déjà sélectionné', 'warning');
        return;
    }
    
    // Add member to selected list
    selectedTontineMembers.push({
        memberId: memberId,
        position: null
    });
    
    // Clear search
    document.getElementById('member-search-input').value = '';
    document.getElementById('search-results').style.display = 'none';
    
    displaySelectedMembers();
    showNotification(`${member.name} ajouté à la tontine`, 'success');
}

function displaySelectedMembers() {
    const container = document.getElementById('members-selector');
    const totalRounds = parseInt(document.getElementById('tontine-rounds').value) || 0;
    
    if (selectedTontineMembers.length === 0) {
        container.innerHTML = '<p class="no-members">Aucun membre sélectionné. Recherchez et ajoutez des membres ci-dessus.</p>';
        return;
    }
    
    container.innerHTML = selectedTontineMembers.map(sm => {
        const member = state.members.find(m => m.id === sm.memberId);
        if (!member) return '';
        
        return `
            <div class="member-position-item selected-member-item">
                <div class="member-position-details">
                    <div class="member-position-name">
                        ${member.name}
                        <span class="selected-member-badge">Sélectionné</span>
                    </div>
                    <div class="member-position-info">
                        ${member.phone} ${member.cni ? `• CNI: ${member.cni}` : ''}
                    </div>
                </div>
                <div class="position-selector" style="display: flex;">
                    <label for="position-${member.id}">Position:</label>
                    <select id="position-${member.id}" onchange="updateMemberPosition('${member.id}', this.value)">
                        <option value="">Choisir...</option>
                        ${Array.from({length: totalRounds}, (_, i) => i + 1).map(pos => 
                            `<option value="${pos}" ${sm.position === pos ? 'selected' : ''}>${pos}</option>`
                        ).join('')}
                    </select>
                </div>
                <button class="btn btn-sm btn-danger" onclick="removeMemberFromTontine('${member.id}')" title="Retirer">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }).filter(html => html).join('');
}

function updateMemberPosition(memberId, position) {
    const memberSelection = selectedTontineMembers.find(sm => sm.memberId === memberId);
    if (!memberSelection) return;
    
    const positionNum = position ? parseInt(position) : null;
    
    // Check if position is already taken
    if (positionNum && selectedTontineMembers.some(sm => sm.position === positionNum && sm.memberId !== memberId)) {
        showNotification(`La position ${positionNum} est déjà occupée`, 'error');
        // Reset the select
        document.getElementById(`position-${memberId}`).value = memberSelection.position || '';
        return;
    }
    
    memberSelection.position = positionNum;
    validatePositionsNew();
}

function removeMemberFromTontine(memberId) {
    selectedTontineMembers = selectedTontineMembers.filter(sm => sm.memberId !== memberId);
    displaySelectedMembers();
    
    const member = state.members.find(m => m.id === memberId);
    if (member) {
        showNotification(`${member.name} retiré de la tontine`, 'info');
    }
}

// Simplified validation for the new system
function validatePositionsNew() {
    const usedPositions = new Set();
    let hasErrors = false;
    
    selectedTontineMembers.forEach(sm => {
        if (sm.position && usedPositions.has(sm.position)) {
            hasErrors = true;
        } else if (sm.position) {
            usedPositions.add(sm.position);
        }
    });
    
    return !hasErrors;
}

// Fonction globale accessible depuis l'HTML (maintenue pour compatibilité)
function togglePositionSelector(memberId) {
    const checkbox = document.getElementById(`member-${memberId}`);
    const positionSelect = document.getElementById(`position-${memberId}`);
    
    if (checkbox && positionSelect) {
        if (checkbox.checked) {
            positionSelect.disabled = false;
        } else {
            positionSelect.disabled = true;
            positionSelect.value = '';
        }
        validatePositions();
    }
}

// Rendre la fonction accessible globalement
window.togglePositionSelector = togglePositionSelector;

function validatePositions() {
    const rounds = parseInt(document.getElementById('tontine-rounds').value) || 0;
    const selectedPositions = [];
    const duplicates = [];
    
    // Check for duplicate positions
    state.members.forEach(member => {
        const checkbox = document.getElementById(`member-${member.id}`);
        const positionSelect = document.getElementById(`position-${member.id}`);
        
        if (checkbox && checkbox.checked && positionSelect && positionSelect.value) {
            const position = parseInt(positionSelect.value);
            if (selectedPositions.includes(position)) {
                duplicates.push(position);
            } else {
                selectedPositions.push(position);
            }
        }
    });
    
    // Highlight duplicates
    state.members.forEach(member => {
        const positionSelect = document.getElementById(`position-${member.id}`);
        if (positionSelect) {
            const position = parseInt(positionSelect.value);
            if (duplicates.includes(position)) {
                positionSelect.style.borderColor = 'var(--danger-color)';
            } else {
                positionSelect.style.borderColor = '';
            }
        }
    });
    
    return duplicates.length === 0;
}

// Fonction supprimée - utiliser updateMembersSelector(existingTontine = null) à la place

function handleTontineSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const tontineId = form.dataset.tontineId;
    
    const tontineData = {
        name: document.getElementById('tontine-name').value.trim(),
        description: document.getElementById('tontine-description').value.trim(),
        amount: parseInt(document.getElementById('tontine-amount').value),
        frequency: document.getElementById('tontine-frequency').value,
        startDate: document.getElementById('tontine-start-date').value,
        totalRounds: parseInt(document.getElementById('tontine-rounds').value)
    };
    
    // Get selected members with positions from the new search system
    const selectedMembers = selectedTontineMembers.filter(sm => sm.position !== null && sm.position > 0);
    
    // Validation
    if (!tontineData.name || !tontineData.amount || !tontineData.frequency || !tontineData.startDate || !tontineData.totalRounds) {
        showNotification('Veuillez remplir tous les champs obligatoires', 'error');
        return;
    }
    
    if (selectedMembers.length !== tontineData.totalRounds) {
        showNotification(`Le nombre de membres (${selectedMembers.length}) doit correspondre au nombre de tours (${tontineData.totalRounds})`, 'error');
        return;
    }
    
    // Check for duplicate positions
    const positions = selectedMembers.map(m => m.position);
    if (new Set(positions).size !== positions.length) {
        showNotification('Les positions doivent être uniques pour chaque membre', 'error');
        return;
    }
    
    // Check if all positions from 1 to totalRounds are filled
    const sortedPositions = positions.sort((a, b) => a - b);
    for (let i = 1; i <= tontineData.totalRounds; i++) {
        if (!sortedPositions.includes(i)) {
            showNotification(`La position ${i} n'est pas attribuée`, 'error');
            return;
        }
    }
    
    tontineData.membersWithPositions = selectedMembers.sort((a, b) => a.position - b.position);
    tontineData.currentRound = 1;
    
    if (tontineId) {
        // Update existing tontine
        const tontineIndex = state.tontines.findIndex(t => t.id === tontineId);
        state.tontines[tontineIndex] = { ...state.tontines[tontineIndex], ...tontineData };
        saveTontineToDB(state.tontines[tontineIndex]).then(() => {
            showNotification('Tontine modifiée avec succès', 'success');
        }).catch((error) => {
            showNotification('Erreur de sauvegarde', 'error');
        });
    } else {
        // Add new tontine
        const newTontine = {
            id: generateId(),
            ...tontineData,
            status: 'active',
            createdAt: new Date().toISOString()
        };
        state.tontines.push(newTontine);
        saveTontineToDB(newTontine).then(() => {
            showNotification('Tontine créée avec succès', 'success');
        }).catch((error) => {
            showNotification('Erreur de sauvegarde', 'error');
        });
        updateRecentActivities();
    }
    
    closeModal('tontine-modal');
    
    if (state.currentSection === 'tontines') {
        renderTontines();
    }
    
    updateDashboard();
}

function renderTontines(searchTerm = '') {
    const container = document.getElementById('tontines-grid');
    
    let filteredTontines = state.tontines;
    if (searchTerm) {
        filteredTontines = state.tontines.filter(tontine => 
            tontine.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (tontine.description && tontine.description.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }
    
    if (filteredTontines.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-handshake"></i>
                <p>${searchTerm ? 'Aucune tontine trouvée' : 'Aucune tontine créée'}</p>
                <button class="btn btn-primary" onclick="openTontineModal()">
                    Créer la première tontine
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredTontines.map(tontine => {
        const totalAmount = tontine.amount * (tontine.members ? tontine.members.length : 0);
        const currentRound = getCurrentRound(tontine);
        
        return `
            <div class="tontine-card">
                <div class="tontine-header">
                    <h3>${tontine.name}</h3>
                    <span class="status-badge ${tontine.status}">${getTontineStatusText(tontine)}</span>
                </div>
                <div class="tontine-info">
                    <div class="tontine-amount">
                        <i class="fas fa-money-bill-wave"></i>
                        <span>${formatCurrency(tontine.amount)} FCFA / membre</span>
                    </div>
                 
                    <div class="tontine-members">
                        <i class="fas fa-users"></i>
                        <span>${tontine.totalRounds} membres</span>
                    </div>
                    <div class="tontine-frequency">
                        <i class="fas fa-calendar-alt"></i>
                        <span>${getFrequencyText(tontine.frequency)}</span>
                    </div>
                    <div class="tontine-round">
                        <i class="fas fa-sync-alt"></i>
                        <span>Tour ${tontine.currentRound || 1}</span>
                    </div>
                </div>
                <div class="tontine-actions">
                    <button class="btn btn-sm btn-primary" onclick="showTontineDetails('${tontine.id}')">
                        <i class="fas fa-eye"></i>
                        Voir
                    </button>

                    <button class="btn btn-sm btn-danger" onclick="deleteTontine('${tontine.id}')">
                        <i class="fas fa-trash"></i>
                        Supprimer
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function showTontineDetails(tontineId, activeTab = 'overview') {
    const tontine = state.tontines.find(t => t.id === tontineId);
    if (!tontine) {
        showNotification('Tontine non trouvée', 'error');
        return;
    }
    
    const modal = document.getElementById('tontine-details-modal');
    const title = document.getElementById('tontine-details-title');
    const content = document.getElementById('tontine-details-content');
    
    title.textContent = `Détails de ${tontine.name}`;
    
    content.innerHTML = getTontineTabContent(tontine, activeTab);
    
    modal.classList.add('active');
}

function switchTontineTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('#tontine-details-modal .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`#tontine-details-modal .tab-btn[onclick="switchTontineTab('${tabName}')"]`).classList.add('active');
    
    // Get current tontine data and update content
    const title = document.getElementById('tontine-details-title').textContent;
    const tontineName = title.replace('Détails de ', '');
    const tontine = state.tontines.find(t => t.name === tontineName);
    
    if (tontine) {
        const content = document.getElementById('tontine-details-content');
        content.innerHTML = getTontineTabContent(tontine, tabName);
    }
}

function getTontineTabContent(tontine, activeTab) {
    const tontinePayments = state.payments.filter(p => p.tontineId === tontine.id);
    const totalCollected = tontinePayments.reduce((sum, p) => sum + p.amount, 0);
    const totalAmount = tontine.amount * (tontine.membersWithPositions?.length || 0);

    switch (activeTab) {
        case 'overview':
            return `
                <div class="tab-content">
                    <div class="detail-section">
                        <h4><i class="fas fa-info-circle"></i> Informations générales</h4>
                        <div class="info-grid">
                            <div class="info-row">
                                <strong>Nom:</strong>
                                <span>${tontine.name}</span>
                            </div>
                            <div class="info-row">
                                <strong>Montant par membre:</strong>
                                <span>${formatCurrency(tontine.amount)} FCFA</span>
                            </div>
                            <div class="info-row">
                                <strong>Nombre de tours:</strong>
                                <span>${tontine.totalRounds}</span>
                            </div>
                            <div class="info-row">
                                <strong>Fréquence:</strong>
                                <span>${getFrequencyText(tontine.frequency)}</span>
                            </div>
                            <div class="info-row">
                                <strong>Date de début:</strong>
                                <span>${new Date(tontine.startDate).toLocaleDateString('fr-FR')}</span>
                            </div>
                            <div class="info-row">
                                <strong>Statut:</strong>
                                <span class="status-badge ${tontine.status}">${getTontineStatusText(tontine)}</span>
                            </div>
                            <div class="info-row">
                                <strong>Tour actuel:</strong>
                                <span>${tontine.currentRound || 1}</span>
                            </div>
                        </div>
                        ${tontine.description ? `
                            <div class="description-box">
                                <h5>Description</h5>
                                <p>${tontine.description}</p>
                            </div>
                        ` : ''}
                    </div>
                    
                    
                </div>
            `;

        case 'members':
            const tontineMembers = (tontine.membersWithPositions || []).map(mp => {
                const member = state.members.find(m => m.id === mp.memberId);
                const memberPayments = tontinePayments.filter(p => p.memberId === mp.memberId);
                const memberTotal = memberPayments.reduce((sum, p) => sum + p.amount, 0);
                
                return {
                    ...member,
                    position: mp.position,
                    payments: memberPayments,
                    totalPaid: memberTotal
                };
            }).sort((a, b) => a.position - b.position);

            return `
                <div class="tab-content">
                    <div class="detail-section">
                        <h4><i class="fas fa-users"></i> Participants (${tontineMembers.length})</h4>
                        <div class="participants-grid">
                            ${tontineMembers.map((member) => {
                                const isCurrentReceiver = member.position === (tontine.currentRound || 1);
                                
                                return `
                                    <div class="participant-card ${isCurrentReceiver ? 'current-receiver' : ''}">
                                        <div class="participant-header">
                                            <div>
                                                <div class="participant-name">${member.name}</div>
                                                <div class="participant-position">Position ${member.position}</div>
                                            </div>
                                            ${isCurrentReceiver ? '<span class="receiver-badge">Bénéficiaire</span>' : ''}
                                        </div>
                                        <div class="participant-details">
                                            <div class="detail-row">
                                                <span>Téléphone:</span>
                                                <span>${member.phone}</span>
                                            </div>
                                            <div class="detail-row">
                                                <span>Total payé:</span>
                                                <strong>${formatCurrency(member.totalPaid)} FCFA</strong>
                                            </div>
                                            <div class="detail-row">
                                                <span>Paiements:</span>
                                                <span>${member.payments.length}</span>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;

        case 'payments':
            return `
                <div class="tab-content">
                    <div class="detail-section">
                        <h4><i class="fas fa-credit-card"></i> Historique des paiements (${tontinePayments.length})</h4>
                        ${tontinePayments.length === 0 ? 
                            '<p class="no-data">Aucun paiement enregistré pour cette tontine</p>' :
                            `<div class="payments-history">
                                ${tontinePayments.map(payment => {
                                    const member = state.members.find(m => m.id === payment.memberId);
                                    return `
                                        <div class="payment-item">
                                            <div class="payment-info">
                                                <span class="payment-date">${new Date(payment.date).toLocaleDateString('fr-FR')}</span>
                                                <span class="payment-member">${member ? member.name : 'Membre inconnu'}</span>
                                                <span class="payment-round">Tour ${payment.round || 'N/A'}</span>
                                            </div>
                                            <div class="payment-amount">
                                                ${formatCurrency(payment.amount)} FCFA
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>`
                        }
                    </div>
                </div>
            `;

        case 'rounds':
            return `
                <div class="tab-content">
                    <div class="detail-section">
                        <h4><i class="fas fa-sync-alt"></i> Gestion des Tours</h4>
                        <div class="rounds-management">
                            ${Array.from({length: tontine.totalRounds}, (_, i) => i + 1).map(roundNum => {
                                // Séparer les cotisations et les versements
                                const roundContributions = tontinePayments.filter(p => p.round === roundNum && p.type === 'contribution');
                                const roundPayouts = tontinePayments.filter(p => p.round === roundNum && p.type === 'payout');
                                
                                const totalMembers = tontine.membersWithPositions?.length || 0;
                                const contributionsPaid = roundContributions.length;
                                const payoutMade = roundPayouts.length > 0;
                                
                                const isCompleted = isRoundCompleted(tontine.id, roundNum);
                                const contributionsComplete = contributionsPaid === totalMembers;
                                const isCurrent = roundNum === (tontine.currentRound || 1);
                                const receiver = tontine.membersWithPositions?.find(mp => mp.position === roundNum);
                                const receiverMember = receiver ? state.members.find(m => m.id === receiver.memberId) : null;
                                
                                return `
                                    <div class="round-card ${isCurrent ? 'current-round' : ''} ${isCompleted ? 'completed-round' : ''}">
                                        <div class="round-header">
                                            <h5>Tour ${roundNum}</h5>
                                            <div class="round-status-container">
                                                ${getRoundStatusBadge(tontine.id, roundNum)}
                                                ${!isCompleted && contributionsComplete && payoutMade ? `
                                                    <button class="btn btn-sm btn-success" onclick="markRoundAsCompleted('${tontine.id}', ${roundNum})" title="Marquer comme terminé">
                                                        <i class="fas fa-check"></i> Terminer
                                                    </button>
                                                ` : ''}
                                            </div>
                                        </div>
                                        <div class="round-details">
                                            <p><strong>Bénéficiaire:</strong> ${receiverMember ? receiverMember.name : 'Non défini'}</p>
                                            <p><strong>Cotisations:</strong> ${contributionsPaid}/${totalMembers} membres</p>
                                            <p><strong>Versement:</strong> ${payoutMade ? 'Effectué' : 'En attente'}</p>
                                            <p><strong>Progression:</strong> ${totalMembers > 0 ? Math.round(contributionsPaid / totalMembers * 100) : 0}%</p>
                                            ${isCompleted ? '<p class="completion-note"><i class="fas fa-info-circle"></i> Tour terminé - exclu des statistiques</p>' : ''}
                                        </div>
                                        ${contributionsComplete && !payoutMade && !isCompleted ? `
                                            <button class="btn btn-success btn-sm" onclick="processRoundPayout('${tontine.id}', ${roundNum})">
                                                <i class="fas fa-money-bill-wave"></i> Effectuer le versement
                                            </button>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;

        default:
            return '';
    }
}

function deleteTontine(tontineId) {
    const tontine = state.tontines.find(t => t.id === tontineId);
    if (!tontine) {
        showNotification('Tontine non trouvée', 'error');
        return;
    }
    
    // Check if tontine has payments
    const tontinePayments = state.payments.filter(p => p.tontineId === tontineId);
    if (tontinePayments.length > 0) {
        showNotification('Impossible de supprimer cette tontine car elle a des paiements enregistrés', 'error');
        return;
    }
    
    if (confirm(`Êtes-vous sûr de vouloir supprimer la tontine "${tontine.name}" ?`)) {
        state.tontines = state.tontines.filter(t => t.id !== tontineId);
        deleteFromDB('tontines', tontineId).then(() => {
            showNotification('Tontine supprimée avec succès', 'success');
        }).catch((error) => {
            showNotification('Erreur de suppression', 'error');
        });
        renderTontines();
        updateDashboard();
    }
}

// Payment Management Functions
function openPaymentModal(paymentId = null) {
    const modal = document.getElementById('payment-modal');
    const form = document.getElementById('payment-form');
    const title = document.getElementById('payment-modal-title');
    
    // Populate tontine select
    updateTontineSelect();
    
    if (paymentId) {
        const payment = state.payments.find(p => p.id === paymentId);
        if (payment) {
            title.textContent = 'Modifier le paiement';
            document.getElementById('payment-tontine').value = payment.tontineId;
            updateMemberSelect(payment.tontineId);
            document.getElementById('payment-member').value = payment.memberId;
            updateAvailableRounds();
            document.getElementById('payment-round').value = payment.round;
            document.getElementById('payment-amount').value = payment.amount;
            document.getElementById('payment-date').value = payment.date;
            document.getElementById('payment-type').value = payment.type;
            document.getElementById('payment-method').value = payment.method;
            document.getElementById('payment-reference').value = payment.reference;
            document.getElementById('payment-notes').value = payment.notes || '';
            form.dataset.paymentId = paymentId;
        }
    } else {
        title.textContent = 'Nouveau Paiement';
        form.reset();
        delete form.dataset.paymentId;
        
        // Set default date to today
        document.getElementById('payment-date').value = new Date().toISOString().split('T')[0];
        
        // Generate reference
        document.getElementById('payment-reference').value = generateTransactionReference(new Date());
    }
    
    modal.classList.add('active');
}

function updateTontineSelect() {
    const select = document.getElementById('payment-tontine');
    select.innerHTML = '<option value="">Sélectionner une tontine...</option>';
    
    state.tontines.filter(t => t.status === 'active').forEach(tontine => {
        const option = document.createElement('option');
        option.value = tontine.id;
        option.textContent = `${tontine.name} - ${formatCurrency(tontine.amount)} FCFA`;
        select.appendChild(option);
    });
    
    select.addEventListener('change', function() {
        updateMemberSelect(this.value);
        document.getElementById('payment-member').disabled = !this.value;
        document.getElementById('payment-round').disabled = true;
        document.getElementById('payment-amount').value = '';
    });
}

function updateMemberSelect(tontineId) {
    const memberSelect = document.getElementById('payment-member');
    const roundSelect = document.getElementById('payment-round');
    
    console.log('Mise à jour sélecteur membres pour tontine:', tontineId);
    
    memberSelect.innerHTML = '<option value="">Sélectionner un membre...</option>';
    if (roundSelect) {
        roundSelect.innerHTML = '<option value="">Sélectionner d\'abord un membre</option>';
    }
    
    if (!tontineId) {
        memberSelect.disabled = true;
        if (roundSelect) roundSelect.disabled = true;
        return;
    }
    
    const tontine = state.tontines.find(t => t.id === tontineId);
    console.log('Tontine trouvée:', tontine);
    
    if (!tontine || !tontine.membersWithPositions || tontine.membersWithPositions.length === 0) {
        memberSelect.disabled = true;
        if (roundSelect) roundSelect.disabled = true;
        console.log('Aucun membre avec positions trouvé');
        return;
    }
    
    memberSelect.disabled = false;
    
    // Ajouter les membres avec leurs positions
    tontine.membersWithPositions.forEach(mp => {
        const member = state.members.find(m => m.id === mp.memberId);
        if (member) {
            const option = document.createElement('option');
            option.value = member.id;
            option.textContent = `${member.name} (Position ${mp.position})`;
            memberSelect.appendChild(option);
            console.log('Membre ajouté:', member.name, 'Position:', mp.position);
        }
    });
}

function updateAvailableRounds() {
    const tontineId = document.getElementById('payment-tontine').value;
    const memberId = document.getElementById('payment-member').value;
    const roundSelect = document.getElementById('payment-round');
    const amountInput = document.getElementById('payment-amount');
    
    roundSelect.innerHTML = '<option value="">Sélectionner un tour...</option>';
    amountInput.value = '';
    
    if (!tontineId || !memberId) {
        roundSelect.disabled = true;
        return;
    }
    
    const tontine = state.tontines.find(t => t.id === tontineId);
    if (!tontine) {
        roundSelect.disabled = true;
        return;
    }
    
    // Get member's existing payments for this tontine
    const memberPayments = state.payments.filter(p => 
        p.tontineId === tontineId && p.memberId === memberId
    );
    const paidRounds = memberPayments.map(p => p.round);
    
    roundSelect.disabled = false;
    
    // Add available rounds (not yet paid)
    for (let round = 1; round <= tontine.totalRounds; round++) {
        if (!paidRounds.includes(round)) {
            // Check if previous rounds are paid (sequential payment)
            let canPayThisRound = true;
            for (let prevRound = 1; prevRound < round; prevRound++) {
                if (!paidRounds.includes(prevRound)) {
                    canPayThisRound = false;
                    break;
                }
            }
            
            const option = document.createElement('option');
            option.value = round;
            option.textContent = `Tour ${round}`;
            option.disabled = !canPayThisRound;
            if (!canPayThisRound) {
                option.textContent += ' (Payez d\'abord les tours précédents)';
            }
            roundSelect.appendChild(option);
        }
    }
    
    // Check if all regular rounds are completed and allow additional payments
    const allRegularRoundsCompleted = paidRounds.filter(r => r <= tontine.totalRounds).length === tontine.totalRounds;
    if (allRegularRoundsCompleted || tontine.allowAdditionalPayments) {
        // Add option for additional payments (cagnotte rapportée)
        const nextRound = Math.max(...paidRounds, tontine.totalRounds) + 1;
        const option = document.createElement('option');
        option.value = nextRound;
        option.textContent = `Tour ${nextRound} (Cagnotte rapportée)`;
        option.style.fontStyle = 'italic';
        option.style.color = '#666';
        roundSelect.appendChild(option);
    }
    
    roundSelect.addEventListener('change', function() {
        if (this.value) {
            amountInput.value = tontine.amount;
            amountInput.readOnly = true;
            updatePaymentAmount();
        } else {
            amountInput.value = '';
            amountInput.readOnly = false;
        }
    });
}

// Function to update payment amount based on due date and penalty
function updatePaymentAmount() {
    const tontineId = document.getElementById('payment-tontine').value;
    const round = parseInt(document.getElementById('payment-round').value);
    const paymentDate = document.getElementById('payment-date').value;
    const paymentType = document.getElementById('payment-type').value;
    const amountInput = document.getElementById('payment-amount');
    const notesInput = document.getElementById('payment-notes');
    
    if (!tontineId || !round || !paymentDate || paymentType !== 'contribution') {
        return;
    }
    
    const tontine = state.tontines.find(t => t.id === tontineId);
    if (!tontine) return;
    
    const dueDate = calculateRoundDueDate(tontine, round);
    const paymentCalculation = calculatePaymentAmount(tontine.amount, paymentDate, dueDate);
    
    // Update amount field
    amountInput.value = paymentCalculation.amount;
    
    // Update notes with penalty information
    let currentNotes = notesInput.value.replace(/\n?--- INFORMATIONS DE PÉNALITÉ ---[\s\S]*?--- FIN INFORMATIONS ---/g, '');
    
    const penaltyInfoElement = document.getElementById('penalty-info');
    
    if (paymentCalculation.penalty > 0) {
        const penaltyInfo = `\n--- INFORMATIONS DE PÉNALITÉ ---\nPaiement en retard de ${paymentCalculation.daysLate} jour(s)\nDate d'échéance: ${dueDate.toLocaleDateString('fr-FR')}\nMontant de base: ${formatCurrency(tontine.amount)} FCFA\nPénalité (10%): ${formatCurrency(paymentCalculation.penalty)} FCFA\nMontant total: ${formatCurrency(paymentCalculation.amount)} FCFA\n--- FIN INFORMATIONS ---`;
        notesInput.value = currentNotes + penaltyInfo;
        
        // Show visual indicator
        amountInput.style.borderColor = '#f59e0b';
        amountInput.style.backgroundColor = '#fef3c7';
        
        // Show penalty info
        if (penaltyInfoElement) {
            penaltyInfoElement.style.display = 'block';
            penaltyInfoElement.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Pénalité de ${formatCurrency(paymentCalculation.penalty)} FCFA pour retard de ${paymentCalculation.daysLate} jour(s)`;
        }
    } else {
        notesInput.value = currentNotes;
        amountInput.style.borderColor = '';
        amountInput.style.backgroundColor = '';
        
        // Hide penalty info
        if (penaltyInfoElement) {
            penaltyInfoElement.style.display = 'none';
        }
    }
}

function updateTontineSelect() {
    const select = document.getElementById('payment-tontine');
    const activeTontines = state.tontines.filter(t => t.status === 'active');
    
    select.innerHTML = '<option value="">Sélectionner une tontine...</option>' +
        activeTontines.map(tontine => 
            `<option value="${tontine.id}">${tontine.name} - ${formatCurrency(tontine.amount)} FCFA</option>`
        ).join('');
    
    // Add event listener for tontine selection
    select.addEventListener('change', (e) => {
        const tontineId = e.target.value;
        if (tontineId) {
            updateMemberSelect(tontineId);
            const tontine = state.tontines.find(t => t.id === tontineId);
            if (tontine) {
                document.getElementById('payment-amount').value = tontine.amount;
            }
        } else {
            document.getElementById('payment-member').innerHTML = '<option value="">Sélectionner d\'abord une tontine</option>';
            document.getElementById('payment-member').disabled = true;
            document.getElementById('payment-amount').value = '';
        }
    });
}



function handlePaymentSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const paymentId = form.dataset.paymentId;
    
    const paymentData = {
        tontineId: document.getElementById('payment-tontine').value,
        memberId: document.getElementById('payment-member').value,
        round: parseInt(document.getElementById('payment-round').value),
        amount: parseInt(document.getElementById('payment-amount').value),
        date: document.getElementById('payment-date').value,
        type: document.getElementById('payment-type').value,
        method: document.getElementById('payment-method').value,
        reference: document.getElementById('payment-reference').value,
        notes: document.getElementById('payment-notes').value.trim()
    };
    
    // Validation
    if (!paymentData.tontineId || !paymentData.memberId || !paymentData.round || 
        !paymentData.amount || !paymentData.date || !paymentData.type || !paymentData.method) {
        showNotification('Veuillez remplir tous les champs obligatoires', 'error');
        return;
    }
    
    const tontine = state.tontines.find(t => t.id === paymentData.tontineId);
    if (!tontine) {
        showNotification('Tontine non trouvée', 'error');
        return;
    }
    
    // Calculate due date and penalties for contributions
    let penalty = 0;
    let daysLate = 0;
    if (paymentData.type === 'contribution') {
        const dueDate = calculateRoundDueDate(tontine, paymentData.round);
        const paymentCalculation = calculatePaymentAmount(tontine.amount, paymentData.date, dueDate);
        penalty = paymentCalculation.penalty;
        daysLate = paymentCalculation.daysLate;
        
        // Update payment amount with penalty
        paymentData.amount = paymentCalculation.amount;
        paymentData.penalty = penalty;
        paymentData.daysLate = daysLate;
        paymentData.dueDate = dueDate.toISOString().split('T')[0];
        
        // Show penalty notice if applicable
        if (penalty > 0) {
            showNotification(`Paiement en retard de ${daysLate} jour(s). Pénalité appliquée : ${formatCurrency(penalty)} FCFA`, 'warning');
        }
    }
    
    // Validation for new payments only
    if (!paymentId) {
        // Check if member already paid for this round
        const existingPayment = state.payments.find(p => 
            p.tontineId === paymentData.tontineId && 
            p.memberId === paymentData.memberId && 
            p.round === paymentData.round
        );
        
        if (existingPayment) {
            showNotification('Ce membre a déjà payé pour ce tour', 'error');
            return;
        }
        
        // Check sequential payment rule (must pay previous rounds first)
        const memberPayments = state.payments.filter(p => 
            p.tontineId === paymentData.tontineId && p.memberId === paymentData.memberId
        );
        const paidRounds = memberPayments.map(p => p.round).sort((a, b) => a - b);
        
        for (let round = 1; round < paymentData.round; round++) {
            if (!paidRounds.includes(round)) {
                showNotification(`Vous devez d'abord payer le tour ${round}`, 'error');
                return;
            }
        }
        
        // Validate base amount matches tontine amount (before penalty)
        const baseAmount = paymentData.amount - (penalty || 0);
        if (baseAmount !== tontine.amount) {
            showNotification(`Le montant de base doit être de ${formatCurrency(tontine.amount)} FCFA`, 'error');
            return;
        }
    }
    
    if (paymentId) {
        // Update existing payment
        const paymentIndex = state.payments.findIndex(p => p.id === paymentId);
        state.payments[paymentIndex] = { ...state.payments[paymentIndex], ...paymentData };
        savePaymentToDB(state.payments[paymentIndex]).then(() => {
            showNotification('Paiement modifié avec succès', 'success');
        }).catch((error) => {
            showNotification('Erreur de sauvegarde', 'error');
        });
    } else {
        // Add new payment
        const newPayment = {
            id: generateId(),
            ...paymentData,
            status: 'paid',
            createdAt: new Date().toISOString()
        };
        state.payments.push(newPayment);
        savePaymentToDB(newPayment).then(() => {
            showNotification('Paiement enregistré avec succès', 'success');
        }).catch((error) => {
            showNotification('Erreur de sauvegarde', 'error');
        });
        updateRecentActivities();
        
        // Check if round is complete and advance to next round for contributions
        if (paymentData.type === 'contribution') {
            checkRoundCompletion(paymentData.tontineId, paymentData.round);
        }
        
        // Check if all rounds are complete and handle additional payments as "cagnotte rapportée"
        checkTontineCompletion(paymentData.tontineId);
    }
    
    closeModal('payment-modal');
    
    if (state.currentSection === 'payments') {
        renderPayments();
        updatePaymentsSummary();
    }
    
    updateDashboard();
}

function checkRoundCompletion(tontineId, round) {
    const tontine = state.tontines.find(t => t.id === tontineId);
    if (!tontine) return;
    
    // Compter uniquement les cotisations pour ce tour (pas les versements)
    const roundContributions = state.payments.filter(p => 
        p.tontineId === tontineId && p.round === round && p.type === 'contribution'
    );
    
    const totalMembers = tontine.membersWithPositions?.length || 0;
    
    if (roundContributions.length === totalMembers) {
        // Tous les membres ont cotisé, on peut effectuer le versement
        const receiver = tontine.membersWithPositions.find(mp => mp.position === round);
        const receiverMember = receiver ? state.members.find(m => m.id === receiver.memberId) : null;
        
        if (receiverMember) {
            showNotification(`Tour ${round} terminé ! Tous les membres ont cotisé. Versement disponible pour ${receiverMember.name}.`, 'success');
        } else {
            showNotification(`Tour ${round} terminé ! Tous les membres ont cotisé.`, 'success');
        }
    }
}

function checkTontineCompletion(tontineId) {
    const tontine = state.tontines.find(t => t.id === tontineId);
    if (!tontine) return;
    
    // Vérifier si tous les tours réguliers sont terminés
    const completedRounds = [];
    for (let round = 1; round <= tontine.totalRounds; round++) {
        const roundPayments = state.payments.filter(p => 
            p.tontineId === tontineId && p.round === round && p.type === 'contribution'
        );
        if (roundPayments.length === tontine.membersWithPositions.length) {
            completedRounds.push(round);
        }
    }
    
    // Si tous les tours réguliers sont terminés
    if (completedRounds.length === tontine.totalRounds) {
        // Marquer la tontine comme terminée et autoriser les paiements additionnels
        const tontineIndex = state.tontines.findIndex(t => t.id === tontineId);
        if (tontineIndex !== -1) {
            state.tontines[tontineIndex].status = 'completed';
            state.tontines[tontineIndex].allowAdditionalPayments = true;
        }
        
        // Marquer tous les paiements au-delà des tours réguliers comme "cagnotte rapportée"
        const additionalPayments = state.payments.filter(p => 
            p.tontineId === tontineId && 
            p.round > tontine.totalRounds &&
            p.type === 'contribution'
        );
        
        additionalPayments.forEach(payment => {
            // Trouver le membre qui devrait recevoir ce paiement selon la rotation
            const currentRoundPosition = ((payment.round - 1) % tontine.totalRounds) + 1;
            const receiver = tontine.membersWithPositions.find(mp => mp.position === currentRoundPosition);
            const receiverMember = receiver ? state.members.find(m => m.id === receiver.memberId) : null;
            
            payment.type = 'cagnotte_rapportee';
            payment.receiver = receiverMember ? receiverMember.name : `Position ${currentRoundPosition}`;
            payment.notes = (payment.notes || '') + 
                `\n--- CAGNOTTE RAPPORTÉE ---\n` +
                `Ce paiement est considéré comme une cagnotte rapportée.\n` +
                `Destinataire: ${payment.receiver}\n` +
                `Tous les tours réguliers de la tontine sont terminés.`;
        });
        
        if (additionalPayments.length > 0) {
            showNotification(`${additionalPayments.length} paiement(s) traité(s) comme cagnotte rapportée`, 'info');
        }
        
        saveData();
    }
}

function processRoundPayout(tontineId, position) {
    const tontine = state.tontines.find(t => t.id === tontineId);
    if (!tontine) {
        showNotification('Tontine non trouvée', 'error');
        return;
    }
    
    const receiver = tontine.membersWithPositions.find(mp => mp.position === position);
    if (!receiver) {
        showNotification('Bénéficiaire non trouvé', 'error');
        return;
    }
    
    const receiverMember = state.members.find(m => m.id === receiver.memberId);
    if (!receiverMember) {
        showNotification('Membre bénéficiaire non trouvé', 'error');
        return;
    }
    
    // Check if all members have paid for this round
    const roundPayments = state.payments.filter(p => 
        p.tontineId === tontineId && p.round === position
    );
    
    const totalMembers = tontine.membersWithPositions.length;
    
    if (roundPayments.length < totalMembers) {
        showNotification('Tous les membres n\'ont pas encore payé pour ce tour', 'error');
        return;
    }
    
    // Calculate total amount to pay out
    const totalAmount = roundPayments.reduce((sum, p) => sum + p.amount, 0);
    
    const confirmation = confirm(
        `Effectuer le versement de ${formatCurrency(totalAmount)} FCFA à ${receiverMember.name} pour le tour ${position} ?`
    );
    
    if (confirmation) {
        // Create payout payment record
        const payoutPayment = {
            id: generateId(),
            tontineId: tontineId,
            memberId: receiver.memberId,
            round: position,
            amount: totalAmount,
            date: new Date().toISOString(),
            type: 'payout',
            method: 'cash',
            reference: generateTransactionReference(new Date()),
            notes: `Versement du tour ${position}`,
            status: 'paid',
            createdAt: new Date().toISOString()
        };
        
        state.payments.push(payoutPayment);
        
        // Marquer le tour comme terminé et avancer au tour suivant
        markRoundAsCompleted(tontineId, position);
        
        const tontineIndex = state.tontines.findIndex(t => t.id === tontineId);
        if (tontineIndex !== -1) {
            state.tontines[tontineIndex].currentRound = position + 1;
            
            // Check if tontine is complete
            if (position >= tontine.totalRounds) {
                state.tontines[tontineIndex].status = 'completed';
                state.tontines[tontineIndex].completedAt = new Date().toISOString();
                showNotification(`Tontine "${tontine.name}" terminée ! Tous les tours ont été complétés.`, 'success');
            } else {
                showNotification(`Tour ${position} terminé et marqué. Passage au tour ${position + 1}.`, 'success');
            }
        }
        
        saveData();
        showNotification(`Versement effectué avec succès à ${receiverMember.name}`, 'success');
        
        // Refresh the view
        if (state.currentSection === 'tontines') {
            renderTontines();
        } else if (state.currentSection === 'payments') {
            renderPayments();
            updatePaymentsSummary();
        }
        
        updateDashboard();
        
        // Close and reopen the modal to refresh data
        const modal = document.getElementById('tontine-details-modal');
        if (modal.classList.contains('active')) {
            showTontineDetails(tontineId, 'rounds');
        }
    }
}

function renderPayments(searchTerm = '') {
    const container = document.getElementById('payments-list');
    
    let filteredPayments = state.payments;
    if (searchTerm) {
        filteredPayments = state.payments.filter(payment => {
            const member = state.members.find(m => m.id === payment.memberId);
            const tontine = state.tontines.find(t => t.id === payment.tontineId);
            
            return (member && member.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                   (tontine && tontine.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                   payment.reference.toLowerCase().includes(searchTerm.toLowerCase());
        });
    }
    
    if (filteredPayments.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-credit-card"></i>
                <p>${searchTerm ? 'Aucun paiement trouvé' : 'Aucun paiement enregistré'}</p>
                <button class="btn btn-primary" onclick="openPaymentModal()">
                    Enregistrer le premier paiement
                </button>
            </div>
        `;
        return;
    }
    
    // Sort payments by date (most recent first)
    filteredPayments.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    container.innerHTML = `
        <div class="payments-table">
            <div class="table-header">
                <div class="table-cell">Date</div>
                <div class="table-cell">Référence</div>
                <div class="table-cell">Membre</div>
                <div class="table-cell">Tontine</div>
                <div class="table-cell">Montant</div>
                <div class="table-cell">Type</div>
                <div class="table-cell">Mode</div>
                <div class="table-cell">Actions</div>
            </div>
            ${filteredPayments.map(payment => {
                const member = state.members.find(m => m.id === payment.memberId);
                const tontine = state.tontines.find(t => t.id === payment.tontineId);
                
                return `
                    <div class="table-row">
                        <div class="table-cell">${new Date(payment.date).toLocaleDateString('fr-FR')}</div>
                        <div class="table-cell">${payment.reference}</div>
                        <div class="table-cell">${member ? member.name : 'Membre inconnu'}</div>
                        <div class="table-cell">${tontine ? tontine.name : 'Tontine inconnue'}</div>
                        <div class="table-cell amount">
                            ${formatCurrency(payment.amount)} FCFA
                            ${payment.penalty ? `<br><small style="color: #f59e0b; font-weight: 500;"><i class="fas fa-exclamation-triangle"></i> +${formatCurrency(payment.penalty)} FCFA (pénalité)</small>` : ''}
                        </div>
                        <div class="table-cell">
                            <span class="type-badge ${payment.type}">${getPaymentTypeText(payment.type)}</span>
                        </div>
                        <div class="table-cell">${getPaymentMethodText(payment.method)}</div>
                        <div class="table-cell actions">
                            <button class="btn btn-sm btn-primary" onclick="printPaymentReceipt('${payment.id}')" title="Imprimer le reçu">
                                <i class="fas fa-print"></i>
                            </button>

                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function updatePaymentsSummary() {
    // Filtrer les paiements en excluant les tours terminés pour les cotisations
    const activeContributions = state.payments.filter(payment => {
        return payment.type === 'contribution' && !isRoundCompleted(payment.tontineId, payment.round);
    });
    
    // Les versements ne sont pas affectés par le statut des tours terminés
    const allPayouts = state.payments.filter(payment => payment.type === 'payout');
    
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const monthlyActiveContributions = activeContributions.filter(payment => {
        const paymentDate = new Date(payment.date);
        return paymentDate.getMonth() === currentMonth && paymentDate.getFullYear() === currentYear;
    });
    
    const monthlyPayouts = allPayouts.filter(payment => {
        const paymentDate = new Date(payment.date);
        return paymentDate.getMonth() === currentMonth && paymentDate.getFullYear() === currentYear;
    });
    
    const collected = monthlyActiveContributions.reduce((sum, p) => sum + p.amount, 0);
    const versements = monthlyPayouts.reduce((sum, p) => sum + p.amount, 0);
    const penalties = activeContributions.reduce((sum, p) => sum + (p.penalty || 0), 0);
    
    document.getElementById('payments-collected').textContent = formatCurrency(collected) + ' FCFA';
    document.getElementById('payments-pending').textContent = formatCurrency(versements) + ' FCFA';
    document.getElementById('payments-overdue').textContent = formatCurrency(penalties) + ' FCFA';
}

function updatePaymentFilters() {
    const tontineFilter = document.getElementById('payment-tontine-filter');
    
    // Update tontine filter options
    const tontines = state.tontines;
    tontineFilter.innerHTML = '<option value="">Toutes les tontines</option>' +
        tontines.map(tontine => 
            `<option value="${tontine.id}">${tontine.name}</option>`
        ).join('');
}

function deletePayment(paymentId) {
    const payment = state.payments.find(p => p.id === paymentId);
    if (!payment) {
        showNotification('Paiement non trouvé', 'error');
        return;
    }
    
    if (confirm('Êtes-vous sûr de vouloir supprimer ce paiement ?')) {
        state.payments = state.payments.filter(p => p.id !== paymentId);
        deleteFromDB('payments', paymentId).then(() => {
            showNotification('Paiement supprimé avec succès', 'success');
        }).catch((error) => {
            showNotification('Erreur de suppression', 'error');
        });
        renderPayments();
        updatePaymentsSummary();
        updateDashboard();
    }
}

// Utility Functions
function getTontineStatusText(tontine) {
    if (!tontine.status) {
        // Determine status based on rounds completion
        if (tontine.currentRound > tontine.totalRounds) {
            return 'Terminée';
        } else if (tontine.currentRound === 1 && new Date() < new Date(tontine.startDate)) {
            return 'En attente';
        } else {
            return 'Active';
        }
    }
    
    const statusMap = {
        'active': 'Active',
        'completed': 'Terminée',
        'suspended': 'Suspendue',
        'pending': 'En attente'
    };
    return statusMap[tontine.status] || tontine.status;
}

function getFrequencyText(frequency) {
    const frequencyMap = {
        'Hebdomadaire': 'Hebdomadaire',
        'Mensuelle': 'Mensuelle',
        'Trimestrielle': 'Trimestrielle'
    };
    return frequencyMap[frequency] || frequency;
}

// Add missing event listeners for dynamic form updates
document.addEventListener('DOMContentLoaded', function() {
    // Add event listener for tontine form
    const tontineRoundsInput = document.getElementById('tontine-rounds');
    if (tontineRoundsInput) {
        tontineRoundsInput.addEventListener('input', function() {
            updateMembersSelector();
        });
    }
    
    // Add event listener for payment form
    const paymentTontineSelect = document.getElementById('payment-tontine');
    if (paymentTontineSelect) {
        paymentTontineSelect.addEventListener('change', function() {
            updateMemberSelect(this.value);
        });
    }
    
    const paymentMemberSelect = document.getElementById('payment-member');
    if (paymentMemberSelect) {
        paymentMemberSelect.addEventListener('change', updateAvailableRounds);
    }
    
    // Add event listeners for automatic penalty calculation
    const paymentDateInput = document.getElementById('payment-date');
    if (paymentDateInput) {
        paymentDateInput.addEventListener('change', updatePaymentAmount);
    }
    
    const paymentTypeSelect = document.getElementById('payment-type');
    if (paymentTypeSelect) {
        paymentTypeSelect.addEventListener('change', function() {
            updatePaymentAmount();
            // Reset amount input style when switching to payout
            if (this.value === 'payout') {
                const amountInput = document.getElementById('payment-amount');
                amountInput.style.borderColor = '';
                amountInput.style.backgroundColor = '';
            }
        });
    }
    
    // Ajouter des données de test si aucune données n'existent
    initializeTestData();
});

// Fonction pour initialiser des données de test
function initializeTestData() {
    if (state.members.length === 0) {
        console.log('Ajout de données de test...');
        
        // Ajouter quelques membres de test
        const testMembers = [
            {
                id: generateId(),
                name: 'ESDRAS',
                email: 'marie.dubois@email.com',
                phone: '+225 07 89 85 84 98',
                cni: 'CNI123456',
                address: '123 Rue de la République',
                createdAt: new Date().toISOString()
            },
            {
                id: generateId(),
                name: 'MARC',
                email: 'jean.martin@email.com',
                phone: '+225 05 45 47 79 23',
                cni: 'CNI789123',
                address: '456 Avenue des Champs',
                createdAt: new Date().toISOString()
            },
            {
                id: generateId(),
                name: 'HENOC',
                email: 'sophie.laurent@email.com',
                phone: '+225 ',
                cni: 'CNI456789',
                address: '789 Boulevard Saint-Michel',
                createdAt: new Date().toISOString()
            }
        ];
        
        state.members = testMembers;
        saveData();
        console.log('Données de test ajoutées avec succès !');
        
        // Mettre à jour l'affichage si on est sur la section des membres
        if (state.currentSection === 'members') {
            renderMembers();
        }
        updateDashboard();
    }
}

function getPaymentTypeText(type) {
    const typeMap = {
        'contribution': 'Contribution',
        'payout': 'Versement',
        'cagnotte_rapportee': 'Cagnotte rapportée'
    };
    return typeMap[type] || type;
}

function getPaymentMethodText(method) {
    const methodMap = {
        'cash': 'Espèces',
        'mobile': 'Mobile Money',
        'bank': 'Virement bancaire',
        'check': 'Chèque'
    };
    return methodMap[method] || method;
}

// Modal Management
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('active');
}

// Fonction pour imprimer un reçu de paiement
function printPaymentReceipt(paymentId) {
    const payment = state.payments.find(p => p.id === paymentId);
    if (!payment) return;

    const member = getMemberName(payment.memberId);
    const tontine = state.tontines.find(t => t.id === payment.tontineId);
    
    const receiptContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Reçu de Paiement - ${payment.reference}</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    max-width: 400px;
                    margin: 0 auto;
                    padding: 20px;
                    line-height: 1.6;
                    color: #333;
                }
                .header {
                    text-align: center;
                    border-bottom: 2px solid #6366f1;
                    padding-bottom: 15px;
                    margin-bottom: 20px;
                }
                .title {
                    font-size: 24px;
                    font-weight: bold;
                    color: #6366f1;
                    margin: 0;
                }
                .subtitle {
                    font-size: 14px;
                    color: #666;
                    margin: 5px 0;
                }
                .receipt-info {
                    background: #f8fafc;
                    padding: 15px;
                    border-radius: 8px;
                    margin: 20px 0;
                }
                .info-row {
                    display: flex;
                    justify-content: space-between;
                    margin: 8px 0;
                    padding: 5px 0;
                }
                .info-row:not(:last-child) {
                    border-bottom: 1px dotted #ddd;
                }
                .label {
                    font-weight: 600;
                    color: #374151;
                }
                .value {
                    color: #111827;
                }
                .amount {
                    font-size: 20px;
                    font-weight: bold;
                    color: #059669;
                    text-align: center;
                    background: #ecfdf5;
                    padding: 10px;
                    border-radius: 6px;
                    margin: 15px 0;
                }
                .footer {
                    text-align: center;
                    margin-top: 30px;
                    padding-top: 15px;
                    border-top: 1px solid #ddd;
                    font-size: 12px;
                    color: #666;
                }
                .signature {
                    margin-top: 40px;
                    text-align: right;
                }
                .signature-line {
                    border-bottom: 1px solid #333;
                    width: 200px;
                    margin: 20px 0 5px auto;
                }
                @media print {
                    body { margin: 0; padding: 10px; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1 class="title">REÇU DE PAIEMENT</h1>
                <p class="subtitle">Gestionnaire de Tontines</p>
            </div>
            
            <div class="receipt-info">
                <div class="info-row">
                    <span class="label">Numéro de Reçu:</span>
                    <span class="value">${payment.reference}</span>
                </div>
                <div class="info-row">
                    <span class="label">Date de Paiement:</span>
                    <span class="value">${new Date(payment.date).toLocaleDateString('fr-FR')}</span>
                </div>
                <div class="info-row">
                    <span class="label">Membre:</span>
                    <span class="value">${member}</span>
                </div>
                <div class="info-row">
                    <span class="label">Tontine:</span>
                    <span class="value">${tontine ? tontine.name : 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">Tour:</span>
                    <span class="value">${payment.round}</span>
                </div>
                <div class="info-row">
                    <span class="label">Type de Paiement:</span>
                    <span class="value">${getPaymentTypeText(payment.type)}</span>
                </div>
                <div class="info-row">
                    <span class="label">Méthode:</span>
                    <span class="value">${getPaymentMethodText(payment.method)}</span>
                </div>
                ${payment.penalty > 0 ? `
                <div class="info-row">
                    <span class="label">Pénalité:</span>
                    <span class="value">${formatCurrency(payment.penalty)}</span>
                </div>
                ` : ''}
            </div>
            
            <div class="amount">
                Montant Total: ${formatCurrency(payment.amount)}
            </div>
            
            ${payment.notes ? `
            <div class="receipt-info">
                <div class="info-row">
                    <span class="label">Notes:</span>
                </div>
                <div style="margin-top: 8px; padding: 8px; background: #fff; border-radius: 4px;">
                    ${payment.notes}
                </div>
            </div>
            ` : ''}
            
            <div class="signature">
                <div class="signature-line"></div>
                <p>Signature du Trésorier</p>
            </div>
            
            <div class="footer">
                <p>Reçu généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}</p>
                <p>Gestionnaire de Tontines - Système de Gestion</p>
            </div>
        </body>
        </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(receiptContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
}

// Fonction pour rechercher un membre par CNI dans le modal de tontine
function searchTontineMemberByCNI(cniValue) {
    const searchTerm = cniValue.trim().toLowerCase();
    const memberSelector = document.getElementById('tontine-members-selector');
    
    if (!memberSelector) return;
    
    // Sauvegarder les sélections actuelles
    const currentSelections = Array.from(memberSelector.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    
    // Filtrer et afficher les membres
    let filteredMembers = state.members;
    
    if (searchTerm) {
        filteredMembers = state.members.filter(member => 
            (member.cni && member.cni.toLowerCase().includes(searchTerm)) ||
            (member.name && member.name.toLowerCase().includes(searchTerm))
        );
    }
    
    // Réafficher les membres avec le filtre
    updateMembersSelector(null, filteredMembers, currentSelections);
    
    if (searchTerm && filteredMembers.length === 0) {
        memberSelector.innerHTML = '<p class="no-results">Aucun membre trouvé avec cette CNI</p>';
    }
}

// Fonction pour effacer la recherche de tontine
function clearTontineSearch() {
    document.getElementById('tontine-cni-search').value = '';
    updateMembersSelector();
}

// Fonction pour activer le mode sombre sur les modales
function activateModalDarkMode() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.classList.add('dark-mode');
    });
}

// Fonction pour gérer les tours terminés avec badges
function markRoundAsCompleted(tontineId, round) {
    const tontine = state.tontines.find(t => t.id === tontineId);
    if (!tontine) return;
    
    // Initialiser la propriété completedRounds si elle n'existe pas
    if (!tontine.completedRounds) {
        tontine.completedRounds = [];
    }
    
    // Ajouter le tour aux tours terminés s'il n'y est pas déjà
    if (!tontine.completedRounds.includes(round)) {
        tontine.completedRounds.push(round);
        saveData();
        showNotification(`Tour ${round} marqué comme terminé`, 'success');
    }
}

// Fonction pour vérifier si un tour est terminé
function isRoundCompleted(tontineId, round) {
    const tontine = state.tontines.find(t => t.id === tontineId);
    return tontine && tontine.completedRounds && tontine.completedRounds.includes(round);
}

// Fonction pour obtenir le badge de statut d'un tour
function getRoundStatusBadge(tontineId, round) {
    if (isRoundCompleted(tontineId, round)) {
        return '<span class="round-badge completed">Terminé</span>';
    }
    
    // Vérifier si le tour est en cours
    const currentRound = getCurrentRound(state.tontines.find(t => t.id === tontineId));
    if (round === currentRound) {
        return '<span class="round-badge current">En cours</span>';
    }
    
    if (round < currentRound) {
        return '<span class="round-badge pending">En attente</span>';
    }
    
    return '<span class="round-badge future">À venir</span>';
}

// Fonction pour générer le rapport mensuel PDF (format simplifié comme les reçus)
function generateMonthlyReport() {
    try {
        // Obtenir le mois sélectionné ou le mois actuel
        const filterMonth = document.getElementById('payment-month-filter').value;
        const currentDate = filterMonth ? new Date(filterMonth + '-01') : new Date();
        const monthName = currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        
        // Calculer les statistiques
        const totalMembers = state.members.length;
        const activeTontines = state.tontines.filter(t => t.status === 'active').length;
        const monthlyPayments = getMonthlyPayments(currentDate);
        const totalAmount = monthlyPayments.reduce((sum, p) => sum + p.amount, 0);
        const paidPayments = monthlyPayments.filter(p => p.status === 'paid');
        const pendingPayments = monthlyPayments.filter(p => p.status === 'pending');
        const totalPaid = paidPayments.reduce((sum, p) => sum + p.amount, 0);
        const totalPending = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
        
        // Créer le contenu HTML du rapport
        const reportContent = `
            <div style="max-width: 800px; margin: 0 auto; font-family: Arial, sans-serif; background: white; padding: 40px;">
                <!-- En-tête avec logo -->
                <div style="text-align: center; margin-bottom: 40px; position: relative;">
                    <img src="logo tontine.png" alt="Logo Tontine" style="position: absolute; top: 0; right: 0; width: 80px; height: 80px;">
                    <h1 style="color: #6366f1; font-size: 28px; margin: 0; margin-bottom: 10px;">RAPPORT MENSUEL</h1>
                    <h2 style="color: #64748b; font-size: 18px; margin: 0;">${monthName.charAt(0).toUpperCase() + monthName.slice(1)}</h2>
                    <p style="color: #9ca3af; font-size: 12px; margin: 10px 0;">Généré le: ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}</p>
                </div>
                
                <!-- Statistiques générales -->
                <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 20px; border-radius: 12px; margin-bottom: 30px;">
                    <h3 style="margin: 0 0 15px 0; font-size: 18px;">📊 STATISTIQUES GÉNÉRALES</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div>
                            <p style="margin: 5px 0; font-size: 14px;"><strong>Membres total:</strong> ${totalMembers}</p>
                            <p style="margin: 5px 0; font-size: 14px;"><strong>Tontines actives:</strong> ${activeTontines}</p>
                        </div>
                        <div>
                            <p style="margin: 5px 0; font-size: 14px;"><strong>Paiements du mois:</strong> ${monthlyPayments.length}</p>
                            <p style="margin: 5px 0; font-size: 14px;"><strong>Montant total:</strong> ${formatCurrency(totalAmount)} FCFA</p>
                        </div>
                    </div>
                </div>
                
                <!-- Section Tontines Actives -->
                <div style="margin-bottom: 30px;">
                    <h3 style="color: #6366f1; font-size: 18px; margin-bottom: 15px; border-bottom: 2px solid #6366f1; padding-bottom: 5px;">🤝 TONTINES ACTIVES</h3>
                    ${generateTontinesTable()}
                </div>
                
                <!-- Section Paiements -->
                <div style="margin-bottom: 30px;">
                    <h3 style="color: #6366f1; font-size: 18px; margin-bottom: 15px; border-bottom: 2px solid #6366f1; padding-bottom: 5px;">💳 PAIEMENTS DU MOIS</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                        <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; border-left: 4px solid #10b981;">
                            <p style="margin: 0; color: #10b981; font-weight: bold;">✓ Paiements effectués</p>
                            <p style="margin: 5px 0 0 0; font-size: 14px;">${paidPayments.length} (${formatCurrency(totalPaid)} FCFA)</p>
                        </div>
                        <div style="background: #fffbeb; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
                            <p style="margin: 0; color: #f59e0b; font-weight: bold;">⏳ En attente</p>
                            <p style="margin: 5px 0 0 0; font-size: 14px;">${pendingPayments.length} (${formatCurrency(totalPending)} FCFA)</p>
                        </div>
                        <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; border-left: 4px solid #0ea5e9;">
                            <p style="margin: 0; color: #0ea5e9; font-weight: bold;">📊 Total collecté</p>
                            <p style="margin: 5px 0 0 0; font-size: 14px;">${formatCurrency(totalAmount)} FCFA</p>
                        </div>
                    </div>
                    ${generatePaymentsTable(monthlyPayments)}
                </div>
                
                <!-- Pied de page -->
                <div style="border-top: 2px solid #6366f1; padding-top: 20px; text-align: center; color: #64748b;">
                    <p style="margin: 0; font-size: 14px; font-weight: bold;">Gestionnaire de Tontines</p>
                    <p style="margin: 5px 0 0 0; font-size: 9px;">TONTINE MANAGER - La tontine autrement</p>
                </div>
            </div>
        `;
        
        // Créer une nouvelle fenêtre pour l'impression
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Rapport Mensuel - ${monthName}</title>
                <meta charset="UTF-8">
                <style>
                    @media print {
                        body { margin: 0; }
                        @page { margin: 15mm; }
                    }
                    body { 
                        font-family: Arial, sans-serif; 
                        margin: 0; 
                        padding: 20px;
                        background: #f8fafc;
                    }
                    table { 
                        width: 100%; 
                        border-collapse: collapse; 
                        margin: 10px 0;
                        background: white;
                        border-radius: 8px;
                        overflow: hidden;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    th { 
                        background: #6366f1; 
                        color: white; 
                        padding: 12px 8px; 
                        text-align: left;
                        font-size: 12px;
                    }
                    td { 
                        padding: 10px 8px; 
                        border-bottom: 1px solid #e2e8f0;
                        font-size: 11px;
                    }
                    tr:nth-child(even) { background: #f8fafc; }
                    tr:hover { background: #f1f5f9; }
                </style>
            </head>
            <body>
                ${reportContent}
            </body>
            </html>
        `);
        
        printWindow.document.close();
        
        // Attendre que le contenu soit chargé puis imprimer
        setTimeout(() => {
            printWindow.print();
        }, 500);
        
        showNotification('Rapport généré avec succès !', 'success');
        
    } catch (error) {
        console.error('Erreur lors de la génération du rapport:', error);
        showNotification('Erreur lors de la génération du rapport', 'error');
    }
}

// Fonction pour générer le tableau des tontines
function generateTontinesTable() {
    const activeTontines = state.tontines.filter(t => t.status === 'active');
    
    if (activeTontines.length === 0) {
        return '<p style="color: #64748b; font-style: italic; text-align: center; padding: 20px;">Aucune tontine active pour cette période</p>';
    }
    
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>Nom de la tontine</th>
                    <th>Montant par tour</th>
                    <th>Fréquence</th>
                    <th>Nombre de membres</th>
                    <th>Statut</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    activeTontines.forEach(tontine => {
        tableHTML += `
            <tr>
                <td><strong>${tontine.name}</strong></td>
                <td>${formatCurrency(tontine.amount)} FCFA</td>
                <td>${tontine.frequency}</td>
                <td>${tontine.members ? tontine.members.length : 0} membres</td>
                <td><span style="background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-size: 10px;">ACTIVE</span></td>
            </tr>
        `;
    });
    
    tableHTML += `
            </tbody>
        </table>
    `;
    
    return tableHTML;
}

// Fonction pour générer le tableau des paiements
function generatePaymentsTable(payments) {
    if (payments.length === 0) {
        return '<p style="color: #64748b; font-style: italic; text-align: center; padding: 20px;">Aucun paiement pour cette période</p>';
    }
    
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Membre</th>
                    <th>Tontine</th>
                    <th>Montant</th>
                    <th>Type</th>
                    <th>Statut</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // Limiter à 20 paiements les plus récents pour ne pas surcharger
    const recentPayments = payments.slice(0, 20);
    
    recentPayments.forEach(payment => {
        const member = state.members.find(m => m.id === payment.memberId);
        const tontine = state.tontines.find(t => t.id === payment.tontineId);
        const statusColor = payment.status === 'paid' ? '#10b981' : payment.status === 'pending' ? '#f59e0b' : '#ef4444';
        const statusText = payment.status === 'paid' ? 'PAYÉ' : payment.status === 'pending' ? 'EN ATTENTE' : 'RETARD';
        
        tableHTML += `
            <tr>
                <td>${new Date(payment.date).toLocaleDateString('fr-FR')}</td>
                <td>${member ? member.name : 'Membre inconnu'}</td>
                <td>${tontine ? tontine.name : 'Tontine inconnue'}</td>
                <td><strong>${formatCurrency(payment.amount)} FCFA</strong></td>
                <td>${getPaymentTypeText(payment.type)}</td>
                <td><span style="background: ${statusColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 10px;">${statusText}</span></td>
            </tr>
        `;
    });
    
    if (payments.length > 20) {
        tableHTML += `
            <tr>
                <td colspan="6" style="text-align: center; font-style: italic; color: #64748b;">
                    ... et ${payments.length - 20} autres paiements
                </td>
            </tr>
        `;
    }
    
    tableHTML += `
            </tbody>
        </table>
    `;
    
    return tableHTML;
}

// Fonction pour obtenir les paiements du mois (si elle n'existe pas déjà)
function getMonthlyPayments(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    return state.payments.filter(payment => {
        const paymentDate = new Date(payment.date);
        return paymentDate.getFullYear() === year && paymentDate.getMonth() === month;
    });
}

// Fonction pour obtenir le texte du type de paiement (si elle n'existe pas déjà)
function getPaymentTypeText(type) {
    switch (type) {
        case 'contribution':
            return 'Contribution';
        case 'payout':
            return 'Versement';
        case 'penalty':
            return 'Pénalité';
        case 'cagnotte':
            return 'Cagnotte rapportée';
        default:
            return 'Autre';
    }
}

function exportReport() {
    const currentDate = new Date();
    const monthName = currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
    
    // Filter payments for current month
    const monthlyPayments = state.payments.filter(payment => {
        const paymentDate = new Date(payment.date);
        return paymentDate.getMonth() === currentMonth && paymentDate.getFullYear() === currentYear;
    });
    
    // Create Excel workbook
    const wb = XLSX.utils.book_new();
    
    // Summary sheet
    const summaryData = [
        ['GESTIONNAIRE DE TONTINES'],
        ['RAPPORT MENSUEL - ' + monthName.toUpperCase()],
        ['Généré le: ' + currentDate.toLocaleDateString('fr-FR')],
        [],
        ['RÉSUMÉ GÉNÉRAL'],
        ['Membres totaux', state.members.length],
        ['Tontines actives', state.tontines.filter(t => t.status === 'active').length],
        ['Paiements du mois', monthlyPayments.length],
        ['Montant total collecté', monthlyPayments.reduce((sum, p) => sum + p.amount, 0) + ' FCFA'],
        ['Total pénalités', monthlyPayments.reduce((sum, p) => sum + (p.penalty || 0), 0) + ' FCFA'],
        []
    ];
    
    // Add tontine details
    summaryData.push(['DÉTAIL PAR TONTINE']);
    state.tontines.forEach(tontine => {
        const tontinePayments = monthlyPayments.filter(p => p.tontineId === tontine.id);
        const tontineTotal = tontinePayments.reduce((sum, p) => sum + p.amount, 0);
        
        summaryData.push([
            tontine.name,
            tontinePayments.length + ' paiements',
            tontineTotal + ' FCFA',
            getTontineStatusText(tontine)
        ]);
    });
    
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Style the header
    summaryWs['A1'] = { v: 'GESTIONNAIRE DE TONTINES', t: 's', s: { font: { bold: true, sz: 16 } } };
    summaryWs['A2'] = { v: 'RAPPORT MENSUEL - ' + monthName.toUpperCase(), t: 's', s: { font: { bold: true, sz: 14 } } };
    
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Résumé');
    
    // Payments detail sheet
    const paymentsData = [
        ['DÉTAIL DES PAIEMENTS - ' + monthName.toUpperCase()],
        [],
        ['Date', 'Membre', 'Téléphone', 'Tontine', 'Tour', 'Montant (FCFA)', 'Pénalité (FCFA)', 'Méthode', 'Référence', 'Statut']
    ];
    
    monthlyPayments.forEach(payment => {
        const member = state.members.find(m => m.id === payment.memberId);
        const tontine = state.tontines.find(t => t.id === payment.tontineId);
        
        paymentsData.push([
            new Date(payment.date).toLocaleDateString('fr-FR'),
            member ? member.name : 'Membre inconnu',
            member ? member.phone : 'N/A',
            tontine ? tontine.name : 'Tontine inconnue',
            payment.round || 'N/A',
            payment.amount,
            payment.penalty || 0,
            getPaymentMethodText(payment.method),
            payment.reference,
            payment.status || 'Validé'
        ]);
    });
    
    const paymentsWs = XLSX.utils.aoa_to_sheet(paymentsData);
    paymentsWs['A1'] = { v: 'DÉTAIL DES PAIEMENTS - ' + monthName.toUpperCase(), t: 's', s: { font: { bold: true, sz: 14 } } };
    
    XLSX.utils.book_append_sheet(wb, paymentsWs, 'Paiements');
    
    // Members sheet
    const membersData = [
        ['LISTE DES MEMBRES'],
        [],
        ['Nom', 'Téléphone', 'CNI', 'Tontines participées', 'Total payé (FCFA)', 'Dernière activité']
    ];
    
    state.members.forEach(member => {
        const memberPayments = state.payments.filter(p => p.memberId === member.id);
        const memberTontines = [...new Set(memberPayments.map(p => {
            const tontine = state.tontines.find(t => t.id === p.tontineId);
            return tontine ? tontine.name : 'Tontine inconnue';
        }))];
        const totalPaid = memberPayments.reduce((sum, p) => sum + p.amount, 0);
        const lastPayment = memberPayments.length > 0 ? 
            new Date(Math.max(...memberPayments.map(p => new Date(p.date)))).toLocaleDateString('fr-FR') : 
            'Aucun paiement';
        
        membersData.push([
            member.name,
            member.phone,
            member.cni,
            memberTontines.join(', ') || 'Aucune',
            totalPaid,
            lastPayment
        ]);
    });
    
    const membersWs = XLSX.utils.aoa_to_sheet(membersData);
    membersWs['A1'] = { v: 'LISTE DES MEMBRES', t: 's', s: { font: { bold: true, sz: 14 } } };
    
    XLSX.utils.book_append_sheet(wb, membersWs, 'Membres');
    
    // Tontines sheet
    const tontinesData = [
        ['LISTE DES TONTINES'],
        [],
        ['Nom', 'Description', 'Montant (FCFA)', 'Fréquence', 'Tours', 'Participants', 'Date début', 'Tour actuel', 'Statut']
    ];
    
    state.tontines.forEach(tontine => {
        const participantCount = tontine.membersWithPositions ? tontine.membersWithPositions.length : 0;
        
        tontinesData.push([
            tontine.name,
            tontine.description || '',
            tontine.amount,
            getFrequencyText(tontine.frequency),
            tontine.totalRounds || 'N/A',
            participantCount,
            new Date(tontine.startDate).toLocaleDateString('fr-FR'),
            tontine.currentRound || 1,
            getTontineStatusText(tontine)
        ]);
    });
    
    const tontinesWs = XLSX.utils.aoa_to_sheet(tontinesData);
    tontinesWs['A1'] = { v: 'LISTE DES TONTINES', t: 's', s: { font: { bold: true, sz: 14 } } };
    
    XLSX.utils.book_append_sheet(wb, tontinesWs, 'Tontines');
    
    // Export as .xlsm file
    const fileName = `rapport-mensuel-tontines-${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}.xlsm`;
    XLSX.writeFile(wb, fileName, { bookType: 'xlsm' });
    
    showNotification('Rapport Excel exporté avec succès', 'success');
}

// Database Management
function exportDatabase() {
    // Créer un classeur avec plusieurs feuilles
    const wb = XLSX.utils.book_new();
    
    // === FEUILLE 1: RÉSUMÉ ===
    const activeContributions = state.payments.filter(p => p.type === 'contribution' && !isRoundCompleted(p.tontineId, p.round));
    const totalContributions = state.payments.filter(p => p.type === 'contribution').reduce((sum, p) => sum + p.amount, 0);
    const totalPayouts = state.payments.filter(p => p.type === 'payout').reduce((sum, p) => sum + p.amount, 0);
    const activeContributionsAmount = activeContributions.reduce((sum, p) => sum + p.amount, 0);
    const completedRoundsCount = state.tontines.reduce((sum, t) => sum + (t.completedRounds?.length || 0), 0);
    
    const summaryData = [
        ['RAPPORT COMPLET DE GESTION DES TONTINES'],
        ['Date d\'export:', new Date().toLocaleDateString('fr-FR')],
        ['Heure d\'export:', new Date().toLocaleTimeString('fr-FR')],
        [''],
        ['STATISTIQUES GÉNÉRALES'],
        ['Nombre total de membres:', state.members.length],
        ['Nombre total de tontines:', state.tontines.length],
        ['Tours terminés:', completedRoundsCount],
        ['Total paiements enregistrés:', state.payments.length],
        [''],
        ['ANALYSE FINANCIÈRE'],
        ['Total des cotisations (tous tours):', formatCurrency(totalContributions)],
        ['Total des versements effectués:', formatCurrency(totalPayouts)],
        ['Cotisations actives (tours non terminés):', formatCurrency(activeContributionsAmount)],
        ['Différence (cotisations - versements):', formatCurrency(totalContributions - totalPayouts)],
        [''],
        ['ÉTAT DES TONTINES'],
        ['Nom de la Tontine', 'Nombre de Membres', 'Montant par Tour', 'Tours Terminés', 'Statut'],
        ...state.tontines.map(t => [
            t.name, 
            t.membersWithPositions?.length || 0, 
            formatCurrency(t.amount),
            t.completedRounds?.length || 0,
            getTontineStatusText(t)
        ])
    ];
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Formatage de la feuille résumé
    summarySheet['!cols'] = [{ width: 25 }, { width: 20 }, { width: 15 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Résumé');
    
    // === FEUILLE 2: MEMBRES ===
    const membersData = [
        ['ID', 'Nom Complet', 'CNI', 'Téléphone', 'Email', 'Adresse', 'Date d\'ajout']
    ];
    
    state.members.forEach(member => {
        membersData.push([
            member.id,
            member.name,
            member.cni || '',
            member.phone || '',
            member.email || '',
            member.address || '',
            member.joinDate ? new Date(member.joinDate).toLocaleDateString('fr-FR') : ''
        ]);
    });
    
    const membersSheet = XLSX.utils.aoa_to_sheet(membersData);
    membersSheet['!cols'] = [
        { width: 15 }, { width: 25 }, { width: 15 }, 
        { width: 15 }, { width: 25 }, { width: 30 }, { width: 12 }
    ];
    XLSX.utils.book_append_sheet(wb, membersSheet, 'Membres');
    
    // === FEUILLE 3: TONTINES ===
    const tontinesData = [
        ['ID', 'Nom', 'Description', 'Montant (FCFA)', 'Fréquence', 'Nombre de Tours', 'Date de Début', 'Tour Actuel', 'Tours Terminés', 'Statut', 'Nombre de Membres']
    ];
    
    state.tontines.forEach(tontine => {
        tontinesData.push([
            tontine.id,
            tontine.name,
            tontine.description || '',
            tontine.amount,
            getFrequencyText(tontine.frequency),
            tontine.totalRounds || tontine.rounds,
            new Date(tontine.startDate).toLocaleDateString('fr-FR'),
            tontine.currentRound || 1,
            tontine.completedRounds?.length || 0,
            getTontineStatusText(tontine),
            tontine.membersWithPositions?.length || 0
        ]);
    });
    
    const tontinesSheet = XLSX.utils.aoa_to_sheet(tontinesData);
    tontinesSheet['!cols'] = [
        { width: 15 }, { width: 20 }, { width: 30 }, { width: 15 }, 
        { width: 12 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 12 }
    ];
    XLSX.utils.book_append_sheet(wb, tontinesSheet, 'Tontines');
    
    // === FEUILLE 4: PAIEMENTS ===
    const paymentsData = [
        ['Référence', 'Date', 'Membre', 'Tontine', 'Tour', 'Type', 'Montant (FCFA)', 'Méthode', 'Pénalité', 'Notes']
    ];
    
    state.payments.forEach(payment => {
        const member = state.members.find(m => m.id === payment.memberId);
        const tontine = state.tontines.find(t => t.id === payment.tontineId);
        
        paymentsData.push([
            payment.reference,
            new Date(payment.date).toLocaleDateString('fr-FR'),
            member ? member.name : 'Membre inconnu',
            tontine ? tontine.name : 'Tontine inconnue',
            payment.round,
            getPaymentTypeText(payment.type),
            payment.amount,
            getPaymentMethodText(payment.method),
            payment.penalty || 0,
            payment.notes || ''
        ]);
    });
    
    const paymentsSheet = XLSX.utils.aoa_to_sheet(paymentsData);
    paymentsSheet['!cols'] = [
        { width: 15 }, { width: 12 }, { width: 20 }, { width: 20 }, 
        { width: 8 }, { width: 12 }, { width: 15 }, { width: 15 }, { width: 12 }, { width: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, paymentsSheet, 'Paiements');
    
    // === FEUILLE 5: ANALYSE DES TOURS ===
    const roundsAnalysisData = [
        ['ANALYSE DÉTAILLÉE DES TOURS PAR TONTINE'],
        [''],
        ['Tontine', 'Tour', 'Bénéficiaire', 'Cotisations', 'Versement', 'Statut', 'Date Versement']
    ];
    
    state.tontines.forEach(tontine => {
        for (let round = 1; round <= (tontine.totalRounds || tontine.rounds || 0); round++) {
            const receiver = tontine.membersWithPositions?.find(mp => mp.position === round);
            const receiverMember = receiver ? state.members.find(m => m.id === receiver.memberId) : null;
            const roundContributions = state.payments.filter(p => p.tontineId === tontine.id && p.round === round && p.type === 'contribution');
            const roundPayout = state.payments.find(p => p.tontineId === tontine.id && p.round === round && p.type === 'payout');
            const isCompleted = isRoundCompleted(tontine.id, round);
            
            let status = 'En attente';
            if (isCompleted) status = 'Terminé';
            else if (roundPayout) status = 'Versé';
            else if (roundContributions.length === (tontine.membersWithPositions?.length || 0)) status = 'Prêt pour versement';
            else if (roundContributions.length > 0) status = 'En cours';
            
            roundsAnalysisData.push([
                tontine.name,
                round,
                receiverMember ? receiverMember.name : 'Non défini',
                `${roundContributions.length}/${tontine.membersWithPositions?.length || 0}`,
                roundPayout ? formatCurrency(roundPayout.amount) : 'Non effectué',
                status,
                roundPayout ? new Date(roundPayout.date).toLocaleDateString('fr-FR') : ''
            ]);
        }
    });
    
    const roundsAnalysisSheet = XLSX.utils.aoa_to_sheet(roundsAnalysisData);
    roundsAnalysisSheet['!cols'] = [
        { width: 20 }, { width: 8 }, { width: 20 }, { width: 12 }, 
        { width: 15 }, { width: 15 }, { width: 12 }
    ];
    XLSX.utils.book_append_sheet(wb, roundsAnalysisSheet, 'Analyse Tours');
    
    // === FEUILLE 6: DÉTAILS PAR TONTINE ===
    state.tontines.forEach(tontine => {
        const tontineDetailsData = [
            [`DÉTAILS TONTINE: ${tontine.name}`],
            [''],
            ['INFORMATIONS GÉNÉRALES'],
            ['Montant par membre:', formatCurrency(tontine.amount)],
            ['Fréquence:', getFrequencyText(tontine.frequency)],
            ['Date de début:', new Date(tontine.startDate).toLocaleDateString('fr-FR')],
            ['Nombre de tours:', tontine.rounds],
            [''],
            ['MEMBRES ET POSITIONS'],
            ['Position', 'Nom du Membre', 'CNI', 'Téléphone', 'Statut Paiement']
        ];
        
        tontine.members.forEach(member => {
            const memberInfo = state.members.find(m => m.id === member.memberId);
            const memberPayments = state.payments.filter(p => 
                p.tontineId === tontine.id && p.memberId === member.memberId
            );
            const totalPaid = memberPayments.reduce((sum, p) => sum + p.amount, 0);
            const expectedTotal = tontine.amount * (tontine.totalRounds || tontine.rounds || 0);
            const status = totalPaid >= expectedTotal ? 'À jour' : `Reste ${formatCurrency(expectedTotal - totalPaid)}`;
            
            tontineDetailsData.push([
                member.position,
                memberInfo ? memberInfo.name : 'Membre inconnu',
                memberInfo ? memberInfo.cni || '' : '',
                memberInfo ? memberInfo.phone || '' : '',
                status
            ]);
        });
        
        const tontineSheet = XLSX.utils.aoa_to_sheet(tontineDetailsData);
        tontineSheet['!cols'] = [{ width: 10 }, { width: 25 }, { width: 15 }, { width: 15 }, { width: 20 }];
        XLSX.utils.book_append_sheet(wb, tontineSheet, tontine.name.substring(0, 31));
    });
    
    // Générer le fichier
    const fileName = `Gestionnaire-Tontines-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    showNotification('Fichier Excel exporté avec succès!', 'success');
}

function importDatabase() {
    const fileInput = document.getElementById('import-file-input');
    fileInput.click();
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                if (data.members && data.tontines && data.payments) {
                    if (confirm('Cette action remplacera toutes les données existantes. Êtes-vous sûr ?')) {
                        state.members = data.members;
                        state.tontines = data.tontines;
                        state.payments = data.payments;
                        
                        saveData();
                        showNotification('Base de données importée avec succès', 'success');
                        
                        // Refresh current view
                        updateDashboard();
                        if (state.currentSection === 'members') renderMembers();
                        if (state.currentSection === 'tontines') renderTontines();
                        if (state.currentSection === 'payments') {
                            renderPayments();
                            updatePaymentsSummary();
                        }
                    }
                } else {
                    showNotification('Format de fichier invalide', 'error');
                }
            } catch (error) {
                showNotification('Erreur lors de l\'importation du fichier', 'error');
            }
        };
        reader.readAsText(file);
    });
}

// Gestionnaire d'erreurs pour les problèmes de stockage
window.addEventListener('error', function(event) {
    if (event.error && event.error.name === 'QuotaExceededError') {
        showNotification('Espace de stockage insuffisant. Veuillez libérer de l\'espace.', 'error');
    }
});

// Sauvegarder automatiquement avant de fermer la page
// Les données sont maintenant sauvegardées automatiquement dans Firestore
window.addEventListener('beforeunload', function() {
    // Plus besoin de sauvegarder manuellement avec Firebase
});
// Chart.js configuration pour le graphique
function initSalesChart() {
    const ctx = document.getElementById('salesChart');
    if (!ctx) return;
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Sales',
                data: [65, 78, 66, 85, 92, 98],
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#f3f4f6'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Mettre à jour les statistiques du dashboard
function updateDashboardStats() {
    // Adapter avec vos données de tontines
    const totalMembers = state.members.length;
    const activeTontines = state.tontines.filter(t => t.status === 'active').length;
    const totalAmount = state.payments.reduce((sum, p) => sum + p.amount, 0);
    const pendingPayments = state.payments.filter(p => p.status === 'pending').length;
    
    // Mettre à jour l'affichage
    document.getElementById('total-users-display').textContent = totalMembers.toLocaleString();
    document.getElementById('total-amount-display').textContent = `${formatCurrency(totalAmount)} FCFA`;
    document.getElementById('new-clients-display').textContent = `+${Math.floor(totalMembers * 0.1)}`;
    document.getElementById('total-sales-display').textContent = `${formatCurrency(totalAmount * 0.8)} FCFA`;
}

// Mettre à jour les statistiques réelles du dashboard
function updateTontineStats() {
    const totalMembers = state.members.length;
    const activeTontines = state.tontines.filter(t => t.status === 'active').length;
    const completedTontines = state.tontines.filter(t => t.status === 'completed').length;
    
    // Calcul des paiements du mois actuel
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthlyPayments = state.payments.filter(p => {
        const paymentDate = new Date(p.date);
        return paymentDate.getMonth() === currentMonth && paymentDate.getFullYear() === currentYear;
    }).length;
    
    // Calcul du montant total
    const totalAmount = state.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    // Calcul des pourcentages de croissance (simulés)
    const membersGrowth = Math.floor(Math.random() * 20) + 5; // 5-25%
    const tontinesGrowth = Math.floor(Math.random() * 15) + 2; // 2-17%
    const paymentsGrowth = Math.floor(Math.random() * 30) + 10; // 10-40%
    const amountGrowth = Math.floor(Math.random() * 25) + 8; // 8-33%
    
    // Mise à jour de l'affichage
    document.getElementById('total-members-display').textContent = totalMembers.toLocaleString();
    document.getElementById('active-tontines-display').textContent = activeTontines.toLocaleString();
    document.getElementById('monthly-payments-display').textContent = monthlyPayments.toLocaleString();
    document.getElementById('total-amount-display').textContent = `${formatCurrency(totalAmount)} FCFA`;
    
    // Mise à jour des pourcentages
    document.getElementById('chart-growth').textContent = `Croissance de +${amountGrowth}% cette année`;
}

// Initialiser le graphique des paiements avec données réelles
function initPaymentsChart() {
    const ctx = document.getElementById('paymentsChart');
    if (!ctx) return;
    
    // Préparer les données des 6 derniers mois
    const months = [];
    const paymentData = [];
    
    for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthName = date.toLocaleDateString('fr-FR', { month: 'short' });
        months.push(monthName);
        
        // Calculer les paiements pour ce mois
        const monthPayments = state.payments.filter(p => {
            const paymentDate = new Date(p.date);
            return paymentDate.getMonth() === date.getMonth() && 
                   paymentDate.getFullYear() === date.getFullYear();
        }).reduce((sum, p) => sum + (p.amount || 0), 0);
        
        paymentData.push(monthPayments / 1000); // Convertir en milliers
    }
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'Paiements (milliers FCFA)',
                data: paymentData,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#667eea',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 3,
                pointRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#f3f4f6',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#6b7280',
                        callback: function(value) {
                            return value + 'k FCFA';
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#6b7280'
                    }
                }
            },
            elements: {
                point: {
                    hoverRadius: 8
                }
            }
        }
    });
}

// Mettre à jour l'état des tontines
function updateTontinesStatus() {
    const container = document.getElementById('tontines-status-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    const recentTontines = state.tontines.slice(0, 4);
    
    if (recentTontines.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">Aucune tontine créée</p>';
        return;
    }
    
    recentTontines.forEach(tontine => {
        const statusClass = tontine.status === 'active' ? 'active' : 
                          tontine.status === 'completed' ? 'completed' : 'pending';
        const statusIcon = tontine.status === 'active' ? 'fa-play' : 
                          tontine.status === 'completed' ? 'fa-check' : 'fa-pause';
        
        const progress = calculateTontineProgress(tontine);
        
        const item = document.createElement('div');
        item.className = 'status-item';
        item.innerHTML = `
            <div class="status-icon ${statusClass}">
                <i class="fas ${statusIcon}"></i>
            </div>
            <div class="status-info">
                <div class="status-name">${tontine.name}</div>
                <div class="status-details">${tontine.members?.length || 0} membres • ${progress}% complété</div>
            </div>
        `;
        container.appendChild(item);
    });
}



// Calculer le progrès d'une tontine
function calculateTontineProgress(tontine) {
    if (!tontine.members || tontine.members.length === 0) return 0;
    
    const totalPayments = state.payments.filter(p => p.tontineId === tontine.id && p.type !== 'payout').length;
    const expectedPayments = tontine.members.length * getCurrentRound(tontine);
    
    return Math.min(100, Math.floor((totalPayments / expectedPayments) * 100));
}

// Mettre à jour le dashboard complet
function updateDashboard() {
    updateTontineStats();
    updateTontinesStatus();
    updateRecentActivities();
    
    // Initialiser le graphique après un court délai
    setTimeout(() => {
        initPaymentsChart();
    }, 100);
}

// Modifier la fonction initApp pour inclure la mise à jour du dashboard
const originalInitApp = initApp;
initApp = async function() {
    await originalInitApp();
    updateDashboard();
};

// Modifier la fonction saveData pour mettre à jour le dashboard
const originalSaveData = saveData;
saveData = function() {
    originalSaveData();
    updateDashboard();
};

// Fonction pour mettre à jour toutes les vues
function refreshAllViews() {
    updateDashboard();
    updateRecentActivities();
    updateDashboardStats();
    
    // Mettre à jour les autres sections si elles sont actives
    if (state.currentSection === 'members') {
        renderMembers();
    } else if (state.currentSection === 'tontines') {
        renderTontines();
    } else if (state.currentSection === 'payments') {
        renderPayments();
        updatePaymentsSummary();
    }
}
