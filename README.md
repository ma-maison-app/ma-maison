<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ma Maison · French Sanctuary</title>
    
    <!-- PWA Meta Tags -->
    <meta name="theme-color" content="#8b4654">
    <meta name="description" content="Your personal French study sanctuary with Pomodoro timer, music, and cloud sync">
    <link rel="manifest" href="./manifest.json">
    
    <!-- Apple Touch Icon -->
    <link rel="apple-touch-icon" href="./icon-192.png">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Ma Maison">
    
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Work+Sans:wght@300;400;500&family=Allura&display=swap" rel="stylesheet">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    
    <!-- Firebase REST API - No CDN needed! -->
    <script>
// ============================================
// GLOBAL ERROR HANDLER - Catch null reference errors
// ============================================
window.addEventListener('error', function(e) {
    console.error('❌ Global error caught:', e.message, e.filename, e.lineno, e.colno);
    // Don't prevent the error from showing in console, but prevent page crash
    e.preventDefault();
    return true;
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('❌ Unhandled promise rejection:', e.reason);
    e.preventDefault();
});

console.log('🏡 Ma Maison - French Sanctuary');
console.log('✅ Error handlers installed');

// Firebase REST API Implementation - Embedded directly in HTML
const FirebaseREST = {
    config: null,
    currentUser: null,
    
    init: async function(config) {
        this.config = config;
        this.currentUser = await this.getStoredUser();
        return this;
    },
    
    signUp: async function(email, password) {
        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${this.config.apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        this.currentUser = {
            uid: data.localId,
            email: data.email,
            token: data.idToken,
            refreshToken: data.refreshToken
        };
        await this.storeUser(this.currentUser);
        // Trigger auth callback
        if (window._authCallback) window._authCallback(this.currentUser);
        return this.currentUser;
    },
    
    signIn: async function(email, password) {
        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.config.apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        this.currentUser = {
            uid: data.localId,
            email: data.email,
            token: data.idToken,
            refreshToken: data.refreshToken
        };
        await this.storeUser(this.currentUser);
        // Trigger auth callback
        if (window._authCallback) window._authCallback(this.currentUser);
        return this.currentUser;
    },
    
    signOut: async function() {
        this.currentUser = null;
        this._memoryStore = {};
        
        // Clear IndexedDB
        try {
            const db = await this._getDB();
            const transaction = db.transaction([this._storeName], 'readwrite');
            const store = transaction.objectStore(this._storeName);
            store.delete('firebase_user');
        } catch (e) {
            console.warn('IndexedDB clear failed:', e);
        }
        
        // Clear sessionStorage
        try {
            sessionStorage.removeItem('firebase_user');
        } catch (e) {
            // sessionStorage not available
        }
        
        // Trigger auth callback
        if (window._authCallback) window._authCallback(null);
        return Promise.resolve();
    },
    
    getCurrentUser: function() {
        return this.currentUser;
    },
    
    setDocument: async function(collection, docId, data) {
        if (!this.currentUser) {
            console.error('❌ setDocument failed: Not authenticated');
            throw new Error('Not authenticated');
        }
        await this.refreshTokenIfNeeded();
        
        const url = `https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/(default)/documents/${collection}/${docId}`;
        const firestoreData = this.toFirestoreFormat(data);
        
        console.log('🔥 Firestore PATCH request:', {
            url,
            collection,
            docId,
            dataKeys: Object.keys(data)
        });
        
        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.currentUser.token}`
            },
            body: JSON.stringify({ fields: firestoreData })
        });
        
        const result = await response.json();
        console.log('🔥 Firestore response:', response.status, result);
        
        if (result.error) {
            console.error('❌ Firestore error:', result.error);
            throw new Error(result.error.message || JSON.stringify(result.error));
        }
        return result;
    },
    
    getDocument: async function(collection, docId) {
        if (!this.currentUser) throw new Error('Not authenticated');
        await this.refreshTokenIfNeeded();
        
        const url = `https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/(default)/documents/${collection}/${docId}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${this.currentUser.token}` }
        });
        
        const result = await response.json();
        if (result.error) {
            if (result.error.code === 404) return null;
            throw new Error(result.error.message);
        }
        return this.fromFirestoreFormat(result.fields);
    },
    
    toFirestoreFormat: function(obj) {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value === null) result[key] = { nullValue: null };
            else if (typeof value === 'string') result[key] = { stringValue: value };
            else if (typeof value === 'number') result[key] = { doubleValue: value };
            else if (typeof value === 'boolean') result[key] = { booleanValue: value };
            else if (Array.isArray(value)) {
                result[key] = {
                    arrayValue: {
                        values: value.map(item => {
                            if (typeof item === 'object') return { mapValue: { fields: this.toFirestoreFormat(item) } };
                            if (typeof item === 'string') return { stringValue: item };
                            if (typeof item === 'number') return { doubleValue: item };
                            if (typeof item === 'boolean') return { booleanValue: item };
                            return { stringValue: String(item) };
                        })
                    }
                };
            } else if (typeof value === 'object') result[key] = { mapValue: { fields: this.toFirestoreFormat(value) } };
            else result[key] = { stringValue: String(value) };
        }
        return result;
    },
    
    fromFirestoreFormat: function(fields) {
        if (!fields) return null;
        const result = {};
        for (const [key, value] of Object.entries(fields)) {
            if (value.stringValue !== undefined) result[key] = value.stringValue;
            else if (value.doubleValue !== undefined) result[key] = value.doubleValue;
            else if (value.integerValue !== undefined) result[key] = parseInt(value.integerValue);
            else if (value.booleanValue !== undefined) result[key] = value.booleanValue;
            else if (value.nullValue !== undefined) result[key] = null;
            else if (value.arrayValue) {
                result[key] = value.arrayValue.values ? value.arrayValue.values.map(item => {
                    if (item.mapValue) return this.fromFirestoreFormat(item.mapValue.fields);
                    if (item.stringValue !== undefined) return item.stringValue;
                    if (item.doubleValue !== undefined) return item.doubleValue;
                    if (item.booleanValue !== undefined) return item.booleanValue;
                    return item;
                }) : [];
            } else if (value.mapValue) result[key] = this.fromFirestoreFormat(value.mapValue.fields);
        }
        return result;
    },
    
    // Robust storage using IndexedDB (works everywhere, persists forever)
    _memoryStore: {},
    _dbName: 'MaMaisonDB',
    _storeName: 'auth',
    
    _getDB: async function() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this._dbName, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this._storeName)) {
                    db.createObjectStore(this._storeName);
                }
            };
        });
    },
    
    storeUser: async function(user) {
        const userData = { ...user, timestamp: Date.now() };
        
        // Store in memory
        this._memoryStore.firebase_user = userData;
        
        // Store in IndexedDB for persistence
        try {
            const db = await this._getDB();
            const transaction = db.transaction([this._storeName], 'readwrite');
            const store = transaction.objectStore(this._storeName);
            store.put(userData, 'firebase_user');
        } catch (e) {
            console.warn('IndexedDB storage failed:', e);
            // Fallback to sessionStorage
            try {
                sessionStorage.setItem('firebase_user', JSON.stringify(userData));
            } catch (e2) {
                console.warn('sessionStorage also failed:', e2);
            }
        }
    },
    
    getStoredUser: async function() {
        // Try memory first (fastest)
        if (this._memoryStore.firebase_user) {
            const user = this._memoryStore.firebase_user;
            if (Date.now() - user.timestamp < 60 * 60 * 1000) {
                return user;
            }
        }
        
        // Try IndexedDB
        try {
            const db = await this._getDB();
            const transaction = db.transaction([this._storeName], 'readonly');
            const store = transaction.objectStore(this._storeName);
            const request = store.get('firebase_user');
            
            const user = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            if (user && Date.now() - user.timestamp < 60 * 60 * 1000) {
                this._memoryStore.firebase_user = user;
                return user;
            }
        } catch (e) {
            console.warn('IndexedDB read failed:', e);
        }
        
        // Fallback to sessionStorage
        try {
            const stored = sessionStorage.getItem('firebase_user');
            if (stored) {
                const user = JSON.parse(stored);
                if (Date.now() - user.timestamp < 60 * 60 * 1000) {
                    this._memoryStore.firebase_user = user;
                    return user;
                }
            }
        } catch (e) {
            console.warn('sessionStorage read failed:', e);
        }
        
        return null;
    },
    
    refreshTokenIfNeeded: async function() {
        if (!this.currentUser) return;
        
        const stored = this._memoryStore.firebase_user;
        if (!stored || Date.now() - stored.timestamp < 50 * 60 * 1000) return;
        
        const url = `https://securetoken.googleapis.com/v1/token?key=${this.config.apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: this.currentUser.refreshToken })
        });
        const data = await response.json();
        if (data.error) {
            await this.signOut();
            throw new Error('Session expired');
        }
        this.currentUser.token = data.id_token;
        this.currentUser.refreshToken = data.refresh_token;
        await this.storeUser(this.currentUser);
    }
};

// Initialize Firebase REST - no status bar needed
console.log('✅ Firebase REST ready!');

const firebaseConfig = {
    apiKey: "AIzaSyD5l89evtb8svRKoTVICAVwA4JbpoXjJKQ",
    authDomain: "ma-maison-french.firebaseapp.com",
    projectId: "ma-maison-french",
    storageBucket: "ma-maison-french.firebasestorage.app",
    messagingSenderId: "319573050083",
    appId: "1:319573050083:web:11ff8453f39cce3160fbd6",
    measurementId: "G-JP9BNPQX0B"
};

// Initialize Firebase (must be async now)
(async () => {
    try {
        console.log('🔄 Initializing Firebase REST...');
        await FirebaseREST.init(firebaseConfig);
        console.log('✅ Firebase initialized successfully');
        
        // Make compatible with existing code
        window.firebaseAuth = FirebaseREST;
        window.firebaseDB = FirebaseREST;
        window.firebaseReady = true;
        window.firebaseModules = {
            signInWithEmailAndPassword: (auth, email, password) => FirebaseREST.signIn(email, password),
            createUserWithEmailAndPassword: (auth, email, password) => FirebaseREST.signUp(email, password),
            signOut: (auth) => FirebaseREST.signOut(),
            onAuthStateChanged: async (auth, callback) => {
                // Check stored user on load (async) with error handling
                try {
                    const storedUser = await FirebaseREST.getStoredUser();
                    if (storedUser) {
                        FirebaseREST.currentUser = storedUser;
                        console.log('👤 Restored user from storage:', storedUser.email);
                        callback(storedUser);
                    } else {
                        console.log('👤 No stored user found');
                        callback(null);
                    }
                } catch (error) {
                    console.warn('⚠️ Error checking stored user:', error);
                    callback(null);
                }
                
                // Listen for changes
                window._authCallback = callback;
            },
        doc: (db, collection, docId) => ({ collection, docId }),
        setDoc: (ref, data) => FirebaseREST.setDocument(ref.collection, ref.docId, data),
        getDoc: (ref) => FirebaseREST.getDocument(ref.collection, ref.docId).then(data => ({
            exists: () => data !== null,
            data: () => data
        }))
    };
    
    console.log('✅ Firebase modules configured');
    } catch (error) {
        console.error('❌ Firebase initialization failed:', error);
        alert('Firebase initialization failed. Check console for details.');
    }
    
    // Call initFirebaseAuth when ready (outside try/catch so errors don't break Firebase)
    if (window.initFirebaseAuth) {
        try {
            window.initFirebaseAuth();
        } catch (e) {
            console.error('❌ initFirebaseAuth error:', e);
        }
    } else {
        const checkInit = setInterval(() => {
            if (window.initFirebaseAuth) {
                clearInterval(checkInit);
                try {
                    window.initFirebaseAuth();
                } catch (e) {
                    console.error('❌ initFirebaseAuth error:', e);
                }
            }
        }, 100);
    }
})(); // Close async IIFE
    </script>
    
    <style>
        :root {
            --cream: #FBF9F4;
            --cream-dark: #F5F1E8;
            --crimson: #8B2635;
            --crimson-soft: #A64253;
            --navy: #1B2B3A;
            --navy-soft: #2C3E50;
            --gold: #C9A861;
            --gold-pale: #E5D4A6;
            --text: #2A2520;
            --text-soft: #6B615C;
            --whisper: rgba(42, 37, 32, 0.04);
            --shadow: rgba(27, 43, 58, 0.08);
            --shadow-strong: rgba(27, 43, 58, 0.15);
            --rosy: #D4A5A5;
            --sage: #A8B8A8;
        }

        /* Dark mode variables - Rich, sophisticated night theme */
        body.dark-mode {
            --cream: #0d1117;
            --cream-dark: #161b22;
            --crimson: #ff6b8a;
            --crimson-soft: #ff8fab;
            --navy: #e8dcc8;
            --navy-soft: #c9b8a0;
            --gold: #f4d58d;
            --gold-pale: #d4b886;
            --text: #e8dcc8;
            --text-soft: #9d8e7a;
            --whisper: rgba(232, 220, 200, 0.08);
            --shadow: rgba(0, 0, 0, 0.5);
            --shadow-strong: rgba(0, 0, 0, 0.7);
            --rosy: #d4969d;
            --sage: #9fb99f;
        }

        body.dark-mode {
            background: linear-gradient(135deg, #0d1117 0%, #161b22 50%, #1a1f26 100%);
        }

        body.dark-mode .header {
            background: rgba(22, 27, 34, 0.95);
            border-bottom-color: rgba(232, 220, 200, 0.1);
        }

        body.dark-mode .nav {
            border-bottom-color: rgba(232, 220, 200, 0.1);
        }

        body.dark-mode .word-card,
        body.dark-mode .entrance-card,
        body.dark-mode .reading-card,
        body.dark-mode .listening-card,
        body.dark-mode .recording-card,
        body.dark-mode .writing-card,
        body.dark-mode .note-card,
        body.dark-mode .resource-card {
            background: rgba(22, 27, 34, 0.8);
            border: 1px solid rgba(232, 220, 200, 0.12);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        }

        body.dark-mode .word-card:hover,
        body.dark-mode .reading-card:hover,
        body.dark-mode .listening-card:hover,
        body.dark-mode .recording-card:hover,
        body.dark-mode .writing-card:hover,
        body.dark-mode .note-card:hover,
        body.dark-mode .resource-card:hover {
            border-color: rgba(244, 213, 141, 0.3);
            box-shadow: 0 8px 24px rgba(244, 213, 141, 0.15);
        }
        
        /* Dark mode house icon styles */
        body.dark-mode .house-icon rect[fill="#A64253"] {
            fill: #4a3545;
            stroke: #ff6b8a;
        }
        
        body.dark-mode .house-icon circle[fill="#D4A5A5"] {
            fill: #9d8e7a;
        }
        
        body.dark-mode .house-icon rect[fill="#FBF9F4"] {
            fill: #2a2f38;
            stroke: #f4d58d;
        }
        
        body.dark-mode .house-icon path[fill="#D4A5A5"] {
            fill: #3a2f3f;
            stroke: #ff6b8a;
        }
        
        body.dark-mode .house-icon rect[fill="#F5E6D3"] {
            fill: #2a2f38;
            stroke: #ff6b8a;
        }
        
        body.dark-mode .house-icon rect[fill="#E8DCC8"] {
            fill: #1a1f26;
            stroke: #c9b8a0;
        }
        
        body.dark-mode .house-icon .house-door path {
            fill: #4a3545;
            stroke: #ff6b8a;
        }
        
        body.dark-mode .house-icon .house-door path[fill="#D4A5A5"] {
            fill: #d4969d;
            stroke: #ff8fab;
        }
        
        body.dark-mode .house-icon .house-door circle {
            fill: #f4d58d;
        }
        
        body.dark-mode .house-icon rect[fill="#E5D4A6"] {
            fill: #1a1f26;
            stroke: #c9b8a0;
        }
        

        /* House lights - random surprise in night mode */
        body.dark-mode .house-icon .house-window {
            fill: #2a2535;
            transition: fill 0.6s ease;
        }
        body.dark-mode .house-lights-on .house-icon .house-window {
            fill: #FFE08A;
            filter: drop-shadow(0 0 6px rgba(255, 210, 80, 0.9));
        }
        body.dark-mode .house-lights-on .house-icon {
            filter: drop-shadow(0 0 18px rgba(255, 210, 80, 0.25));
        }
        body.dark-mode .house-icon line {
            stroke: #c9b8a0;
        }

        /* ====== SVG ANIMATIONS ====== */
        .animation-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 9999;
            overflow: hidden;
        }

        /* Floating Hearts */
        /* Removed floating heart animation styles - no longer needed */
        
        /* ====== HOUSE ICON STYLES ====== */
        .house-container {
            position: relative;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .house-container:hover {
            transform: scale(1.05);
        }

        .house-icon {
            width: 80px;
            height: 80px;
        }

        /* Door animation */
        .house-door {
            transform-origin: left center;
            transition: transform 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }

        .house-container.open .house-door {
            transform: rotateY(-85deg);
        }

        /* Floating hearts animation */
        .heart-particles {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            overflow: visible;
        }

        .heart-particle {
            position: absolute;
            bottom: 45%;
            left: 50%;
            opacity: 0;
            animation: floatHeart 3s ease-out forwards;
        }

        @keyframes floatHeart {
            0% {
                transform: translate(-50%, 0) scale(0);
                opacity: 0;
            }
            20% {
                opacity: 1;
            }
            100% {
                transform: translate(var(--tx), -80px) scale(1);
                opacity: 0;
            }
        }
        /* ====== END HOUSE ICON STYLES ====== */
        
        body.dark-mode .btn-primary {
            background: linear-gradient(135deg, #d4746f 0%, #b85d5d 100%);
            border-color: transparent;
            box-shadow: 0 4px 12px rgba(212, 116, 111, 0.3);
        }

        body.dark-mode .btn-primary:hover {
            background: linear-gradient(135deg, #e08882 0%, #c96b6b 100%);
            box-shadow: 0 6px 16px rgba(212, 116, 111, 0.4);
        }

        /* Comprehensive dark mode: Override ALL white backgrounds */
        body.dark-mode .affirmation,
        body.dark-mode .heart-note,
        body.dark-mode .modal-content,
        body.dark-mode .filter-bar,
        body.dark-mode .stat-card,
        body.dark-mode .srs-stat-box,
        body.dark-mode .srs-card-container,
        body.dark-mode .form-group input,
        body.dark-mode .form-group select,
        body.dark-mode .form-group textarea,
        body.dark-mode .srs-diff-btn,
        body.dark-mode .garden-summary,
        body.dark-mode .pdf-page {
            background: rgba(22, 27, 34, 0.9) !important;
        }

        body.dark-mode .btn-secondary {
            background: rgba(232, 220, 200, 0.1);
            border: 1px solid rgba(232, 220, 200, 0.2);
            color: var(--gold);
        }

        body.dark-mode .btn-secondary:hover {
            background: rgba(232, 220, 200, 0.15);
            border-color: rgba(232, 220, 200, 0.3);
        }

        body.dark-mode .icon-btn {
            background: rgba(232, 220, 200, 0.08);
            color: var(--gold);
        }

        body.dark-mode .icon-btn:hover {
            background: rgba(232, 220, 200, 0.15);
        }

        body.dark-mode .modal-content {
            background: #161b22;
            border: 1px solid rgba(232, 220, 200, 0.15);
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
        }

        body.dark-mode .form-input,
        body.dark-mode .form-textarea,
        body.dark-mode .form-select {
            background: rgba(13, 17, 23, 0.6);
            border-color: rgba(232, 220, 200, 0.15);
            color: var(--text);
        }

        body.dark-mode .form-input:focus,
        body.dark-mode .form-textarea:focus,
        body.dark-mode .form-select:focus {
            border-color: var(--gold);
            background: rgba(13, 17, 23, 0.8);
        }

        body.dark-mode .category-tag {
            background: rgba(244, 213, 141, 0.15);
            border: 1px solid rgba(244, 213, 141, 0.3);
            color: var(--gold);
        }

        body.dark-mode .affirmation {
            background: rgba(22, 27, 34, 0.95);
            border-left-color: var(--gold);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        }

        body.dark-mode .game-section {
            background: rgba(22, 27, 34, 0.6);
            border: 1px solid rgba(232, 220, 200, 0.12);
        }

        body.dark-mode .empty {
            color: var(--text-soft);
        }

        /* === SRS SYSTEM STYLES === */
        .srs-stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .srs-stat-box {
            background: var(--cream);
            padding: 1.5rem;
            border-radius: 2px;
            text-align: center;
            box-shadow: 0 2px 8px var(--shadow);
            border-left: 3px solid var(--gold);
        }

        body.dark-mode .srs-stat-box {
            background: rgba(22, 27, 34, 0.8);
        }

        .srs-stat-number {
            font-family: 'Cormorant Garamond', serif;
            font-size: 2.5rem;
            color: var(--crimson);
            font-weight: 500;
        }

        .srs-stat-label {
            font-size: 0.85rem;
            color: var(--text-soft);
            margin-top: 0.5rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .srs-card-container {
            background: var(--cream);
            border-radius: 12px;
            padding: 3rem;
            box-shadow: 0 4px 20px var(--shadow);
            min-height: 450px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            margin: 2rem auto;
            max-width: 700px;
        }

        body.dark-mode .srs-card-container {
            background: rgba(22, 27, 34, 0.8);
        }

        .srs-card-word {
            font-family: 'Cormorant Garamond', serif;
            font-size: 3rem;
            font-weight: 500;
            color: var(--crimson);
            margin-bottom: 1.5rem;
        }

        .srs-card-translation {
            font-size: 2rem;
            color: var(--navy);
            margin-bottom: 1rem;
            opacity: 0;
            transition: opacity 0.3s;
        }

        .srs-card-container.revealed .srs-card-translation {
            opacity: 1;
        }

        .srs-card-example {
            font-size: 1.1rem;
            color: var(--text-soft);
            font-style: italic;
            padding: 1.5rem;
            background: var(--whisper);
            border-radius: 8px;
            max-width: 550px;
            margin: 1.5rem auto;
            opacity: 0;
            transition: opacity 0.3s;
        }

        .srs-card-container.revealed .srs-card-example {
            opacity: 1;
        }

        .srs-difficulty-buttons {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
            width: 100%;
            max-width: 500px;
            margin-top: 2rem;
            opacity: 0;
            transition: opacity 0.3s;
        }

        .srs-card-container.revealed .srs-difficulty-buttons {
            opacity: 1;
        }

        .srs-diff-btn {
            padding: 1rem;
            border: 2px solid;
            border-radius: 8px;
            background: var(--cream);
            cursor: pointer;
            font-size: 1rem;
            font-weight: 500;
            transition: all 0.3s;
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
        }

        body.dark-mode .srs-diff-btn {
            background: var(--cream-dark);
        }

        .srs-diff-btn small {
            font-size: 0.75rem;
            opacity: 0.7;
        }

        .srs-diff-btn.again {
            border-color: #dc3545;
            color: #dc3545;
        }

        .srs-diff-btn.again:hover {
            background: #dc3545;
            color: white;
        }

        .srs-diff-btn.hard {
            border-color: #fd7e14;
            color: #fd7e14;
        }

        .srs-diff-btn.hard:hover {
            background: #fd7e14;
            color: white;
        }

        .srs-diff-btn.good {
            border-color: #28a745;
            color: #28a745;
        }

        .srs-diff-btn.good:hover {
            background: #28a745;
            color: white;
        }

        .srs-diff-btn.easy {
            border-color: #007bff;
            color: #007bff;
        }

        .srs-diff-btn.easy:hover {
            background: #007bff;
            color: white;
        }

        .srs-progress-bar {
            width: 100%;
            height: 8px;
            background: var(--whisper);
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 1.5rem;
        }

        .srs-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--crimson), var(--gold));
            transition: width 0.3s;
        }

        .srs-progress-text {
            text-align: center;
            font-size: 0.9rem;
            color: var(--text-soft);
            margin-bottom: 1rem;
        }

        .srs-complete-message {
            text-align: center;
            padding: 3rem;
        }

        .srs-complete-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
        }

        .srs-complete-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 2.5rem;
            color: var(--crimson);
            margin-bottom: 1rem;
        }

        .srs-complete-subtitle {
            font-size: 1.2rem;
            color: var(--text-soft);
            margin-bottom: 2rem;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        html {
            scroll-behavior: smooth;
        }

        body {
            font-family: 'Work Sans', sans-serif;
            background: var(--cream);
            color: var(--text);
            line-height: 1.7;
            font-weight: 300;
            overflow-x: hidden;
        }

        /* Affirmation */
        .affirmation {
            position: fixed;
            top: 20%;
            right: 3rem;
            max-width: 280px;
            padding: 1.5rem;
            background: var(--cream);
            border-left: 2px solid var(--gold);
            box-shadow: 0 4px 20px var(--shadow);
            opacity: 0;
            transform: translateX(20px);
            pointer-events: none;
            z-index: 1000;
            transition: all 1s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .affirmation.visible {
            opacity: 1;
            transform: translateX(0);
        }

        .affirmation-text {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.1rem;
            font-weight: 400;
            color: var(--navy);
            margin-bottom: 0.5rem;
            font-style: italic;
        }

        .affirmation-translation {
            font-size: 0.85rem;
            color: var(--text-soft);
        }

        /* Floating Heart Button - HIDDEN (not needed) */
        #floating-heart {
            display: none !important;
        }
        
        /* Animated floating hearts - DISABLED */
        .floating-heart:not(#floating-heart) {
            display: none;
        }

        /* Dark Mode Toggle Button */
        .dark-mode-toggle {
            position: fixed;
            bottom: 2rem;
            left: 2rem;
            width: 52px;
            height: 52px;
            border-radius: 50%;
            background: var(--cream);
            border: 1px solid var(--whisper);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 16px var(--shadow);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 1000;
        }

        body.dark-mode .dark-mode-toggle {
            background: var(--cream-dark);
            border-color: var(--whisper);
        }

        .dark-mode-toggle:hover {
            transform: scale(1.08);
            box-shadow: 0 6px 24px var(--shadow-strong);
        }

        .dark-mode-toggle svg {
            width: 24px;
            height: 24px;
            transition: all 0.4s ease;
        }

        .dark-mode-toggle .sun-icon {
            display: none;
        }

        body.dark-mode .dark-mode-toggle .sun-icon {
            display: block;
        }

        body.dark-mode .dark-mode-toggle .moon-icon {
            display: none;
        }

        /* Celestial Body (Sun/Moon) - Atmospheric Feature */
        .celestial-body {
            position: absolute;
            top: -15px;
            right: -15px;
            width: 45px;
            height: 45px;
            z-index: 10;
            pointer-events: none;
            transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* Sun SVG */
        .celestial-body .sun {
            opacity: 1;
            transition: opacity 0.8s ease, transform 0.8s ease;
        }

        .celestial-body .moon {
            position: absolute;
            top: 0;
            left: 0;
            opacity: 0;
            transition: opacity 0.8s ease, transform 0.8s ease;
        }

        /* Dark mode transitions */
        body.dark-mode .celestial-body .sun {
            opacity: 0;
            transform: rotate(180deg) scale(0.8);
        }

        body.dark-mode .celestial-body .moon {
            opacity: 1;
            transform: rotate(0deg) scale(1);
        }

        /* Glow effects */
        .celestial-body .sun {
            filter: drop-shadow(0 0 15px rgba(255, 200, 87, 0.7));
        }

        body.dark-mode .celestial-body .moon {
            filter: drop-shadow(0 0 12px rgba(232, 232, 232, 0.8));
        }

        /* Stars container */
        .stars-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1;
            opacity: 0;
            transition: opacity 1s ease;
        }

        body.dark-mode .stars-container {
            opacity: 1;
        }

        /* Individual star */
        .star {
            position: absolute;
            width: 2px;
            height: 2px;
            background: white;
            border-radius: 50%;
            animation: twinkle 3s infinite;
            box-shadow: 0 0 3px rgba(255, 255, 255, 0.8);
        }

        /* Twinkling animation */
        @keyframes twinkle {
            0%, 100% {
                opacity: 0.3;
                transform: scale(1);
            }
            50% {
                opacity: 1;
                transform: scale(1.2);
            }
        }

        /* Different animation delays for stars */
        .star:nth-child(2n) {
            animation-delay: 0.5s;
            animation-duration: 2.5s;
        }

        .star:nth-child(3n) {
            animation-delay: 1s;
            animation-duration: 3.5s;
        }

        .star:nth-child(4n) {
            animation-delay: 1.5s;
            animation-duration: 2.8s;
        }

        .star:nth-child(5n) {
            animation-delay: 0.8s;
            animation-duration: 3.2s;
        }

        /* Larger stars */
        .star.large {
            width: 3px;
            height: 3px;
            box-shadow: 0 0 5px rgba(255, 255, 255, 0.9);
        }

        /* Mobile responsiveness for celestial body */
        @media (max-width: 768px) {
            .celestial-body {
                width: 38px;
                height: 38px;
                top: -12px;
                right: -12px;
            }
        }

        @media (max-width: 480px) {
            .celestial-body {
                width: 35px;
                height: 35px;
                top: -10px;
                right: -10px;
            }
        }

        /* Floating Quick Actions */
        .floating-actions {
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            z-index: 1000;
        }

        .floating-btn-main {
            width: 70px;
            height: 70px;
            border: none;
            background: transparent;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            filter: drop-shadow(0 4px 20px rgba(166, 66, 83, 0.4));
            outline: none !important;
        }
        
        .floating-btn-main:focus {
            outline: none !important;
        }
        
        /* REMOVED - No more square background or ::before pseudo-element */

        .floating-btn-main:hover {
            transform: scale(1.1);
            filter: drop-shadow(0 6px 28px rgba(166, 66, 83, 0.6));
        }

        .floating-btn-main svg {
            width: 50px;
            height: 50px;
            position: absolute;
            transition: all 0.3s ease;
        }

        .floating-btn-main .close-icon {
            opacity: 0;
            transform: rotate(-90deg);
            stroke: #A64253;
            width: 30px;
            height: 30px;
        }

        .floating-actions.active .floating-btn-main .plus-icon {
            opacity: 0;
            transform: rotate(90deg);
        }

        .floating-actions.active .floating-btn-main .close-icon {
            opacity: 1;
            transform: rotate(0);
        }

        .floating-menu {
            position: absolute;
            bottom: 70px;
            right: 0;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            opacity: 0;
            pointer-events: none;
            transform: translateY(20px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .floating-actions.active .floating-menu {
            opacity: 1;
            pointer-events: all;
            transform: translateY(0);
        }

        .floating-btn-action {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem 1.25rem;
            background: var(--cream);
            border: 1px solid var(--whisper);
            border-radius: 28px;
            cursor: pointer;
            box-shadow: 0 4px 16px var(--shadow);
            transition: all 0.3s ease;
            white-space: nowrap;
            font-family: 'Work Sans', sans-serif;
            font-size: 0.9rem;
            color: var(--navy);
            outline: none !important;
        }
        
        .floating-btn-action:focus {
            outline: none !important;
        }

        .floating-btn-action:hover {
            background: var(--cream-dark);
            transform: translateX(-4px);
            box-shadow: 0 6px 24px var(--shadow-strong);
        }

        .floating-btn-action svg {
            width: 20px;
            height: 20px;
            stroke: var(--crimson);
            fill: none;
            flex-shrink: 0;
        }

        body.dark-mode .floating-btn-main {
            background: transparent;
            box-shadow: none;
        }

        body.dark-mode .floating-btn-main:hover {
            box-shadow: none;
        }

        body.dark-mode .floating-btn-main svg {
            /* Heart stays the same burgundy color in dark mode */
        }

        body.dark-mode .floating-btn-action {
            background: var(--cream-dark);
            border-color: rgba(232, 220, 200, 0.15);
        }

        body.dark-mode .floating-btn-action:hover {
            background: rgba(22, 27, 34, 0.9);
            border-color: rgba(244, 213, 141, 0.3);
        }

        body.dark-mode .floating-btn-action svg {
            stroke: var(--gold);
        }

        /* Header */
        .header {
            padding: 2rem 2rem 1rem;
            border-bottom: 1px solid var(--whisper);
            background: rgba(251, 249, 244, 0.95);
            backdrop-filter: blur(10px);
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .header-inner {
            max-width: 1100px;
            margin: 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .logo {
            display: flex;
            flex-direction: column;
        }

        .logo-main {
            font-family: 'Allura', cursive;
            font-size: 2.2rem;
            font-weight: 400;
            color: var(--crimson);
            letter-spacing: 0.02em;
        }

        .logo-sub {
            font-size: 0.7rem;
            color: var(--text-soft);
            letter-spacing: 0.2em;
            text-transform: uppercase;
            margin-top: 0.25rem;
        }

        .signature {
            font-family: 'Allura', cursive;
            font-size: 2rem;
            color: var(--gold);
            opacity: 0.7;
            cursor: pointer;
            transition: all 0.5s ease;
        }

        .signature:hover {
            opacity: 0.9;
        }

        /* Navigation */
        .nav {
            max-width: 1100px;
            margin: 0 auto;
            padding: 2rem 2rem 1rem;
            display: flex;
            gap: 0.5rem;
            border-bottom: 1px solid var(--whisper);
            overflow-x: auto;
        }

        .nav-link {
            padding: 0.75rem 1.5rem;
            border: none;
            background: transparent;
            font-family: 'Work Sans', sans-serif;
            font-size: 0.9rem;
            font-weight: 400;
            color: var(--text-soft);
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.3s;
            white-space: nowrap;
        }

        .nav-link:hover {
            color: var(--crimson);
        }

        .nav-link.active {
            color: var(--navy);
            border-bottom-color: var(--crimson);
        }

        /* Main */
        .main {
            max-width: 1100px;
            margin: 0 auto;
            padding: 3rem 2rem 5rem;
        }

        .room {
            display: none;
            animation: fadeIn 0.6s ease-out;
        }

        .room.active {
            display: block;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .room-intro {
            text-align: center;
            max-width: 650px;
            margin: 0 auto 3rem;
        }

        .room-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 2.5rem;
            font-weight: 400;
            color: var(--navy);
            margin-bottom: 1rem;
        }

        .room-description {
            font-size: 1rem;
            color: var(--text-soft);
            line-height: 1.8;
        }

        /* Resource Dropdown Button */
        .resources-dropdown-container {
            margin: 1.5rem 0 2rem;
            text-align: center;
        }

        .resources-toggle-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1.5rem;
            background: linear-gradient(135deg, var(--cream) 0%, var(--whisper) 100%);
            border: 1px solid rgba(139, 70, 84, 0.15);
            border-radius: 20px;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            font-size: 0.9rem;
            color: var(--text-soft);
            font-family: 'Work Sans', sans-serif;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .resources-toggle-btn:hover {
            background: linear-gradient(135deg, var(--whisper) 0%, white 100%);
            border-color: var(--crimson);
            color: var(--crimson);
            box-shadow: 0 4px 12px rgba(139, 70, 84, 0.15);
            transform: translateY(-2px);
        }

        .resources-toggle-btn svg {
            width: 18px;
            height: 18px;
            transition: transform 0.3s ease;
        }

        .resources-toggle-btn.active .resources-chevron {
            transform: rotate(180deg);
        }

        .resources-dropdown-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
            opacity: 0;
            margin-top: 0;
        }

        .resources-dropdown-content.active {
            max-height: 2000px;
            opacity: 1;
            margin-top: 1.5rem;
        }

        .section-resources-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1.5rem;
            padding: 1rem;
        }

        .resource-mini-card {
            background: var(--cream);
            padding: 1.5rem;
            border-radius: 12px;
            border: 1px solid rgba(139, 70, 84, 0.1);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
            transition: all 0.3s ease;
            position: relative;
        }

        .resource-mini-card:hover {
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
            transform: translateY(-4px);
            border-color: var(--crimson);
        }

        .resource-mini-card-icon {
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, var(--rosy) 0%, var(--gold-pale) 100%);
            border-radius: 10px;
            margin-bottom: 1rem;
        }

        .resource-mini-card-icon svg {
            width: 22px;
            height: 22px;
            color: white;
        }

        .resource-mini-card-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.2rem;
            color: var(--navy);
            margin-bottom: 0.5rem;
            font-weight: 500;
        }

        .resource-mini-card-desc {
            font-size: 0.85rem;
            color: var(--text-soft);
            line-height: 1.6;
            margin-bottom: 0.75rem;
        }

        .resource-mini-card-link {
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            font-size: 0.8rem;
            color: var(--crimson);
            text-decoration: none;
            transition: color 0.2s ease;
        }

        .resource-mini-card-link:hover {
            color: var(--navy);
        }

        .resource-mini-card-link svg {
            width: 14px;
            height: 14px;
        }

        /* Cards */
        .entrance-card {
            background: var(--cream);
            padding: 3rem;
            border-radius: 2px;
            box-shadow: 0 4px 24px var(--shadow);
            margin-bottom: 2rem;
            border-top: 3px solid var(--gold);
        }

        .entrance-sentence {
            font-family: 'Cormorant Garamond', serif;
            font-size: 2.25rem;
            font-weight: 400;
            color: var(--navy);
            margin-bottom: 1rem;
            text-align: center;
        }

        .entrance-translation {
            font-size: 1.1rem;
            color: var(--text-soft);
            text-align: center;
            margin-bottom: 2rem;
        }

        .entrance-note {
            font-size: 0.95rem;
            line-height: 1.8;
            color: var(--text);
            padding: 1.5rem;
            background: var(--whisper);
            border-left: 2px solid var(--gold-pale);
        }

        /* Buttons */
        .data-actions {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin-top: 2rem;
        }

        .btn {
            padding: 0.875rem 2rem;
            border: none;
            border-radius: 2px;
            font-family: 'Work Sans', sans-serif;
            font-size: 0.9rem;
            font-weight: 400;
            cursor: pointer;
            transition: all 0.3s;
        }

        .btn-primary {
            background: var(--navy);
            color: white;
        }

        .btn-primary:hover {
            background: var(--navy-soft);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px var(--shadow);
        }

        .btn-secondary {
            background: var(--cream);
            color: var(--navy);
            border: 1px solid var(--navy);
        }

        .btn-secondary:hover {
            background: var(--cream-dark);
        }

        .timer-preset {
            padding: 0.5rem 1rem;
            font-size: 0.85rem;
            min-width: auto;
        }

        .timer-preset.active {
            background: var(--navy);
            color: white;
            border-color: var(--navy);
        }

        body.dark-mode .timer-preset.active {
            background: var(--gold);
            color: var(--navy);
            border-color: var(--gold);
        }

        .btn-danger {
            background: transparent;
            color: var(--crimson);
            border: 1px solid var(--crimson);
            font-size: 0.8rem;
        }

        .btn-danger:hover {
            background: var(--crimson);
            color: white;
        }

        .btn-drive {
            padding: 0.875rem;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--cream);
            color: var(--navy);
            border: 1px solid var(--navy);
            cursor: pointer;
            transition: all 0.3s;
        }

        .btn-drive:hover {
            background: var(--cream-dark);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px var(--shadow);
        }

        /* Word Grid */
        .word-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 1.5rem;
        }

        .word-card {
            background: var(--cream);
            padding: 2rem;
            border-radius: 2px;
            box-shadow: 0 2px 12px var(--shadow);
            border-left: 3px solid var(--gold);
            position: relative;
        }

        .word-actions {
            position: absolute;
            top: 1rem;
            right: 1rem;
            display: flex;
            gap: 0.5rem;
            z-index: 10;
        }

        .icon-btn {
            background: var(--cream);
            border: none;
            cursor: pointer;
            font-size: 1.1rem;
            opacity: 0.6;
            transition: opacity 0.2s;
            padding: 0.25rem;
            border-radius: 2px;
        }

        .icon-btn:hover {
            opacity: 1;
        }

        .icon-btn.favorite-active {
            opacity: 1;
        }

        .icon-btn.favorite-active:hover {
            transform: scale(1.1);
        }
        
        /* Elegant icon buttons in reading passage header */
        .reading-passage-header .icon-btn:hover {
            opacity: 1 !important;
            background: rgba(190, 31, 46, 0.08);
        }

        .word-image {
            width: 100%;
            height: 200px;
            object-fit: cover;
            border-radius: 2px;
            margin-bottom: 1rem;
        }

        /* View Toggle */
        .view-toggle {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.6rem 1.2rem;
            font-size: 0.9rem;
        }

        .view-toggle.active {
            background: var(--navy);
            color: white;
            border-color: var(--navy);
        }

        body.dark-mode .view-toggle.active {
            background: var(--gold);
            color: var(--navy);
            border-color: var(--gold);
        }

        /* Flip Cards */
        .flip-card-wrapper {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 400px;
            margin: 2rem 0;
            perspective: 1000px;
        }

        .flip-card {
            width: 100%;
            max-width: 600px;
            height: 400px;
            cursor: pointer;
            position: relative;
        }

        .flip-card-inner {
            position: relative;
            width: 100%;
            height: 100%;
            transition: transform 0.6s;
            transform-style: preserve-3d;
        }

        .flip-card.flipped .flip-card-inner {
            transform: rotateY(180deg);
        }

        .flip-card-front,
        .flip-card-back {
            position: absolute;
            width: 100%;
            height: 100%;
            backface-visibility: hidden;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 3rem;
            box-shadow: 0 8px 32px var(--shadow);
        }

        .flip-card-front {
            background: linear-gradient(135deg, white 0%, var(--cream-dark) 100%);
            border: 2px solid var(--gold);
        }

        .flip-card-back {
            background: linear-gradient(135deg, var(--navy) 0%, var(--navy-soft) 100%);
            color: white;
            transform: rotateY(180deg);
        }

        body.dark-mode .flip-card-front {
            background: linear-gradient(135deg, var(--cream-dark) 0%, #1a1f26 100%);
            border-color: var(--gold);
        }

        body.dark-mode .flip-card-back {
            background: linear-gradient(135deg, var(--gold) 0%, #d4b886 100%);
            color: var(--navy);
        }

        .flip-card-content {
            text-align: center;
            width: 100%;
        }

        .flip-card-word {
            font-family: 'Cormorant Garamond', serif;
            font-size: 3rem;
            font-weight: 500;
            color: var(--navy);
            margin-bottom: 1rem;
        }

        body.dark-mode .flip-card-word {
            color: var(--gold);
        }

        .flip-card-hint {
            font-size: 0.9rem;
            color: var(--text-soft);
            font-style: italic;
        }

        .flip-card-meaning {
            font-size: 2rem;
            font-weight: 500;
            margin-bottom: 1.5rem;
        }

        .flip-card-example {
            font-size: 1.1rem;
            font-style: italic;
            opacity: 0.9;
            line-height: 1.6;
        }

        .flip-card-controls {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 2rem;
            margin-top: 2rem;
        }

        .flip-card-counter {
            font-size: 1.1rem;
            color: var(--text);
            font-weight: 500;
            min-width: 80px;
            text-align: center;
        }

        .word-french {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.75rem;
            color: var(--navy);
            margin-bottom: 0.5rem;
        }

        .word-meaning {
            font-size: 1rem;
            color: var(--navy-soft);
            margin-bottom: 1rem;
            font-weight: 400;
            font-style: italic;
        }

        .word-article {
            font-size: 0.85rem;
            color: var(--text-soft);
            margin-bottom: 1rem;
        }

        .word-contexts {
            margin: 1rem 0;
        }

        .context {
            margin-bottom: 1rem;
        }

        .context-label {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--gold);
            margin-bottom: 0.25rem;
        }

        .context-sentence {
            font-size: 0.95rem;
            color: var(--text);
            font-style: italic;
        }

        .word-note {
            margin-top: 1rem;
            padding-top: 1rem;
            border-top: 1px solid var(--whisper);
            font-size: 0.9rem;
            color: var(--text-soft);
        }

        /* Categories Grid */
        .category-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-bottom: 1rem;
        }

        .category-tag {
            display: inline-block;
            background: var(--whisper);
            color: var(--text-soft);
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            font-size: 0.75rem;
            letter-spacing: 0.03em;
        }

        .category-tag.topic {
            background: var(--gold-pale);
            color: var(--navy);
        }

        .category-tag.time {
            background: var(--sage);
            color: white;
            font-size: 0.7rem;
        }

        .empty {
            grid-column: 1 / -1;
            text-align: center;
            padding: 4rem 2rem;
        }

        .empty-icon {
            font-size: 3rem;
            margin-bottom: 1rem;
        }

        .empty-text {
            font-size: 1rem;
            color: var(--text-soft);
            line-height: 1.8;
        }

        /* Game section */
        .game-section {
            background: var(--cream);
            padding: 2rem;
            border-radius: 2px;
            box-shadow: 0 2px 12px var(--shadow);
            margin-bottom: 2rem;
            text-align: center;
            border-top: 3px solid var(--crimson);
        }

        .game-container {
            margin-top: 1.5rem;
        }

        .game-mode-btn {
            font-size: 0.85rem;
            padding: 0.6rem 1rem;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
        }

        .game-mode-btn svg {
            flex-shrink: 0;
        }

        .game-mode-btn.active {
            background: var(--crimson);
            color: white;
            border-color: var(--crimson);
        }

        .game-instructions {
            font-size: 1rem;
            color: var(--text-soft);
            margin-bottom: 1.5rem;
            font-style: italic;
        }

        .matching-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
            max-width: 600px;
            margin: 0 auto;
        }

        .matching-card {
            background: var(--cream);
            padding: 1.5rem;
            border-radius: 12px;
            border: 2px solid var(--whisper);
            cursor: pointer;
            transition: all 0.3s ease;
            font-size: 1.1rem;
            color: var(--navy);
            font-family: 'Cormorant Garamond', serif;
        }

        .matching-card:hover {
            border-color: var(--gold);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px var(--shadow);
        }

        .matching-card.selected {
            background: var(--gold-pale);
            border-color: var(--gold);
        }

        .matching-card.matched {
            background: #e8f5e8;
            border-color: #7fa87f;
            cursor: default;
            opacity: 0.6;
        }

        .matching-card.wrong {
            background: #ffe8e8;
            border-color: var(--crimson);
            animation: shake 0.4s;
        }

        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-10px); }
            75% { transform: translateX(10px); }
        }

        .fillblank-option {
            padding: 0.75rem 1.5rem;
            background: var(--cream);
            border: 2px solid var(--whisper);
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 1rem;
            color: var(--navy);
        }

        .fillblank-option:hover {
            border-color: var(--gold);
            background: var(--gold-pale);
        }

        .fillblank-option.correct {
            background: #e8f5e8;
            border-color: #7fa87f;
            cursor: default;
        }

        .fillblank-option.incorrect {
            background: #ffe8e8;
            border-color: var(--crimson);
            animation: shake 0.4s;
        }

        .game-result {
            margin-top: 1.5rem;
            min-height: 100px;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }

        .game-word {
            font-family: 'Cormorant Garamond', serif;
            font-size: 2rem;
            color: var(--navy);
            margin-bottom: 0.5rem;
        }

        .game-prompt {
            font-size: 0.95rem;
            color: var(--text-soft);
            font-style: italic;
        }

        /* Resource cards */
        .resource-grid {
            display: grid;
            gap: 1rem;
        }

        .resource-card {
            background: var(--cream);
            padding: 1.5rem;
            border-radius: 2px;
            box-shadow: 0 2px 8px var(--shadow);
            border-left: 3px solid var(--crimson);
            display: flex;
            justify-content: space-between;
            align-items: start;
            gap: 1rem;
        }

        .resource-info {
            flex: 1;
        }

        .resource-type {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--gold);
            margin-bottom: 0.5rem;
        }

        .resource-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.25rem;
            color: var(--navy);
            margin-bottom: 0.25rem;
        }

        .resource-link {
            font-size: 0.85rem;
            color: var(--text-soft);
            word-break: break-all;
            text-decoration: none;
            display: block;
            margin-bottom: 0.5rem;
        }

        .resource-link:hover {
            color: var(--crimson);
            text-decoration: underline;
        }

        .resource-note {
            margin-top: 0.5rem;
            font-size: 0.9rem;
            color: var(--text);
            font-style: italic;
        }

        .resource-status {
            font-size: 0.8rem;
            color: var(--text-soft);
            margin-top: 0.5rem;
        }

        /* PDF Save Button */
        .pdf-save-btn {
            position: fixed;
            bottom: 2rem;
            left: 2rem;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: var(--crimson);
            color: white;
            border: none;
            box-shadow: 0 4px 12px var(--shadow-strong);
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100;
        }

        .pdf-save-btn:hover {
            background: var(--crimson-soft);
            transform: translateY(-2px);
            box-shadow: 0 6px 16px var(--shadow-strong);
        }

        .pdf-save-btn svg {
            width: 24px;
            height: 24px;
        }
        
        /* Stack export buttons vertically */
        #save-words-csv {
            bottom: 6.5rem !important;
            left: 2rem !important;
            right: auto !important;
            background: var(--navy);
        }
        
        #save-words-csv:hover {
            background: var(--navy-soft);
        }
        
        #bulk-import-btn {
            bottom: 11rem !important;
            left: 2rem !important;
            right: auto !important;
            background: var(--gold);
        }
        
        #bulk-import-btn:hover {
            background: var(--gold-pale);
            color: var(--text);
        }

        /* Transcript/Lyrics Button */
        .transcript-btn {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: var(--gold-pale);
            color: var(--navy);
            border: none;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .transcript-btn:hover {
            background: var(--gold);
            transform: scale(1.05);
        }

        .transcript-btn svg {
            width: 20px;
            height: 20px;
        }

        .resource-actions {
            display: flex;
            gap: 0.5rem;
            align-items: center;
        }

        /* Speaking recordings */
        .recording-card {
            background: var(--cream);
            padding: 1.5rem;
            border-radius: 2px;
            box-shadow: 0 2px 8px var(--shadow);
            border-left: 3px solid var(--gold);
            margin-bottom: 1rem;
        }

        .recording-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 1rem;
        }

        .recording-date {
            font-size: 0.8rem;
            color: var(--text-soft);
        }

        .recording-transcript {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.25rem;
            color: var(--navy);
            margin-bottom: 0.75rem;
            font-style: italic;
        }

        .recording-note {
            font-size: 0.9rem;
            color: var(--text);
            padding: 1rem;
            background: var(--whisper);
            border-left: 2px solid var(--gold-pale);
        }

        /* Transcript Cards */
        .transcript-card {
            background: var(--cream);
            padding: 2rem;
            border-radius: 2px;
            box-shadow: 0 2px 8px var(--shadow);
            border-left: 3px solid var(--crimson);
            margin-bottom: 1.5rem;
        }

        body.dark-mode .transcript-card {
            background: rgba(22, 27, 34, 0.8);
            border-left-color: var(--crimson);
        }

        .transcript-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
        }

        .transcript-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.5rem;
            color: var(--navy);
            font-weight: 500;
        }

        .transcript-body {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.2rem;
            line-height: 1.8;
            color: var(--text);
            max-height: none; /* Show full content by default */
            overflow-y: auto;
            transition: max-height 0.3s ease, padding 0.3s ease, opacity 0.3s ease;
        }
        
        .transcript-body.folded {
            max-height: 0;
            padding: 0;
            opacity: 0;
            overflow: hidden;
        }

        .clickable-word {
            cursor: pointer;
            transition: all 0.2s;
            border-bottom: 1px dotted transparent;
            padding: 0 2px;
        }

        .clickable-word:hover {
            background: var(--gold-pale);
            border-bottom-color: var(--gold);
            color: var(--navy);
        }
        
        .chevron-icon {
            transition: transform 0.3s ease;
        }
        
        #transcript-chevron {
            transition: transform 0.3s ease;
        }

        body.dark-mode .clickable-word:hover {
            background: rgba(244, 213, 141, 0.2);
            border-bottom-color: var(--gold);
        }

        .lookup-info {
            padding: 1rem 0;
        }

        .lookup-lemma {
            font-size: 1rem;
            color: var(--text-soft);
            margin-bottom: 0.5rem;
        }

        .lookup-ipa {
            font-family: 'Courier New', monospace;
            font-size: 1.1rem;
            color: var(--gold);
            margin-bottom: 1rem;
        }

        .lookup-translations {
            list-style: none;
            padding: 0;
        }

        .lookup-translations li {
            padding: 0.5rem 0;
            border-bottom: 1px solid var(--whisper);
        }

        .lookup-translations li:last-child {
            border-bottom: none;
        }

        .lookup-sentence {
            margin-top: 1rem;
            padding: 1rem;
            background: var(--whisper);
            border-left: 3px solid var(--gold);
            font-style: italic;
            color: var(--text-soft);
        }

        /* Notes section */
        #notes-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 1.5rem;
        }

        .note-card {
            background: var(--cream);
            padding: 1.5rem;
            border-radius: 2px;
            box-shadow: 0 2px 8px var(--shadow);
            display: flex;
            flex-direction: column;
            gap: 1rem;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .note-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px var(--shadow-strong);
        }

        .note-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .note-category {
            padding: 0.35rem 0.75rem;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 500;
            border-radius: 2px;
        }

        .note-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.4rem;
            font-weight: 500;
            color: var(--navy);
            line-height: 1.3;
        }

        .note-content {
            font-size: 0.95rem;
            color: var(--text);
            line-height: 1.6;
        }

        .note-link {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            font-size: 0.85rem;
            color: var(--gold);
            text-decoration: none;
            transition: color 0.2s;
        }

        .note-link:hover {
            color: var(--crimson);
        }

        .note-date {
            font-size: 0.75rem;
            color: var(--text-soft);
            margin-top: auto;
            padding-top: 1rem;
            border-top: 1px solid var(--whisper);
        }

        /* Writings archive */
        .writing-card {
            background: var(--cream);
            padding: 2rem;
            border-radius: 2px;
            box-shadow: 0 2px 8px var(--shadow);
            border-left: 3px solid var(--navy);
            margin-bottom: 1rem;
        }

        .writing-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--whisper);
        }

        .writing-date {
            font-size: 0.8rem;
            color: var(--text-soft);
        }

        .writing-text {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.15rem;
            line-height: 1.9;
            color: var(--text);
            white-space: pre-wrap;
        }

        /* Modal */
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(27, 43, 58, 0.5);
            z-index: 200;
            backdrop-filter: blur(4px);
        }

        .modal.active {
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .modal-content {
            background: var(--cream);
            padding: 3rem;
            border-radius: 2px;
            max-width: 600px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px var(--shadow-strong);
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
            border-bottom: 1px solid var(--whisper);
            padding-bottom: 1rem;
        }

        .modal-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.75rem;
            color: var(--navy);
        }

        .close-btn {
            background: transparent;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: var(--text-soft);
            transition: color 0.2s;
        }

        .close-btn:hover {
            color: var(--crimson);
        }

        .form-group {
            margin-bottom: 1.5rem;
        }

        .form-label {
            display: block;
            font-size: 0.9rem;
            color: var(--text);
            margin-bottom: 0.5rem;
        }

        .form-input,
        .form-textarea,
        .form-select {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid #DDD;
            border-radius: 2px;
            font-family: 'Work Sans', sans-serif;
            font-size: 0.95rem;
            transition: border-color 0.2s;
        }

        .form-input:focus,
        .form-textarea:focus,
        .form-select:focus {
            outline: none;
            border-color: var(--gold);
        }

        .form-textarea {
            min-height: 100px;
            resize: vertical;
        }

        .form-actions {
            display: flex;
            gap: 1rem;
            justify-content: flex-end;
            margin-top: 2rem;
        }

        .image-upload-area {
            border: 2px dashed #DDD;
            border-radius: 2px;
            padding: 2rem;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s;
        }

        .image-upload-area:hover {
            border-color: var(--gold);
            background: var(--whisper);
        }

        .image-preview {
            max-width: 100%;
            max-height: 300px;
            margin-top: 1rem;
            border-radius: 2px;
        }

        /* Category Grid */
        .category-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
            margin-bottom: 1.5rem;
        }

        /* Writing area */
        .writing-container {
            background: var(--cream);
            padding: 3rem;
            border-radius: 2px;
            box-shadow: 0 4px 24px var(--shadow);
            margin-bottom: 2rem;
        }

        .writing-area {
            width: 100%;
            min-height: 400px;
            padding: 2rem;
            border: 1px solid #EEE;
            border-radius: 2px;
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.25rem;
            line-height: 2;
            color: var(--text);
            background: var(--cream);
            resize: vertical;
        }

        .writing-area:focus {
            outline: none;
            border-color: var(--gold);
        }

        body.dark-mode .writing-area {
            background: rgba(22, 27, 34, 0.6);
            border-color: rgba(232, 220, 200, 0.2);
        }

        body.dark-mode .writing-area:focus {
            border-color: var(--gold);
        }

        .writing-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 1.5rem;
        }

        .word-count {
            font-size: 0.9rem;
            color: var(--text-soft);
            cursor: pointer;
            user-select: none;
            transition: color 0.2s;
        }

        .word-count:hover {
            color: var(--crimson);
        }

        .word-count-container {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
        }

        .word-goal {
            font-size: 0.75rem;
            color: var(--gold);
            font-weight: 500;
        }

        .writing-actions {
            display: flex;
            gap: 0.75rem;
            flex-wrap: wrap;
        }

        /* Mistake marking styles */
        .mistake-mark {
            background: linear-gradient(to bottom, transparent 0%, transparent 60%, rgba(190, 31, 46, 0.3) 60%, rgba(190, 31, 46, 0.3) 100%);
            text-decoration: underline wavy var(--crimson);
            text-decoration-thickness: 2px;
            text-underline-offset: 2px;
            cursor: pointer;
            position: relative;
        }

        body.dark-mode .mistake-mark {
            background: linear-gradient(to bottom, transparent 0%, transparent 60%, rgba(139, 70, 84, 0.4) 60%, rgba(139, 70, 84, 0.4) 100%);
        }

        .marking-mode-active .writing-area {
            cursor: text;
            user-select: text;
        }

        .mistake-tooltip {
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            background: var(--crimson);
            color: white;
            padding: 0.5rem 0.75rem;
            border-radius: 4px;
            font-size: 0.85rem;
            white-space: nowrap;
            margin-bottom: 0.5rem;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
            z-index: 1000;
        }

        .mistake-mark:hover .mistake-tooltip {
            opacity: 1;
        }

        .mistake-tooltip::after {
            content: '';
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            border: 6px solid transparent;
            border-top-color: var(--crimson);
        }

        /* Writing prompts section */
        .writing-prompts-section {
            background: linear-gradient(135deg, var(--whisper), rgba(232, 220, 200, 0.4));
            padding: 1.5rem;
            border-radius: 2px;
            margin-bottom: 2rem;
            border: 1px solid rgba(232, 220, 200, 0.5);
        }

        body.dark-mode .writing-prompts-section {
            background: linear-gradient(135deg, rgba(22, 27, 34, 0.8), rgba(139, 70, 84, 0.1));
            border-color: rgba(232, 220, 200, 0.2);
        }

        .prompt-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
            gap: 1rem;
        }

        .prompt-label {
            font-size: 0.85rem;
            color: var(--text-soft);
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .prompt-link {
            font-size: 0.85rem;
            color: var(--crimson);
            text-decoration: none;
            transition: opacity 0.2s;
        }

        .prompt-link:hover {
            opacity: 0.7;
        }

        .current-prompt {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.1rem;
            color: var(--text);
            font-style: italic;
            line-height: 1.6;
        }

        /* Title row with dice button */
        .title-row {
            display: flex;
            gap: 0.75rem;
            margin-bottom: 1.5rem;
            align-items: center;
        }

        .writing-title {
            flex: 1;
            padding: 0.875rem 1.25rem;
            border: 1px solid #EEE;
            border-radius: 2px;
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.5rem;
            color: var(--text);
            background: var(--cream);
            transition: border-color 0.2s;
        }

        .writing-title:focus {
            outline: none;
            border-color: var(--gold);
        }

        .writing-title::placeholder {
            color: var(--text-soft);
            font-style: italic;
        }

        body.dark-mode .writing-title {
            background: rgba(22, 27, 34, 0.6);
            border-color: rgba(232, 220, 200, 0.2);
        }

        .dice-btn {
            width: 36px;
            height: 36px;
            border: 1px solid var(--gold);
            background: var(--cream);
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--crimson);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            flex-shrink: 0;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .dice-btn:hover {
            background: var(--gold);
            color: var(--cream);
            transform: rotate(360deg) scale(1.05);
            box-shadow: 0 4px 8px rgba(190, 31, 46, 0.15);
        }

        .dice-btn svg {
            width: 18px;
            height: 18px;
        }

        body.dark-mode .dice-btn {
            background: rgba(22, 27, 34, 0.6);
            border-color: var(--gold);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        body.dark-mode .dice-btn:hover {
            background: var(--gold);
            color: var(--text);
            box-shadow: 0 4px 8px rgba(212, 175, 55, 0.25);
        }

        /* Archive header */
        .archive-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid rgba(232, 220, 200, 0.3);
        }

        .btn-sm {
            padding: 0.5rem 1rem;
            font-size: 0.875rem;
        }

        /* Collapsible writing cards */
        .writing-card {
            background: var(--cream);
            border: 1px solid rgba(232, 220, 200, 0.5);
            border-radius: 2px;
            margin-bottom: 1rem;
            overflow: hidden;
            transition: all 0.2s;
        }

        .writing-card:hover {
            box-shadow: 0 2px 12px var(--shadow);
        }

        .writing-card-header {
            padding: 1.25rem 1.5rem;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 1rem;
            user-select: none;
        }

        .writing-card-header:hover {
            background: rgba(232, 220, 200, 0.3);
        }

        .writing-card-title-area {
            flex: 1;
            min-width: 0;
        }

        .writing-card-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.25rem;
            font-weight: 600;
            color: var(--text);
            margin-bottom: 0.25rem;
        }

        .writing-card-date {
            font-size: 0.85rem;
            color: var(--text-soft);
        }

        .writing-card-preview {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1rem;
            color: var(--text-soft);
            margin-top: 0.5rem;
            line-height: 1.6;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .writing-card-toggle {
            width: 32px;
            height: 32px;
            border: none;
            background: transparent;
            color: var(--text-soft);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.3s, color 0.2s;
            flex-shrink: 0;
        }

        .writing-card-toggle:hover {
            color: var(--crimson);
        }

        .writing-card-toggle.expanded {
            transform: rotate(180deg);
        }

        .writing-card-toggle svg {
            width: 20px;
            height: 20px;
        }

        .writing-card-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
        }

        .writing-card-content.expanded {
            max-height: 2000px;
        }

        .writing-card-body {
            padding: 0 1.5rem 1.5rem 1.5rem;
        }

        .writing-card-text {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.1rem;
            line-height: 2;
            color: var(--text);
            white-space: pre-wrap;
            word-wrap: break-word;
            margin-bottom: 1.25rem;
        }

        .writing-card-actions {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
            padding-top: 1rem;
            border-top: 1px solid rgba(232, 220, 200, 0.3);
        }

        body.dark-mode .writing-card {
            background: rgba(22, 27, 34, 0.6);
            border-color: rgba(232, 220, 200, 0.2);
        }

        body.dark-mode .writing-card-header:hover {
            background: rgba(232, 220, 200, 0.05);
        }

        /* AI selector */
        .ai-selector {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 0.75rem;
            margin-top: 0.5rem;
        }

        .ai-option {
            padding: 0.875rem 1rem;
            border: 2px solid rgba(232, 220, 200, 0.3);
            background: var(--cream);
            border-radius: 2px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            font-weight: 500;
            color: var(--text-soft);
            transition: all 0.2s;
        }

        .ai-option:hover {
            border-color: var(--gold);
            color: var(--text);
        }

        .ai-option.active {
            border-color: var(--crimson);
            background: rgba(139, 70, 84, 0.1);
            color: var(--crimson);
        }

        body.dark-mode .ai-option {
            background: rgba(22, 27, 34, 0.6);
            border-color: rgba(232, 220, 200, 0.2);
        }

        body.dark-mode .ai-option.active {
            background: rgba(139, 70, 84, 0.2);
        }

        .ai-result-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
        }

        .ai-result-text {
            background: var(--whisper);
            padding: 1.25rem;
            border-radius: 2px;
            border-left: 3px solid var(--gold);
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.05rem;
            line-height: 1.8;
            color: var(--text);
            white-space: pre-wrap;
        }

        body.dark-mode .ai-result-text {
            background: rgba(22, 27, 34, 0.8);
        }

        .ai-disclaimer {
            margin-top: 1rem;
            padding: 0.875rem;
            background: rgba(232, 220, 200, 0.3);
            border-radius: 2px;
            font-size: 0.85rem;
            color: var(--text-soft);
            line-height: 1.5;
        }

        body.dark-mode .ai-disclaimer {
            background: rgba(232, 220, 200, 0.05);
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
            .writing-container {
                padding: 1.5rem;
            }

            .writing-title {
                font-size: 1.25rem;
            }

            .writing-area {
                font-size: 1.1rem;
                padding: 1.25rem;
            }

            .dice-btn {
                width: 44px;
                height: 44px;
            }

            .ai-selector {
                grid-template-columns: 1fr;
            }

            .writing-actions {
                width: 100%;
            }

            .writing-actions button {
                flex: 1;
            }

            .archive-header {
                flex-direction: column;
                gap: 1rem;
                align-items: stretch;
            }

            .archive-header h3 {
                text-align: center;
            }
        }

        /* Speaking section */
        #spoken-text {
            margin-top: 1.5rem;
            min-height: 60px;
            padding: 1rem;
            background: var(--whisper);
            border-left: 2px solid var(--gold);
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.25rem;
        }

        .speaking-controls {
            display: flex;
            gap: 1rem;
            margin-top: 1rem;
        }

        /* Practice Stats */
        .practice-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .stat-card {
            background: var(--cream);
            padding: 1.5rem;
            border-radius: 2px;
            border-left: 3px solid var(--gold);
            text-align: center;
        }

        .stat-number {
            font-family: 'Cormorant Garamond', serif;
            font-size: 2.5rem;
            font-weight: 500;
            color: var(--crimson);
            margin-bottom: 0.25rem;
        }

        .stat-label {
            font-size: 0.8rem;
            color: var(--text-soft);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .speaking-controls {
            display: flex;
            gap: 1rem;
            margin-top: 1rem;
        }

        /* Tabs */
        .tabs {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 2rem;
            border-bottom: 1px solid var(--whisper);
        }

        .tab {
            padding: 0.75rem 1.5rem;
            border: none;
            background: transparent;
            font-family: 'Work Sans', sans-serif;
            font-size: 0.9rem;
            cursor: pointer;
            color: var(--text-soft);
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
        }

        .tab:hover {
            color: var(--navy);
        }

        .tab.active {
            color: var(--navy);
            border-bottom-color: var(--crimson);
        }

        .tab-content {
            display: none;
        }

        /* Filter Bar */
        .filter-bar {
            display: flex;
            flex-wrap: wrap;
            gap: 0.75rem;
            padding: 1.75rem;
            background: var(--cream);
            border-radius: 16px;
            margin-bottom: 2rem;
            box-shadow: 0 2px 12px var(--shadow);
            border: 1px solid rgba(201, 168, 97, 0.2);
        }

        .filter-tag {
            padding: 0.65rem 1.5rem;
            border: 2px solid var(--whisper);
            background: var(--cream);
            font-family: 'Work Sans', sans-serif;
            font-size: 0.9rem;
            font-weight: 500;
            color: var(--text);
            cursor: pointer;
            border-radius: 24px;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
        }

        .filter-tag:hover {
            transform: translateY(-2px);
            border-color: var(--gold);
            background: var(--gold-pale);
            box-shadow: 0 4px 12px rgba(201, 168, 97, 0.2);
        }

        .filter-tag.active {
            background: var(--crimson);
            color: white;
            border-color: var(--crimson);
            box-shadow: 0 4px 16px rgba(139, 38, 53, 0.3);
            transform: translateY(-1px);
        }

        .filter-tag.active::after {
            content: '✓';
            margin-left: 0.5rem;
            font-weight: 700;
        }

        /* Question Section (Parler) */
        .question-section {
            background: var(--cream);
            padding: 2rem;
            border-radius: 16px;
            box-shadow: 0 2px 12px var(--shadow);
            margin-bottom: 2rem;
            border: 1px solid rgba(201, 168, 97, 0.2);
        }

        .question-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            margin-bottom: 1.25rem;
            padding-bottom: 0.75rem;
            border-bottom: 1px solid var(--whisper);
        }

        .question-title {
            font-family: 'Work Sans', sans-serif;
            font-size: 0.75rem;
            font-weight: 600;
            color: var(--gold);
            margin: 0;
            letter-spacing: 0.15em;
            text-transform: uppercase;
        }

        .doc-link {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.5rem 1rem;
            background: var(--whisper);
            color: var(--navy);
            text-decoration: none;
            border-radius: 8px;
            font-family: 'Work Sans', sans-serif;
            font-size: 0.8rem;
            font-weight: 500;
            transition: all 0.2s ease;
            border: 1px solid transparent;
        }

        .doc-link:hover {
            background: var(--gold-pale);
            border-color: var(--gold);
            color: var(--crimson);
        }

        .doc-link svg {
            width: 14px;
            height: 14px;
            opacity: 0.7;
        }

        .question-input {
            font-size: 1.15rem !important;
            font-family: 'Cormorant Garamond', serif !important;
            font-weight: 400;
            color: var(--navy) !important;
            padding: 1rem 1.25rem !important;
            border-radius: 12px !important;
            border: 2px solid var(--whisper) !important;
            background: var(--cream) !important;
            transition: all 0.3s ease !important;
        }

        .question-input:focus {
            border-color: var(--gold) !important;
            background: white !important;
            box-shadow: 0 0 0 4px rgba(201, 168, 97, 0.1) !important;
            outline: none !important;
        }

        .question-input::placeholder {
            font-family: 'Work Sans', sans-serif;
            font-size: 0.95rem;
            font-style: italic;
            color: var(--text-soft);
            opacity: 0.6;
        }

        /* Beautiful Speak Button */
        .btn-speak {
            display: inline-flex;
            align-items: center;
            gap: 0.65rem;
            padding: 0.85rem 1.75rem;
            background: var(--cream);
            color: var(--crimson);
            border: 2px solid var(--gold-pale);
            border-radius: 24px;
            font-family: 'Work Sans', sans-serif;
            font-size: 0.95rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px var(--shadow);
            margin-bottom: 1.5rem;
        }

        .mic-icon {
            width: 18px;
            height: 18px;
            flex-shrink: 0;
        }

        .btn-speak:hover {
            background: var(--gold-pale);
            border-color: var(--gold);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(201, 168, 97, 0.3);
        }

        .btn-speak:active {
            transform: translateY(0);
        }

        .btn-speak.btn-danger {
            background: var(--crimson);
            color: white;
            border-color: var(--crimson);
        }

        .tab-content.active {
            display: block;
        }

        /* SVG Icons */
        .svg-icon {
            width: 20px;
            height: 20px;
            fill: currentColor;
            display: inline-block;
            vertical-align: middle;
        }

        .svg-icon-lg {
            width: 48px;
            height: 48px;
            fill: currentColor;
        }

        /* Heart Note */
        .heart-note {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0.9);
            background: var(--cream);
            padding: 2.5rem;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(139, 38, 53, 0.2);
            z-index: 10000;
            max-width: 320px;
            text-align: center;
            border-top: 4px solid var(--rosy);
            animation: heartNoteIn 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
            display: none;
        }

        @keyframes heartNoteIn {
            from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
            to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }

        /* HEATMAP CALENDAR */
        .heatmap-container {
            background: var(--cream);
            padding: 2rem;
            border-radius: 16px;
            box-shadow: 0 4px 16px var(--shadow);
            margin-bottom: 2rem;
        }

        .heatmap-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.5rem;
            color: var(--navy);
            margin-bottom: 1.5rem;
            font-weight: 500;
        }

        .heatmap-grid {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 4px;
            max-width: 600px;
        }

        .heatmap-day {
            aspect-ratio: 1;
            background: var(--whisper);
            border-radius: 4px;
            position: relative;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .heatmap-day:hover {
            transform: scale(1.15);
            z-index: 10;
            box-shadow: 0 2px 8px var(--shadow);
        }

        .heatmap-day[data-count="1"] { background: #fef3e8; }
        .heatmap-day[data-count="2"] { background: #fde8d0; }
        .heatmap-day[data-count="3"] { background: #f9d3ab; }
        .heatmap-day[data-count="4"] { background: #f4be86; }
        .heatmap-day[data-count="5"] { background: #efa961; }
        .heatmap-day[data-count="6"] { background: #e89442; }
        .heatmap-day[data-count="7"] { background: #df7f29; }
        .heatmap-day[data-count="8"] { background: #d46a16; }
        .heatmap-day[data-count="9"] { background: #c85a0c; }
        .heatmap-day[data-count="10"] { background: #b84d06; border: 2px solid var(--crimson); }

        .heatmap-tooltip {
            position: absolute;
            bottom: calc(100% + 8px);
            left: 50%;
            transform: translateX(-50%);
            background: var(--navy);
            color: white;
            padding: 0.5rem 0.75rem;
            border-radius: 6px;
            font-size: 0.75rem;
            white-space: nowrap;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
            z-index: 1000;
        }

        .heatmap-day:hover .heatmap-tooltip {
            opacity: 1;
        }

        .heatmap-legend {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-top: 1rem;
            font-size: 0.85rem;
            color: var(--text-soft);
        }

        .heatmap-legend-item {
            width: 14px;
            height: 14px;
            border-radius: 3px;
        }

        /* PRESENCE CALENDAR - MULTI MONTH */
        .calendar-navigation {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 1.5rem;
            gap: 1rem;
        }

        .calendar-nav-btn {
            background: var(--cream-dark);
            border: none;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.3s ease;
            color: var(--navy);
        }

        .calendar-nav-btn:hover {
            background: var(--sage);
            color: white;
            transform: scale(1.05);
        }

        .calendar-nav-btn svg {
            width: 24px;
            height: 24px;
        }

        .calendar-month-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.35rem;
            font-weight: 500;
            color: var(--navy);
            text-align: center;
            flex: 1;
        }

        #presence-calendar-months {
            max-width: 100%;
        }

        .calendar-month {
            background: var(--whisper);
            padding: 1.5rem;
            border-radius: 12px;
            border: 1px solid var(--cream-dark);
        }

        .calendar-month-header {
            text-align: center;
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.25rem;
            font-weight: 500;
            color: var(--navy);
            margin-bottom: 1rem;
        }

        .calendar-weekdays {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 6px;
            margin-bottom: 6px;
        }

        .calendar-weekday {
            text-align: center;
            font-size: 0.7rem;
            color: var(--text-soft);
            font-weight: 500;
            padding: 0.35rem 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .calendar-grid {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            grid-auto-rows: minmax(0, auto);
            gap: 6px;
        }

        /* PRESENCE CALENDAR - DAY STYLES */
        #presence-calendar-container {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 8px;
            max-width: 600px;
            margin: 0 auto;
        }

        .calendar-day-header {
            text-align: center;
            font-size: 0.75rem;
            color: var(--text-soft);
            font-weight: 500;
            padding: 0.5rem 0;
        }

        .calendar-day {
            aspect-ratio: 1;
            background: var(--whisper);
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
            border: 2px solid transparent;
        }

        .calendar-day:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .calendar-day.today {
            border: 2px solid var(--crimson);
        }

        .calendar-day.active {
            background: linear-gradient(135deg, #fef3e8 0%, #fde8d0 100%);
        }

        .calendar-day.active-1 {
            background: linear-gradient(135deg, #fff5f5 0%, #ffe8e8 100%);
            box-shadow: 0 0 8px rgba(255, 136, 136, 0.15);
        }

        .calendar-day.active-2 {
            background: linear-gradient(135deg, #ffd4d4 0%, #ffbaba 100%);
            box-shadow: 0 0 12px rgba(255, 136, 136, 0.25);
        }

        .calendar-day.active-3 {
            background: linear-gradient(135deg, #ffbaba 0%, #ff9999 100%);
            box-shadow: 0 0 16px rgba(255, 119, 119, 0.35);
        }

        .calendar-day.active-4 {
            background: linear-gradient(135deg, #ff9999 0%, #ff7777 100%);
            box-shadow: 0 0 20px rgba(255, 119, 119, 0.45);
        }

        .calendar-day.active-5 {
            background: linear-gradient(135deg, #ff7777 0%, #ff5555 100%);
            box-shadow: 0 0 24px rgba(255, 85, 85, 0.5);
            animation: rosyGlow 3s ease-in-out infinite;
        }

        @keyframes rosyGlow {
            0%, 100% { box-shadow: 0 0 20px rgba(255, 85, 85, 0.4); }
            50% { box-shadow: 0 0 30px rgba(255, 85, 85, 0.6); }
        }

        .calendar-day-number {
            font-size: 0.9rem;
            font-weight: 500;
            color: var(--navy);
            margin-bottom: 0.25rem;
        }

        .calendar-day-icons {
            display: flex;
            gap: 2px;
            flex-wrap: wrap;
            justify-content: center;
            max-width: 100%;
        }

        .calendar-action-icon {
            width: 14px;
            height: 14px;
        }

        .calendar-action-icon svg {
            width: 100%;
            height: 100%;
            fill: var(--navy);
            opacity: 0.7;
        }

        .action-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            padding: 0.4rem 0.85rem;
            background: var(--cream-dark);
            border-radius: 20px;
            font-size: 0.85rem;
            color: var(--navy);
            transition: all 0.3s ease;
        }

        .action-badge svg {
            width: 16px;
            height: 16px;
            fill: var(--navy);
        }

        .action-badge.active {
            background: linear-gradient(135deg, #ff9999 0%, #ff7777 100%);
            color: white;
            box-shadow: 0 2px 8px rgba(255, 119, 119, 0.3);
        }

        .action-badge.active svg {
            fill: white;
        }

        /* INTERACTIVE READING */
        .reading-passage-card {
            background: white;
            border-radius: 16px;
            padding: 2rem;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
            margin-bottom: 2rem;
            border: 1px solid var(--whisper);
            transition: all 0.3s ease;
        }

        .reading-passage-card:hover {
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }

        .reading-passage-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 1.5rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--whisper);
        }

        .reading-passage-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.4rem;
            color: var(--navy);
            margin-bottom: 0.5rem;
        }

        .reading-passage-meta {
            font-size: 0.85rem;
            color: var(--text-soft);
        }

        .reading-passage-stats {
            display: flex;
            gap: 1.5rem;
            font-size: 0.85rem;
        }

        .reading-stat {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.25rem;
        }

        .reading-stat-value {
            font-size: 1.5rem;
            font-weight: 500;
            color: var(--crimson);
        }

        .reading-stat-label {
            color: var(--text-soft);
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .reading-passage-text {
            font-size: 1.1rem;
            line-height: 1.9;
            color: var(--text);
            user-select: none;
            cursor: text;
        }

        .reading-passage-text .word {
            cursor: pointer;
            padding: 2px 0;
            border-radius: 3px;
            transition: all 0.2s ease;
            display: inline-block;
        }

        .reading-passage-text .word:hover {
            background: rgba(255, 215, 0, 0.2);
        }

        .reading-passage-text .word.unknown {
            background: rgba(255, 215, 0, 0.3);
            border-bottom: 2px solid #FFD700;
        }

        .reading-passage-text .word.known {
            background: rgba(144, 238, 144, 0.2);
        }

        /* Dark mode for reading passages */
        body.dark-mode .reading-passage-card {
            background: var(--dark-card);
            border-color: rgba(255, 255, 255, 0.1);
        }

        body.dark-mode .reading-passage-card:hover {
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        body.dark-mode .reading-passage-title {
            color: var(--dark-text);
        }

        body.dark-mode .reading-passage-meta {
            color: var(--dark-text-soft);
        }

        body.dark-mode .reading-passage-text {
            color: var(--dark-text);
        }

        body.dark-mode .reading-passage-text .word:hover {
            background: rgba(255, 215, 0, 0.3);
        }

        body.dark-mode .reading-passage-text .word.unknown {
            background: rgba(255, 215, 0, 0.4);
            border-bottom-color: #FFD700;
        }

        body.dark-mode .reading-passage-text .word.known {
            background: rgba(144, 238, 144, 0.25);
        }

        .reading-passage-content {
            transition: all 0.3s ease;
        }

        /* Multi-word selection mode */
        .selection-mode-active .reading-passage-text {
            user-select: text;
        }

        .selection-mode-active .reading-passage-text .word {
            cursor: text;
        }

        .selection-mode-toolbar {
            position: fixed;
            bottom: 2rem;
            left: 50%;
            transform: translateX(-50%);
            background: var(--navy);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 50px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            display: flex;
            gap: 1rem;
            align-items: center;
            z-index: 1000;
            animation: slideUp 0.3s ease;
        }

        body.dark-mode .selection-mode-toolbar {
            background: var(--crimson);
        }

        @keyframes slideUp {
            from {
                transform: translateX(-50%) translateY(100px);
                opacity: 0;
            }
            to {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
            }
        }

        .selection-mode-toolbar button {
            background: white;
            color: var(--navy);
            border: none;
            padding: 0.5rem 1.5rem;
            border-radius: 25px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        body.dark-mode .selection-mode-toolbar button {
            background: white;
            color: var(--crimson);
        }

        .selection-mode-toolbar button:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .word-popup {
            position: fixed;
            background: white;
            border: 2px solid var(--crimson);
            border-radius: 12px;
            padding: 1rem 1.25rem;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            min-width: 200px;
            animation: popIn 0.2s ease-out;
        }

        @keyframes popIn {
            from {
                opacity: 0;
                transform: scale(0.9) translateY(-10px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }

        .word-popup-word {
            font-size: 1.2rem;
            font-weight: 500;
            color: var(--navy);
            margin-bottom: 0.75rem;
        }

        .word-popup-actions {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .word-popup-btn {
            padding: 0.6rem 1rem;
            border: none;
            border-radius: 8px;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.2s;
            font-family: 'Work Sans', sans-serif;
        }

        .word-popup-btn.primary {
            background: var(--crimson);
            color: white;
        }

        .word-popup-btn.primary:hover {
            background: #b71c1c;
            transform: translateY(-1px);
        }

        .word-popup-btn.secondary {
            background: var(--cream-dark);
            color: var(--navy);
        }

        .word-popup-btn.secondary:hover {
            background: #e0ddd5;
        }

        .reading-progress-bar {
            margin-top: 1.5rem;
            padding-top: 1.5rem;
            border-top: 1px solid var(--whisper);
        }

        .reading-progress-label {
            font-size: 0.85rem;
            color: var(--text-soft);
            margin-bottom: 0.5rem;
        }

        .reading-progress-track {
            height: 8px;
            background: var(--whisper);
            border-radius: 4px;
            overflow: hidden;
        }

        .reading-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #ff9999, #ff7777);
            border-radius: 4px;
            transition: width 0.3s ease;
        }

        /* GROWTH TREE VISUALIZATION */
        .growth-tree-container {
            background: linear-gradient(180deg, #fdfcfb 0%, #f7f6f4 100%);
            padding: 3rem 2rem 2.5rem;
            border-radius: 24px;
            box-shadow: 0 2px 24px rgba(0, 0, 0, 0.04);
            margin-bottom: 2rem;
            position: relative;
            overflow: hidden;
            border: 1px solid rgba(168, 184, 168, 0.1);
        }

        .growth-tree-header {
            text-align: center;
            margin-bottom: 2.5rem;
            position: relative;
            z-index: 1;
        }

        .growth-tree-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.5rem;
            color: var(--navy);
            font-weight: 400;
            margin-bottom: 0.35rem;
            letter-spacing: 0.3px;
        }

        .growth-tree-subtitle {
            font-size: 0.875rem;
            color: var(--text-soft);
            font-weight: 300;
            letter-spacing: 0.2px;
        }

        .growth-tree-canvas {
            max-width: 320px;
            margin: 0 auto 2.5rem;
            position: relative;
            z-index: 1;
        }

        #tree-svg {
            width: 100%;
            height: auto;
            filter: drop-shadow(0 1px 3px rgba(0,0,0,0.04));
        }

        .growth-tree-stats {
            display: flex;
            justify-content: center;
            gap: 3rem;
            flex-wrap: wrap;
            position: relative;
            z-index: 1;
        }

        .growth-stat {
            text-align: center;
            min-width: 80px;
        }

        .growth-stat-icon {
            font-size: 1.5rem;
            margin-bottom: 0.5rem;
            opacity: 0.8;
        }

        .growth-stat-value {
            font-family: 'Cormorant Garamond', serif;
            font-size: 2.5rem;
            font-weight: 300;
            color: var(--navy);
            margin-bottom: 0.15rem;
            line-height: 1;
        }

        .growth-stat-label {
            font-size: 0.75rem;
            color: var(--text-soft);
            text-transform: lowercase;
            letter-spacing: 1px;
            font-weight: 300;
        }

        /* Tree SVG Elements - More refined */
        .tree-trunk {
            fill: #9d8b7a;
            transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .tree-branch {
            stroke: #9d8b7a;
            stroke-width: 2.5;
            fill: none;
            stroke-linecap: round;
            opacity: 0;
            animation: growBranch 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        @keyframes growBranch {
            from { 
                opacity: 0; 
                stroke-dasharray: 150; 
                stroke-dashoffset: 150; 
            }
            to { 
                opacity: 0.85; 
                stroke-dasharray: 150; 
                stroke-dashoffset: 0; 
            }
        }

        .tree-leaf {
            fill: #a8b89a;
            opacity: 0;
            animation: leafAppear 1.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
            transform-origin: center;
        }

        @keyframes leafAppear {
            from { 
                opacity: 0; 
                transform: scale(0) rotate(-10deg); 
            }
            to { 
                opacity: 0.75; 
                transform: scale(1) rotate(0deg); 
            }
        }

        .tree-flower {
            opacity: 0;
            animation: flowerBloom 1.8s cubic-bezier(0.4, 0, 0.2, 1) forwards;
            transform-origin: center;
        }

        @keyframes flowerBloom {
            0% { 
                opacity: 0; 
                transform: scale(0) rotate(-15deg); 
            }
            70% { 
                transform: scale(1.08) rotate(2deg); 
            }
            100% { 
                opacity: 0.9; 
                transform: scale(1) rotate(0deg); 
            }
        }

        /* GARDEN VISUAL */
        .garden-visual {
            background: linear-gradient(to bottom, #e8f4f8 0%, #f5f9e8 100%);
            padding: 3rem 2rem;
            border-radius: 20px;
            box-shadow: 0 4px 16px var(--shadow);
            margin-bottom: 2rem;
            position: relative;
            overflow: hidden;
        }

        .garden-visual::before {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 30%;
            background: linear-gradient(to top, rgba(168, 184, 168, 0.2), transparent);
            pointer-events: none;
        }

        .garden-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.5rem;
            color: var(--navy);
            margin-bottom: 2rem;
            font-weight: 500;
            text-align: center;
        }

        .garden-flowers {
            display: flex;
            flex-wrap: wrap;
            gap: 1.5rem;
            justify-content: center;
            align-items: flex-end;
            min-height: 200px;
            position: relative;
            z-index: 1;
        }

        .flower {
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
            transition: transform 0.3s ease;
            animation: flowerGrow 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .flower:hover {
            transform: translateY(-8px);
        }

        @keyframes flowerGrow {
            from {
                opacity: 0;
                transform: translateY(20px) scale(0.5);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        .flower-bloom {
            width: 50px;
            height: 50px;
            position: relative;
            margin-bottom: 4px;
        }

        .flower-bloom.small { width: 35px; height: 35px; }
        .flower-bloom.medium { width: 50px; height: 50px; }
        .flower-bloom.large { width: 65px; height: 65px; }

        .flower-stem {
            width: 3px;
            background: linear-gradient(to bottom, #7fa87f, #a8b8a8);
            border-radius: 2px;
        }

        .flower-stem.small { height: 40px; }
        .flower-stem.medium { height: 60px; }
        .flower-stem.large { height: 80px; }

        .flower-label {
            margin-top: 0.5rem;
            font-size: 0.75rem;
            color: var(--navy);
            font-weight: 500;
            text-align: center;
            max-width: 80px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .garden-stats {
            text-align: center;
            margin-top: 2rem;
            padding-top: 2rem;
            border-top: 1px solid rgba(168, 184, 168, 0.3);
            font-size: 0.9rem;
            color: var(--text-soft);
        }

        /* MUSIC PLAYER MODAL */
        .music-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(27, 43, 58, 0.8);
            backdrop-filter: blur(8px);
            z-index: 10000;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 1rem;
            overflow-y: auto;
        }

        .music-modal.active {
            display: flex;
        }

        .music-modal-content {
            background: linear-gradient(135deg, var(--cream) 0%, white 100%);
            padding: 3rem;
            border-radius: 24px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 500px;
            width: 100%;
            position: relative;
            animation: modalSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            max-height: 90vh;
            overflow-y: auto;
            margin: auto;
        }

        @keyframes modalSlideIn {
            from {
                opacity: 0;
                transform: translateY(-30px) scale(0.95);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        .music-modal-close {
            position: absolute;
            top: 1rem;
            right: 1rem;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: var(--whisper);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            z-index: 10;
        }

        .music-modal-close:hover {
            background: var(--crimson);
            transform: rotate(90deg);
        }

        .music-modal-close:hover svg {
            stroke: white;
        }

        .music-modal-close svg {
            width: 24px;
            height: 24px;
        }

        .music-modal-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 2rem;
            color: var(--navy);
            margin-bottom: 0.5rem;
            font-weight: 500;
        }

        .music-modal-subtitle {
            font-size: 0.95rem;
            color: var(--text-soft);
            margin-bottom: 2.5rem;
            font-style: italic;
        }

        .music-player-card {
            background: var(--cream);
            padding: 2rem;
            border-radius: 16px;
            box-shadow: 0 4px 16px var(--shadow);
            margin-bottom: 1.5rem;
        }

        .music-album-art {
            width: 100%;
            height: 200px;
            background: linear-gradient(135deg, var(--gold-pale) 0%, var(--rosy) 100%);
            border-radius: 12px;
            margin-bottom: 1.5rem;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
        }

        .music-album-art svg {
            width: 80px;
            height: 80px;
            fill: white;
            opacity: 0.3;
        }

        .music-wave {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 40px;
            background: rgba(255, 255, 255, 0.2);
            animation: musicWave 2s ease-in-out infinite;
        }

        @keyframes musicWave {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
        }

        .music-now-playing {
            text-align: center;
            margin-bottom: 1.5rem;
        }

        .music-track-name {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.5rem;
            color: var(--navy);
            margin-bottom: 0.25rem;
            font-weight: 500;
        }

        .music-track-artist {
            font-size: 0.9rem;
            color: var(--text-soft);
        }

        .music-controls-main {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .music-play-btn {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--crimson) 0%, var(--crimson-soft) 100%);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            box-shadow: 0 4px 16px rgba(139, 38, 53, 0.3);
        }

        .music-play-btn:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 24px rgba(139, 38, 53, 0.4);
        }

        .music-play-btn svg {
            width: 28px;
            height: 28px;
            fill: white;
        }

        .music-volume-section {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1rem 0;
        }

        .music-volume-icon {
            width: 20px;
            height: 20px;
            fill: var(--text-soft);
            flex-shrink: 0;
        }

        .music-volume-slider {
            flex: 1;
            height: 6px;
            -webkit-appearance: none;
            appearance: none;
            background: var(--whisper);
            border-radius: 3px;
            outline: none;
        }

        .music-volume-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 18px;
            height: 18px;
            background: var(--crimson);
            border-radius: 50%;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .music-volume-slider::-webkit-slider-thumb:hover {
            transform: scale(1.2);
        }

        .music-volume-slider::-moz-range-thumb {
            width: 18px;
            height: 18px;
            background: var(--crimson);
            border-radius: 50%;
            cursor: pointer;
            border: none;
        }

        .music-playlist {
            margin-top: 1.5rem;
        }

        .music-playlist-title {
            font-size: 0.9rem;
            color: var(--text-soft);
            margin-bottom: 1rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 500;
        }

        .music-track-item {
            padding: 1rem;
            border-radius: 12px;
            margin-bottom: 0.5rem;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 1rem;
            background: var(--cream);
        }

        .music-track-item:hover {
            background: var(--gold-pale);
            transform: translateX(4px);
        }

        .music-track-item.active {
            background: var(--gold-pale);
            border-left: 3px solid var(--crimson);
        }

        .music-track-icon {
            width: 40px;
            height: 40px;
            border-radius: 8px;
            background: var(--cream);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .music-track-icon svg {
            width: 20px;
            height: 20px;
            fill: var(--crimson);
        }

        .music-track-info {
            flex: 1;
        }

        .music-track-info-name {
            font-size: 0.95rem;
            color: var(--navy);
            font-weight: 500;
        }

        .music-track-info-duration {
            font-size: 0.8rem;
            color: var(--text-soft);
        }

        /* Music button in header */
        .header-music-btn {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: var(--whisper);
            border: 1px solid transparent;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            position: relative;
        }

        .header-music-btn:hover {
            background: var(--gold-pale);
            border-color: var(--gold);
            transform: translateY(-2px);
        }

        .header-music-btn svg {
            width: 20px;
            height: 20px;
            fill: var(--navy);
        }

        .header-music-btn.playing::after {
            content: '';
            position: absolute;
            top: -2px;
            right: -2px;
            width: 10px;
            height: 10px;
            background: var(--crimson);
            border-radius: 50%;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.2); }
        }

        /* ============================================
           ENHANCED LISTENING PLAYER STYLES
           ============================================ */
        .listening-player-container {
            padding: 1rem 0;
        }

        #youtube-player-wrapper {
            position: relative;
            width: 100%;
            padding-bottom: 56.25%; /* 16:9 aspect ratio */
            margin-bottom: 1.5rem;
            background: #000;
            border-radius: 12px;
            overflow: hidden;
        }

        #youtube-player {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        }

        .player-controls {
            background: var(--cream-dark);
            border-radius: 16px;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
        }

        body.dark-mode .player-controls {
            background: rgba(255, 255, 255, 0.05);
        }

        .player-controls-main {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1rem;
        }

        .player-btn {
            background: white;
            border: 2px solid var(--whisper);
            border-radius: 12px;
            padding: 0.75rem 1rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.9rem;
            font-weight: 500;
            color: var(--navy);
            transition: all 0.2s ease;
            font-family: 'Work Sans', sans-serif;
        }

        body.dark-mode .player-btn {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.2);
            color: var(--dark-text);
        }

        .player-btn:hover {
            background: var(--cream);
            border-color: var(--gold);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        body.dark-mode .player-btn:hover {
            background: rgba(255, 255, 255, 0.15);
        }

        .player-btn svg {
            width: 20px;
            height: 20px;
        }

        .player-btn-play {
            background: var(--crimson);
            color: white;
            border-color: var(--crimson);
            padding: 1rem 1.5rem;
        }

        .player-btn-play:hover {
            background: #b71c1c;
            border-color: #b71c1c;
        }

        .player-btn-play svg {
            width: 24px;
            height: 24px;
        }

        .player-btn.active {
            background: var(--crimson);
            color: white;
            border-color: var(--crimson);
        }

        .player-speed-controls {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 0.5rem;
            padding: 1rem 0 0.5rem;
            border-top: 1px solid var(--whisper);
        }

        body.dark-mode .player-speed-controls {
            border-top-color: rgba(255, 255, 255, 0.1);
        }

        .speed-btn {
            background: white;
            border: 1px solid var(--whisper);
            border-radius: 8px;
            padding: 0.5rem 1rem;
            cursor: pointer;
            font-size: 0.85rem;
            font-weight: 500;
            color: var(--navy);
            transition: all 0.2s ease;
            font-family: 'Work Sans', sans-serif;
        }

        body.dark-mode .speed-btn {
            background: rgba(255, 255, 255, 0.05);
            border-color: rgba(255, 255, 255, 0.1);
            color: var(--dark-text);
        }

        .speed-btn:hover {
            background: var(--cream);
            border-color: var(--gold);
        }

        body.dark-mode .speed-btn:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .speed-btn.active {
            background: var(--navy);
            color: white;
            border-color: var(--navy);
        }

        body.dark-mode .speed-btn.active {
            background: var(--crimson);
            border-color: var(--crimson);
        }

        .ab-repeat-indicator {
            margin-top: 1rem;
            padding: 0.75rem 1rem;
            background: rgba(190, 31, 46, 0.1);
            border: 1px solid var(--crimson);
            border-radius: 8px;
            text-align: center;
            font-size: 0.9rem;
            color: var(--crimson);
        }

        .interactive-transcript {
            background: white;
            border-radius: 16px;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            border: 1px solid var(--whisper);
        }

        body.dark-mode .interactive-transcript {
            background: var(--dark-card);
            border-color: rgba(255, 255, 255, 0.1);
        }

        body.dark-mode .interactive-transcript h3 {
            color: var(--dark-text);
        }

        .transcript-lines {
            max-height: 400px;
            overflow-y: auto;
            padding: 0.5rem;
        }

        .transcript-line {
            padding: 0.75rem 1rem;
            margin-bottom: 0.5rem;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            border-left: 3px solid transparent;
            font-size: 1.05rem;
            line-height: 1.6;
        }

        .transcript-line:hover {
            background: var(--cream-dark);
            border-left-color: var(--gold);
        }

        body.dark-mode .transcript-line:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .transcript-line.active {
            background: rgba(190, 31, 46, 0.1);
            border-left-color: var(--crimson);
        }

        body.dark-mode .transcript-line.active {
            background: rgba(190, 31, 46, 0.2);
        }

        .transcript-timestamp {
            display: inline-block;
            font-weight: 600;
            color: var(--crimson);
            margin-right: 0.75rem;
            font-size: 0.9rem;
            min-width: 60px;
        }

        body.dark-mode .transcript-timestamp {
            color: var(--gold);
        }

        .transcript-text {
            color: var(--text);
        }

        body.dark-mode .transcript-text {
            color: var(--dark-text);
        }
        
        /* Clickable words in transcript */
        .clickable-transcript-word {
            cursor: pointer;
            padding: 0.1rem 0.2rem;
            border-radius: 3px;
            transition: all 0.2s;
        }
        
        .clickable-transcript-word:hover {
            background: rgba(190, 31, 46, 0.1);
        }
        
        .clickable-transcript-word.word-selected {
            background: rgba(190, 31, 46, 0.25);
            border-bottom: 2px solid var(--crimson);
        }
        
        .clickable-transcript-word.word-unknown {
            background: rgba(255, 165, 0, 0.25);
            color: #d97706;
            font-weight: 500;
        }
        
        .clickable-transcript-word.word-known {
            background: rgba(34, 197, 94, 0.2);
            color: #16a34a;
            font-weight: 500;
        }
        
        /* Word analysis popup */
        .word-analysis-popup {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--cream);
            padding: 2rem;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
            z-index: 10001;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        }
        
        body.dark-mode .word-analysis-popup {
            background: var(--dark-bg);
            box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        }
        
        .word-analysis-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 10000;
        }

        .player-progress-section {
            text-align: center;
            padding: 1.5rem;
            background: var(--cream-dark);
            border-radius: 16px;
        }

        body.dark-mode .player-progress-section {
            background: rgba(255, 255, 255, 0.05);
        }

        .progress-stars {
            font-size: 2rem;
            margin-bottom: 1rem;
            letter-spacing: 0.25rem;
        }

        .progress-stars .star {
            transition: all 0.2s ease;
            display: inline-block;
        }

        .progress-stars .star:hover {
            transform: scale(1.2);
        }

        .progress-stars .star.inactive {
            opacity: 0.3;
        }

        /* Listening Category Tabs */
        .listening-category-tabs {
            padding: 0.5rem;
            background: var(--cream-dark);
            border-radius: 12px;
            display: inline-flex;
        }

        body.dark-mode .listening-category-tabs {
            background: rgba(255, 255, 255, 0.05);
        }

        .listening-category-tab {
            background: transparent;
            border: none;
            padding: 0.6rem 1.25rem;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 500;
            color: var(--text-soft);
            transition: all 0.2s ease;
            font-family: 'Work Sans', sans-serif;
            white-space: nowrap;
        }

        .listening-category-tab:hover {
            background: rgba(255, 255, 255, 0.5);
            color: var(--navy);
        }

        body.dark-mode .listening-category-tab:hover {
            background: rgba(255, 255, 255, 0.1);
            color: var(--dark-text);
        }

        .listening-category-tab.active {
            background: white;
            color: var(--crimson);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        body.dark-mode .listening-category-tab.active {
            background: var(--crimson);
            color: white;
        }

        .listening-card {
            background: white;
            border-radius: 16px;
            padding: 1.5rem;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
            border: 1px solid var(--whisper);
            transition: all 0.3s ease;
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        body.dark-mode .listening-card {
            background: var(--dark-card);
            border-color: rgba(255, 255, 255, 0.1);
        }

        .listening-card:hover {
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
            transform: translateY(-2px);
        }

        body.dark-mode .listening-card:hover {
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        .listening-card-actions {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
        }

        .btn-play-interactive {
            background: var(--crimson);
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 12px;
            cursor: pointer;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            transition: all 0.2s ease;
            font-family: 'Work Sans', sans-serif;
        }

        .btn-play-interactive:hover {
            background: #b71c1c;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(190, 31, 46, 0.3);
        }

        .btn-play-interactive svg {
            width: 18px;
            height: 18px;
        }

        /* Responsive */
        @media (max-width: 768px) {
            .player-controls-main {
                flex-wrap: wrap;
                gap: 0.5rem;
            }

            .player-btn {
                padding: 0.6rem 0.8rem;
                font-size: 0.85rem;
            }

            .player-btn-play {
                padding: 0.8rem 1.2rem;
            }

            .player-speed-controls {
                flex-wrap: wrap;
            }

            .speed-btn {
                padding: 0.4rem 0.8rem;
                font-size: 0.8rem;
            }

            .transcript-line {
                font-size: 0.95rem;
                padding: 0.6rem 0.8rem;
            }

            .transcript-timestamp {
                font-size: 0.85rem;
                min-width: 50px;
            }
        }

        /* Responsive */
        @media (max-width: 768px) {
            .affirmation {
                right: 1rem;
                max-width: 240px;
            }

            .header {
                padding: 1rem 1rem 0.75rem;
            }

            .logo-main {
                font-size: 1.4rem;
            }

            .logo-sub {
                font-size: 0.6rem;
                letter-spacing: 0.15em;
            }

            .signature {
                font-size: 1.5rem;
            }

            .main {
                padding: 2rem 1rem 3rem;
            }

            .heatmap-grid {
                gap: 3px;
            }

            .garden-flowers {
                gap: 1rem;
            }

            .flower-bloom.large { width: 50px; height: 50px; }

            .music-modal-close {
                width: 48px;
                height: 48px;
            }

            .music-modal-close svg {
                width: 28px;
                height: 28px;
            }
            
            /* CALENDAR FIX - Mobile responsive */
            .heatmap-grid {
                overflow-x: auto;
                padding-bottom: 1rem;
            }
            
            .heatmap-day {
                min-width: 14px;
                min-height: 14px;
            }
            
            /* Presence calendar mobile fix - prevent huge February */
            .calendar-month {
                padding: 1rem;
            }
            
            .calendar-grid {
                gap: 4px;
            }
            
            .calendar-day {
                aspect-ratio: auto;
                min-height: 50px;
                max-height: 60px;
                height: auto;
                font-size: 0.85rem;
            }
            
            .calendar-day-number {
                font-size: 0.85rem;
            }
            
            .calendar-day-icons {
                transform: scale(0.8);
            }
            
            /* INTERACTIVE TEXTS FIX - Mobile responsive */
            .reading-passage-card {
                padding: 1.5rem 1rem;
                margin-bottom: 1.5rem;
            }
            
            .reading-passage-header {
                flex-direction: column !important;
                gap: 1rem;
                align-items: stretch !important;
            }
            
            .reading-passage-header > div:first-child {
                width: 100%;
            }
            
            .reading-passage-header > div:last-child {
                width: 100%;
                flex-direction: column !important;
                gap: 1rem !important;
            }
            
            /* Stats box on mobile */
            .reading-passage-header > div:last-child > div[style*="gradient"] {
                width: 100% !important;
                display: grid !important;
                grid-template-columns: repeat(4, 1fr) !important;
                gap: 0.75rem !important;
                padding: 1rem !important;
            }
            
            /* Stat separators hidden on mobile */
            .reading-passage-header > div:last-child > div[style*="gradient"] > div[style*="width: 1px"] {
                display: none !important;
            }
            
            .reading-passage-stats {
                flex-wrap: wrap;
                gap: 0.75rem;
                justify-content: flex-start;
            }
            
            .reading-passage-text {
                font-size: 1rem;
                line-height: 1.7;
            }
            
            /* Icon buttons on mobile */
            .reading-passage-header .icon-btn {
                padding: 0.4rem !important;
            }
            
            .reading-passage-header .icon-btn svg {
                width: 16px !important;
                height: 16px !important;
            }
            
            /* Linked reading button on mobile */
            .reading-passage-header button[onclick^="viewLinkedReading"] {
                font-size: 0.75rem !important;
                padding: 0.4rem 0.8rem !important;
            }
            
            .reading-stat {
                min-width: 70px;
            }
            
            /* ACCOUNT BUTTON FIX - Mobile responsive */
            .header {
                overflow: hidden;
            }
            
            .account-section {
                max-width: 100%;
                overflow: hidden;
            }
            
            .account-section button {
                font-size: 0.85rem;
                padding: 0.4rem 0.8rem;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            /* Selection toolbar mobile */
            .selection-mode-toolbar {
                flex-direction: column;
                bottom: 1rem;
                left: 1rem;
                right: 1rem;
                transform: none;
                padding: 1rem;
                gap: 0.75rem;
            }
            
            .selection-mode-toolbar button {
                width: 100%;
            }
            
            /* Modal responsive */
            .modal-content {
                max-width: 95% !important;
                margin: 1rem;
            }
            
            /* Reading passage buttons responsive */
            .reading-passage-card [style*="display: flex"] button {
                min-width: unset !important;
                flex: 1 1 auto;
            }
        }

            .nav {
                padding: 1rem;
            }

            .entrance-card {
                padding: 2rem 1.5rem;
            }

            .entrance-sentence {
                font-size: 1.75rem;
            }

            .word-grid {
                grid-template-columns: 1fr;
            }

            .data-actions {
                flex-direction: column;
                align-items: center;
            }

            .modal-content {
                padding: 2rem 1.5rem;
            }

            .tabs {
                overflow-x: auto;
            }

            .speaking-controls {
                flex-direction: column;
            }

            .category-grid {
                grid-template-columns: 1fr;
            }

            .pdf-save-btn {
                bottom: 1rem;
                left: 1rem;
                width: 48px;
                height: 48px;
            }

            .pdf-save-btn svg {
                width: 20px;
                height: 20px;
            }

            .transcript-btn {
                width: 36px;
                height: 36px;
            }

            .transcript-btn svg {
                width: 18px;
                height: 18px;
            }
            
            /* Reading list mobile */
            .resource-card {
                padding: 1.25rem !important;
            }
            
            .resource-info > div:first-child {
                flex-wrap: wrap !important;
            }
            
            .resource-card button[onclick^="viewLinkedPassage"] {
                font-size: 0.7rem !important;
                padding: 0.3rem 0.5rem !important;
                white-space: nowrap;
            }
            
            .resource-card button[onclick^="viewLinkedPassage"] svg {
                width: 10px !important;
                height: 10px !important;
            }
        }
    </style>
</head>
<body>
    <!-- Twinkling Stars -->
    <div class="stars-container" id="starsContainer"></div>

    <!-- Animation Container for SVG effects -->
    <div class="animation-container" id="animationContainer"></div>

    <!-- Affirmation -->
    <div class="affirmation" id="affirmation">
        <div class="affirmation-text"></div>
        <div class="affirmation-translation"></div>
    </div>

    <!-- Heart Note -->
    <div class="heart-note" id="heart-note">
        <div id="heart-reason"></div>
        <div style="margin-top: 1.5rem; font-size: 0.9rem; color: var(--text-soft);">
            C'est ton voyage.
        </div>
    </div>

    <!-- Header -->
    <header class="header">
        <div class="header-inner">
            <div class="logo">
                <div class="logo-main" id="logo-main" style="cursor: pointer;">Ma Maison</div>
                <div class="logo-sub" id="logo-sub" style="cursor: pointer;">Où chaque moment est doux</div>
            </div>
            <!-- HOUSE ICON (replaces "apprendre") -->
            <div class="house-container" id="houseContainer">
                <div class="heart-particles" id="heartParticles"></div>
                
                <svg class="house-icon" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <!-- Chimney FIRST - so it appears BEHIND the roof -->
                    <rect x="165" y="150" width="45" height="90" rx="3" fill="#A64253" stroke="#8B2635" stroke-width="3"/>
                    
                    <!-- Chimney smoke -->
                    <g opacity="0.6">
                        <circle cx="187" cy="135" r="8" fill="#D4A5A5"/>
                        <circle cx="182" cy="120" r="10" fill="#D4A5A5"/>
                        <circle cx="192" cy="110" r="7" fill="#D4A5A5"/>
                    </g>
                    
                    <!-- Book on chimney -->
                    <g transform="translate(172, 128)">
                        <rect width="30" height="18" rx="2" fill="#FBF9F4" stroke="#8B2635" stroke-width="2"/>
                        <line x1="15" y1="2" x2="15" y2="16" stroke="#8B2635" stroke-width="1.5"/>
                        <line x1="6" y1="9" x2="24" y2="9" stroke="#8B2635" stroke-width="1"/>
                    </g>
                    
                    <!-- Roof - comes AFTER chimney so it covers the bottom -->
                    <path d="M 100 240 L 256 130 L 412 240 Z" fill="#D4A5A5" stroke="#8B2635" stroke-width="3"/>
                    
                    <!-- House body -->
                    <rect x="120" y="240" width="272" height="220" rx="4" fill="#F5E6D3" stroke="#8B2635" stroke-width="3"/>
                    
                    <!-- Window left -->
                    <rect class="house-window" x="150" y="280" width="45" height="50" rx="8" fill="#E8DCC8" stroke="#8B2635" stroke-width="2.5"/>
                    <line x1="172.5" y1="280" x2="172.5" y2="330" stroke="#8B2635" stroke-width="2"/>
                    <line x1="150" y1="305" x2="195" y2="305" stroke="#8B2635" stroke-width="2"/>
                    
                    <!-- Window right -->
                    <rect class="house-window" x="317" y="280" width="45" height="50" rx="8" fill="#E8DCC8" stroke="#8B2635" stroke-width="2.5"/>
                    <line x1="339.5" y1="280" x2="339.5" y2="330" stroke="#8B2635" stroke-width="2"/>
                    <line x1="317" y1="305" x2="362" y2="305" stroke="#8B2635" stroke-width="2"/>
                    
                    <!-- Door frame -->
                    <rect x="210" y="310" width="92" height="150" rx="45" fill="#FBF9F4" stroke="#8B2635" stroke-width="3"/>
                    
                    <!-- Door (animated) -->
                    <g class="house-door">
                        <path d="M 210 310 Q 210 280 256 280 Q 302 280 302 310 L 302 460 L 210 460 Z" 
                              fill="#8B2635" stroke="#8B2635" stroke-width="3"/>
                        
                        <!-- Heart on door -->
                        <g transform="translate(256, 360)">
                            <path d="M 0,-8 C -4,-12 -10,-12 -14,-8 C -18,-4 -18,2 -10,10 L 0,18 L 10,10 C 18,2 18,-4 14,-8 C 10,-12 4,-12 0,-8 Z" 
                                  fill="#D4A5A5" stroke="#FBF9F4" stroke-width="1.5"/>
                        </g>
                        
                        <!-- Door handle -->
                        <circle cx="280" cy="385" r="5" fill="#C9A861"/>
                    </g>
                    
                    <!-- Base/Ground -->
                    <rect x="100" y="460" width="312" height="12" fill="#E5D4A6" stroke="#8B2635" stroke-width="2"/>
                </svg>
                
                <!-- Celestial Body (Sun/Moon) next to house -->
                <div class="celestial-body" id="celestialBody">
                    <!-- Sun SVG -->
                    <svg class="sun" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="50" cy="50" r="20" fill="#FFC857"/>
                        <g stroke="#FFC857" stroke-width="3" stroke-linecap="round">
                            <line x1="50" y1="10" x2="50" y2="20"/>
                            <line x1="50" y1="80" x2="50" y2="90"/>
                            <line x1="10" y1="50" x2="20" y2="50"/>
                            <line x1="80" y1="50" x2="90" y2="50"/>
                            <line x1="21.7" y1="21.7" x2="28.3" y2="28.3"/>
                            <line x1="71.7" y1="71.7" x2="78.3" y2="78.3"/>
                            <line x1="21.7" y1="78.3" x2="28.3" y2="71.7"/>
                            <line x1="71.7" y1="28.3" x2="78.3" y2="21.7"/>
                        </g>
                    </svg>
                    
                    <!-- Moon SVG -->
                    <svg class="moon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <mask id="moon-crescent-mask">
                                <circle cx="50" cy="50" r="30" fill="white"/>
                                <circle cx="63" cy="44" r="26" fill="black"/>
                            </mask>
                        </defs>
                        <circle cx="50" cy="50" r="30" fill="#E8E0C8" mask="url(#moon-crescent-mask)"/>
                    </svg>
                </div>
            </div>
        </div>
    </header>

    <!-- PWA Install Button -->
    <div id="install-button-container" style="display: none; position: fixed; bottom: 20px; right: 20px; z-index: 9999;">
        <button id="pwa-install-btn" style="
            background: linear-gradient(135deg, var(--crimson) 0%, #a63d4a 100%);
            color: white;
            border: none;
            padding: 16px 24px;
            border-radius: 50px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 8px 24px rgba(139, 70, 84, 0.4);
            display: flex;
            align-items: center;
            gap: 10px;
            transition: all 0.3s ease;
            font-family: 'Work Sans', sans-serif;
        " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 12px 32px rgba(139, 70, 84, 0.5)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 8px 24px rgba(139, 70, 84, 0.4)'">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Installer l'App
        </button>
    </div>

    <!-- Navigation -->
    <nav class="nav">
        <button class="nav-link active" data-room="entree">L'Entrée</button>
        <button class="nav-link" data-room="jardin">Le Jardin</button>
        <button class="nav-link" data-room="lire">Le Coin Lecture</button>
        <button class="nav-link" data-room="ecouter">Le Studio d'Écoute</button>
        <button class="nav-link" data-room="parler">Le Parloir</button>
        <button class="nav-link" data-room="ecrire">Le Salon d'Écriture</button>
        <button class="nav-link" data-room="notes">Le Cabinet de Travail</button>
        <button class="nav-link" data-room="ressources">La Réserve</button>
    </nav>

    <!-- Main -->
    <main class="main">
        <!-- L'Entrée -->
        <section class="room active" id="entree">
            <div class="room-intro">
                <h1 class="room-title">L'Entrée</h1>
                <p class="room-description" id="time-greeting">
                    Bonjour, tu es revenu chez toi.
                </p>
                <p class="room-description" id="presence-streak" style="font-size: 0.9rem; margin-top: 0.5rem;">
                    <!-- Streak info will appear here -->
                </p>
            </div>

            <!-- Presence Calendar -->
            <div class="entrance-card">
                <div class="entrance-sentence">Ton calendrier de présence</div>
                <div class="entrance-translation" style="margin-bottom: 1.5rem;">
                    Chaque jour où tu touches le français compte. Pas besoin d'être parfait.
                </div>
                
                <div class="calendar-navigation">
                    <button class="calendar-nav-btn" id="prev-month">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                        </svg>
                    </button>
                    <div class="calendar-month-title" id="current-month-title">Février 2026</div>
                    <button class="calendar-nav-btn" id="next-month">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                        </svg>
                    </button>
                </div>
                
                <div id="presence-calendar-months">
                    <!-- Single month calendar will be rendered here -->
                </div>
                
                <div style="margin-top: 1.5rem; padding: 1rem; background: var(--whisper); border-radius: 8px;">
                    <div style="font-size: 0.9rem; color: var(--text-soft); margin-bottom: 0.75rem;">Aujourd'hui, tu as fait:</div>
                    <div id="today-actions" style="display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center;">
                        <!-- Today's action badges will appear here -->
                    </div>
                </div>
            </div>

            <div id="entrance-content"></div>

            <!-- Monthly Heatmap -->
            <div class="heatmap-container">
                <div class="heatmap-title">Ton activité d'étude</div>
                <div class="heatmap-grid" id="heatmap-grid"></div>
                <div class="heatmap-legend">
                    <span>Moins</span>
                    <div class="heatmap-legend-item" style="background: var(--whisper);"></div>
                    <div class="heatmap-legend-item" style="background: #fde8d0;"></div>
                    <div class="heatmap-legend-item" style="background: #f4be86;"></div>
                    <div class="heatmap-legend-item" style="background: #df7f29;"></div>
                    <div class="heatmap-legend-item" style="background: #b84d06;"></div>
                    <span>Plus</span>
                </div>
            </div>

            <!-- Study Timer -->
            <div class="entrance-card">
                <div class="entrance-sentence">Minuteur d'étude</div>
                <div class="entrance-translation">
                    Concentre-toi. Prends des pauses. Apprends à ton rythme.
                </div>
                
                <div style="text-align: center; margin-top: 1.5rem;">
                    <div id="timer-display" style="font-family: 'Cormorant Garamond', serif; font-size: 3rem; color: var(--navy); margin-bottom: 1rem; font-weight: 500;">25:00</div>
                    
                    <div style="display: flex; gap: 0.5rem; justify-content: center; margin-bottom: 1rem;">
                        <button class="btn btn-secondary timer-preset" data-minutes="5">5 min</button>
                        <button class="btn btn-secondary timer-preset" data-minutes="15">15 min</button>
                        <button class="btn btn-secondary timer-preset active" data-minutes="25">25 min</button>
                        <button class="btn btn-secondary timer-preset" data-minutes="45">45 min</button>
                    </div>
                    
                    <div style="display: flex; gap: 1rem; justify-content: center;">
                        <button class="btn btn-primary" id="timer-start">Commencer</button>
                        <button class="btn btn-secondary" id="timer-reset" style="display: none;">Réinitialiser</button>
                    </div>
                </div>
            </div>

            <!-- Data management -->
            <div class="entrance-card">
                <div class="entrance-sentence">Tes données</div>
                <div class="entrance-translation">
                    Tout reste sur ton appareil. Tu peux sauvegarder ou recommencer.
                </div>
                <div class="data-actions">
                    <button class="btn btn-secondary" id="export-data">
                        ⬇ Exporter tout
                    </button>
                    <button class="btn btn-secondary" id="import-data">
                        ⬆ Importer tout
                    </button>
                    <button class="btn-drive" id="drive-link" title="Sauvegarde Google Drive">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
                        </svg>
                    </button>
                    <button class="btn btn-danger" id="reset-data">
                        Recommencer à zéro
                    </button>
                </div>
            </div>

            <!-- Account Section -->
            <div class="entrance-card">
                <div class="entrance-sentence">Ton compte</div>
                <div class="entrance-translation">
                    Connecte-toi pour sauvegarder tes progrès dans le cloud.
                </div>
                
                <!-- Login Button (shows when not logged in) -->
                <div id="entrance-login-section" style="text-align: center; margin-top: 1.5rem;">
                    <button class="btn btn-primary" id="entrance-login-btn" onclick="openModal('auth-modal')" style="padding: 0.75rem 2rem; font-size: 1rem;">
                        Se connecter
                    </button>
                </div>
                
                <!-- User Profile (shows when logged in) -->
                <div id="entrance-user-profile" style="display: none; text-align: center; margin-top: 1.5rem;">
                    <div style="display: inline-flex; align-items: center; gap: 1rem; background: var(--cream-dark); padding: 1rem 1.5rem; border-radius: 24px; border: 1px solid var(--whisper);">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, var(--crimson) 0%, var(--crimson-soft) 100%); color: white; display: flex; align-items: center; justify-content: center; font-weight: 500; font-size: 1.1rem;" id="entrance-user-avatar"></div>
                        <div style="text-align: left;">
                            <div style="font-weight: 500; color: var(--navy); margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.5rem;">
                                <span>Connecté</span>
                                <span id="sync-indicator" style="font-size: 0.8rem; color: var(--gold); opacity: 0; transition: opacity 0.3s;">☁️ Sync...</span>
                            </div>
                            <div id="entrance-user-email" style="color: var(--text-soft); font-size: 0.9rem;"></div>
                        </div>
                        <button class="btn btn-secondary" id="entrance-logout-btn" style="margin-left: 1rem;">Déconnexion</button>
                    </div>
                </div>
            </div>
        </section>

        <!-- Le Jardin -->
        <section class="room" id="jardin">
            <div class="room-intro">
                <h1 class="room-title">Le Jardin</h1>
                <p class="room-description">
                    Plante des mots. Laisse-les grandir dans leur propre temps.
                </p>
            </div>

            <!-- Growth Tree Visualization -->
            <div class="growth-tree-container">
                <div class="growth-tree-header">
                    <div class="growth-tree-title">Ton arbre de croissance</div>
                    <div class="growth-tree-subtitle">Chaque mot appris fait grandir ton arbre</div>
                </div>
                
                <div class="growth-tree-canvas" id="growth-tree">
                    <svg viewBox="0 0 400 500" id="tree-svg">
                        <!-- Tree will be rendered here -->
                    </svg>
                </div>
                
                <div class="growth-tree-stats">
                    <div class="growth-stat">
                        <div class="growth-stat-icon">🌱</div>
                        <div class="growth-stat-value" id="tree-leaves">0</div>
                        <div class="growth-stat-label">Feuilles</div>
                    </div>
                    <div class="growth-stat">
                        <div class="growth-stat-icon">🌿</div>
                        <div class="growth-stat-value" id="tree-branches">0</div>
                        <div class="growth-stat-label">Branches</div>
                    </div>
                    <div class="growth-stat">
                        <div class="growth-stat-icon">🌸</div>
                        <div class="growth-stat-value" id="tree-flowers">0</div>
                        <div class="growth-stat-label">Fleurs</div>
                    </div>
                </div>
            </div>

            <!-- Garden Visual -->
            <div class="garden-visual">
                <div class="garden-title">Ton jardin de mots</div>
                <div class="garden-flowers" id="garden-flowers"></div>
                <div class="garden-stats" id="garden-stats"></div>
            </div>

            <!-- Jardin Filters - NEW -->
            <div class="entrance-card" id="jardin-filters">
                <div class="entrance-sentence" style="font-size:1.5rem;">Explorer le jardin</div>

                <div class="category-grid">
                    <div>
                        <label class="form-label">Année</label>
                        <select class="form-select" id="filter-year">
                            <option value="">Toutes</option>
                        </select>
                    </div>

                    <div>
                        <label class="form-label">Trimestre</label>
                        <select class="form-select" id="filter-quarter">
                            <option value="">Tous</option>
                            <option value="Q1">Q1</option>
                            <option value="Q2">Q2</option>
                            <option value="Q3">Q3</option>
                            <option value="Q4">Q4</option>
                        </select>
                    </div>

                    <div>
                        <label class="form-label">Semaine</label>
                        <select class="form-select" id="filter-week">
                            <option value="">Toutes</option>
                        </select>
                    </div>

                    <div>
                        <label class="form-label">Thème</label>
                        <select class="form-select" id="filter-theme">
                            <option value="">Tous les thèmes</option>
                        </select>
                    </div>

                    <div>
                        <label class="form-label">Favoris</label>
                        <select class="form-select" id="filter-favorite">
                            <option value="">Tous</option>
                            <option value="true">Favoris de Sasha ⭐</option>
                        </select>
                    </div>
                </div>

                <div style="text-align:right;">
                    <button class="btn btn-secondary" id="reset-filters">Tout afficher</button>
                </div>
            </div>

            <!-- Game section -->
            <div class="game-section">
                <div style="margin-bottom: 1.5rem;">
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; margin-bottom: 1rem;">
                        <button class="btn btn-secondary game-mode-btn" data-game="srs">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                            SRS Review
                        </button>
                        <button class="btn btn-secondary game-mode-btn active" data-game="random">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                <circle cx="15.5" cy="15.5" r="1.5"></circle>
                                <circle cx="8.5" cy="15.5" r="1.5"></circle>
                                <circle cx="15.5" cy="8.5" r="1.5"></circle>
                            </svg>
                            Mot aléatoire
                        </button>
                        <button class="btn btn-secondary game-mode-btn" data-game="matching">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                                <polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline>
                                <polyline points="7.5 19.79 7.5 14.6 3 12"></polyline>
                                <polyline points="21 12 16.5 14.6 16.5 19.79"></polyline>
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                                <line x1="12" y1="22.08" x2="12" y2="12"></line>
                            </svg>
                            Association
                        </button>
                        <button class="btn btn-secondary game-mode-btn" data-game="fillblank">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                            Compléter
                        </button>
                        <button class="btn btn-secondary game-mode-btn" data-game="speed">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
                            </svg>
                            Chrono
                        </button>
                        <button class="btn btn-secondary game-mode-btn" data-game="quiz">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                                <line x1="12" y1="17" x2="12.01" y2="17"></line>
                            </svg>
                            Quiz
                        </button>
                    </div>
                </div>

                <!-- Random Word Game (Original) -->
                <div class="game-container" id="game-random" style="display: block;">
                    <button class="btn btn-primary" id="random-word">
                        Donne-moi un mot
                    </button>
                    <div class="game-result" id="game-result">
                        <div class="game-prompt">Clique pour commencer</div>
                    </div>
                </div>

                <!-- Matching Game -->
                <div class="game-container" id="game-matching" style="display: none;">
                    <div class="game-instructions">Associe les mots français avec leurs traductions</div>
                    <div id="matching-pairs" class="matching-grid"></div>
                    <div style="margin-top: 1rem; text-align: center;">
                        <button class="btn btn-primary" id="start-matching">Commencer</button>
                        <button class="btn btn-secondary" id="reset-matching" style="display: none;">Nouvelle partie</button>
                    </div>
                    <div id="matching-score" style="margin-top: 1rem; text-align: center; font-size: 1.2rem; color: var(--navy);"></div>
                </div>

                <!-- Fill in the Blank -->
                <div class="game-container" id="game-fillblank" style="display: none;">
                    <div class="game-instructions">Complète la phrase avec le bon mot</div>
                    <div id="fillblank-content">
                        <div id="fillblank-sentence" style="font-size: 1.3rem; color: var(--navy); margin: 2rem 0; font-family: 'Cormorant Garamond', serif;"></div>
                        <div id="fillblank-options" style="display: flex; gap: 0.75rem; flex-wrap: wrap; justify-content: center;"></div>
                        <div id="fillblank-feedback" style="margin-top: 1.5rem; font-size: 1.1rem; min-height: 40px;"></div>
                    </div>
                    <div style="margin-top: 1rem; text-align: center;">
                        <button class="btn btn-primary" id="start-fillblank">Commencer</button>
                        <button class="btn btn-secondary" id="next-fillblank" style="display: none;">Suivant</button>
                    </div>
                    <div id="fillblank-score" style="margin-top: 1rem; text-align: center; font-size: 1rem; color: var(--text-soft);"></div>
                </div>

                <!-- Speed Round -->
                <div class="game-container" id="game-speed" style="display: none;">
                    <div class="game-instructions">Combien de mots peux-tu te rappeler en 60 secondes ?</div>
                    <div id="speed-timer" style="font-size: 3rem; color: var(--crimson); font-family: 'Cormorant Garamond', serif; text-align: center; margin: 1.5rem 0;">60</div>
                    <div id="speed-word" style="font-size: 2rem; color: var(--navy); font-family: 'Cormorant Garamond', serif; text-align: center; margin: 1.5rem 0; min-height: 60px;"></div>
                    <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 1rem;">
                        <button class="btn btn-primary" id="speed-know" style="display: none;">✓ Je sais</button>
                        <button class="btn btn-secondary" id="speed-skip" style="display: none;">→ Passer</button>
                    </div>
                    <div style="margin-top: 1.5rem; text-align: center;">
                        <button class="btn btn-primary" id="start-speed">Commencer</button>
                    </div>
                    <div id="speed-score" style="margin-top: 1rem; text-align: center; font-size: 1.1rem; color: var(--navy);"></div>
                </div>

                <!-- Translation Quiz -->
                <div class="game-container" id="game-quiz" style="display: none;">
                    <div class="game-instructions">Traduis ce mot</div>
                    <div id="quiz-word" style="font-size: 2.5rem; color: var(--crimson); font-family: 'Cormorant Garamond', serif; text-align: center; margin: 2rem 0; min-height: 80px;"></div>
                    <div style="max-width: 400px; margin: 0 auto;">
                        <input type="text" id="quiz-input" class="form-input" placeholder="Ta réponse..." style="text-align: center; font-size: 1.2rem; display: none;">
                    </div>
                    <div id="quiz-feedback" style="margin-top: 1.5rem; font-size: 1.1rem; text-align: center; min-height: 40px;"></div>
                    <div style="margin-top: 1rem; text-align: center;">
                        <button class="btn btn-primary" id="start-quiz">Commencer</button>
                        <button class="btn btn-primary" id="submit-quiz" style="display: none;">Vérifier</button>
                        <button class="btn btn-secondary" id="next-quiz" style="display: none;">Suivant</button>
                    </div>
                    <div id="quiz-score" style="margin-top: 1rem; text-align: center; font-size: 1rem; color: var(--text-soft);"></div>
                </div>

                <!-- SRS Review -->
                <div class="game-container" id="game-srs" style="display: none;">
                    <div class="srs-stats-grid">
                        <div class="srs-stat-box">
                            <div class="srs-stat-number" id="srs-due-count">0</div>
                            <div class="srs-stat-label">Due Today</div>
                        </div>
                        <div class="srs-stat-box">
                            <div class="srs-stat-number" id="srs-new-count">0</div>
                            <div class="srs-stat-label">New</div>
                        </div>
                        <div class="srs-stat-box">
                            <div class="srs-stat-number" id="srs-learning-count">0</div>
                            <div class="srs-stat-label">Learning</div>
                        </div>
                        <div class="srs-stat-box">
                            <div class="srs-stat-number" id="srs-mastered-count">0</div>
                            <div class="srs-stat-label">Mastered</div>
                        </div>
                    </div>
                    <div id="srs-session-area">
                        <div style="text-align: center; padding: 2rem;">
                            <button class="btn btn-primary" id="start-srs-session" style="font-size: 1.1rem; padding: 1.25rem 3rem;">
                                Commencer la révision
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 2rem; text-align: center;">
                <div style="display: flex; gap: 1rem; justify-content: center; align-items: center; flex-wrap: wrap;">
                    <button class="btn btn-secondary view-toggle active" data-view="grid">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                        </svg>
                        Grille
                    </button>
                    <button class="btn btn-secondary view-toggle" data-view="cards">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="3" y1="9" x2="21" y2="9"></line>
                        </svg>
                        Cartes
                    </button>
                    <button class="btn btn-primary" id="add-word-btn">+ Planter un nouveau mot</button>
                </div>
            </div>

            <!-- Flip Cards View -->
            <div id="flip-cards-container" style="display: none;">
                <div class="flip-card-wrapper">
                    <div class="flip-card" id="flip-card">
                        <div class="flip-card-inner">
                            <div class="flip-card-front">
                                <div class="flip-card-word" id="flip-card-word">Cliquez pour commencer</div>
                                <div class="flip-card-hint">Cliquez pour voir la traduction</div>
                            </div>
                            <div class="flip-card-back">
                                <div class="flip-card-meaning" id="flip-card-meaning"></div>
                                <div class="flip-card-example" id="flip-card-example"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="flip-card-controls">
                    <button class="btn btn-secondary" id="flip-prev">← Précédent</button>
                    <div class="flip-card-counter">
                        <span id="flip-current">0</span> / <span id="flip-total">0</span>
                    </div>
                    <button class="btn btn-secondary" id="flip-next">Suivant →</button>
                </div>
                
                <div style="text-align: center; margin-top: 1rem;">
                    <button class="btn btn-secondary" id="flip-shuffle">🔀 Mélanger</button>
                </div>
            </div>

            <div class="word-grid" id="word-grid"></div>

            <!-- Combined Export/Import Menu Button -->
            <button class="pdf-save-btn" id="jardin-menu-btn" title="Gérer les mots" style="display: none;">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                </svg>
            </button>
            
            <!-- Jardin Actions Menu -->
            <div id="jardin-actions-menu" style="display: none; position: fixed; bottom: 90px; right: 20px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.15); padding: 0.5rem; z-index: 9999; min-width: 200px;">
                <button class="menu-action-btn" id="menu-save-pdf" style="display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 0.75rem 1rem; border: none; background: none; cursor: pointer; border-radius: 8px; transition: background 0.2s; font-family: 'Work Sans', sans-serif; font-size: 0.95rem; color: var(--navy);" onmouseover="this.style.background='var(--whisper)'" onmouseout="this.style.background='none'">
                    <svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px; color: var(--crimson);">
                        <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15.5h8v1H8v-1zm0-3h8v1H8v-1z"/>
                    </svg>
                    <span>Exporter en PDF</span>
                </button>
                <button class="menu-action-btn" id="menu-save-csv" style="display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 0.75rem 1rem; border: none; background: none; cursor: pointer; border-radius: 8px; transition: background 0.2s; font-family: 'Work Sans', sans-serif; font-size: 0.95rem; color: var(--navy);" onmouseover="this.style.background='var(--whisper)'" onmouseout="this.style.background='none'">
                    <svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px; color: var(--gold);">
                        <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6zm8-10v2h2v-2h-2zm0 4v2h2v-2h-2zM8 14h2v2H8v-2zm0-4h2v2H8v-2z"/>
                    </svg>
                    <span>Exporter CSV</span>
                </button>
                <button class="menu-action-btn" id="menu-bulk-import" style="display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 0.75rem 1rem; border: none; background: none; cursor: pointer; border-radius: 8px; transition: background 0.2s; font-family: 'Work Sans', sans-serif; font-size: 0.95rem; color: var(--navy);" onmouseover="this.style.background='var(--whisper)'" onmouseout="this.style.background='none'">
                    <svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px; color: var(--sage);">
                        <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
                    </svg>
                    <span>Importer des mots</span>
                </button>
            </div>
        </section>

        <!-- Lire -->
        <section class="room" id="lire">
            <div class="room-intro">
                <h1 class="room-title">Le Coin Lecture</h1>
                <p class="room-description">
                    Garde une trace de ce que tu lis et pratique avec des textes interactifs.
                </p>
            </div>

            <!-- Resources Dropdown -->
            <div class="resources-dropdown-container">
                <button class="resources-toggle-btn" data-section="lire">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                    </svg>
                    <span>Mes ressources</span>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 14px; height: 14px;">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                </button>
                <div class="resources-dropdown-content" id="lire-resources">
                    <div class="section-resources-grid"></div>
                </div>
            </div>

            <!-- Reading List Section -->
            <div style="margin-bottom: 3rem;">
                <h3 style="font-family: 'Cormorant Garamond', serif; font-size: 1.8rem; color: var(--navy); margin-bottom: 0.5rem;">Ma Liste de Lecture</h3>
                <p style="color: var(--text-soft); margin-bottom: 1.5rem; font-size: 0.95rem;">
                    Articles, livres, et contenus que tu veux lire ou as déjà lu.
                </p>

                <div style="margin-bottom: 2rem; text-align: center;">
                    <button class="btn btn-primary" id="add-reading-btn">+ Ajouter un article ou livre</button>
                </div>

                <div class="resource-grid" id="reading-grid"></div>
            </div>
            
            <!-- Decorative Divider -->
            <div style="margin: 3rem 0; border-top: 2px solid var(--whisper); position: relative;">
                <div style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: var(--cream); padding: 0 1rem;">
                    <svg viewBox="0 0 24 24" fill="currentColor" style="width: 24px; height: 24px; color: var(--crimson); opacity: 0.5;">
                        <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/>
                    </svg>
                </div>
            </div>
            
            <!-- Interactive Reading Passages Section -->
            <div style="margin-top: 3rem;">
                <h3 style="font-family: 'Cormorant Garamond', serif; font-size: 1.8rem; color: var(--navy); margin-bottom: 0.5rem;">Lecture Interactive</h3>
                <p style="color: var(--text-soft); margin-bottom: 1.5rem; font-size: 0.95rem;">
                    Importe des textes français et clique sur les mots inconnus pour les ajouter à ton vocabulaire.
                </p>
                
                <div style="margin-bottom: 2rem;">
                    <button class="btn btn-primary" onclick="openModal('add-passage-modal')">
                        <svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px;">
                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                        </svg>
                        Ajouter un texte interactif
                    </button>
                </div>
                
                <div id="reading-passages-container"></div>
            </div>
            
            <!-- Transcripts Section -->
            <div id="reading-transcripts-section" style="margin-top: 3rem; display: none;">
                <h3 style="font-family: 'Cormorant Garamond', serif; font-size: 1.8rem; color: var(--navy); margin-bottom: 1.5rem;">
                    Transcriptions
                    <button class="btn btn-primary" id="add-reading-transcript-btn" style="margin-left: 1rem; padding: 0.5rem 1rem; font-size: 0.9rem;">
                        + Ajouter une transcription
                    </button>
                </h3>
                <div id="reading-transcripts-container"></div>
            </div>
        </section>

        <!-- Écouter -->
        <section class="room" id="ecouter">
            <div class="room-intro">
                <h1 class="room-title">Le Studio d'Écoute</h1>
                <p class="room-description">
                    Chansons, vidéos, films — tout ce que tu écoutes pour apprendre.
                </p>
            </div>

            <!-- Resources Dropdown -->
            <div class="resources-dropdown-container">
                <button class="resources-toggle-btn" data-section="ecouter">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
                    </svg>
                    <span>Mes ressources</span>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 14px; height: 14px;">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                </button>
                <div class="resources-dropdown-content" id="ecouter-resources">
                    <div class="section-resources-grid"></div>
                </div>
            </div>

            <!-- Category Filter Tabs -->
            <div style="margin-bottom: 2rem;">
                <div class="listening-category-tabs" style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; margin-bottom: 1.5rem;">
                    <button class="listening-category-tab active" data-category="all" onclick="filterListeningByCategory('all')">
                        Tout
                    </button>
                    <button class="listening-category-tab" data-category="video" onclick="filterListeningByCategory('video')">
                        Vidéos
                    </button>
                    <button class="listening-category-tab" data-category="song" onclick="filterListeningByCategory('song')">
                        Musique
                    </button>
                    <button class="listening-category-tab" data-category="movie" onclick="filterListeningByCategory('movie')">
                        Films
                    </button>
                    <button class="listening-category-tab" data-category="series" onclick="filterListeningByCategory('series')">
                        Séries
                    </button>
                    <button class="listening-category-tab" data-category="podcast" onclick="filterListeningByCategory('podcast')">
                        Podcasts
                    </button>
                </div>

                <div style="text-align: center;">
                    <button class="btn btn-primary" id="add-listening-btn">Ajouter du contenu</button>
                </div>
            </div>

            <div class="resource-grid" id="listening-grid"></div>
            
            <!-- Transcripts Section -->
            <div id="listening-transcripts-section" style="margin-top: 3rem; display: none;">
                <h3 style="font-family: 'Cormorant Garamond', serif; font-size: 1.8rem; color: var(--navy); margin-bottom: 1.5rem;">
                    Transcriptions
                    <button class="btn btn-primary" id="add-listening-transcript-btn" style="margin-left: 1rem; padding: 0.5rem 1rem; font-size: 0.9rem;">
                        + Ajouter une transcription
                    </button>
                </h3>
                <div id="listening-transcripts-container"></div>
            </div>
        </section>

        <!-- Parler -->
        <section class="room" id="parler">
            <div class="room-intro">
                <h1 class="room-title">Le Parloir</h1>
                <p class="room-description">
                    Réponds aux questions. Enregistre ta voix. Personne ne juge.
                </p>
            </div>

            <!-- Resources Dropdown -->
            <div class="resources-dropdown-container">
                <button class="resources-toggle-btn" data-section="parler">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
                    </svg>
                    <span>Mes ressources</span>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 14px; height: 14px;">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                </button>
                <div class="resources-dropdown-content" id="parler-resources">
                    <div class="section-resources-grid"></div>
                </div>
            </div>

            <!-- Tabs -->
            <div class="tabs">
                <button class="tab active" data-tab="practice">Pratiquer</button>
                <button class="tab" data-tab="recordings-tab">Enregistrements</button>
            </div>

            <!-- Practice tab -->
            <div class="tab-content active" id="practice">
                <!-- Speaking Prompts Section with Randomizer -->
                <div class="writing-prompts-section">
                    <div class="prompt-header">
                        <span class="prompt-label">Besoin d'inspiration?</span>
                        <button class="dice-btn" id="random-speaking-prompt-btn" title="Question aléatoire">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                                <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"/>
                                <circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"/>
                                <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/>
                                <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                            </svg>
                        </button>
                        <a href="https://docs.google.com/document/d/1VRRqrIv1ZbgeH5rBHolE_v-FRdrPXLIg9n7lz-DTX6g/edit?usp=drivesdk" target="_blank" class="prompt-link">Plus de questions →</a>
                    </div>
                    <div class="current-prompt" id="current-speaking-prompt">Clique sur le dé pour obtenir une question</div>
                </div>

                <!-- Question Input -->
                <div class="question-section">
                    <input type="text" class="form-input question-input" id="parler-question" placeholder="Ou écris ta propre question...">
                </div>

                <!-- Recording Interface -->
                <div class="entrance-card">
                    <div style="display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap;">
                        <button class="btn-speak" id="start-speaking">
                            <svg class="mic-icon" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                            </svg>
                            Commencer à parler
                        </button>
                        
                        <button class="btn-speak" onclick="document.getElementById('audio-upload-input').click()">
                            <svg class="mic-icon" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
                            </svg>
                            Télécharger un audio
                        </button>
                        <input type="file" id="audio-upload-input" accept="audio/*" style="display: none;">
                    </div>
                    
                    <div id="speaking-indicator" style="display: none; text-align: center; margin: 1rem 0; color: var(--crimson); font-weight: 500;">
                        <span style="display: inline-block; animation: pulse 1.5s ease-in-out infinite;">● En écoute...</span>
                    </div>
                    
                    <div id="spoken-text" style="min-height: 60px;"></div>
                    
                    <div class="speaking-controls" id="recording-controls" style="display: none;">
                        <input type="text" class="form-input" id="recording-note" placeholder="Ajoute une note supplémentaire (optionnel)...">
                        <button class="btn btn-secondary" id="save-recording">Sauvegarder</button>
                    </div>
                </div>
            </div>

            <!-- Recordings tab -->
            <div class="tab-content" id="recordings-tab">
                <!-- Stats Summary -->
                <div class="practice-stats" id="practice-stats" style="display: none;">
                    <div class="stat-card">
                        <div class="stat-number" id="total-recordings">0</div>
                        <div class="stat-label">Sessions totales</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number" id="this-week-recordings">0</div>
                        <div class="stat-label">Cette semaine</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number" id="total-words-spoken">0</div>
                        <div class="stat-label">Mots prononcés</div>
                    </div>
                </div>

                <div id="recordings-list"></div>
            </div>
        </section>

        <!-- Écrire -->
        <section class="room" id="ecrire">
            <div class="room-intro">
                <h1 class="room-title">Le Salon d'Écriture</h1>
                <p class="room-description">
                    Écris ce que tu veux. Tout est sauvegardé.
                </p>
            </div>

            <!-- Resources Dropdown -->
            <div class="resources-dropdown-container">
                <button class="resources-toggle-btn" data-section="ecrire">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                    <span>Mes ressources</span>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 14px; height: 14px;">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                </button>
                <div class="resources-dropdown-content" id="ecrire-resources">
                    <div class="section-resources-grid"></div>
                </div>
            </div>

            <!-- Tabs -->
            <div class="tabs">
                <button class="tab active" data-tab="write">Écrire</button>
                <button class="tab" data-tab="archive">Archive</button>
            </div>

            <!-- Write tab -->
            <div class="tab-content active" id="write">
                <!-- Writing Prompts Section -->
                <div class="writing-prompts-section">
                    <div class="prompt-header">
                        <span class="prompt-label">Besoin d'inspiration?</span>
                        <button class="dice-btn" id="random-prompt-btn" title="Prompt aléatoire">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                                <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"/>
                                <circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"/>
                                <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/>
                                <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                            </svg>
                        </button>
                        <a href="https://docs.google.com/document/d/1lDaN1EKeK0aSzX0HZgQ_k5I4Q-om3Kk6O53Dc1Fhkyo/edit?usp=drivesdk" target="_blank" class="prompt-link">Plus de prompts →</a>
                    </div>
                    <div class="current-prompt" id="current-prompt">Clique sur le dé pour obtenir un prompt</div>
                </div>

                <div class="writing-container">
                    <!-- Title input without dice button now -->
                    <input 
                        type="text" 
                        class="writing-title" 
                        id="writing-title"
                        placeholder="Titre (optionnel)"
                        style="width: 100%; margin-bottom: 1rem;">
                    
                    <textarea 
                        class="writing-area" 
                        id="writing-area"
                        placeholder="Commence à écrire..."></textarea>
                    
                    <div class="writing-footer">
                        <div class="word-count-container">
                            <div class="word-count" id="word-count" title="Clique 3x pour définir un objectif">0 mots</div>
                            <div class="word-goal" id="word-goal" style="display: none;"></div>
                        </div>
                        <div class="writing-actions">
                            <button class="btn btn-secondary" id="mark-mistakes-btn" title="Marquer les erreurs dans ton texte">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px; margin-right: 6px;">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                                <span id="mark-mistakes-text">Marquer erreurs</span>
                            </button>
                            <button class="btn btn-secondary" id="ai-analyze-btn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px; margin-right: 6px;">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                                    <polyline points="7.5 4.21 12 6.81 16.5 4.21"/>
                                    <polyline points="7.5 19.79 7.5 14.6 3 12"/>
                                    <polyline points="21 12 16.5 14.6 16.5 19.79"/>
                                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                                    <line x1="12" y1="22.08" x2="12" y2="12"/>
                                </svg>
                                Analyser avec IA
                            </button>
                            <button class="btn btn-primary" id="save-writing">Sauvegarder</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Archive tab -->
            <div class="tab-content" id="archive">
                <div class="archive-header">
                    <h3 style="margin: 0; font-size: 1.1rem;">Mes écrits</h3>
                    <button class="btn btn-secondary btn-sm" id="export-all-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; margin-right: 4px;">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Exporter tout
                    </button>
                </div>
                <div id="writings-archive"></div>
            </div>
        </section>

        <!-- Notes -->
        <section class="room" id="notes">
            <div class="room-intro">
                <h1 class="room-title">Le Cabinet de Travail</h1>
                <p class="room-description">
                    Ta base de connaissances personnelle. Grammaire, prononciation, phrases — tout organisé.
                </p>
            </div>

            <!-- Filters -->
            <div class="filter-bar">
                <button class="filter-tag active" data-note-filter="all">Tout</button>
                <button class="filter-tag" data-note-filter="grammaire">Grammaire</button>
                <button class="filter-tag" data-note-filter="prononciation">Prononciation</button>
                <button class="filter-tag" data-note-filter="phrases">Phrases</button>
                <button class="filter-tag" data-note-filter="vocabulaire">Vocabulaire</button>
                <button class="filter-tag" data-note-filter="culture">Culture</button>
                <button class="filter-tag" data-note-filter="autre">Autre</button>
            </div>

            <!-- Add Note Button -->
            <div style="margin-bottom: 2rem; text-align: center;">
                <button class="btn btn-primary" onclick="openModal('note-modal')">+ Ajouter une note</button>
            </div>

            <!-- Notes Grid -->
            <div id="notes-grid"></div>
        </section>

        <!-- Ressources -->
        <section class="room" id="ressources">
            <div class="room-intro">
                <h1 class="room-title">La Réserve</h1>
                <p class="room-description">
                    Sites web, chaînes YouTube, applications — tous tes outils pour apprendre.
                </p>
            </div>

            <div style="margin-bottom: 2rem; display: flex; gap: 1rem; align-items: center; justify-content: center; flex-wrap: wrap;">
                <div style="min-width: 200px;">
                    <select class="form-select" id="filter-resources-type">
                        <option value="">Tous les types</option>
                        <option value="website">Sites web</option>
                        <option value="youtube">YouTube</option>
                        <option value="app">Applications</option>
                        <option value="book">Livres</option>
                        <option value="podcast">Podcasts</option>
                        <option value="other">Autre</option>
                    </select>
                </div>
                <button class="btn btn-primary" id="add-resource-btn">+ Ajouter une ressource</button>
            </div>

            <div class="resource-grid" id="resources-grid"></div>
        </section>
    </main>

    <!-- Word Modal -->
    <div class="modal" id="word-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Planter un mot</h2>
                <button class="close-btn" onclick="closeModal('word-modal')">&times;</button>
            </div>
            
            <form id="word-form">
                <div class="form-group">
                    <label class="form-label">Image (optionnel)</label>
                    <div class="image-upload-area" id="word-image-upload">
                        <p>Clique pour ajouter une image</p>
                        <img id="word-image-preview" class="image-preview" style="display: none;">
                    </div>
                    <input type="file" id="word-image-input" accept="image/*" style="display: none;">
                </div>

                <div class="form-group">
                    <label class="form-label">Le mot en français</label>
                    <input type="text" class="form-input" id="word-input" required>
                </div>

                <div class="form-group">
                    <label class="form-label">Signification / Meaning</label>
                    <input type="text" class="form-input" id="meaning-input" placeholder="What it means to you">
                </div>

                <div class="form-group">
                    <label class="form-label">Article (optionnel)</label>
                    <select class="form-select" id="article-input">
                        <option value="">—</option>
                        <option value="le">le (masculin)</option>
                        <option value="la">la (féminin)</option>
                        <option value="l'">l' (voyelle)</option>
                        <option value="les">les (pluriel)</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Genre (optionnel)</label>
                    <select class="form-select" id="gender-input">
                        <option value="">—</option>
                        <option value="m">masculin</option>
                        <option value="f">féminin</option>
                    </select>
                </div>

                <div class="category-grid">
                    <div>
                        <label class="form-label">Thème / Topic</label>
                        <input type="text" class="form-input" id="theme-input" placeholder="ex: amour, mode, cuisine..." list="theme-suggestions">
                        <datalist id="theme-suggestions">
                            <option value="amour">
                            <option value="mode">
                            <option value="nature">
                            <option value="nourriture">
                            <option value="voyage">
                            <option value="art">
                            <option value="musique">
                            <option value="émotions">
                        </datalist>
                    </div>

                    <div>
                        <label class="form-label">Semaine / Week</label>
                        <select class="form-select" id="week-input">
                            <option value="">—</option>
                            <option value="1">Semaine 1</option>
                            <option value="2">Semaine 2</option>
                            <option value="3">Semaine 3</option>
                            <option value="4">Semaine 4</option>
                            <option value="5">Semaine 5</option>
                            <option value="6">Semaine 6</option>
                            <option value="7">Semaine 7</option>
                            <option value="8">Semaine 8</option>
                            <option value="9">Semaine 9</option>
                            <option value="10">Semaine 10</option>
                            <option value="11">Semaine 11</option>
                            <option value="12">Semaine 12</option>
                        </select>
                    </div>

                    <div>
                        <label class="form-label">Trimestre / Quarter</label>
                        <select class="form-select" id="quarter-input">
                            <option value="">—</option>
                            <option value="Q1">Q1</option>
                            <option value="Q2">Q2</option>
                            <option value="Q3">Q3</option>
                            <option value="Q4">Q4</option>
                        </select>
                    </div>

                    <div>
                        <label class="form-label">Année / Year</label>
                        <select class="form-select" id="year-input">
                            <option value="">—</option>
                            <option value="2026">2026</option>
                            <option value="2027">2027</option>
                            <option value="2028">2028</option>
                            <option value="2029">2029</option>
                            <option value="2030">2030</option>
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Contexte neutre</label>
                    <input type="text" class="form-input" id="context1" placeholder="Une phrase simple avec ce mot">
                </div>

                <div class="form-group">
                    <label class="form-label">Contexte émotionnel (optionnel)</label>
                    <input type="text" class="form-input" id="context2" placeholder="Une phrase qui a du sens pour toi">
                </div>

                <div class="form-group">
                    <label class="form-label">Contexte idiomatique (optionnel)</label>
                    <input type="text" class="form-input" id="context3" placeholder="Expression ou phrase naturelle">
                </div>

                <div class="form-group">
                    <label class="form-label">Note personnelle (optionnel)</label>
                    <textarea class="form-textarea" id="note-input" placeholder="Pourquoi ce mot t'intéresse ? D'où vient-il ?"></textarea>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('word-modal')">Annuler</button>
                    <button type="submit" class="btn btn-primary">Planter</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Edit Word Modal -->
    <div class="modal" id="edit-word-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Modifier le mot</h2>
                <button class="close-btn" onclick="closeModal('edit-word-modal')">&times;</button>
            </div>
            
            <form id="edit-word-form">
                <input type="hidden" id="edit-word-id">
                
                <div class="form-group">
                    <label class="form-label">Image (optionnel)</label>
                    <div class="image-upload-area" id="edit-word-image-upload">
                        <p>Clique pour changer l'image</p>
                        <img id="edit-word-image-preview" class="image-preview" style="display: none;">
                    </div>
                    <input type="file" id="edit-word-image-input" accept="image/*" style="display: none;">
                </div>

                <div class="form-group">
                    <label class="form-label">Le mot en français</label>
                    <input type="text" class="form-input" id="edit-word-input" required>
                </div>

                <div class="form-group">
                    <label class="form-label">Signification / Meaning</label>
                    <input type="text" class="form-input" id="edit-meaning-input">
                </div>

                <div class="form-group">
                    <label class="form-label">Article (optionnel)</label>
                    <select class="form-select" id="edit-article-input">
                        <option value="">—</option>
                        <option value="le">le (masculin)</option>
                        <option value="la">la (féminin)</option>
                        <option value="l'">l' (voyelle)</option>
                        <option value="les">les (pluriel)</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Genre (optionnel)</label>
                    <select class="form-select" id="edit-gender-input">
                        <option value="">—</option>
                        <option value="m">masculin</option>
                        <option value="f">féminin</option>
                    </select>
                </div>

                <div class="category-grid">
                    <div>
                        <label class="form-label">Thème / Topic</label>
                        <input type="text" class="form-input" id="edit-theme-input" list="theme-suggestions">
                    </div>

                    <div>
                        <label class="form-label">Semaine / Week</label>
                        <select class="form-select" id="edit-week-input">
                            <option value="">—</option>
                            <option value="1">Semaine 1</option>
                            <option value="2">Semaine 2</option>
                            <option value="3">Semaine 3</option>
                            <option value="4">Semaine 4</option>
                            <option value="5">Semaine 5</option>
                            <option value="6">Semaine 6</option>
                            <option value="7">Semaine 7</option>
                            <option value="8">Semaine 8</option>
                            <option value="9">Semaine 9</option>
                            <option value="10">Semaine 10</option>
                            <option value="11">Semaine 11</option>
                            <option value="12">Semaine 12</option>
                        </select>
                    </div>

                    <div>
                        <label class="form-label">Trimestre / Quarter</label>
                        <select class="form-select" id="edit-quarter-input">
                            <option value="">—</option>
                            <option value="Q1">Q1</option>
                            <option value="Q2">Q2</option>
                            <option value="Q3">Q3</option>
                            <option value="Q4">Q4</option>
                        </select>
                    </div>

                    <div>
                        <label class="form-label">Année / Year</label>
                        <select class="form-select" id="edit-year-input">
                            <option value="">—</option>
                            <option value="2026">2026</option>
                            <option value="2027">2027</option>
                            <option value="2028">2028</option>
                            <option value="2029">2029</option>
                            <option value="2030">2030</option>
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Contexte neutre</label>
                    <input type="text" class="form-input" id="edit-context1">
                </div>

                <div class="form-group">
                    <label class="form-label">Contexte émotionnel (optionnel)</label>
                    <input type="text" class="form-input" id="edit-context2">
                </div>

                <div class="form-group">
                    <label class="form-label">Contexte idiomatique (optionnel)</label>
                    <input type="text" class="form-input" id="edit-context3">
                </div>

                <div class="form-group">
                    <label class="form-label">Note personnelle (optionnel)</label>
                    <textarea class="form-textarea" id="edit-note-input"></textarea>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('edit-word-modal')">Annuler</button>
                    <button type="submit" class="btn btn-primary">Sauvegarder</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Bulk Import Modal -->
    <div class="modal" id="bulk-import-modal">
        <div class="modal-content" style="max-width: 700px;">
            <div class="modal-header">
                <h2 class="modal-title">Importer plusieurs mots</h2>
                <button class="close-btn" onclick="closeModal('bulk-import-modal')">&times;</button>
            </div>
            
            <div style="margin-bottom: 1.5rem;">
                <p style="margin-bottom: 1rem; color: var(--text-soft);">
                    Colle tes mots dans le format suivant (une ligne par mot):
                </p>
                <div style="background: var(--cream-dark); padding: 1rem; border-radius: 8px; font-family: monospace; font-size: 0.85rem; margin-bottom: 1rem;">
                    embrasure | window recess | La lumière entre par l'embrasure. | architecture<br>
                    épanouissement | blooming, fulfillment | Son épanouissement personnel est visible.<br>
                    soupçon | hint, suspicion | Il y a un soupçon de vanille. | cuisine
                </div>
                <p style="color: var(--text-soft); font-size: 0.9rem;">
                    <strong>Format:</strong> mot français | signification | exemple (optionnel) | thème (optionnel)<br>
                    Sépare avec le symbole | (barre verticale)
                </p>
            </div>
            
            <form id="bulk-import-form">
                <div class="form-group">
                    <label class="form-label">Colle tes mots ici</label>
                    <textarea 
                        class="form-textarea" 
                        id="bulk-import-text" 
                        placeholder="embrasure | window recess | La lumière entre par l'embrasure. | architecture&#10;épanouissement | blooming, fulfillment | Son épanouissement personnel est visible.&#10;soupçon | hint, suspicion | Il y a un soupçon de vanille. | cuisine"
                        rows="10"
                        required
                        style="font-family: monospace;"
                    ></textarea>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label class="form-label">Semaine / Week (optionnel)</label>
                        <select class="form-select" id="bulk-week">
                            <option value="">—</option>
                            <option value="1">Semaine 1</option>
                            <option value="2">Semaine 2</option>
                            <option value="3">Semaine 3</option>
                            <option value="4">Semaine 4</option>
                            <option value="5">Semaine 5</option>
                            <option value="6">Semaine 6</option>
                            <option value="7">Semaine 7</option>
                            <option value="8">Semaine 8</option>
                            <option value="9">Semaine 9</option>
                            <option value="10">Semaine 10</option>
                            <option value="11">Semaine 11</option>
                            <option value="12">Semaine 12</option>
                        </select>
                    </div>

                    <div class="form-group" style="margin-bottom: 0;">
                        <label class="form-label">Trimestre / Quarter (optionnel)</label>
                        <select class="form-select" id="bulk-quarter">
                            <option value="">—</option>
                            <option value="Q1">Q1</option>
                            <option value="Q2">Q2</option>
                            <option value="Q3">Q3</option>
                            <option value="Q4">Q4</option>
                        </select>
                    </div>

                    <div class="form-group" style="margin-bottom: 0;">
                        <label class="form-label">Année / Year (optionnel)</label>
                        <select class="form-select" id="bulk-year">
                            <option value="">—</option>
                            <option value="2026">2026</option>
                            <option value="2027">2027</option>
                            <option value="2028">2028</option>
                            <option value="2029">2029</option>
                            <option value="2030">2030</option>
                        </select>
                    </div>

                    <div class="form-group" style="margin-bottom: 0;">
                        <label class="form-label">Thème par défaut (optionnel)</label>
                        <input type="text" class="form-input" id="bulk-theme" placeholder="ex: animaux">
                    </div>
                </div>

                <p style="color: var(--text-soft); font-size: 0.85rem; margin-bottom: 1.5rem;">
                    💡 Ces champs s'appliquent à TOUS les mots importés. Si un mot a déjà un thème dans le fichier, il sera utilisé à la place.
                </p>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('bulk-import-modal')">Annuler</button>
                    <button type="submit" class="btn btn-primary">Importer</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Reading Modal -->
    <div class="modal" id="reading-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Ajouter à ta bibliothèque</h2>
                <button class="close-btn" onclick="closeModal('reading-modal')">&times;</button>
            </div>
            
            <form id="reading-form">
                <div class="form-group">
                    <label class="form-label">Type</label>
                    <select class="form-select" id="reading-type" required>
                        <option value="article">Article</option>
                        <option value="book">Livre</option>
                        <option value="blog">Blog</option>
                        <option value="other">Autre</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Titre</label>
                    <input type="text" class="form-input" id="reading-title" required>
                </div>

                <div class="form-group">
                    <label class="form-label">Lien (optionnel)</label>
                    <input type="url" class="form-input" id="reading-link" placeholder="https://...">
                </div>

                <div class="form-group">
                    <label class="form-label">Statut</label>
                    <select class="form-select" id="reading-status">
                        <option value="want">Je veux lire</option>
                        <option value="reading">En train de lire</option>
                        <option value="done">Lu</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Notes</label>
                    <textarea class="form-textarea" id="reading-note" placeholder="Pourquoi tu veux lire ça ? Qu'est-ce que tu en penses ?"></textarea>
                </div>

                <div class="form-group">
                    <label class="form-label">Lier à un texte interactif (optionnel)</label>
                    <select class="form-select" id="reading-linked-passage">
                        <option value="">-- Aucun --</option>
                    </select>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('reading-modal')">Annuler</button>
                    <button type="submit" class="btn btn-primary">Ajouter</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Edit Reading Modal -->
    <div class="modal" id="edit-reading-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Modifier la lecture</h2>
                <button class="close-btn" onclick="closeModal('edit-reading-modal')">&times;</button>
            </div>
            
            <form id="edit-reading-form">
                <input type="hidden" id="edit-reading-id">
                <div class="form-group">
                    <label class="form-label">Type</label>
                    <select class="form-select" id="edit-reading-type" required>
                        <option value="article">Article</option>
                        <option value="book">Livre</option>
                        <option value="blog">Blog</option>
                        <option value="other">Autre</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Titre</label>
                    <input type="text" class="form-input" id="edit-reading-title" required>
                </div>

                <div class="form-group">
                    <label class="form-label">Lien (optionnel)</label>
                    <input type="url" class="form-input" id="edit-reading-link" placeholder="https://...">
                </div>

                <div class="form-group">
                    <label class="form-label">Statut</label>
                    <select class="form-select" id="edit-reading-status">
                        <option value="want">Je veux lire</option>
                        <option value="reading">En train de lire</option>
                        <option value="done">Lu</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Notes</label>
                    <textarea class="form-textarea" id="edit-reading-note" placeholder="Pourquoi tu veux lire ça ? Qu'est-ce que tu en penses ?"></textarea>
                </div>

                <div class="form-group">
                    <label class="form-label">Lier à un texte interactif (optionnel)</label>
                    <select class="form-select" id="edit-reading-linked-passage">
                        <option value="">-- Aucun --</option>
                    </select>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('edit-reading-modal')">Annuler</button>
                    <button type="submit" class="btn btn-primary">Sauvegarder</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Add Passage Modal -->
    <div class="modal" id="add-passage-modal">
        <div class="modal-content" style="max-width: 700px;">
            <div class="modal-header">
                <h2 class="modal-title">Ajouter un texte</h2>
                <button class="close-btn" onclick="closeModal('add-passage-modal')">&times;</button>
            </div>
            
            <form id="add-passage-form">
                <div class="form-group">
                    <label class="form-label">Titre</label>
                    <input type="text" class="form-input" id="passage-title" required placeholder="Ex: Article du Monde, Chapitre 1...">
                </div>

                <div class="form-group">
                    <label class="form-label">Source (optionnel)</label>
                    <input type="text" class="form-input" id="passage-source" placeholder="Ex: Le Monde, L'Étranger par Camus...">
                </div>

                <div class="form-group">
                    <label class="form-label">Lié à un élément de "Ma Liste de Lecture" (optionnel)</label>
                    <select class="form-select" id="passage-linked-reading">
                        <option value="">-- Sélectionner un élément --</option>
                    </select>
                    <small style="color: var(--text-soft);">Si ce texte provient de votre liste de lecture, sélectionnez-le ici.</small>
                </div>

                <div class="form-group">
                    <label class="form-label">Texte (longueur illimitée)</label>
                    <textarea class="form-textarea" id="passage-text" required style="min-height: 400px; font-size: 1.05rem; line-height: 1.8; resize: vertical;" placeholder="Colle ton texte français ici...

Tu peux inclure plusieurs paragraphes.

Ils seront préservés lors de l'affichage !"></textarea>
                    <small style="color: var(--text-soft);">✨ Nouveau : Les paragraphes sont maintenant préservés ! Clique sur les mots ou sélectionne plusieurs mots à la fois pour les ajouter à ton vocabulaire.</small>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('add-passage-modal')">Annuler</button>
                    <button type="submit" class="btn btn-primary">Ajouter</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Listening Modal -->
    <div class="modal" id="listening-modal">
        <div class="modal-content" style="max-width: 700px;">
            <div class="modal-header">
                <h2 class="modal-title">Ajouter du contenu</h2>
                <button class="close-btn" onclick="closeModal('listening-modal')">&times;</button>
            </div>
            
            <form id="listening-form">
                <div class="form-group">
                    <label class="form-label">Type de contenu</label>
                    <select class="form-select" id="listening-type" required>
                        <option value="video">Vidéo</option>
                        <option value="song">Musique</option>
                        <option value="podcast">Podcast</option>
                        <option value="movie">Film</option>
                        <option value="series">Série</option>
                        <option value="other">Autre</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">URL YouTube</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="url" class="form-input" id="listening-media-url" placeholder="https://youtube.com/watch?v=..." style="flex: 1;">
                        <button type="button" class="btn btn-secondary" onclick="fetchYouTubeTitle()" id="fetch-yt-title-btn" style="white-space: nowrap; padding: 0 1.25rem;">
                            <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px; margin-right: 0.4rem; vertical-align: middle;">
                                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                            </svg>
                            Récupérer le titre
                        </button>
                    </div>
                    <small style="color: var(--text-soft); font-size: 0.85rem;">Colle l'URL et clique sur le bouton pour remplir automatiquement le titre</small>
                </div>

                <div class="form-group">
                    <label class="form-label">Titre</label>
                    <input type="text" class="form-input" id="listening-title" required placeholder="Le titre du contenu">
                </div>

                <div class="form-group" style="background: var(--cream-dark); padding: 1.25rem; border-radius: 12px; border: 2px dashed var(--whisper);">
                    <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
                        <svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px; color: var(--crimson);">
                            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                        </svg>
                        Transcription (recommandé)
                        <a href="https://downsub.com" target="_blank" rel="noopener noreferrer" 
                           title="Obtenir les sous-titres YouTube"
                           style="display:inline-flex; align-items:center; gap:0.3rem; padding:0.25rem 0.65rem; background:var(--crimson); color:white; border-radius:20px; font-size:0.78rem; font-weight:500; text-decoration:none; letter-spacing:0.02em; transition:background 0.2s, transform 0.2s; white-space:nowrap; margin-left:auto;"
                           onmouseover="this.style.background='#a03040';this.style.transform='translateY(-1px)'"
                           onmouseout="this.style.background='var(--crimson)';this.style.transform='none'">
                            <svg viewBox="0 0 24 24" fill="currentColor" style="width:13px;height:13px;flex-shrink:0;">
                                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                            </svg>
                            DownSub
                        </a>
                    </label>
                    <textarea class="form-textarea" id="listening-transcript-text" placeholder="Colle ici les sous-titres de DownSub ou autre source...&#10;&#10;Formats acceptés automatiquement:&#10;00:15 Bonjour, je m'appelle Marie.&#10;[00:23] J'habite à Paris depuis cinq ans.&#10;&#10;Ou format SRT complet avec →" style="min-height: 180px; font-family: 'Courier New', monospace; font-size: 0.9rem; background: white;"></textarea>
                    <small style="color: var(--text-soft); font-size: 0.85rem; display: block; margin-top: 0.5rem;">
                        Les timestamps seront détectés automatiquement et transformés en transcription cliquable
                    </small>
                </div>

                <div class="form-group">
                    <label class="form-label">Niveau de maîtrise</label>
                    <select class="form-select" id="listening-progress">
                        <option value="not-started">Pas encore commencé</option>
                        <option value="working">En cours d'apprentissage</option>
                        <option value="reviewing">En révision</option>
                        <option value="mastered">Maîtrisé</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Notes personnelles (optionnel)</label>
                    <textarea class="form-textarea" id="listening-note" placeholder="Expressions utiles, vocabulaire intéressant, contexte..."></textarea>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('listening-modal')">Annuler</button>
                    <button type="submit" class="btn btn-primary">Ajouter</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Edit Listening Modal -->
    <div class="modal" id="edit-listening-modal">
        <div class="modal-content" style="max-width: 700px;">
            <div class="modal-header">
                <h2 class="modal-title">Modifier le contenu</h2>
                <button class="close-btn" onclick="closeModal('edit-listening-modal')">&times;</button>
            </div>
            
            <form id="edit-listening-form">
                <input type="hidden" id="edit-listening-id">
                
                <div class="form-group">
                    <label class="form-label">Type de contenu</label>
                    <select class="form-select" id="edit-listening-type" required>
                        <option value="video">Vidéo</option>
                        <option value="song">Musique</option>
                        <option value="podcast">Podcast</option>
                        <option value="movie">Film</option>
                        <option value="series">Série</option>
                        <option value="other">Autre</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">URL YouTube</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="url" class="form-input" id="edit-listening-media-url" placeholder="https://youtube.com/watch?v=..." style="flex: 1;">
                        <button type="button" class="btn btn-secondary" onclick="fetchYouTubeTitleEdit()" style="white-space: nowrap; padding: 0 1.25rem;">
                            <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px; margin-right: 0.4rem; vertical-align: middle;">
                                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                            </svg>
                            Récupérer le titre
                        </button>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Titre</label>
                    <input type="text" class="form-input" id="edit-listening-title" required>
                </div>

                <div class="form-group" style="background: var(--cream-dark); padding: 1.25rem; border-radius: 12px; border: 2px dashed var(--whisper);">
                    <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
                        <svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px; color: var(--crimson);">
                            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                        </svg>
                        Transcription
                        <a href="https://downsub.com" target="_blank" rel="noopener noreferrer"
                           title="Obtenir les sous-titres YouTube"
                           style="display:inline-flex; align-items:center; gap:0.3rem; padding:0.25rem 0.65rem; background:var(--crimson); color:white; border-radius:20px; font-size:0.78rem; font-weight:500; text-decoration:none; letter-spacing:0.02em; transition:background 0.2s, transform 0.2s; white-space:nowrap; margin-left:auto;"
                           onmouseover="this.style.background='#a03040';this.style.transform='translateY(-1px)'"
                           onmouseout="this.style.background='var(--crimson)';this.style.transform='none'">
                            <svg viewBox="0 0 24 24" fill="currentColor" style="width:13px;height:13px;flex-shrink:0;">
                                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                            </svg>
                            DownSub
                        </a>
                    </label>
                    <textarea class="form-textarea" id="edit-listening-transcript-text" placeholder="Colle ici les sous-titres..." style="min-height: 180px; font-family: 'Courier New', monospace; font-size: 0.9rem; background: white;"></textarea>
                </div>

                <div class="form-group">
                    <label class="form-label">Niveau de maîtrise</label>
                    <select class="form-select" id="edit-listening-progress">
                        <option value="not-started">Pas encore commencé</option>
                        <option value="working">En cours d'apprentissage</option>
                        <option value="reviewing">En révision</option>
                        <option value="mastered">Maîtrisé</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Notes personnelles</label>
                    <textarea class="form-textarea" id="edit-listening-note"></textarea>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('edit-listening-modal')">Annuler</button>
                    <button type="submit" class="btn btn-primary">Sauvegarder</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Enhanced Listening Player Modal -->
    <div class="modal" id="listening-player-modal">
        <div class="modal-content" style="max-width: 1000px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header">
                <h2 class="modal-title" id="player-title">Lecteur interactif</h2>
                <button class="close-btn" onclick="closeListeningPlayer()">&times;</button>
            </div>
            
            <div class="listening-player-container">
                <!-- YouTube Player -->
                <div id="youtube-player-wrapper" style="display: none;">
                    <div id="youtube-player"></div>
                </div>

                <!-- Enhanced Controls -->
                <div class="player-controls">
                    <div class="player-controls-main">
                        <button class="player-btn" onclick="skipBackward()" title="Retour 5 secondes">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
                            </svg>
                            -5s
                        </button>
                        
                        <button class="player-btn player-btn-play" id="play-pause-btn" onclick="togglePlayPause()">
                            <svg viewBox="0 0 24 24" fill="currentColor" id="play-icon">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                            <svg viewBox="0 0 24 24" fill="currentColor" id="pause-icon" style="display: none;">
                                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                            </svg>
                        </button>
                        
                        <button class="player-btn" onclick="skipForward()" title="Avance 5 secondes">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
                            </svg>
                            +5s
                        </button>
                        
                        <button class="player-btn" onclick="toggleLoop()" id="loop-btn" title="Boucle section">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
                            </svg>
                        </button>
                        
                        <button class="player-btn" onclick="toggleABRepeat()" id="ab-repeat-btn" title="Répétition A-B">
                            <span style="font-weight: bold; font-size: 0.9rem;">A-B</span>
                        </button>
                    </div>

                    <div class="player-speed-controls">
                        <span style="font-size: 0.85rem; color: var(--text-soft); margin-right: 0.5rem;">Vitesse:</span>
                        <button class="speed-btn" onclick="setSpeed(0.75)" data-speed="0.75">0.75x</button>
                        <button class="speed-btn active" onclick="setSpeed(1.0)" data-speed="1.0">1.0x</button>
                        <button class="speed-btn" onclick="setSpeed(1.25)" data-speed="1.25">1.25x</button>
                        <button class="speed-btn" onclick="setSpeed(1.5)" data-speed="1.5">1.5x</button>
                    </div>

                    <div class="ab-repeat-indicator" id="ab-indicator" style="display: none;">
                        <span id="ab-text">Répétition A-B: <strong id="ab-range"></strong></span>
                        <button onclick="clearABRepeat()" style="background: transparent; border: none; color: var(--crimson); cursor: pointer; margin-left: 0.5rem; font-weight: bold;">✕</button>
                    </div>
                </div>

                <!-- Interactive Transcript -->
                <div class="interactive-transcript">
                    <h3 style="font-family: 'Cormorant Garamond', serif; font-size: 1.3rem; margin-bottom: 0.5rem; color: var(--navy);">
                        Transcription interactive
                    </h3>
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
                        <p style="font-size: 0.85rem; color: var(--text-soft); margin: 0;">
                            💡 Clique un mot pour l'analyser
                        </p>
                        <button id="multi-select-toggle" class="multi-select-inline-btn" onclick="toggleMultiSelectMode()" title="Mode sélection multiple">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 11l3 3L22 4"></path>
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                            </svg>
                        </button>
                        <span id="multi-select-hint" style="font-size: 0.8rem; color: var(--rose); font-weight: 500; display: none;">
                            📝 Sélectionne plusieurs mots
                        </span>
                    </div>
                    <div id="transcript-content" class="transcript-lines">
                        <p style="color: var(--text-soft); text-align: center; padding: 2rem;">Aucune transcription disponible</p>
                    </div>
                </div>

                <!-- Progress & Notes -->
                <div class="player-progress-section">
                    <div class="progress-stars" id="progress-stars">
                        <span class="star">⭐</span>
                        <span class="star">⭐</span>
                        <span class="star">⭐</span>
                        <span class="star inactive">☆</span>
                        <span class="star inactive">☆</span>
                    </div>
                    <select class="form-select" id="player-progress-select" onchange="updatePlayerProgress()" style="max-width: 300px; margin: 1rem auto;">
                        <option value="not-started">Pas encore commencé</option>
                        <option value="working">En cours ⭐⭐⭐☆☆</option>
                        <option value="reviewing">En révision ⭐⭐⭐⭐☆</option>
                        <option value="mastered">Maîtrisé ⭐⭐⭐⭐⭐</option>
                    </select>
                </div>
            </div>
        </div>
    </div>

    <!-- Resources Modal -->
    <div class="modal" id="resources-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Ajouter une ressource</h2>
                <button class="close-btn" onclick="closeModal('resources-modal')">&times;</button>
            </div>
            
            <form id="resources-form">
                <div class="form-group">
                    <label class="form-label">Type</label>
                    <select class="form-select" id="resources-type" required>
                        <option value="website">Site Web</option>
                        <option value="youtube">Chaîne YouTube</option>
                        <option value="app">Application</option>
                        <option value="podcast">Podcast</option>
                        <option value="tool">Outil</option>
                        <option value="course">Cours</option>
                        <option value="other">Autre</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Nom</label>
                    <input type="text" class="form-input" id="resources-name" required placeholder="Ex: Duolingo, French Today...">
                </div>

                <div class="form-group">
                    <label class="form-label">Description</label>
                    <input type="text" class="form-input" id="resources-description" placeholder="À quoi sert cette ressource ?">
                </div>

                <div class="form-group">
                    <label class="form-label">Lien (optionnel mais recommandé)</label>
                    <input type="url" class="form-input" id="resources-link" placeholder="https://...">
                </div>

                <div class="form-group">
                    <label class="form-label">Notes personnelles</label>
                    <textarea class="form-textarea" id="resources-note" placeholder="Pourquoi tu aimes cette ressource ? Comment tu l'utilises ?"></textarea>
                </div>

                <div class="form-group">
                    <label class="form-label">Afficher dans les sections (optionnel)</label>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-top: 0.5rem;">
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.5rem; background: var(--whisper); border-radius: 8px; transition: all 0.2s ease;">
                            <input type="checkbox" class="resources-section-checkbox" value="lire" style="cursor: pointer;">
                            <span style="font-size: 0.9rem; color: var(--text);">📚 Le Coin Lecture</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.5rem; background: var(--whisper); border-radius: 8px; transition: all 0.2s ease;">
                            <input type="checkbox" class="resources-section-checkbox" value="ecouter" style="cursor: pointer;">
                            <span style="font-size: 0.9rem; color: var(--text);">🎵 Le Studio d'Écoute</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.5rem; background: var(--whisper); border-radius: 8px; transition: all 0.2s ease;">
                            <input type="checkbox" class="resources-section-checkbox" value="parler" style="cursor: pointer;">
                            <span style="font-size: 0.9rem; color: var(--text);">🗣️ Le Parloir</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.5rem; background: var(--whisper); border-radius: 8px; transition: all 0.2s ease;">
                            <input type="checkbox" class="resources-section-checkbox" value="ecrire" style="cursor: pointer;">
                            <span style="font-size: 0.9rem; color: var(--text);">✍️ Le Salon d'Écriture</span>
                        </label>
                    </div>
                    <p style="font-size: 0.8rem; color: var(--text-soft); margin-top: 0.5rem; font-style: italic;">Cette ressource apparaîtra dans les sections sélectionnées</p>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('resources-modal')">Annuler</button>
                    <button type="submit" class="btn btn-primary">Ajouter</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Edit Resources Modal -->
    <div class="modal" id="edit-resources-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Modifier la ressource</h2>
                <button class="close-btn" onclick="closeModal('edit-resources-modal')">&times;</button>
            </div>
            
            <form id="edit-resources-form">
                <input type="hidden" id="edit-resources-id">
                <div class="form-group">
                    <label class="form-label">Type</label>
                    <select class="form-select" id="edit-resources-type" required>
                        <option value="website">Site Web</option>
                        <option value="youtube">Chaîne YouTube</option>
                        <option value="app">Application</option>
                        <option value="podcast">Podcast</option>
                        <option value="tool">Outil</option>
                        <option value="course">Cours</option>
                        <option value="other">Autre</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Nom</label>
                    <input type="text" class="form-input" id="edit-resources-name" required placeholder="Ex: Duolingo, French Today...">
                </div>

                <div class="form-group">
                    <label class="form-label">Description</label>
                    <input type="text" class="form-input" id="edit-resources-description" placeholder="À quoi sert cette ressource ?">
                </div>

                <div class="form-group">
                    <label class="form-label">Lien (optionnel mais recommandé)</label>
                    <input type="url" class="form-input" id="edit-resources-link" placeholder="https://...">
                </div>

                <div class="form-group">
                    <label class="form-label">Notes personnelles</label>
                    <textarea class="form-textarea" id="edit-resources-note" placeholder="Pourquoi tu aimes cette ressource ? Comment tu l'utilises ?"></textarea>
                </div>

                <div class="form-group">
                    <label class="form-label">Afficher dans les sections (optionnel)</label>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-top: 0.5rem;">
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.5rem; background: var(--whisper); border-radius: 8px; transition: all 0.2s ease;">
                            <input type="checkbox" class="edit-resources-section-checkbox" value="lire" style="cursor: pointer;">
                            <span style="font-size: 0.9rem; color: var(--text);">📚 Le Coin Lecture</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.5rem; background: var(--whisper); border-radius: 8px; transition: all 0.2s ease;">
                            <input type="checkbox" class="edit-resources-section-checkbox" value="ecouter" style="cursor: pointer;">
                            <span style="font-size: 0.9rem; color: var(--text);">🎵 Le Studio d'Écoute</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.5rem; background: var(--whisper); border-radius: 8px; transition: all 0.2s ease;">
                            <input type="checkbox" class="edit-resources-section-checkbox" value="parler" style="cursor: pointer;">
                            <span style="font-size: 0.9rem; color: var(--text);">🗣️ Le Parloir</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.5rem; background: var(--whisper); border-radius: 8px; transition: all 0.2s ease;">
                            <input type="checkbox" class="edit-resources-section-checkbox" value="ecrire" style="cursor: pointer;">
                            <span style="font-size: 0.9rem; color: var(--text);">✍️ Le Salon d'Écriture</span>
                        </label>
                    </div>
                    <p style="font-size: 0.8rem; color: var(--text-soft); margin-top: 0.5rem; font-style: italic;">Cette ressource apparaîtra dans les sections sélectionnées</p>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('edit-resources-modal')">Annuler</button>
                    <button type="submit" class="btn btn-primary">Sauvegarder</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Note Modal -->
    <div class="modal" id="note-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Ajouter une note</h2>
                <button class="close-btn" onclick="closeModal('note-modal')">&times;</button>
            </div>
            
            <form id="note-form">
                <div class="form-group">
                    <label class="form-label">Catégorie</label>
                    <select class="form-select" id="note-category" required>
                        <option value="">Choisir...</option>
                        <option value="grammaire">Grammaire</option>
                        <option value="prononciation">Prononciation</option>
                        <option value="phrases">Phrases</option>
                        <option value="vocabulaire">Vocabulaire</option>
                        <option value="culture">Culture</option>
                        <option value="autre">Autre</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Titre / Question</label>
                    <input type="text" class="form-input" id="note-title" placeholder="ex: Comment utiliser le subjonctif ?" required>
                </div>

                <div class="form-group">
                    <label class="form-label">Contenu / Réponse</label>
                    <textarea class="form-textarea" id="note-content" rows="6" placeholder="Écris ta note ici..." required></textarea>
                </div>

                <div class="form-group">
                    <label class="form-label">Lien (optionnel)</label>
                    <input type="url" class="form-input" id="note-link" placeholder="https://...">
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('note-modal')">Annuler</button>
                    <button type="submit" class="btn btn-primary">Sauvegarder</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Edit Note Modal -->
    <div class="modal" id="edit-note-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Modifier la note</h2>
                <button class="close-btn" onclick="closeModal('edit-note-modal')">&times;</button>
            </div>
            
            <form id="edit-note-form">
                <input type="hidden" id="edit-note-id">
                <div class="form-group">
                    <label class="form-label">Catégorie</label>
                    <select class="form-select" id="edit-note-category" required>
                        <option value="">Choisir...</option>
                        <option value="grammaire">Grammaire</option>
                        <option value="prononciation">Prononciation</option>
                        <option value="phrases">Phrases</option>
                        <option value="vocabulaire">Vocabulaire</option>
                        <option value="culture">Culture</option>
                        <option value="autre">Autre</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Titre / Question</label>
                    <input type="text" class="form-input" id="edit-note-title" placeholder="ex: Comment utiliser le subjonctif ?" required>
                </div>

                <div class="form-group">
                    <label class="form-label">Contenu / Réponse</label>
                    <textarea class="form-textarea" id="edit-note-content" rows="6" placeholder="Écris ta note ici..." required></textarea>
                </div>

                <div class="form-group">
                    <label class="form-label">Lien (optionnel)</label>
                    <input type="url" class="form-input" id="edit-note-link" placeholder="https://...">
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('edit-note-modal')">Annuler</button>
                    <button type="submit" class="btn btn-primary">Sauvegarder</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Edit Recording Modal -->
    <div class="modal" id="edit-recording-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Modifier l'enregistrement</h2>
                <button class="close-btn" onclick="closeModal('edit-recording-modal')">&times;</button>
            </div>
            
            <form id="edit-recording-form">
                <input type="hidden" id="edit-recording-id">
                <div class="form-group">
                    <label class="form-label">Question</label>
                    <input type="text" class="form-input" id="edit-recording-question" placeholder="La question que tu as répondu...">
                </div>

                <div class="form-group">
                    <label class="form-label">Note supplémentaire</label>
                    <textarea class="form-textarea" id="edit-recording-note" placeholder="Ajoute ou modifie ta note..."></textarea>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('edit-recording-modal')">Annuler</button>
                    <button type="submit" class="btn btn-primary">Sauvegarder</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Edit Writing Modal -->
    <div class="modal" id="edit-writing-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Modifier l'écriture</h2>
                <button class="close-btn" onclick="closeModal('edit-writing-modal')">&times;</button>
            </div>
            
            <form id="edit-writing-form">
                <input type="hidden" id="edit-writing-id">
                <div class="form-group">
                    <label class="form-label">Titre (optionnel)</label>
                    <input type="text" class="form-input" id="edit-writing-title" placeholder="Titre de ton écriture...">
                </div>
                <div class="form-group">
                    <label class="form-label">Texte</label>
                    <textarea class="form-textarea" id="edit-writing-text" rows="10" placeholder="Modifie ton texte ici..." required></textarea>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('edit-writing-modal')">Annuler</button>
                    <button type="submit" class="btn btn-primary">Sauvegarder</button>
                </div>
            </form>
        </div>
    </div>

    <!-- AI Analysis Modal -->
    <div class="modal" id="ai-analysis-modal">
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h2 class="modal-title">Analyser avec IA</h2>
                <button class="close-btn" onclick="closeModal('ai-analysis-modal')">&times;</button>
            </div>
            
            <div class="form-group">
                <label class="form-label">Choisis ton IA</label>
                <div class="ai-selector">
                    <button class="ai-option active" data-ai="claude">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                        </svg>
                        Claude
                    </button>
                    <button class="ai-option" data-ai="chatgpt">
                        <svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px;">
                            <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
                        </svg>
                        ChatGPT
                    </button>
                    <button class="ai-option" data-ai="deepseek">
                        <svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px;">
                            <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5zm0 18.5c-4.42-.99-7.5-5.37-7.5-9.5V8.3l7.5-3.75L19.5 8.3V11c0 4.13-3.08 8.51-7.5 9.5z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                        DeepSeek
                    </button>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">Question pour l'IA</label>
                <select class="form-input" id="ai-question-select">
                    <option value="analyze">Analyse générale de mon texte</option>
                    <option value="grammar">Vérifie la grammaire et l'orthographe</option>
                    <option value="improve">Comment puis-je améliorer ce texte?</option>
                    <option value="style">Analyse le style et le ton</option>
                    <option value="continue">Continue ce texte pour moi</option>
                    <option value="custom">Question personnalisée</option>
                </select>
            </div>

            <div class="form-group" id="custom-question-group" style="display: none;">
                <textarea class="form-textarea" id="custom-ai-question" rows="3" placeholder="Pose ta question personnalisée..."></textarea>
            </div>

            <div id="ai-result-container" style="display: none; margin-top: 1.5rem;">
                <div class="ai-result-header">
                    <strong>Réponse:</strong>
                    <button class="btn btn-secondary btn-sm" id="copy-ai-result">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                    </button>
                </div>
                <div class="ai-result-text" id="ai-result-text"></div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal('ai-analysis-modal')">Fermer</button>
                <button type="button" class="btn btn-primary" id="send-to-ai-btn">
                    <span id="ai-btn-text">Envoyer</span>
                    <span id="ai-loading" style="display: none;">Analyse...</span>
                </button>
            </div>

            <div class="ai-disclaimer">
                ⚠️ Cette fonctionnalité ouvre l'IA choisie dans un nouvel onglet avec ta question. Tu devras coller ton texte manuellement.
            </div>
        </div>
    </div>

    <!-- Hidden file input for import -->
    <input type="file" id="import-file-input" accept=".json" style="display: none;">

    <!-- Add Reading Transcript Modal -->
    <div class="modal" id="add-reading-transcript-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Ajouter une transcription</h2>
                <button class="close-btn" onclick="closeModal('add-reading-transcript-modal')">&times;</button>
            </div>
            
            <form id="add-reading-transcript-form">
                <div class="form-group">
                    <label class="form-label">Titre</label>
                    <input type="text" class="form-input" id="reading-transcript-title" placeholder="Ex: Article du Monde" required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">📝 Texte français</label>
                    <textarea class="form-textarea" id="reading-transcript-text" rows="8" placeholder="Colle le texte français ici..." required></textarea>
                </div>

                <div style="text-align: center; margin: 1rem 0;">
                    <button type="button" class="btn btn-secondary" id="translate-reading-btn" style="display: flex; align-items: center; gap: 0.5rem; margin: 0 auto;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M10 14h4"></path>
                        </svg>
                        Traduire automatiquement
                    </button>
                </div>

                <div class="form-group">
                    <label class="form-label">🌍 Traduction anglaise (éditable)</label>
                    <textarea class="form-textarea" id="reading-transcript-translation" rows="8" placeholder="Traduction automatique ou manuelle..." style="background: var(--cream-light);"></textarea>
                </div>

                <div class="form-group">
                    <label class="form-label">🔗 Lier à un matériel de lecture (optionnel)</label>
                    <select class="form-select" id="reading-transcript-linked-material">
                        <option value="">Aucun lien</option>
                    </select>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('add-reading-transcript-modal')">Annuler</button>
                    <button type="submit" class="btn btn-primary">Ajouter</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Add Listening Transcript Modal -->
    <div class="modal" id="add-listening-transcript-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Ajouter une transcription</h2>
                <button class="close-btn" onclick="closeModal('add-listening-transcript-modal')">&times;</button>
            </div>
            
            <form id="add-listening-transcript-form">
                <div class="form-group">
                    <label class="form-label">Titre</label>
                    <input type="text" class="form-input" id="listening-transcript-title" placeholder="Ex: Paroles de chanson" required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">📝 Texte français (paroles/transcription)</label>
                    <div style="margin-bottom: 0.5rem;">
                        <a href="https://downsub.com/" target="_blank" class="btn btn-secondary" style="display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; padding: 0.5rem 1rem;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                            </svg>
                            📄 Get Transcript (DownSub)
                        </a>
                    </div>
                    <textarea class="form-textarea" id="listening-transcript-text" rows="8" placeholder="Colle les paroles ici..." required></textarea>
                </div>
                
                <!-- Display Area with Clickable Words -->
                <div class="form-group" id="listening-clickable-transcript-area" style="display: none;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <label class="form-label" style="margin: 0;">✨ Clique sur les mots pour chercher</label>
                        <button type="button" id="toggle-transcript-btn" class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.85rem; display: flex; align-items: center; gap: 0.3rem;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="transcript-chevron">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                            <span id="transcript-toggle-text">Replier</span>
                        </button>
                    </div>
                    <div id="listening-clickable-transcript" style="background: var(--cream-dark); padding: 1.5rem; border-radius: 12px; line-height: 1.8; font-size: 1.1rem; max-height: 400px; overflow-y: auto; cursor: text; user-select: text; transition: max-height 0.3s ease, padding 0.3s ease;"></div>
                </div>

                <div style="text-align: center; margin: 1rem 0;">
                    <button type="button" class="btn btn-secondary" id="translate-listening-btn" style="display: flex; align-items: center; gap: 0.5rem; margin: 0 auto;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M10 14h4"></path>
                        </svg>
                        Traduire automatiquement
                    </button>
                </div>

                <div class="form-group">
                    <label class="form-label">🌍 Traduction anglaise (éditable)</label>
                    <textarea class="form-textarea" id="listening-transcript-translation" rows="8" placeholder="Traduction automatique ou manuelle..." style="background: var(--cream-light);"></textarea>
                </div>

                <div class="form-group">
                    <label class="form-label">🔗 Lier à un matériel d'écoute (optionnel)</label>
                    <select class="form-select" id="listening-transcript-linked-material">
                        <option value="">Aucun lien</option>
                    </select>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('add-listening-transcript-modal')">Annuler</button>
                    <button type="submit" class="btn btn-primary">Ajouter</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Word Lookup Popup -->
    <div class="modal" id="word-lookup-modal" style="z-index: 10000;">
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2 class="modal-title">🔍 Définition du mot</h2>
                <button class="close-btn" onclick="closeModal('word-lookup-modal')">&times;</button>
            </div>
            
            <!-- Editable Word Field -->
            <div style="padding: 1.5rem; padding-bottom: 0;">
                <div class="form-group">
                    <label class="form-label">Mot (éditable)</label>
                    <input type="text" class="form-input" id="lookup-word-input" style="font-size: 1.3rem; font-weight: 600; color: var(--burgundy);">
                </div>
            </div>
            
            <div id="lookup-content" style="padding: 1.5rem;">
                <div style="text-align: center; padding: 2rem; color: var(--text-soft);">
                    Chargement...
                </div>
            </div>

            <!-- Dictionary Buttons -->
            <div style="padding: 0 1.5rem 1rem;">
                <label class="form-label">Ou chercher dans un dictionnaire</label>
                <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem;">
                    <button onclick="openDictionaryFromLookup('collins')" class="btn btn-secondary" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem; font-size: 0.9rem;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                        </svg>
                        <span>Collins</span>
                    </button>
                    
                    <button onclick="openDictionaryFromLookup('reverso')" class="btn btn-secondary" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem; font-size: 0.9rem;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="2" y1="12" x2="22" y2="12"></line>
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                        </svg>
                        <span>Reverso</span>
                    </button>
                    
                    <button onclick="openDictionaryFromLookup('linguee')" class="btn btn-secondary" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem; font-size: 0.9rem;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                        <span>Linguee</span>
                    </button>
                </div>
            </div>

            <div class="form-actions" id="lookup-actions" style="display: none;">
                <button type="button" class="btn btn-secondary" onclick="closeModal('word-lookup-modal')">Annuler</button>
                <button type="button" class="btn btn-primary" id="save-lookup-word">Ajouter à Le Jardin</button>
            </div>
        </div>
    </div>

    <!-- Dictionary Lookup Modal -->
    <div class="modal" id="dictionary-lookup-modal" style="z-index: 10001;">
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2 class="modal-title">🔍 Mot cliqué</h2>
                <button class="close-btn" onclick="closeDictionaryLookup()">&times;</button>
            </div>
            
            <div style="padding: 1.5rem;">
                <div class="form-group">
                    <label class="form-label">Mot (éditable)</label>
                    <input type="text" class="form-input" id="dictionary-word-input" style="font-size: 1.3rem; font-weight: 600; color: var(--burgundy);">
                </div>
                
                <!-- Translation Display -->
                <div class="form-group" id="translation-display" style="display: none;">
                    <label class="form-label" style="font-size: 0.9rem; margin-bottom: 0.5rem;">Traduction (éditable)</label>
                    <input type="text" class="form-input" id="translation-text" style="font-size: 1.1rem; color: var(--burgundy); font-weight: 500; background: var(--cream-light);" placeholder="Modifier ou ajouter traduction...">
                    <div id="translation-loading" style="font-size: 0.9rem; color: var(--text-soft); font-style: italic; margin-top: 0.5rem;">Chargement...</div>
                </div>
                
                <!-- Add to Le Jardin Button -->
                <div class="form-group">
                    <button onclick="addWordToJardinFromLookup()" class="btn btn-primary" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                        <span>Ajouter à Le Jardin</span>
                    </button>
                </div>
                
                <!-- Reading Passage Quick Actions (only shown when from passage) -->
                <div class="form-group" id="reading-passage-quick-actions" style="display: none;">
                    <label class="form-label" style="font-size: 0.9rem; color: var(--text-soft);">Marquer ce mot dans ce texte:</label>
                    <button onclick="markWordAsUnknownInPassageFromModal()" class="btn btn-secondary" style="width: 100%; font-size: 0.9rem; padding: 0.6rem; background: rgba(255, 215, 0, 0.2); border-color: #FFD700;">
                        ⭐ Je ne connais pas ce mot
                    </button>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Ou chercher dans un dictionnaire</label>
                    <div style="display: flex; gap: 0.75rem; margin-top: 1rem;">
                        <button onclick="openDictionary('collins')" class="btn btn-secondary" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                            </svg>
                            <span>Collins</span>
                        </button>
                        
                        <button onclick="openDictionary('reverso')" class="btn btn-secondary" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="2" y1="12" x2="22" y2="12"></line>
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                            </svg>
                            <span>Reverso</span>
                        </button>
                        
                        <button onclick="openDictionary('linguee')" class="btn btn-secondary" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                            <span>Linguee</span>
                        </button>
                    </div>
                </div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeDictionaryLookup()">Fermer</button>
            </div>
        </div>
    </div>

    <!-- Floating Heart -->
    <svg class="floating-heart" id="floating-heart" width="80" height="80" viewBox="0 0 24 24" fill="#A64253">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
    </svg>

    <script>
        // ============================================
        // FIREBASE SYNC FUNCTIONS (MUST BE FIRST!)
        // ============================================
        window.currentUser = null;
        let saveTimeout;
        
        // Safe sync function that can be called even before Firebase is ready
        window.syncToFirebase = function() {
            console.log('🔔 syncToFirebase called!');
            console.log('   currentUser:', window.currentUser ? window.currentUser.email : 'null');
            console.log('   firebaseReady:', window.firebaseReady);
            console.log('   vocabulary length:', vocabulary.length);
            console.log('   readingPassages length:', readingPassages.length);
            
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                // If Firebase is ready and user is logged in, save to Firebase
                if (window.currentUser && window.firebaseReady) {
                    console.log('📤 Syncing to Firebase...');
                    saveDataToFirebase();
                } else {
                    // Fallback: Save to localStorage
                    console.log('💾 Firebase not ready - saving to localStorage instead');
                    saveToLocalStorage();
                }
            }, 1000); // Wait 1 second after last change
        };
        
        // Save all data to Firebase
        async function saveDataToFirebase() {
            console.log('💾 saveDataToFirebase called!');
            
            if (!window.currentUser) {
                console.error('❌ Save failed - not logged in');
                return;
            }
            
            if (!window.firebaseModules) {
                console.error('❌ Save failed - Firebase modules not loaded');
                return;
            }
            
            const { doc, setDoc } = window.firebaseModules;
            
            console.log('📊 Saving data:');
            console.log('   - vocabulary:', vocabulary.length, 'items');
            console.log('   - writings:', writings.length, 'items');
            console.log('   - readingList:', readingList.length, 'items');
            console.log('   - listeningList:', listeningList.length, 'items');
            console.log('   - recordings:', recordings.length, 'items');
            console.log('   - notes:', notes.length, 'items');
            console.log('   - resourcesList:', resourcesList.length, 'items');
            console.log('   - readingTranscripts:', readingTranscripts.length, 'items');
            console.log('   - listeningTranscripts:', listeningTranscripts.length, 'items');
            console.log('   - readingPassages:', readingPassages.length, 'items');
            console.log('   - presenceData:', Object.keys(presenceData).length, 'days');
            console.log('   - mistakeCorrections:', (mistakeCorrections || []).length, 'corrections');
            
            // Show sync indicator
            const syncIndicator = document.getElementById('sync-indicator');
            if (syncIndicator) syncIndicator.style.opacity = '1';
            
            try {
                await setDoc(doc(window.firebaseDB, 'users', window.currentUser.uid), {
                    vocabulary,
                    readingList,
                    listeningList,
                    recordings,
                    writings,
                    notes,
                    resourcesList,
                    readingTranscripts,
                    listeningTranscripts,
                    readingPassages,
                    presenceData,
                    mistakeCorrections: mistakeCorrections || [],
                    lastUpdated: new Date().toISOString()
                });
                
                console.log('✅ Data saved to Firebase successfully!');
                
                // Hide sync indicator after a moment
                setTimeout(() => {
                    if (syncIndicator) {
                        syncIndicator.textContent = '✓ Sauvegardé';
                        setTimeout(() => {
                            syncIndicator.style.opacity = '0';
                            setTimeout(() => {
                                syncIndicator.textContent = '☁️ Sync...';
                            }, 300);
                        }, 1000);
                    }
                }, 200);
            } catch (error) {
                console.error('❌ Error saving to Firebase:', error);
                console.error('   Error details:', error.code, error.message);
                // Show error in indicator
                if (syncIndicator) {
                    syncIndicator.textContent = '✗ Erreur';
                    syncIndicator.style.color = 'var(--crimson)';
                    setTimeout(() => {
                        syncIndicator.style.opacity = '0';
                        setTimeout(() => {
                            syncIndicator.textContent = '☁️ Sync...';
                            syncIndicator.style.color = 'var(--gold)';
                        }, 300);
                    }, 2000);
                }
            }
        }
        
        // Save to localStorage as fallback when Firebase isn't available
        function saveToLocalStorage() {
            console.log('💾 Saving to localStorage...');
            console.log('   - readingPassages:', readingPassages.length, 'items');
            
            try {
                localStorage.setItem('vocabulary', JSON.stringify(vocabulary));
                localStorage.setItem('readingList', JSON.stringify(readingList));
                localStorage.setItem('listeningList', JSON.stringify(listeningList));
                localStorage.setItem('recordings', JSON.stringify(recordings));
                localStorage.setItem('writings', JSON.stringify(writings));
                localStorage.setItem('notes', JSON.stringify(notes));
                localStorage.setItem('resourcesList', JSON.stringify(resourcesList));
                localStorage.setItem('readingTranscripts', JSON.stringify(readingTranscripts));
                localStorage.setItem('listeningTranscripts', JSON.stringify(listeningTranscripts));
                localStorage.setItem('readingPassages', JSON.stringify(readingPassages));
                localStorage.setItem('presenceData', JSON.stringify(presenceData));
                localStorage.setItem('mistakeCorrections', JSON.stringify(mistakeCorrections || []));
                
                console.log('✅ Data saved to localStorage successfully!');
                
                // Show indicator
                const syncIndicator = document.getElementById('sync-indicator');
                if (syncIndicator) {
                    syncIndicator.textContent = '💾 Local';
                    syncIndicator.style.opacity = '1';
                    setTimeout(() => {
                        syncIndicator.style.opacity = '0';
                        setTimeout(() => {
                            syncIndicator.textContent = '☁️ Sync...';
                        }, 300);
                    }, 1500);
                }
            } catch (error) {
                console.error('❌ Error saving to localStorage:', error);
            }
        }
        
        // Load from localStorage
        function loadFromLocalStorage() {
            console.log('📦 Loading from localStorage...');
            
            try {
                const localVocab = localStorage.getItem('vocabulary');
                const localReadings = localStorage.getItem('readingList');
                const localListening = localStorage.getItem('listeningList');
                const localRecordings = localStorage.getItem('recordings');
                const localWritings = localStorage.getItem('writings');
                const localNotes = localStorage.getItem('notes');
                const localResources = localStorage.getItem('resourcesList');
                const localReadingTranscripts = localStorage.getItem('readingTranscripts');
                const localListeningTranscripts = localStorage.getItem('listeningTranscripts');
                const localPassages = localStorage.getItem('readingPassages');
                const localPresence = localStorage.getItem('presenceData');
                const localMistakes = localStorage.getItem('mistakeCorrections');
                
                if (localVocab) vocabulary = JSON.parse(localVocab);
                if (localReadings) readingList = JSON.parse(localReadings);
                if (localListening) listeningList = JSON.parse(localListening);
                if (localRecordings) recordings = JSON.parse(localRecordings);
                if (localWritings) writings = JSON.parse(localWritings);
                if (localNotes) notes = JSON.parse(localNotes);
                if (localResources) resourcesList = JSON.parse(localResources);
                if (localReadingTranscripts) readingTranscripts = JSON.parse(localReadingTranscripts);
                if (localListeningTranscripts) listeningTranscripts = JSON.parse(localListeningTranscripts);
                if (localPassages) readingPassages = JSON.parse(localPassages);
                if (localPresence) presenceData = JSON.parse(localPresence);
                if (localMistakes) mistakeCorrections = JSON.parse(localMistakes);
                
                console.log('✅ Loaded from localStorage:', {
                    vocabulary: vocabulary.length,
                    readingList: readingList.length,
                    listeningList: listeningList.length,
                    recordings: recordings.length,
                    writings: writings.length,
                    notes: notes.length,
                    resourcesList: resourcesList.length,
                    readingTranscripts: readingTranscripts.length,
                    listeningTranscripts: listeningTranscripts.length,
                    readingPassages: readingPassages.length,
                    presenceData: Object.keys(presenceData).length,
                    mistakeCorrections: (mistakeCorrections || []).length
                });
                
                // Rebuild presence data
                rebuildPresenceDataFromEntries();
                
                // Render everything - wrapped in try-catch to prevent crashes
                if (typeof renderGarden !== 'undefined') {
                    try { renderGarden(); } catch (e) { console.warn('renderGarden error:', e); }
                    try { renderReadingList(); } catch (e) { console.warn('renderReadingList error:', e); }
                    try { renderReadingPassages(); } catch (e) { console.warn('renderReadingPassages error:', e); }
                    try { renderListeningList(); } catch (e) { console.warn('renderListeningList error:', e); }
                    try { renderRecordings(); } catch (e) { console.warn('renderRecordings error:', e); }
                    try { renderWritingsArchive(); } catch (e) { console.warn('renderWritingsArchive error:', e); }
                    try { renderNotes(); } catch (e) { console.warn('renderNotes error:', e); }
                    try { renderResourcesList(); } catch (e) { console.warn('renderResourcesList error:', e); }
                    try { renderTranscripts('reading'); } catch (e) { console.warn('renderTranscripts(reading) error:', e); }
                    try { renderTranscripts('listening'); } catch (e) { console.warn('renderTranscripts(listening) error:', e); }
                    try { initializeSRSData(); } catch (e) { console.warn('initializeSRSData error:', e); }
                    try { updateSRSStatsDisplay(); } catch (e) { console.warn('updateSRSStatsDisplay error:', e); }
                    try { updatePresenceUI(); } catch (e) { console.warn('updatePresenceUI error:', e); }
                    try { updateDebugPanel(); } catch (e) { console.warn('updateDebugPanel error:', e); }
                }
            } catch (error) {
                console.error('❌ Error loading from localStorage:', error);
            }
        }
        
        console.log('✅ Firebase sync functions ready!');
        
        // ============================================
        // SVG ANIMATIONS
        // ============================================
        const animationContainer = document.getElementById('animationContainer');

        // SVG Definitions
        const heartSVG = `
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" 
                      fill="#ff6b8a" opacity="0.8"/>
            </svg>
        `;

        const musicNoteSVG = `
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" 
                      fill="#c9a861" opacity="0.7"/>
            </svg>
        `;

        function createFloatingHeart() {
            // DISABLED - No floating hearts animation
            return;
        }

        // Animation triggers
        let musicNoteInterval = null;

        // Create musical note (when music is playing)
        function createMusicalNote() {
            const note = document.createElement('div');
            note.className = 'musical-note';
            note.innerHTML = musicNoteSVG;
            
            const randomX = Math.random() * window.innerWidth;
            const rotation = (Math.random() - 0.5) * 720;
            
            note.style.left = randomX + 'px';
            note.style.bottom = '0px';
            note.style.setProperty('--rotation', rotation + 'deg');
            
            animationContainer.appendChild(note);
            
            setTimeout(() => note.remove(), 5000);
        }

        // Create firefly/світлячок (dark mode only)
        // Start/stop music note animations
        function startMusicNoteAnimations() {
            if (musicNoteInterval) return;
            
            musicNoteInterval = setInterval(() => {
                createMusicalNote();
            }, 3000); // Every 3 seconds while music plays
        }

        function stopMusicNoteAnimations() {
            if (musicNoteInterval) {
                clearInterval(musicNoteInterval);
                musicNoteInterval = null;
            }
        }

        // Initialize animations on page load
        document.addEventListener('DOMContentLoaded', () => {
            // Check dark mode and start sparkles if appropriate
            if (document.body.classList.contains('dark-mode')) {
            }
        });

        // ============================================
        // DATA MANAGEMENT
        // ============================================
        // Initialize empty - will load from localStorage first, then Firebase when user logs in
        let vocabulary = [];
        let writings = [];
        let readingList = [];
        let listeningList = [];
        let recordings = [];
        let resourcesList = [];
        let notes = [];
        let readingPassages = []; // Interactive reading passages
        let readingTranscripts = []; // Reading transcripts
        let listeningTranscripts = []; // Listening transcripts
        let mistakeCorrections = []; // Mistake corrections for learning

        // IMMEDIATELY load from localStorage on page load (before Firebase is ready)
        console.log('🚀 Page loading - checking localStorage for data...');
        try {
            const localVocab = localStorage.getItem('vocabulary');
            const localReadings = localStorage.getItem('readingList');
            const localListening = localStorage.getItem('listeningList');
            const localRecordings = localStorage.getItem('recordings');
            const localWritings = localStorage.getItem('writings');
            const localNotes = localStorage.getItem('notes');
            const localResources = localStorage.getItem('resourcesList');
            const localReadingTranscripts = localStorage.getItem('readingTranscripts');
            const localListeningTranscripts = localStorage.getItem('listeningTranscripts');
            const localPassages = localStorage.getItem('readingPassages');
            
            if (localVocab) vocabulary = JSON.parse(localVocab);
            if (localReadings) readingList = JSON.parse(localReadings);
            if (localListening) listeningList = JSON.parse(localListening);
            if (localRecordings) recordings = JSON.parse(localRecordings);
            if (localWritings) writings = JSON.parse(localWritings);
            if (localNotes) notes = JSON.parse(localNotes);
            if (localResources) resourcesList = JSON.parse(localResources);
            if (localReadingTranscripts) readingTranscripts = JSON.parse(localReadingTranscripts);
            if (localListeningTranscripts) listeningTranscripts = JSON.parse(localListeningTranscripts);
            if (localPassages) readingPassages = JSON.parse(localPassages);
            
            console.log('✅ Pre-loaded from localStorage:', {
                vocabulary: vocabulary.length,
                readingTranscripts: readingTranscripts.length,
                listeningTranscripts: listeningTranscripts.length,
                readingPassages: readingPassages.length
            });
        } catch (e) {
            console.warn('⚠️ Could not pre-load from localStorage:', e);
        }

        let currentRecording = null;
        let activeWordPopup = null; // Track current word popup

        // Easter egg click counters
        let logoSubClicks = 0;
        let logoMainClicks = 0;
        let logoSubTimer = null;
        let logoMainTimer = null;

        // ============================================
        // PRESENCE TRACKING SYSTEM
        // ============================================
        
        // Presence data structure - will sync with Firebase
        let presenceData = {};
        
        // Action types
        const ACTION_TYPES = {
            WRITING: 'writing',
            SPEAKING: 'speaking',
            LISTENING: 'listening',
            READING: 'reading',
            NEW_WORD: 'new_word'
        };

        // Time-based greetings
        const GREETINGS = {
            morning: [
                "Bonjour, tu es revenu chez toi.",
                "Nouvelle journée, nouveau mot.",
                "On apprend doucement aujourd'hui.",
                "Bienvenue dans ta maison française.",
                "Le matin est doux, comme ton apprentissage."
            ],
            afternoon: [
                "Bon après-midi. Ta maison t'attend.",
                "L'après-midi est à toi.",
                "On continue en douceur.",
                "Prends ton temps cet après-midi.",
                "Tu es là, c'est ce qui compte."
            ],
            evening: [
                "Bonsoir. Ta maison française t'attend.",
                "On révise doucement ce soir.",
                "Tu peux être fier d'être là.",
                "La soirée est calme, apprends en paix.",
                "Bonsoir, entre et installe-toi."
            ],
            night: [
                "Bonne nuit. Même quelques minutes comptent.",
                "La nuit est douce pour apprendre.",
                "Tu es là, même tard. C'est beau.",
                "Quelques mots avant de dormir.",
                "La maison est ouverte, même la nuit."
            ],
            rare: [
                "Chaque mot est une fenêtre.",
                "Tu construis quelque chose de beau.",
                "Le français devient tien, doucement.",
                "Présence, pas perfection.",
                "Ta régularité est ta force."
            ]
        };

        let lastGreeting = null;

        function getTimeBasedGreeting() {
            const hour = new Date().getHours();
            let timeBlock;
            
            if (hour >= 5 && hour < 12) timeBlock = 'morning';
            else if (hour >= 12 && hour < 18) timeBlock = 'afternoon';
            else if (hour >= 18 && hour < 23) timeBlock = 'evening';
            else timeBlock = 'night';
            
            // 5% chance for rare poetic greeting
            if (Math.random() < 0.05) {
                const rareGreetings = GREETINGS.rare;
                return rareGreetings[Math.floor(Math.random() * rareGreetings.length)];
            }
            
            // Get greeting from time block, avoid repeating last one
            const greetings = GREETINGS[timeBlock];
            let greeting;
            do {
                greeting = greetings[Math.floor(Math.random() * greetings.length)];
            } while (greeting === lastGreeting && greetings.length > 1);
            
            lastGreeting = greeting;
            return greeting;
        }

        function getTodayDate() {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`; // LOCAL timezone
        }

        function initPresenceForToday() {
            const today = getTodayDate();
            if (!presenceData[today]) {
                presenceData[today] = {
                    date: today,
                    actions: {
                        writing: false,
                        speaking: false,
                        listening: false,
                        reading: false,
                        new_word: false
                    },
                    totalActions: 0
                };
                savePresenceData();
            }
            return presenceData[today];
        }

        function logAction(actionType) {
            const today = initPresenceForToday();
            if (!today.actions[actionType]) {
                today.actions[actionType] = true;
                today.totalActions = Object.values(today.actions).filter(Boolean).length;
                savePresenceData();
                updatePresenceUI();
            }
        }

        // NEW: Rebuild presenceData from existing entries
        function rebuildPresenceDataFromEntries() {
            console.log('🔄 Rebuilding presence data from existing entries...');
            
            // Keep existing presenceData structure, just add missing dates
            const newPresenceData = {...presenceData};
            
            // Helper to add action to a date
            function addActionToDate(dateStr, actionType) {
                if (!newPresenceData[dateStr]) {
                    newPresenceData[dateStr] = {
                        date: dateStr,
                        actions: {
                            writing: false,
                            speaking: false,
                            listening: false,
                            reading: false,
                            new_word: false
                        },
                        totalActions: 0
                    };
                }
                if (!newPresenceData[dateStr].actions[actionType]) {
                    newPresenceData[dateStr].actions[actionType] = true;
                    newPresenceData[dateStr].totalActions = Object.values(newPresenceData[dateStr].actions).filter(Boolean).length;
                }
            }
            
            // Scan vocabulary (new words)
            if (vocabulary && vocabulary.length > 0) {
                vocabulary.forEach(word => {
                    if (word.created) {
                        const dateStr = word.created.split('T')[0];
                        addActionToDate(dateStr, 'new_word');
                    }
                });
                console.log(`  ✅ Processed ${vocabulary.length} vocabulary words`);
            }
            
            // Scan writings
            if (writings && writings.length > 0) {
                writings.forEach(writing => {
                    if (writing.created) {
                        const dateStr = writing.created.split('T')[0];
                        addActionToDate(dateStr, 'writing');
                    }
                });
                console.log(`  ✅ Processed ${writings.length} writings`);
            }
            
            // Scan readings
            if (readingList && readingList.length > 0) {
                readingList.forEach(reading => {
                    if (reading.created) {
                        const dateStr = reading.created.split('T')[0];
                        addActionToDate(dateStr, 'reading');
                    }
                });
                console.log(`  ✅ Processed ${readingList.length} readings`);
            }
            
            // Scan listening
            if (listeningList && listeningList.length > 0) {
                listeningList.forEach(listening => {
                    if (listening.created) {
                        const dateStr = listening.created.split('T')[0];
                        addActionToDate(dateStr, 'listening');
                    }
                });
                console.log(`  ✅ Processed ${listeningList.length} listening entries`);
            }
            
            // Scan recordings (speaking)
            if (recordings && recordings.length > 0) {
                recordings.forEach(recording => {
                    if (recording.created) {
                        const dateStr = recording.created.split('T')[0];
                        addActionToDate(dateStr, 'speaking');
                    }
                });
                console.log(`  ✅ Processed ${recordings.length} recordings`);
            }
            
            // Update presenceData
            presenceData = newPresenceData;
            console.log(`✅ Rebuilt presence data for ${Object.keys(presenceData).length} days`);
            
            // Save and update UI
            savePresenceData();
            updatePresenceUI();
        }

        function savePresenceData() {
            // Sync to Firebase instead of localStorage
            if (window.syncToFirebase) window.syncToFirebase();
        }

        function calculateStreak() {
            const dates = Object.keys(presenceData).sort().reverse();
            let currentStreak = 0;
            let longestStreak = 0;
            let tempStreak = 0;
            
            const today = getTodayDate();
            let checkDate = new Date(today);
            
            // Calculate current streak
            while (true) {
                const dateStr = checkDate.toISOString().split('T')[0];
                if (presenceData[dateStr] && presenceData[dateStr].totalActions > 0) {
                    currentStreak++;
                } else {
                    break;
                }
                checkDate.setDate(checkDate.getDate() - 1);
            }
            
            // Calculate longest streak
            for (const date of dates) {
                if (presenceData[date].totalActions > 0) {
                    tempStreak++;
                    longestStreak = Math.max(longestStreak, tempStreak);
                } else {
                    tempStreak = 0;
                }
            }
            
            return { currentStreak, longestStreak };
        }

        function updatePresenceUI() {
            // Update greeting
            const greetingEl = document.getElementById('time-greeting');
            if (greetingEl) {
                greetingEl.textContent = getTimeBasedGreeting();
            }
            
            // Update streak
            const streakEl = document.getElementById('presence-streak');
            if (streakEl) {
                const { currentStreak, longestStreak } = calculateStreak();
                if (currentStreak > 0) {
                    streakEl.innerHTML = `🌱 Tu es venu <strong>${currentStreak}</strong> jour${currentStreak > 1 ? 's' : ''} de suite`;
                } else {
                    streakEl.innerHTML = 'La maison est toujours ouverte. <svg viewBox="0 0 24 24" fill="currentColor" style="width: 18px; height: 18px; vertical-align: middle; display: inline-block;"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>';
                }
            }
            
            // Update today's actions
            const todayActionsEl = document.getElementById('today-actions');
            if (todayActionsEl) {
                const today = initPresenceForToday();
                const actionSvgs = {
                    writing: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
                    speaking: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>',
                    listening: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/></svg>',
                    reading: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/></svg>',
                    new_word: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>'
                };
                const actionLabels = {
                    writing: 'Écriture',
                    speaking: 'Parole',
                    listening: 'Écoute',
                    reading: 'Lecture',
                    new_word: 'Nouveau mot'
                };
                
                todayActionsEl.innerHTML = Object.entries(actionSvgs).map(([action, svg]) => `
                    <div class="action-badge ${today.actions[action] ? 'active' : ''}">
                        ${svg}
                        <span>${actionLabels[action]}</span>
                    </div>
                `).join('');
            }
            
            // Render calendar
            renderPresenceCalendar();
        }

        // Current viewing month/year
        let viewingMonth = new Date().getMonth();
        let viewingYear = new Date().getFullYear();

        function renderPresenceCalendar() {
            const container = document.getElementById('presence-calendar-months');
            if (!container) return;
            
            // SVG icon paths
            const svgIcons = {
                writing: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
                speaking: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>',
                listening: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/></svg>',
                reading: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/></svg>',
                new_word: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>'
            };
            
            // Update month title
            const monthTitleEl = document.getElementById('current-month-title');
            if (monthTitleEl) {
                const monthName = new Date(viewingYear, viewingMonth, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                monthTitleEl.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
            }
            
            const firstDay = new Date(viewingYear, viewingMonth, 1);
            const lastDay = new Date(viewingYear, viewingMonth + 1, 0);
            const daysInMonth = lastDay.getDate();
            const startingDayOfWeek = firstDay.getDay();
            
            let html = `
                <div class="calendar-month">
                    <div class="calendar-weekdays">
                        <div class="calendar-weekday">Dim</div>
                        <div class="calendar-weekday">Lun</div>
                        <div class="calendar-weekday">Mar</div>
                        <div class="calendar-weekday">Mer</div>
                        <div class="calendar-weekday">Jeu</div>
                        <div class="calendar-weekday">Ven</div>
                        <div class="calendar-weekday">Sam</div>
                    </div>
                    <div class="calendar-grid">
            `;
            
            // Empty cells before first day
            for (let i = 0; i < startingDayOfWeek; i++) {
                html += '<div></div>';
            }
            
            // Days of month
            const today = new Date();
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(viewingYear, viewingMonth, day);
                const dateStr = `${viewingYear}-${String(viewingMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayData = presenceData[dateStr];
                const isToday = date.getFullYear() === today.getFullYear() && 
                               date.getMonth() === today.getMonth() && 
                               date.getDate() === today.getDate();
                
                let classes = ['calendar-day'];
                if (isToday) classes.push('today');
                
                if (dayData && dayData.totalActions > 0) {
                    const intensity = Math.min(dayData.totalActions, 5);
                    classes.push(`active-${intensity}`);
                }
                
                const actionIcons = dayData ? Object.entries(dayData.actions)
                    .filter(([_, active]) => active)
                    .map(([action]) => {
                        return `<span class="calendar-action-icon">${svgIcons[action]}</span>`;
                    }).join('') : '';
                
                html += `
                    <div class="${classes.join(' ')}">
                        <div class="calendar-day-number">${day}</div>
                        <div class="calendar-day-icons">${actionIcons}</div>
                    </div>
                `;
            }
            
            html += `
                    </div>
                </div>
            `;
            
            container.innerHTML = html;
        }

        // ============================================
        // CELESTIAL ATMOSPHERE - STARS CREATION
        // ============================================
        function createTwinklingStars() {
            const starsContainer = document.getElementById('starsContainer');
            if (!starsContainer) return;
            
            // Clear any existing stars
            starsContainer.innerHTML = '';
            
            // Create 60 stars scattered across the page
            const starCount = 60;
            
            for (let i = 0; i < starCount; i++) {
                const star = document.createElement('div');
                star.className = 'star';
                
                // Randomly make some stars larger
                if (Math.random() > 0.8) {
                    star.classList.add('large');
                }
                
                // Random position across the viewport
                const top = Math.random() * 100;
                const left = Math.random() * 100;
                
                star.style.top = `${top}%`;
                star.style.left = `${left}%`;
                
                // Random animation delay for natural twinkling
                star.style.animationDelay = `${Math.random() * 3}s`;
                
                starsContainer.appendChild(star);
            }
            
            console.log('✨ Twinkling stars initialized');
        }

        // Month navigation
        function setupCalendarNavigation() {
            const prevBtn = document.getElementById('prev-month');
            const nextBtn = document.getElementById('next-month');
            
            if (prevBtn) {
                prevBtn.addEventListener('click', () => {
                    viewingMonth--;
                    if (viewingMonth < 0) {
                        viewingMonth = 11;
                        viewingYear--;
                    }
                    renderPresenceCalendar();
                });
            }
            
            if (nextBtn) {
                nextBtn.addEventListener('click', () => {
                    viewingMonth++;
                    if (viewingMonth > 11) {
                        viewingMonth = 0;
                        viewingYear++;
                    }
                    renderPresenceCalendar();
                });
            }
        }

        // === SRS SYSTEM ===
        function initializeSRSData() {
            vocabulary.forEach(word => {
                if (!word.srs) {
                    word.srs = {
                        easeFactor: 2.5,
                        interval: 0,
                        repetitions: 0,
                        dueDate: new Date().toISOString(),
                        lastReviewed: null,
                        status: 'new'
                    };
                }
            });
            // Use syncToFirebase which checks if user is logged in
            if (window.syncToFirebase) window.syncToFirebase();
        }

        function calculateNextReview(word, quality) {
            const srs = word.srs;
            srs.lastReviewed = new Date().toISOString();

            if (quality < 2) {
                srs.repetitions = 0;
                srs.interval = 1;
                srs.status = 'learning';
            } else {
                if (srs.repetitions === 0) {
                    srs.interval = 1;
                } else if (srs.repetitions === 1) {
                    srs.interval = 6;
                } else {
                    srs.interval = Math.round(srs.interval * srs.easeFactor);
                }
                srs.repetitions++;
                srs.easeFactor = srs.easeFactor + (0.1 - (3 - quality) * (0.08 + (3 - quality) * 0.02));
                if (srs.easeFactor < 1.3) srs.easeFactor = 1.3;
                if (quality === 3) srs.interval = Math.round(srs.interval * 1.3);
                if (srs.repetitions >= 3 && srs.interval >= 21) {
                    srs.status = 'mastered';
                } else {
                    srs.status = 'review';
                }
            }

            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + srs.interval);
            srs.dueDate = nextDate.toISOString();
        }

        function isDueForReview(word) {
            if (!word.srs) return true;
            return new Date(word.srs.dueDate) <= new Date();
        }

        function getDueWords() {
            return vocabulary.filter(w => isDueForReview(w));
        }

        function getSRSStats() {
            // Safety check - ensure vocabulary is initialized
            if (!vocabulary || !Array.isArray(vocabulary)) {
                return { due: 0, new: 0, learning: 0, mastered: 0 };
            }
            
            const dueWords = getDueWords();
            const newWords = vocabulary.filter(w => !w.srs || w.srs.status === 'new');
            const learningWords = vocabulary.filter(w => w.srs && w.srs.status === 'learning');
            const masteredWords = vocabulary.filter(w => w.srs && w.srs.status === 'mastered');
            return { 
                due: dueWords.length, 
                new: newWords.length, 
                learning: learningWords.length, 
                mastered: masteredWords.length 
            };
        }

        function updateSRSStatsDisplay() {
            // Safety check - ensure elements exist
            const dueCountEl = document.getElementById('srs-due-count');
            const newCountEl = document.getElementById('srs-new-count');
            const learningCountEl = document.getElementById('srs-learning-count');
            const masteredCountEl = document.getElementById('srs-mastered-count');
            
            if (!dueCountEl || !newCountEl || !learningCountEl || !masteredCountEl) {
                console.warn('SRS stats elements not found yet');
                return;
            }
            
            const stats = getSRSStats();
            dueCountEl.textContent = stats.due || 0;
            newCountEl.textContent = stats.new || 0;
            learningCountEl.textContent = stats.learning || 0;
            masteredCountEl.textContent = stats.mastered || 0;
        }

        let currentSRSSession = [];
        let currentSRSIndex = 0;

        function startSRSSession() {
            const dueWords = getDueWords();
            if (dueWords.length === 0) {
                showSRSComplete();
                return;
            }
            currentSRSSession = dueWords.sort(() => Math.random() - 0.5);
            currentSRSIndex = 0;
            showSRSCard(currentSRSSession[currentSRSIndex]);
        }

        function showSRSCard(word) {
            const sessionArea = document.getElementById('srs-session-area');
            sessionArea.innerHTML = `
                <div class="srs-progress-bar">
                    <div class="srs-progress-fill" style="width: ${(currentSRSIndex / currentSRSSession.length) * 100}%"></div>
                </div>
                <div class="srs-progress-text">${currentSRSIndex + 1} / ${currentSRSSession.length} cartes</div>
                <div class="srs-card-container" id="srs-card">
                    <div class="srs-card-word">${word.french}</div>
                    <button class="btn btn-primary" onclick="revealSRSAnswer(event)" style="margin: 1.5rem 0;">Voir la réponse</button>
                    <div class="srs-card-translation">${word.english}</div>
                    ${word.example ? `<div class="srs-card-example">${word.example}</div>` : ''}
                    <div class="srs-difficulty-buttons">
                        <button class="srs-diff-btn again" onclick="rateSRSCard(0)">
                            <div>❌ À revoir</div>
                            <small>< 1 jour</small>
                        </button>
                        <button class="srs-diff-btn hard" onclick="rateSRSCard(1)">
                            <div>😓 Difficile</div>
                            <small>< 6 jours</small>
                        </button>
                        <button class="srs-diff-btn good" onclick="rateSRSCard(2)">
                            <div>✅ Bien</div>
                            <small>${getNextIntervalPreview(word, 2)} jours</small>
                        </button>
                        <button class="srs-diff-btn easy" onclick="rateSRSCard(3)">
                            <div>🌟 Facile</div>
                            <small>${getNextIntervalPreview(word, 3)} jours</small>
                        </button>
                    </div>
                </div>
            `;
        }

        function getNextIntervalPreview(word, quality) {
            if (!word.srs) return 1;
            if (quality < 2) return 1;
            let interval;
            if (word.srs.repetitions === 0) {
                interval = 1;
            } else if (word.srs.repetitions === 1) {
                interval = 6;
            } else {
                interval = Math.round(word.srs.interval * word.srs.easeFactor);
            }
            if (quality === 3) interval = Math.round(interval * 1.3);
            return Math.max(1, interval);
        }

        function revealSRSAnswer(event) {
            const card = document.getElementById('srs-card');
            if (card) card.classList.add('revealed');
            if (event && event.target) event.target.style.display = 'none';
        }

        function rateSRSCard(quality) {
            const word = currentSRSSession[currentSRSIndex];
            calculateNextReview(word, quality);
                syncToFirebase(); // Auto-save vocabulary to Firebase
            
            // Trigger hearts for good/easy ratings
            if (quality >= 2) {
                createFloatingHeart();
            }
            
            currentSRSIndex++;
            if (currentSRSIndex >= currentSRSSession.length) {
                showSRSComplete();
            } else {
                showSRSCard(currentSRSSession[currentSRSIndex]);
            }
            updateSRSStatsDisplay();
        }

        function showSRSComplete() {
            const sessionArea = document.getElementById('srs-session-area');
            sessionArea.innerHTML = `
                <div class="srs-complete-message">
                    <div class="srs-complete-icon">🎉</div>
                    <div class="srs-complete-title">Bravo!</div>
                    <div class="srs-complete-subtitle">
                        Tu as terminé ta session de révision.<br>
                        Reviens demain pour continuer ton apprentissage!
                    </div>
                    <button class="btn btn-primary" onclick="location.reload()">Retour au jardin</button>
                </div>
            `;
            
            // Celebration hearts!
            for (let i = 0; i < 8; i++) {
                setTimeout(() => createFloatingHeart(), i * 200);
            }
        }

        // ============================================
        // FILTER STATE - NEW
        // ============================================
        let activeFilters = {
            year: "",
            quarter: "",
            week: "",
            theme: "",
            favorite: ""
        };

        // ============================================
        // IMPORT / EXPORT - FIXED
        // ============================================
        function setupImportExport() {
            console.log('setupImportExport called');
            const exportBtn = document.getElementById('export-data');
            const importBtn = document.getElementById('import-data');
            console.log('Export button:', exportBtn);
            console.log('Import button:', importBtn);
            
            if (!exportBtn || !importBtn) {
                console.error('BUTTONS NOT FOUND!');
                return;
            }
            
            document.getElementById('export-data').addEventListener('click', () => {
                console.log('Export clicked!');
                const data = {
                    vocabulary,
                    writings,
                    readingList,
                    listeningList,
                    recordings,
                    resourcesList,
                    notes,
                    exportDate: new Date().toISOString()
                };

                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ma-maison-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
            });

            // FIX: Added missing import button click handler
            document.getElementById('import-data').addEventListener('click', () => {
                console.log('Import button clicked!');
                document.getElementById('import-file-input').click();
            });

            document.getElementById('import-file-input').addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const data = JSON.parse(event.target.result);
                        
                        if (confirm('Importer ces données ? Cela remplacera tout ce que tu as actuellement.')) {
                            vocabulary = data.vocabulary || [];
                            writings = data.writings || [];
                            readingList = data.readingList || [];
                            listeningList = data.listeningList || [];
                            recordings = data.recordings || [];
                            resourcesList = data.resourcesList || [];
                            notes = data.notes || [];
                            
                            // Sync all imported data to Firebase
                            if (window.syncToFirebase) window.syncToFirebase();
                            
                            renderGarden();
                            populateJardinFilters(); // NEW
                            renderReadingList();
                            renderListeningList();
                            renderRecordings();
                            renderWritingsArchive();
                            renderResourcesList();
                            renderNotes();
                            
                            alert('Données importées avec succès ✓');
                        }
                    } catch (err) {
                        alert('Erreur : fichier invalide');
                        console.error(err);
                    }
                };
                reader.readAsText(file);
                // Reset the file input
                e.target.value = '';
            });

            document.getElementById('drive-link').addEventListener('click', () => {
                window.open('https://drive.google.com/drive/folders/1E7JYANvw4DjaJ2VUsPZuuSExqB4PzU9f', '_blank');
            });

            document.getElementById('reset-data').addEventListener('click', async () => {
                if (confirm('Vraiment tout effacer ? Cette action est irréversible.')) {
                if (confirm('Dernière confirmation — tu es sûr ?')) {
                    // Clear all data arrays
                    vocabulary = [];
                    writings = [];
                    readingList = [];
                    listeningList = [];
                    recordings = [];
                    resourcesList = [];
                    notes = [];
                    presenceData = {};
                    activeFilters = { year: "", quarter: "", week: "", theme: "", favorite: "" };
                    
                    // Clear localStorage (for dark mode, volume, etc)
                    const darkMode = localStorage.getItem('darkMode');
                    const musicVolume = localStorage.getItem('musicVolume');
                    localStorage.clear();
                    if (darkMode) localStorage.setItem('darkMode', darkMode);
                    if (musicVolume) localStorage.setItem('musicVolume', musicVolume);
                    
                    // Sync empty data to Firebase (only if logged in)
                    if (window.currentUser) {
                        await saveDataToFirebase(); // Immediate sync, not debounced
                    }
                    
                    renderGarden();
                    populateJardinFilters();
                    renderReadingList();
                    renderListeningList();
                    renderRecordings();
                    renderWritingsArchive();
                    renderResourcesList();
                    alert('Tout a été effacé. Tu peux recommencer.');
                }
            }
            });
        }

        // ============================================
        // STUDY TIMER
        // ============================================
        let timerInterval = null;
        let timerSeconds = 25 * 60; // Default 25 minutes
        let timerRunning = false;

        function updateTimerDisplay() {
            const minutes = Math.floor(timerSeconds / 60);
            const seconds = timerSeconds % 60;
            document.getElementById('timer-display').textContent = 
                `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        function setupTimer() {
            const timerDisplay = document.getElementById('timer-display');
            const startBtn = document.getElementById('timer-start');
            const resetBtn = document.getElementById('timer-reset');
            const presetBtns = document.querySelectorAll('.timer-preset');

            if (!timerDisplay || !startBtn || !resetBtn) return;

            // Preset buttons
            presetBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    if (timerRunning) return; // Don't change during countdown
                    
                    const minutes = parseInt(btn.dataset.minutes);
                    timerSeconds = minutes * 60;
                    updateTimerDisplay();
                    
                    // Update active state
                    presetBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });

            // Start/Pause button
            startBtn.addEventListener('click', () => {
                if (!timerRunning) {
                    // Start timer
                    timerRunning = true;
                    startBtn.textContent = 'Pause';
                    resetBtn.style.display = 'inline-block';
                    
                    timerInterval = setInterval(() => {
                        timerSeconds--;
                        updateTimerDisplay();
                        
                        if (timerSeconds <= 0) {
                            clearInterval(timerInterval);
                            timerRunning = false;
                            startBtn.textContent = 'Commencer';
                            
                            // Play sound or notification
                            if ('Notification' in window && Notification.permission === 'granted') {
                                new Notification('Minuteur terminé !', {
                                    body: 'Temps d\'étude terminé. Prends une pause ! ☕',
                                    icon: '🎉'
                                });
                            } else {
                                alert('Temps d\'étude terminé ! Prends une pause ☕');
                            }
                        }
                    }, 1000);
                } else {
                    // Pause timer
                    timerRunning = false;
                    clearInterval(timerInterval);
                    startBtn.textContent = 'Reprendre';
                }
            });

            // Reset button
            resetBtn.addEventListener('click', () => {
                clearInterval(timerInterval);
                timerRunning = false;
                
                // Reset to active preset
                const activePreset = document.querySelector('.timer-preset.active');
                const minutes = activePreset ? parseInt(activePreset.dataset.minutes) : 25;
                timerSeconds = minutes * 60;
                
                updateTimerDisplay();
                startBtn.textContent = 'Commencer';
                resetBtn.style.display = 'none';
            });

            // Request notification permission
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }
        }

        // ============================================
        // STUDY HEATMAP
        // ============================================
        function renderHeatmap() {
            const heatmapGrid = document.getElementById('heatmap-grid');
            if (!heatmapGrid) return;

            const today = new Date();
            const days = [];
            
            // Generate last 84 days (12 weeks)
            for (let i = 83; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                days.push(date);
            }

            heatmapGrid.innerHTML = days.map(date => {
                const dateStr = date.toISOString().split('T')[0];
                const count = getActivityCountForDate(dateStr);
                
                return `
                    <div class="heatmap-day" data-count="${Math.min(count, 10)}" data-date="${dateStr}">
                        <div class="heatmap-tooltip">
                            ${date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })}: ${count} ${count === 1 ? 'mot' : 'mots'}
                        </div>
                    </div>
                `;
            }).join('');
        }

        function getActivityCountForDate(dateStr) {
            // Count words added on this date
            const wordsOnDate = vocabulary.filter(w => {
                if (!w.created) return false;
                const wordDate = new Date(w.created).toISOString().split('T')[0];
                return wordDate === dateStr;
            });
            return wordsOnDate.length;
        }

        // ============================================
        // GARDEN VISUAL
        // ============================================
        function renderGardenVisual() {
            const gardenFlowers = document.getElementById('garden-flowers');
            const gardenStats = document.getElementById('garden-stats');
            
            if (!gardenFlowers) return;

            const recentWords = [...vocabulary]
                .sort((a, b) => new Date(b.created) - new Date(a.created))
                .slice(0, 15); // Show last 15 words as flowers

            if (recentWords.length === 0) {
                gardenFlowers.innerHTML = `
                    <div style="text-align: center; color: var(--text-soft); padding: 2rem;">
                        Ton jardin est vide... Plante ton premier mot! 🌱
                    </div>
                `;
                gardenStats.innerHTML = '';
                return;
            }

            gardenFlowers.innerHTML = recentWords.map((word, index) => {
                const age = Math.floor((Date.now() - new Date(word.created)) / (1000 * 60 * 60 * 24));
                const size = age < 7 ? 'small' : age < 30 ? 'medium' : 'large';
                const colors = ['#ff6b8a', '#ffa07a', '#ffb347', '#f4d58d', '#d4a5d4', '#a8b8ff', '#8ab8d4'];
                const color = colors[index % colors.length];
                
                return `
                    <div class="flower" style="animation-delay: ${index * 0.1}s;">
                        <div class="flower-bloom ${size}">
                            <svg viewBox="0 0 100 100" width="100%" height="100%">
                                <!-- Center -->
                                <circle cx="50" cy="50" r="12" fill="#f4d58d"/>
                                <!-- Petals -->
                                <circle cx="50" cy="30" r="15" fill="${color}" opacity="0.9"/>
                                <circle cx="70" cy="40" r="15" fill="${color}" opacity="0.85"/>
                                <circle cx="70" cy="60" r="15" fill="${color}" opacity="0.8"/>
                                <circle cx="50" cy="70" r="15" fill="${color}" opacity="0.85"/>
                                <circle cx="30" cy="60" r="15" fill="${color}" opacity="0.8"/>
                                <circle cx="30" cy="40" r="15" fill="${color}" opacity="0.85"/>
                            </svg>
                        </div>
                        <div class="flower-stem ${size}"></div>
                        <div class="flower-label" title="${word.french}">${word.french}</div>
                    </div>
                `;
            }).join('');

            const totalWords = vocabulary.length;
            const thisWeek = vocabulary.filter(w => {
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return new Date(w.created) >= weekAgo;
            }).length;

            gardenStats.innerHTML = `
                <strong>${totalWords}</strong> mots dans ton jardin · 
                <strong>${thisWeek}</strong> plantés cette semaine
            `;
        }

        // ============================================
        // FLOATING QUICK ACTIONS
        // ============================================
        function setupFloatingActions() {
            const floatingActions = document.getElementById('floating-actions');
            const mainBtn = document.getElementById('floating-main');
            const quickAddWord = document.getElementById('quick-add-word');
            const quickStartTimer = document.getElementById('quick-start-timer');
            const quickFlipCards = document.getElementById('quick-flip-cards');

            if (!floatingActions || !mainBtn || !quickAddWord || !quickStartTimer || !quickFlipCards) return;

            // Toggle menu
            mainBtn.addEventListener('click', () => {
                floatingActions.classList.toggle('active');
            });

            // Quick add word
            quickAddWord.addEventListener('click', () => {
                floatingActions.classList.remove('active');
                openModal('word-modal');
                // Navigate to jardin if not already there
                const jardinBtn = document.querySelector('[data-room="jardin"]');
                if (jardinBtn && !jardinBtn.classList.contains('active')) {
                    jardinBtn.click();
                }
            });

            // Quick start timer
            quickStartTimer.addEventListener('click', () => {
                floatingActions.classList.remove('active');
                // Navigate to entree
                const entreeBtn = document.querySelector('[data-room="entree"]');
                if (entreeBtn) {
                    entreeBtn.click();
                    // Scroll to timer
                    setTimeout(() => {
                        document.getElementById('timer-display')?.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'center' 
                        });
                    }, 100);
                }
            });

            // Quick flip cards
            quickFlipCards.addEventListener('click', () => {
                floatingActions.classList.remove('active');
                // Navigate to jardin
                const jardinBtn = document.querySelector('[data-room="jardin"]');
                if (jardinBtn) {
                    jardinBtn.click();
                    // Switch to cards view
                    setTimeout(() => {
                        const cardsToggle = document.querySelector('[data-view="cards"]');
                        if (cardsToggle) {
                            cardsToggle.click();
                        }
                    }, 100);
                }
            });

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!floatingActions.contains(e.target) && floatingActions.classList.contains('active')) {
                    floatingActions.classList.remove('active');
                }
            });
        }

        // ============================================
        // FLIP CARDS
        // ============================================
        let flipCardsData = [];
        let currentFlipIndex = 0;

        function setupFlipCards() {
            const viewToggles = document.querySelectorAll('.view-toggle');
            const flipCardsContainer = document.getElementById('flip-cards-container');
            const wordGrid = document.getElementById('word-grid');
            const flipCard = document.getElementById('flip-card');
            const flipPrev = document.getElementById('flip-prev');
            const flipNext = document.getElementById('flip-next');
            const flipShuffle = document.getElementById('flip-shuffle');

            if (!viewToggles.length || !flipCardsContainer) return;

            // View toggle
            viewToggles.forEach(btn => {
                btn.addEventListener('click', () => {
                    const view = btn.dataset.view;
                    viewToggles.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    if (view === 'cards') {
                        flipCardsContainer.style.display = 'block';
                        wordGrid.style.display = 'none';
                        initializeFlipCards();
                    } else {
                        flipCardsContainer.style.display = 'none';
                        wordGrid.style.display = 'grid';
                    }
                });
            });

            // Flip card click
            flipCard.addEventListener('click', () => {
                flipCard.classList.toggle('flipped');
            });

            // Navigation
            flipPrev.addEventListener('click', () => {
                if (currentFlipIndex > 0) {
                    currentFlipIndex--;
                    showFlipCard(currentFlipIndex);
                }
            });

            flipNext.addEventListener('click', () => {
                if (currentFlipIndex < flipCardsData.length - 1) {
                    currentFlipIndex++;
                    showFlipCard(currentFlipIndex);
                }
            });

            // Shuffle
            flipShuffle.addEventListener('click', () => {
                flipCardsData = shuffleArray([...getFilteredVocabulary()]);
                currentFlipIndex = 0;
                showFlipCard(currentFlipIndex);
            });

            // Keyboard navigation
            document.addEventListener('keydown', (e) => {
                if (flipCardsContainer.style.display === 'block') {
                    if (e.key === 'ArrowLeft') {
                        flipPrev.click();
                    } else if (e.key === 'ArrowRight') {
                        flipNext.click();
                    } else if (e.key === ' ') {
                        e.preventDefault();
                        flipCard.click();
                    }
                }
            });
        }

        function initializeFlipCards() {
            flipCardsData = getFilteredVocabulary();
            if (flipCardsData.length === 0) {
                document.getElementById('flip-card-word').textContent = 'Aucun mot disponible';
                document.getElementById('flip-card-meaning').textContent = '';
                document.getElementById('flip-card-example').textContent = '';
                document.getElementById('flip-current').textContent = '0';
                document.getElementById('flip-total').textContent = '0';
                return;
            }
            currentFlipIndex = 0;
            showFlipCard(currentFlipIndex);
        }

        function showFlipCard(index) {
            const card = flipCardsData[index];
            if (!card) return;

            // Reset flip state
            document.getElementById('flip-card').classList.remove('flipped');

            // Update content
            document.getElementById('flip-card-word').textContent = card.french;
            document.getElementById('flip-card-meaning').textContent = card.meaning || 'Pas de traduction';
            
            // Show best available context
            const context = card.contexts && card.contexts[0] ? card.contexts[0] : '';
            document.getElementById('flip-card-example').textContent = context;

            // Update counter
            document.getElementById('flip-current').textContent = index + 1;
            document.getElementById('flip-total').textContent = flipCardsData.length;
        }

        function shuffleArray(array) {
            const shuffled = [...array];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
        }

        // ============================================
        // AFFIRMATIONS
        // ============================================
        const affirmations = [
            { fr: "Tu es en train d'apprendre.", en: "You are learning." },
            { fr: "Chaque mot compte.", en: "Every word counts." },
            { fr: "C'est bien d'aller lentement.", en: "It's good to go slowly." },
            { fr: "Tu n'as rien à prouver.", en: "You have nothing to prove." },
            { fr: "La langue t'appartient déjà.", en: "The language already belongs to you." },
            { fr: "Être débutant, c'est courageux.", en: "Being a beginner is brave." },
            { fr: "Ce que tu fais compte.", en: "What you do matters." },
            { fr: "Tu es déjà assez.", en: "You are already enough." },
            { fr: "La beauté n'est pas une faiblesse.", en: "Beauty is not weakness." },
            { fr: "Tu apprends plus vite que tu crois.", en: "You learn faster than you think." },
            { fr: "Prends ton temps.", en: "Take your time." },
            { fr: "Tu es capable.", en: "You are capable." },
            { fr: "Courage !", en: "Courage!" },
            { fr: "Tu vas y arriver !", en: "You're going to make it!" },
            { fr: "Petit à petit, l'oiseau fait son nid.", en: "Little by little, the bird builds its nest." },
            { fr: "Rome ne s'est pas faite en un jour.", en: "Rome wasn't built in a day." },
            { fr: "Continue comme ça.", en: "Keep going like this." },
            { fr: "Tu fais des progrès.", en: "You're making progress." },
            { fr: "Chaque erreur est une leçon.", en: "Every mistake is a lesson." },
            { fr: "Sois fier de toi.", en: "Be proud of yourself." },
            { fr: "L'effort est déjà une victoire.", en: "The effort is already a victory." },
            { fr: "Tu es plus fort que tu crois.", en: "You're stronger than you think." },
            { fr: "Rien n'est impossible.", en: "Nothing is impossible." },
            { fr: "Continue d'avancer.", en: "Keep moving forward." }
        ];

        function showAffirmation() {
            const affEl = document.getElementById('affirmation');
            const aff = affirmations[Math.floor(Math.random() * affirmations.length)];
            
            affEl.querySelector('.affirmation-text').textContent = aff.fr;
            affEl.querySelector('.affirmation-translation').textContent = aff.en;
            
            affEl.classList.add('visible');
            
            setTimeout(() => {
                affEl.classList.remove('visible');
            }, 8000);
        }

        setTimeout(() => {
            showAffirmation();
            setInterval(showAffirmation, 180000);
        }, 30000);

        // ============================================
        // HOUSE MAGIC - FLOATING HEARTS & MOTIVATION
        // ============================================
        let houseClicks = 0;
        let houseTimeout;

        const poeticReasons = [
            "Pour vivre dans les rues de Paris",
            "Pour trouver l'amour au-delà des frontières",
            "Pour être libre dans ma propre peau",
            "Pour la beauté des mots qui dansent",
            "Pour défendre les droits humains, en français",
            "Pour écouter le monde avec un nouvel cœur",
            "Pour devenir qui je suis vraiment",
            "Pour lire les poèmes dans leur langue natale",
            "Pour comprendre les chansons qui font pleurer",
            "Pour écrire des lettres à des inconnus",
            "Pour voyager sans être touriste",
            "Pour rêver en couleurs différentes",
            "Pour construire une carrière avec compassion",
            "Pour sentir le monde avec plus de nuances",
            "Pour la joie de comprendre un jeu de mots",
            "Pour parler à des étrangers comme des amis",
            "Pour lire les menus sans hésitation",
            "Pour le plaisir de l'accent qui roule",
            "Pour les conversations de minuit à Paris",
            "Pour être à la fois chez soi et ailleurs"
        ];

        function createFloatingHearts() {
            const heartParticles = document.getElementById('heartParticles');
            const heartCount = 12;
            
            for (let i = 0; i < heartCount; i++) {
                setTimeout(() => {
                    const heart = document.createElement('div');
                    heart.className = 'heart-particle';
                    
                    // Create SVG heart
                    heart.innerHTML = `
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#D4A5A5" style="filter: drop-shadow(0 2px 4px rgba(139, 38, 53, 0.3));">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                    `;
                    
                    // Random horizontal spread
                    const randomX = (Math.random() - 0.5) * 100;
                    heart.style.setProperty('--tx', `${randomX}px`);
                    heart.style.animationDelay = `${i * 0.15}s`;
                    
                    heartParticles.appendChild(heart);
                    
                    // Remove after animation
                    setTimeout(() => {
                        heart.remove();
                    }, 3000);
                }, i * 150);
            }
        }

        document.getElementById('houseContainer').addEventListener('click', function() {
            houseClicks++;
            
            // Clear previous timeout
            if (houseTimeout) clearTimeout(houseTimeout);
            
            // Set timeout to reset counter
            houseTimeout = setTimeout(() => {
                houseClicks = 0;
            }, 2000);
            
            // Show house magic on 3rd click
            if (houseClicks === 3) {
                // Open the house
                this.classList.add('open');
                
                // Create floating hearts
                createFloatingHearts();
                
                // Show one random poetic reason
                showRandomHeartReason();
                houseClicks = 0;
                
                // Reset house after 8 seconds
                setTimeout(() => {
                    this.classList.remove('open');
                }, 8000);
            }
        });

        function showRandomHeartReason() {
            const randomReason = poeticReasons[Math.floor(Math.random() * poeticReasons.length)];
            const heartNote = document.getElementById('heart-note');
            const heartReason = document.getElementById('heart-reason');
            
            // Add heart icon
            heartReason.innerHTML = `
                <svg width="48" height="48" viewBox="0 0 24 24" fill="#D4A5A5" style="margin-bottom: 1rem;">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
                <div style="font-family: 'Cormorant Garamond'; font-size: 1.3rem; color: var(--navy); line-height: 1.6;">
                    ${randomReason}
                </div>
            `;
            
            heartNote.style.display = 'block';
            
            // Add close functionality
            heartNote.onclick = function() {
                heartNote.style.opacity = '0';
                heartNote.style.transform = 'translate(-50%, -50%) scale(0.95)';
                heartNote.style.transition = 'all 0.5s ease';
                setTimeout(() => {
                    heartNote.style.display = 'none';
                    heartNote.style.opacity = '1';
                    heartNote.style.transform = 'translate(-50%, -50%) scale(1)';
                    // Close house too
                    document.getElementById('houseContainer').classList.remove('open');
                }, 500);
            };
            
            // Auto-remove after 8 seconds
            setTimeout(() => {
                if (heartNote.style.display === 'block') {
                    heartNote.style.opacity = '0';
                    heartNote.style.transform = 'translate(-50%, -50%) scale(0.95)';
                    heartNote.style.transition = 'all 0.5s ease';
                    setTimeout(() => {
                        heartNote.style.display = 'none';
                        heartNote.style.opacity = '1';
                        heartNote.style.transform = 'translate(-50%, -50%) scale(1)';
                    }, 500);
                }
            }, 8000);
        }

        // ============================================
        // DOUBLE-CLICK MAGIC ON ICONS ✨
        // ============================================
        document.addEventListener('dblclick', function(e) {
            const icon = e.target.closest('.empty-icon');
            if (icon) {
                const svg = icon.querySelector('svg');
                if (svg) {
                    // Turn gold with animation
                    svg.style.fill = '#C9A861';
                    svg.style.opacity = '1';
                    svg.style.transform = 'scale(1.2)';
                    svg.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
                    
                    // Show affirmation
                    showAffirmation();
                    
                    // Gentle pulse then settle
                    setTimeout(() => {
                        svg.style.transform = 'scale(1.05)';
                    }, 400);
                    
                    setTimeout(() => {
                        svg.style.transform = 'scale(1)';
                    }, 700);
                }
            }
        });

        // ============================================
        // ENTRANCE PHRASES
        // ============================================
        const entrancePhrases = [
            {
                sentence: "Entre.",
                translation: "Come in.",
                note: "The imperative form of 'entrer' (to enter). A simple, direct welcome. Notice how French commands can be gentle—they invite rather than order."
            },
            {
                sentence: "Prends ton temps.",
                translation: "Take your time.",
                note: "From 'prendre' (to take). This phrase embodies permission to slow down. The reflexive 'ton temps' (your time) makes it personal."
            },
            {
                sentence: "Reste ici.",
                translation: "Stay here.",
                note: "From 'rester' (to stay). An invitation to presence. 'Ici' (here) grounds you in the moment."
            }
        ];

        function renderEntrance() {
            const container = document.getElementById('entrance-content');
            container.innerHTML = entrancePhrases.map(p => `
                <div class="entrance-card">
                    <div class="entrance-sentence">${p.sentence}</div>
                    <div class="entrance-translation">${p.translation}</div>
                    <div class="entrance-note">${p.note}</div>
                </div>
            `).join('');
        }

        // ============================================
        // IMAGE HANDLING - FIXED
        // ============================================
        function setupImageUpload(uploadAreaId, inputId, previewId) {
            const uploadArea = document.getElementById(uploadAreaId);
            const input = document.getElementById(inputId);
            const preview = document.getElementById(previewId);

            if (!uploadArea || !input || !preview) return;

            uploadArea.addEventListener('click', () => input.click());

            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                // Check if file is an image
                if (!file.type.startsWith('image/')) {
                    alert('Veuillez sélectionner une image valide');
                    return;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    preview.src = event.target.result;
                    preview.style.display = 'block';
                };
                reader.onerror = () => {
                    alert('Erreur lors du chargement de l\'image');
                };
                reader.readAsDataURL(file);
            });
        }

        // ============================================
        // VOCABULARY GARDEN - UPDATED WITH FILTERS
        // ============================================
        function getFilteredVocabulary() {
            return vocabulary.filter(word => {
                if (activeFilters.year && word.year !== activeFilters.year) return false;
                if (activeFilters.quarter && word.quarter !== activeFilters.quarter) return false;
                if (activeFilters.week && word.week !== activeFilters.week) return false;
                if (activeFilters.theme && word.theme !== activeFilters.theme) return false;
                if (activeFilters.favorite === 'true' && !word.favorite) return false;
                return true;
            });
        }

        // === GROWTH TREE RENDERING ===
        function renderGrowthTree() {
            const totalWords = vocabulary.length;
            const { currentStreak } = calculateStreak();
            
            // Calculate tree growth metrics
            const leaves = totalWords;
            const branches = Math.floor(currentStreak / 7);
            const flowers = Math.floor(totalWords / 50);
            
            // Update stats display
            document.getElementById('tree-leaves').textContent = leaves;
            document.getElementById('tree-branches').textContent = branches;
            document.getElementById('tree-flowers').textContent = flowers;
            
            // Render SVG tree
            const svg = document.getElementById('tree-svg');
            if (!svg) return;
            
            let svgContent = '';
            
            // More elegant trunk
            svgContent += `
                <path class="tree-trunk" d="M 190 350 Q 185 400 185 450 L 215 450 Q 215 400 210 350 Z" 
                      fill="#9d8b7a" opacity="0.9"/>
            `;
            
            // Graceful main branches
            const mainBranches = Math.min(branches, 6);
            for (let i = 0; i < mainBranches; i++) {
                const side = i % 2 === 0 ? -1 : 1;
                const yPos = 370 - (i * 25);
                const xStart = 200;
                const length = 50 + (i * 8);
                const xEnd = 200 + (side * length);
                const yEnd = yPos - 35 - (i * 3);
                
                svgContent += `
                    <path class="tree-branch" 
                          d="M ${xStart} ${yPos} Q ${xStart + side * (length * 0.4)} ${yPos - 15} ${xEnd} ${yEnd}"
                          style="animation-delay: ${i * 0.15}s"/>
                `;
            }
            
            // Minimal, elegant leaves
            const leafCount = Math.min(leaves, 80);
            const goldenRatio = 1.618;
            
            for (let i = 0; i < leafCount; i++) {
                // Use golden ratio spiral for natural distribution
                const angle = i * goldenRatio * Math.PI;
                const radius = 15 + Math.sqrt(i) * 8;
                const x = 200 + Math.cos(angle) * radius;
                const y = 320 - Math.abs(Math.sin(angle)) * radius;
                
                // Simple circular leaves with slight variation
                const size = 4 + Math.random() * 2;
                svgContent += `
                    <circle class="tree-leaf" 
                            cx="${x}" 
                            cy="${y}" 
                            r="${size}" 
                            style="animation-delay: ${0.3 + i * 0.008}s"/>
                `;
            }
            
            // Delicate flowers at milestones
            const flowerPositions = [
                { x: 200, y: 260 },
                { x: 160, y: 290 },
                { x: 240, y: 290 },
                { x: 180, y: 270 },
                { x: 220, y: 270 }
            ];
            
            for (let i = 0; i < Math.min(flowers, 5); i++) {
                const pos = flowerPositions[i];
                
                // Minimalist 5-petal flower
                svgContent += `
                    <g class="tree-flower" style="animation-delay: ${2 + i * 0.4}s">
                        ${[0, 72, 144, 216, 288].map(angle => {
                            const rad = (angle * Math.PI) / 180;
                            const px = pos.x + Math.cos(rad) * 5;
                            const py = pos.y + Math.sin(rad) * 5;
                            return `<circle cx="${px}" cy="${py}" r="3.5" fill="#f5d5d8" opacity="0.9"/>`;
                        }).join('')}
                        <circle cx="${pos.x}" cy="${pos.y}" r="2.5" fill="#f4c7ab" opacity="0.95"/>
                    </g>
                `;
            }
            
            svg.innerHTML = svgContent;
        }

        function renderGarden() {
            // First render the tree
            renderGrowthTree();
            
            // Then render the word grid
            const grid = document.getElementById('word-grid');
            const filteredVocabulary = getFilteredVocabulary();
            
            if (filteredVocabulary.length === 0) {
                grid.innerHTML = `
                    <div class="empty">
                        <div class="empty-icon">
                            <svg class="svg-icon-lg" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.3;">
                                <path d="M12 22c4.97 0 9-4.03 9-9-4.97 0-9 4.03-9 9zM5.6 10.25c0 1.38 1.12 2.5 2.5 2.5.53 0 1.01-.16 1.42-.44l-.02.19c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5l-.02-.19c.4.28.89.44 1.42.44 1.38 0 2.5-1.12 2.5-2.5 0-1.25-.93-2.3-2.14-2.46.4-.49.64-1.1.64-1.79 0-1.38-1.12-2.5-2.5-2.5-.53 0-1.01.16-1.42.44l.02-.19C12.5 2.12 11.38 1 10 1S7.5 2.12 7.5 3.5l.02.19c-.4-.28-.89-.44-1.42-.44-1.38 0-2.5 1.12-2.5 2.5 0 .69.24 1.3.64 1.79-1.21.16-2.14 1.21-2.14 2.46z"/>
                            </svg>
                        </div>
                        <div class="empty-text">
                            ${vocabulary.length === 0 ? 'Rien ici encore...<br>Plante ton premier mot quand tu es prêt.' : 'Aucun mot ne correspond à tes filtres.<br>Essaie avec des critères différents.'}
                        </div>
                    </div>
                `;
                updatePDFButtonVisibility();
                return;
            }

            // Sort by most recent first
            const sortedVocabulary = [...filteredVocabulary].sort((a, b) => b.id - a.id);

            grid.innerHTML = sortedVocabulary.map(word => `
                <div class="word-card">
                    <div class="word-actions">
                        <button class="icon-btn ${word.favorite ? 'favorite-active' : ''}" onclick="toggleFavorite(${word.id})" title="${word.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
                            <svg class="svg-icon" viewBox="0 0 24 24" fill="${word.favorite ? 'var(--gold)' : 'none'}" stroke="currentColor">
                                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                            </svg>
                        </button>
                        <button class="icon-btn" onclick="editWord(${word.id})" title="Modifier">
                            <svg class="svg-icon" viewBox="0 0 24 24">
                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                            </svg>
                        </button>
                        <button class="icon-btn" onclick="deleteWord(${word.id})" title="Supprimer">
                            <svg class="svg-icon" viewBox="0 0 24 24">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                        </button>
                    </div>
                    ${word.image ? `<img src="${word.image}" class="word-image" alt="${word.french}">` : ''}
                    
                    <div class="category-tags">
                        ${word.favorite ? `<div class="category-tag" style="background: var(--gold-pale); color: var(--navy);">⭐ Favori</div>` : ''}
                        ${word.theme ? `<div class="category-tag topic">${word.theme}</div>` : ''}
                        ${word.week ? `<div class="category-tag time">Semaine ${word.week}</div>` : ''}
                        ${word.quarter ? `<div class="category-tag time">${word.quarter}</div>` : ''}
                        ${word.year ? `<div class="category-tag time">${word.year}</div>` : ''}
                    </div>
                    
                    <div class="word-french">${word.french}</div>
                    ${word.meaning ? `<div class="word-meaning">${word.meaning}</div>` : ''}
                    ${word.article ? `<div class="word-article">${word.article}</div>` : ''}
                    
                    <div class="word-contexts">
                        ${word.contexts && word.contexts[0] ? `
                            <div class="context">
                                <div class="context-label">Neutre</div>
                                <div class="context-sentence">${word.contexts[0]}</div>
                            </div>
                        ` : ''}
                        ${word.contexts && word.contexts[1] ? `
                            <div class="context">
                                <div class="context-label">Émotionnel</div>
                                <div class="context-sentence">${word.contexts[1]}</div>
                            </div>
                        ` : ''}
                        ${word.contexts && word.contexts[2] ? `
                            <div class="context">
                                <div class="context-label">Idiomatique</div>
                                <div class="context-sentence">${word.contexts[2]}</div>
                            </div>
                        ` : ''}
                    </div>
                    ${word.note ? `<div class="word-note">${word.note}</div>` : ''}
                </div>
            `).join('');
            
            updatePDFButtonVisibility();
            renderGardenVisual(); // Update garden visual when words change
            renderHeatmap(); // Update heatmap when words change
        }

        // ============================================
        // POPULATE JARDIN FILTERS - NEW
        // ============================================
        function populateJardinFilters() {
            const years = [...new Set(vocabulary.map(w => w.year).filter(Boolean))].sort();
            const weeks = [...new Set(vocabulary.map(w => w.week).filter(Boolean))].sort((a, b) => a - b);
            const themes = [...new Set(vocabulary.map(w => w.theme).filter(Boolean))].sort();

            const yearSelect = document.getElementById('filter-year');
            const weekSelect = document.getElementById('filter-week');
            const themeSelect = document.getElementById('filter-theme');

            // Year options
            yearSelect.innerHTML = '<option value="">Toutes</option>' +
                years.map(y => `<option value="${y}">${y}</option>`).join('');

            // Week options
            weekSelect.innerHTML = '<option value="">Toutes</option>' +
                weeks.map(w => `<option value="${w}">Semaine ${w}</option>`).join('');

            // Theme options
            themeSelect.innerHTML = '<option value="">Tous les thèmes</option>' +
                themes.map(t => `<option value="${t}">${t}</option>`).join('');

            // Set current filter values if they exist
            if (activeFilters.year) yearSelect.value = activeFilters.year;
            if (activeFilters.week) weekSelect.value = activeFilters.week;
            if (activeFilters.theme) themeSelect.value = activeFilters.theme;
            if (activeFilters.quarter) document.getElementById('filter-quarter').value = activeFilters.quarter;
        }

        // ============================================
        // FILTER EVENT LISTENERS - NEW
        // ============================================
        function setupFilterListeners() {
            document.getElementById('filter-year').addEventListener('change', e => {
                activeFilters.year = e.target.value;
                renderGarden();
            });

            document.getElementById('filter-quarter').addEventListener('change', e => {
                activeFilters.quarter = e.target.value;
                renderGarden();
            });

            document.getElementById('filter-week').addEventListener('change', e => {
                activeFilters.week = e.target.value;
                renderGarden();
            });

            document.getElementById('filter-theme').addEventListener('change', e => {
                activeFilters.theme = e.target.value;
                renderGarden();
            });

            document.getElementById('filter-favorite').addEventListener('change', e => {
                activeFilters.favorite = e.target.value;
                renderGarden();
            });

            document.getElementById('reset-filters').addEventListener('click', () => {
                activeFilters = { year: "", quarter: "", week: "", theme: "", favorite: "" };

                document.getElementById('filter-year').value = "";
                document.getElementById('filter-quarter').value = "";
                document.getElementById('filter-week').value = "";
                document.getElementById('filter-theme').value = "";
                document.getElementById('filter-favorite').value = "";

                renderGarden();
            });
        }

        function openModal(id) {
            console.log(`📂 Opening modal: ${id}`);
            const modal = document.getElementById(id);
            
            if (!modal) {
                console.error(`❌ Modal "${id}" not found in DOM!`);
                alert(`Error: Modal "${id}" not found. Please check the console.`);
                return;
            }
            
            modal.classList.add('active');
            console.log(`✅ Modal "${id}" opened successfully`);
            
            // AUTO-FILL FILTERS WHEN ADDING A WORD - NEW
            if (id === 'word-modal') {
                document.getElementById('year-input').value = activeFilters.year || "";
                document.getElementById('quarter-input').value = activeFilters.quarter || "";
                document.getElementById('week-input').value = activeFilters.week || "";
                document.getElementById('theme-input').value = activeFilters.theme || "";
            }
            
            // Populate linked reading dropdown when opening passage modal
            if (id === 'add-passage-modal') {
                populateLinkedReadingDropdown();
            }
        }

        function closeModal(id) {
            try {
                const modal = document.getElementById(id);
                if (modal && modal.classList) {
                    modal.classList.remove('active');
                } else {
                    console.warn(`⚠️ Modal "${id}" not found`);
                }
                const forms = ['word-form', 'edit-word-form', 'reading-form', 'listening-form', 'resources-form'];
                forms.forEach(formId => {
                    const form = document.getElementById(formId);
                    if (form) form.reset();
                });
                
                // Reset image previews
                const previews = ['word-image-preview', 'edit-word-image-preview'];
                previews.forEach(previewId => {
                    const preview = document.getElementById(previewId);
                    if (preview) {
                        preview.style.display = 'none';
                        preview.src = '';
                    }
                });
                
                // Reset file inputs
                const fileInputs = ['word-image-input', 'edit-word-image-input'];
                fileInputs.forEach(inputId => {
                    const input = document.getElementById(inputId);
                    if (input) input.value = '';
                });
                
                // DON'T reset section checkboxes - let them stay as they were saved!
                // Resources will keep their assigned sections
            } catch (e) {
                console.error('closeModal error:', e);
            }
        }

        function editWord(id) {
            const word = vocabulary.find(w => w.id === id);
            if (!word) return;

            document.getElementById('edit-word-id').value = id;
            document.getElementById('edit-word-input').value = word.french;
            document.getElementById('edit-meaning-input').value = word.meaning || '';
            document.getElementById('edit-article-input').value = word.article || '';
            document.getElementById('edit-gender-input').value = word.gender || '';
            document.getElementById('edit-theme-input').value = word.theme || '';
            document.getElementById('edit-week-input').value = word.week || '';
            document.getElementById('edit-quarter-input').value = word.quarter || '';
            document.getElementById('edit-year-input').value = word.year || '';
            document.getElementById('edit-context1').value = word.contexts && word.contexts[0] ? word.contexts[0] : '';
            document.getElementById('edit-context2').value = word.contexts && word.contexts[1] ? word.contexts[1] : '';
            document.getElementById('edit-context3').value = word.contexts && word.contexts[2] ? word.contexts[2] : '';
            document.getElementById('edit-note-input').value = word.note || '';

            if (word.image) {
                const preview = document.getElementById('edit-word-image-preview');
                preview.src = word.image;
                preview.style.display = 'block';
            }

            openModal('edit-word-modal');
        }

        function deleteWord(id) {
            if (confirm('Supprimer ce mot ?')) {
                vocabulary = vocabulary.filter(w => w.id !== id);
                if (window.syncToFirebase) window.syncToFirebase();
                
                renderGarden();
                populateJardinFilters(); // Update filters after deletion
            }
        }

        function toggleFavorite(id) {
            const word = vocabulary.find(w => w.id === id);
            if (word) {
                word.favorite = !word.favorite;
                if (window.syncToFirebase) window.syncToFirebase();
                
                renderGarden();
            }
        }

        // ============================================
        // ADD WORD - FIXED
        // ============================================
        document.getElementById('word-form').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const imagePreview = document.getElementById('word-image-preview');
            
            const word = {
                id: Date.now(),
                french: document.getElementById('word-input').value.trim(),
                meaning: document.getElementById('meaning-input').value.trim() || '',
                article: document.getElementById('article-input').value,
                gender: document.getElementById('gender-input').value,
                theme: document.getElementById('theme-input').value.trim() || '',
                week: document.getElementById('week-input').value || '',
                quarter: document.getElementById('quarter-input').value || '',
                year: document.getElementById('year-input').value || '',
                contexts: [
                    document.getElementById('context1').value.trim(),
                    document.getElementById('context2').value.trim(),
                    document.getElementById('context3').value.trim()
                ].filter(Boolean),
                note: document.getElementById('note-input').value.trim() || '',
                image: imagePreview.style.display !== 'none' ? imagePreview.src : null,
                created: new Date().toISOString()
            };

            // Validate required field
            if (!word.french) {
                alert('Veuillez entrer un mot en français');
                return;
            }

            vocabulary.push(word);
                if (window.syncToFirebase) window.syncToFirebase();
            
            // Log action for presence tracking
            logAction(ACTION_TYPES.NEW_WORD);
            
            renderGarden();
            populateJardinFilters(); // Update filters after adding
            closeModal('word-modal');
            
            // Trigger floating hearts animation
            for (let i = 0; i < 3; i++) {
                setTimeout(() => createFloatingHeart(), i * 300);
            }
        });

        // ============================================
        // EDIT WORD - FIXED
        // ============================================
        document.getElementById('edit-word-form').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const id = parseInt(document.getElementById('edit-word-id').value);
            const index = vocabulary.findIndex(w => w.id === id);
            
            if (index === -1) return;

            const imagePreview = document.getElementById('edit-word-image-preview');

            vocabulary[index] = {
                ...vocabulary[index],
                french: document.getElementById('edit-word-input').value.trim(),
                meaning: document.getElementById('edit-meaning-input').value.trim() || '',
                article: document.getElementById('edit-article-input').value,
                gender: document.getElementById('edit-gender-input').value,
                theme: document.getElementById('edit-theme-input').value.trim() || '',
                week: document.getElementById('edit-week-input').value || '',
                quarter: document.getElementById('edit-quarter-input').value || '',
                year: document.getElementById('edit-year-input').value || '',
                contexts: [
                    document.getElementById('edit-context1').value.trim(),
                    document.getElementById('edit-context2').value.trim(),
                    document.getElementById('edit-context3').value.trim()
                ].filter(Boolean),
                note: document.getElementById('edit-note-input').value.trim() || '',
                image: imagePreview.style.display !== 'none' ? imagePreview.src : vocabulary[index].image
            };

            // Validate required field
            if (!vocabulary[index].french) {
                alert('Veuillez entrer un mot en français');
                return;
            }            if (window.syncToFirebase) window.syncToFirebase();
            
            renderGarden();
            populateJardinFilters(); // Update filters after editing
            closeModal('edit-word-modal');
        });

        // ============================================
        // RANDOM WORD GAME - UPDATED FOR FILTERS
        // ============================================
        document.getElementById('random-word').addEventListener('click', () => {
            const filteredVocabulary = getFilteredVocabulary();
            
            if (filteredVocabulary.length === 0) {
                document.getElementById('game-result').innerHTML = `
                    <div class="game-prompt">${vocabulary.length === 0 ? 'Plante quelques mots d\'abord' : 'Aucun mot ne correspond à tes filtres'}</div>
                `;
                return;
            }

            const word = filteredVocabulary[Math.floor(Math.random() * filteredVocabulary.length)];
            const prompts = [
                "Utilise ce mot dans une phrase",
                "Dis-le à voix haute",
                "Écris une émotion avec ce mot",
                "Trouve un synonyme",
                "Conjugue ce verbe (ou invente une phrase)",
                "Dessine ce que ce mot signifie pour toi"
            ];
            const prompt = prompts[Math.floor(Math.random() * prompts.length)];

            document.getElementById('game-result').innerHTML = `
                <div class="game-word">${word.french}</div>
                <div class="game-prompt">${prompt}</div>
            `;
        });

        // ============================================
        // GAME MODE SWITCHING
        // ============================================
        document.querySelectorAll('.game-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const gameMode = btn.dataset.game;
                
                // Update active button
                document.querySelectorAll('.game-mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Hide all game containers
                document.querySelectorAll('.game-container').forEach(c => c.style.display = 'none');
                
                // Show selected game
                const selectedGame = document.getElementById(`game-${gameMode}`);
                if (selectedGame) selectedGame.style.display = 'block';
            });
        });

        // ============================================
        // MATCHING GAME
        // ============================================
        let matchingPairs = [];
        let selectedCards = [];
        let matchedCount = 0;

        const startMatchingBtn = document.getElementById('start-matching');
        const resetMatchingBtn = document.getElementById('reset-matching');
        if (startMatchingBtn) startMatchingBtn.addEventListener('click', startMatchingGame);
        if (resetMatchingBtn) resetMatchingBtn.addEventListener('click', startMatchingGame);

        function startMatchingGame() {
            const filteredVocabulary = getFilteredVocabulary();
            if (filteredVocabulary.length < 4) {
                alert('Tu as besoin d\'au moins 4 mots pour jouer');
                return;
            }

            // Get 4 random words
            const shuffled = [...filteredVocabulary].sort(() => Math.random() - 0.5).slice(0, 4);
            matchingPairs = [];
            selectedCards = [];
            matchedCount = 0;

            // Create pairs
            shuffled.forEach((word, i) => {
                matchingPairs.push({ id: i, text: word.french, type: 'french', wordId: i });
                matchingPairs.push({ id: i + 4, text: word.meaning || word.french, type: 'meaning', wordId: i });
            });

            // Shuffle pairs
            matchingPairs.sort(() => Math.random() - 0.5);

            // Render
            const grid = document.getElementById('matching-pairs');
            grid.innerHTML = matchingPairs.map(pair => `
                <div class="matching-card" data-id="${pair.id}" data-word-id="${pair.wordId}">
                    ${pair.text}
                </div>
            `).join('');

            // Add click handlers
            document.querySelectorAll('.matching-card').forEach(card => {
                card.addEventListener('click', handleMatchingClick);
            });

            const startBtn = document.getElementById('start-matching');
            const resetBtn = document.getElementById('reset-matching');
            const scoreElem = document.getElementById('matching-score');
            
            if (startBtn) startBtn.style.display = 'none';
            if (resetBtn) resetBtn.style.display = 'inline-block';
            if (scoreElem) scoreElem.textContent = '';
        }

        function handleMatchingClick(e) {
            const card = e.currentTarget;
            if (card.classList.contains('matched') || selectedCards.includes(card)) return;

            card.classList.add('selected');
            selectedCards.push(card);

            if (selectedCards.length === 2) {
                const [card1, card2] = selectedCards;
                const wordId1 = card1.dataset.wordId;
                const wordId2 = card2.dataset.wordId;

                if (wordId1 === wordId2) {
                    // Match!
                    card1.classList.remove('selected');
                    card2.classList.remove('selected');
                    card1.classList.add('matched');
                    card2.classList.add('matched');
                    matchedCount++;

                    if (matchedCount === 4) {
                        setTimeout(() => {
                            document.getElementById('matching-score').innerHTML = '✨ Parfait ! Tu as tout trouvé ! ✨';
                        }, 300);
                    }
                } else {
                    // No match
                    card1.classList.add('wrong');
                    card2.classList.add('wrong');
                    setTimeout(() => {
                        card1.classList.remove('selected', 'wrong');
                        card2.classList.remove('selected', 'wrong');
                    }, 600);
                }

                selectedCards = [];
            }
        }

        // ============================================
        // FILL IN THE BLANK GAME
        // ============================================
        let fillBlankScore = 0;
        let fillBlankTotal = 0;
        let currentFillBlankWord = null;

        const startFillBlankBtn = document.getElementById('start-fillblank');
        const nextFillBlankBtn = document.getElementById('next-fillblank');
        if (startFillBlankBtn) startFillBlankBtn.addEventListener('click', nextFillBlank);
        if (nextFillBlankBtn) nextFillBlankBtn.addEventListener('click', nextFillBlank);

        function nextFillBlank() {
            const filteredVocabulary = getFilteredVocabulary();
            if (filteredVocabulary.length === 0) {
                alert('Aucun mot disponible');
                return;
            }

            // Get words with contexts
            const wordsWithContext = filteredVocabulary.filter(w => w.contexts && w.contexts[0]);
            if (wordsWithContext.length === 0) {
                alert('Tu as besoin de mots avec des exemples pour jouer');
                return;
            }

            currentFillBlankWord = wordsWithContext[Math.floor(Math.random() * wordsWithContext.length)];
            const sentence = currentFillBlankWord.contexts[0];

            // Replace the word with blank
            const blankSentence = sentence.replace(new RegExp(currentFillBlankWord.french, 'gi'), '______');

            // Get 3 wrong options
            const wrongOptions = filteredVocabulary
                .filter(w => w.id !== currentFillBlankWord.id)
                .sort(() => Math.random() - 0.5)
                .slice(0, 3)
                .map(w => w.french);

            const allOptions = [currentFillBlankWord.french, ...wrongOptions].sort(() => Math.random() - 0.5);

            const sentenceElem = document.getElementById('fillblank-sentence');
            const optionsElem = document.getElementById('fillblank-options');
            
            if (sentenceElem) sentenceElem.textContent = blankSentence;
            if (optionsElem) optionsElem.innerHTML = allOptions.map(opt => `
                <button class="fillblank-option" data-word="${opt}">${opt}</button>
            `).join('');

            document.querySelectorAll('.fillblank-option').forEach(btn => {
                btn.addEventListener('click', handleFillBlankChoice);
            });

            const feedbackElem = document.getElementById('fillblank-feedback');
            const startBtn = document.getElementById('start-fillblank');
            const nextBtn = document.getElementById('next-fillblank');
            const scoreElem = document.getElementById('fillblank-score');
            
            if (feedbackElem) feedbackElem.textContent = '';
            if (startBtn) startBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
            if (scoreElem) scoreElem.textContent = `Score: ${fillBlankScore}/${fillBlankTotal}`;
        }

        function handleFillBlankChoice(e) {
            const chosen = e.currentTarget.dataset.word;
            fillBlankTotal++;

            document.querySelectorAll('.fillblank-option').forEach(btn => {
                btn.style.pointerEvents = 'none';
            });

            const feedbackElem = document.getElementById('fillblank-feedback');
            
            if (chosen === currentFillBlankWord.french) {
                e.currentTarget.classList.add('correct');
                if (feedbackElem) {
                    feedbackElem.innerHTML = '✓ Correct !';
                    feedbackElem.style.color = '#7fa87f';
                }
                fillBlankScore++;
            } else {
                e.currentTarget.classList.add('incorrect');
                if (feedbackElem) {
                    feedbackElem.innerHTML = `✗ C'était: <strong>${currentFillBlankWord.french}</strong>`;
                    feedbackElem.style.color = 'var(--crimson)';
                }
            }

            const nextBtn = document.getElementById('next-fillblank');
            const scoreElem = document.getElementById('fillblank-score');
            
            if (nextBtn) nextBtn.style.display = 'inline-block';
            if (scoreElem) scoreElem.textContent = `Score: ${fillBlankScore}/${fillBlankTotal}`;
        }

        // ============================================
        // SPEED ROUND GAME
        // ============================================
        let speedTimer = 60;
        let speedInterval = null;
        let speedCorrect = 0;
        let speedTotal = 0;
        let speedWords = [];
        let speedIndex = 0;

        const startSpeedBtn = document.getElementById('start-speed');
        const speedKnowBtn = document.getElementById('speed-know');
        const speedSkipBtn = document.getElementById('speed-skip');
        if (startSpeedBtn) startSpeedBtn.addEventListener('click', startSpeedRound);
        if (speedKnowBtn) speedKnowBtn.addEventListener('click', () => handleSpeedAnswer(true));
        if (speedSkipBtn) speedSkipBtn.addEventListener('click', () => handleSpeedAnswer(false));

        function startSpeedRound() {
            const filteredVocabulary = getFilteredVocabulary();
            if (filteredVocabulary.length === 0) {
                alert('Aucun mot disponible');
                return;
            }

            speedTimer = 60;
            speedCorrect = 0;
            speedTotal = 0;
            speedIndex = 0;
            speedWords = [...filteredVocabulary].sort(() => Math.random() - 0.5);

            const startBtn = document.getElementById('start-speed');
            const knowBtn = document.getElementById('speed-know');
            const skipBtn = document.getElementById('speed-skip');
            
            if (startBtn) startBtn.style.display = 'none';
            if (knowBtn) knowBtn.style.display = 'inline-block';
            if (skipBtn) skipBtn.style.display = 'inline-block';

            showSpeedWord();

            speedInterval = setInterval(() => {
                speedTimer--;
                const timerElem = document.getElementById('speed-timer');
                if (timerElem) timerElem.textContent = speedTimer;

                if (speedTimer <= 0) {
                    endSpeedRound();
                }
            }, 1000);
        }

        function showSpeedWord() {
            if (speedIndex >= speedWords.length) {
                speedWords = [...speedWords].sort(() => Math.random() - 0.5);
                speedIndex = 0;
            }
            const wordElem = document.getElementById('speed-word');
            if (wordElem) wordElem.textContent = speedWords[speedIndex].french;
        }

        function handleSpeedAnswer(correct) {
            speedTotal++;
            if (correct) speedCorrect++;
            speedIndex++;
            showSpeedWord();
        }

        function endSpeedRound() {
            clearInterval(speedInterval);
            const knowBtn = document.getElementById('speed-know');
            const skipBtn = document.getElementById('speed-skip');
            const startBtn = document.getElementById('start-speed');
            const wordElem = document.getElementById('speed-word');
            const timerElem = document.getElementById('speed-timer');
            const scoreElem = document.getElementById('speed-score');
            
            if (knowBtn) knowBtn.style.display = 'none';
            if (skipBtn) skipBtn.style.display = 'none';
            if (startBtn) startBtn.style.display = 'inline-block';
            if (wordElem) wordElem.textContent = '';
            if (timerElem) timerElem.textContent = '60';
            if (scoreElem) scoreElem.innerHTML = `
                Terminé ! 🎉<br>
                Tu as reconnu <strong>${speedCorrect}</strong> mots sur <strong>${speedTotal}</strong>
            `;
        }

        // ============================================
        // TRANSLATION QUIZ GAME
        // ============================================
        let quizScore = 0;
        let quizTotal = 0;
        let currentQuizWord = null;

        const startQuizBtn = document.getElementById('start-quiz');
        const submitQuizBtn = document.getElementById('submit-quiz');
        const nextQuizBtn = document.getElementById('next-quiz');
        const quizInput = document.getElementById('quiz-input');
        
        if (startQuizBtn) startQuizBtn.addEventListener('click', nextQuiz);
        if (submitQuizBtn) submitQuizBtn.addEventListener('click', checkQuizAnswer);
        if (nextQuizBtn) nextQuizBtn.addEventListener('click', nextQuiz);

        if (quizInput) quizInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                checkQuizAnswer();
            }
        });

        function nextQuiz() {
            const filteredVocabulary = getFilteredVocabulary();
            if (filteredVocabulary.length === 0) {
                alert('Aucun mot disponible');
                return;
            }

            currentQuizWord = filteredVocabulary[Math.floor(Math.random() * filteredVocabulary.length)];

            const wordElem = document.getElementById('quiz-word');
            const inputElem = document.getElementById('quiz-input');
            const feedbackElem = document.getElementById('quiz-feedback');
            const startBtn = document.getElementById('start-quiz');
            const submitBtn = document.getElementById('submit-quiz');
            const nextBtn = document.getElementById('next-quiz');
            const scoreElem = document.getElementById('quiz-score');
            
            if (wordElem) wordElem.textContent = currentQuizWord.french;
            if (inputElem) {
                inputElem.value = '';
                inputElem.style.display = 'block';
                inputElem.focus();
            }
            if (feedbackElem) feedbackElem.textContent = '';
            if (startBtn) startBtn.style.display = 'none';
            if (submitBtn) submitBtn.style.display = 'inline-block';
            if (nextBtn) nextBtn.style.display = 'none';
            if (scoreElem) scoreElem.textContent = `Score: ${quizScore}/${quizTotal}`;
        }

        function checkQuizAnswer() {
            const inputElem = document.getElementById('quiz-input');
            const answer = inputElem ? inputElem.value.trim().toLowerCase() : '';
            const correct = (currentQuizWord.meaning || '').toLowerCase();

            quizTotal++;

            const feedbackElem = document.getElementById('quiz-feedback');
            
            if (answer === correct || correct.includes(answer)) {
                if (feedbackElem) {
                    feedbackElem.innerHTML = '✓ Correct !';
                    feedbackElem.style.color = '#7fa87f';
                }
                quizScore++;
            } else {
                if (feedbackElem) {
                    feedbackElem.innerHTML = `✗ C'était: <strong>${currentQuizWord.meaning}</strong>`;
                    feedbackElem.style.color = 'var(--crimson)';
                }
            }

            const submitBtn = document.getElementById('submit-quiz');
            const nextBtn = document.getElementById('next-quiz');
            const scoreElem = document.getElementById('quiz-score');
            
            if (submitBtn) submitBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'inline-block';
            if (scoreElem) scoreElem.textContent = `Score: ${quizScore}/${quizTotal}`;
        }

        // ============================================
        // READING LIST - FIXED WITH EDIT
        // ============================================
        function renderReadingList() {
            const grid = document.getElementById('reading-grid');
            
            if (readingList.length === 0) {
                grid.innerHTML = `
                    <div class="empty">
                        <div class="empty-icon">
                            <svg class="svg-icon-lg" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.3;">
                                <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/>
                            </svg>
                        </div>
                        <div class="empty-text">Rien ici encore...</div>
                    </div>
                `;
                return;
            }

            const statusLabels = {
                want: 'Je veux lire',
                reading: 'En train de lire',
                done: 'Lu'
            };

            // Sort by most recent first
            const sortedReadingList = [...readingList].sort((a, b) => b.id - a.id);

            grid.innerHTML = sortedReadingList.map(item => {
                // Check if this reading item has a linked passage
                const hasLinkedPassage = item.linkedPassageId && readingPassages.find(p => p.id === item.linkedPassageId);
                
                return `
                <div class="resource-card">
                    <div class="resource-info">
                        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                            <div class="resource-type">${item.type}</div>
                            ${hasLinkedPassage ? `
                                <button onclick="viewLinkedPassage(${item.id})" 
                                    style="display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.25rem 0.6rem; background: var(--crimson); color: white; border: none; border-radius: 20px; cursor: pointer; font-size: 0.75rem; font-weight: 500; transition: all 0.2s;"
                                    onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 2px 8px rgba(190, 31, 46, 0.3)';"
                                    onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none';"
                                    title="Voir le texte interactif">
                                    <svg viewBox="0 0 24 24" fill="currentColor" style="width: 12px; height: 12px;">
                                        <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                                    </svg>
                                    Texte interactif
                                </button>
                            ` : ''}
                        </div>
                        <div class="resource-title">${item.title}</div>
                        ${item.link ? `<a href="${item.link}" class="resource-link" target="_blank" rel="noopener noreferrer">${item.link}</a>` : ''}
                        ${item.note ? `<div class="resource-note">${item.note}</div>` : ''}
                        <div class="resource-status">${statusLabels[item.status]}</div>
                    </div>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button class="icon-btn" onclick="createInteractiveTextFromReading(${item.id})" title="Voir le texte interactif">
                            <svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                            </svg>
                        </button>
                        <button class="icon-btn" onclick="editReading(${item.id})" title="Modifier">
                            <svg class="svg-icon" viewBox="0 0 24 24">
                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                            </svg>
                        </button>
                        <button class="icon-btn" onclick="deleteReading(${item.id})" title="Supprimer">
                            <svg class="svg-icon" viewBox="0 0 24 24">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
            }).join('');
        }

        window.createInteractiveTextFromReading = function(readingId) {
            const item = readingList.find(r => r.id === readingId);
            if (!item) return;
            
            // FIRST: Check if there's already an interactive text linked to this reading
            const existingPassage = readingPassages.find(p => p.linkedReadingId === readingId);
            
            if (existingPassage) {
                // Navigate to the Textes Interactifs section
                window.location.hash = 'reading';
                
                // Scroll to the specific passage card
                setTimeout(() => {
                    const passageCard = document.getElementById(`passage-card-${existingPassage.id}`);
                    if (passageCard) {
                        passageCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        
                        // Add a highlight flash effect
                        passageCard.style.transition = 'all 0.3s ease';
                        passageCard.style.transform = 'scale(1.02)';
                        passageCard.style.boxShadow = '0 8px 30px rgba(190, 31, 46, 0.3)';
                        
                        setTimeout(() => {
                            passageCard.style.transform = 'scale(1)';
                            passageCard.style.boxShadow = '';
                        }, 600);
                    }
                }, 300);
            } else {
                // No existing passage - open form to create new one
                // Pre-fill the interactive text form with reading list data
                document.getElementById('passage-title').value = item.title;
                document.getElementById('passage-source').value = item.type || '';
                document.getElementById('passage-linked-reading').value = readingId;
                
                // Open modal
                openModal('add-passage-modal');
                
                // Scroll to text field and focus
                setTimeout(() => {
                    const textArea = document.getElementById('passage-text');
                    textArea.focus();
                    textArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        };

        // Populate passages dropdown in reading forms
        function populatePassagesDropdown() {
            const addSelect = document.getElementById('reading-linked-passage');
            const editSelect = document.getElementById('edit-reading-linked-passage');
            
            const options = '<option value="">-- Aucun --</option>' + 
                readingPassages.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
            
            if (addSelect) addSelect.innerHTML = options;
            if (editSelect) editSelect.innerHTML = options;
        }

        function editReading(id) {
            const item = readingList.find(r => r.id === id);
            if (!item) return;

            document.getElementById('edit-reading-id').value = id;
            document.getElementById('edit-reading-type').value = item.type;
            document.getElementById('edit-reading-title').value = item.title;
            document.getElementById('edit-reading-link').value = item.link || '';
            document.getElementById('edit-reading-status').value = item.status;
            document.getElementById('edit-reading-note').value = item.note || '';
            
            // Populate passages dropdown and set current value
            populatePassagesDropdown();
            document.getElementById('edit-reading-linked-passage').value = item.linkedPassageId || '';

            openModal('edit-reading-modal');
        }

        function deleteReading(id) {
            if (confirm('Supprimer cet article ?')) {
                readingList = readingList.filter(r => r.id !== id);
                syncToFirebase(); // Auto-save readingList to Firebase
                renderReadingList();
            }
        }

        function setupReadingListeners() {
            const addReadingBtn = document.getElementById('add-reading-btn');
            const readingForm = document.getElementById('reading-form');
            
            if (!addReadingBtn || !readingForm) {
                console.warn('⚠️ Reading elements not found');
                return;
            }
            
            addReadingBtn.addEventListener('click', () => {
                populatePassagesDropdown();
                openModal('reading-modal');
            });

            readingForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const linkedPassageId = document.getElementById('reading-linked-passage').value;
            
            const item = {
                id: Date.now(),
                type: document.getElementById('reading-type').value,
                title: document.getElementById('reading-title').value.trim(),
                link: document.getElementById('reading-link').value.trim(),
                status: document.getElementById('reading-status').value,
                note: document.getElementById('reading-note').value.trim() || '',
                linkedPassageId: linkedPassageId ? parseInt(linkedPassageId) : null,
                created: new Date().toISOString()
            };

            // Validate required field
            if (!item.title) {
                alert('Veuillez entrer un titre');
                return;
            }

            readingList.push(item);
                syncToFirebase(); // Auto-save readingList to Firebase
            
            // Log action for presence tracking
            logAction(ACTION_TYPES.READING);
            
            renderReadingList();
            document.getElementById('reading-form').reset();
            closeModal('reading-modal');
        });

        // EDIT READING FORM SUBMISSION
        document.getElementById('edit-reading-form').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const id = parseInt(document.getElementById('edit-reading-id').value);
            const index = readingList.findIndex(r => r.id === id);
            
            if (index === -1) return;

            const linkedPassageId = document.getElementById('edit-reading-linked-passage').value;

            readingList[index] = {
                ...readingList[index],
                type: document.getElementById('edit-reading-type').value,
                title: document.getElementById('edit-reading-title').value.trim(),
                link: document.getElementById('edit-reading-link').value.trim(),
                status: document.getElementById('edit-reading-status').value,
                note: document.getElementById('edit-reading-note').value.trim() || '',
                linkedPassageId: linkedPassageId ? parseInt(linkedPassageId) : null
            };

            // Validate required field
            if (!readingList[index].title) {
                alert('Veuillez entrer un titre');
                return;
            }            syncToFirebase(); // Auto-save readingList to Firebase
            renderReadingList();
            closeModal('edit-reading-modal');
        });
        }

        // ============================================
        // LISTENING LIST - ENHANCED WITH INTERACTIVE PLAYER
        // ============================================
        let currentListeningCategory = 'all';

        window.filterListeningByCategory = function(category) {
            currentListeningCategory = category;
            
            // Update active tab
            document.querySelectorAll('.listening-category-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.dataset.category === category) {
                    tab.classList.add('active');
                }
            });
            
            renderListeningList();
        };

        function renderListeningList() {
            const grid = document.getElementById('listening-grid');
            
            // Filter by category
            let filteredList = listeningList;
            if (currentListeningCategory !== 'all') {
                filteredList = listeningList.filter(item => item.type === currentListeningCategory);
            }
            
            if (filteredList.length === 0) {
                const emptyMessage = currentListeningCategory === 'all' 
                    ? 'Rien ici encore...' 
                    : 'Aucun contenu dans cette catégorie';
                    
                grid.innerHTML = `
                    <div class="empty">
                        <div class="empty-icon">
                            <svg class="svg-icon-lg" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.3;">
                                <path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/>
                            </svg>
                        </div>
                        <div class="empty-text">${emptyMessage}</div>
                    </div>
                `;
                return;
            }

            // Sort by most recent first
            const sortedListeningList = [...filteredList].sort((a, b) => b.id - a.id);

            const progressLabels = {
                'not-started': 'Pas commencé',
                'working': 'En cours',
                'reviewing': 'En révision',
                'mastered': 'Maîtrisé'
            };

            const typeLabels = {
                'video': 'Vidéo',
                'song': 'Musique',
                'movie': 'Film',
                'series': 'Série',
                'podcast': 'Podcast',
                'other': 'Autre'
            };

            const progressStars = {
                'not-started': '☆☆☆☆☆',
                'working': '⭐⭐⭐☆☆',
                'reviewing': '⭐⭐⭐⭐☆',
                'mastered': '⭐⭐⭐⭐⭐'
            };

            grid.innerHTML = sortedListeningList.map(item => `
                <div class="listening-card">
                    <div class="resource-info">
                        <div class="resource-type">${typeLabels[item.type] || item.type}</div>
                        <div class="resource-title">${item.title}</div>
                        ${item.note ? `<div class="resource-note" style="margin-top: 0.5rem;">${item.note}</div>` : ''}
                        <div style="margin-top: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-size: 1.1rem;">${progressStars[item.progress || 'not-started']}</span>
                            <span style="color: var(--text-soft); font-size: 0.9rem;">${progressLabels[item.progress || 'not-started']}</span>
                        </div>
                        ${item.transcript && item.transcript.length > 0 ? `
                            <div style="margin-top: 0.5rem; color: var(--sage); font-size: 0.85rem;">
                                Transcription disponible
                            </div>
                        ` : ''}
                    </div>
                    <div class="listening-card-actions">
                        ${item.mediaUrl ? `
                            <button class="btn-play-interactive" onclick="openListeningPlayer(${item.id})">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M8 5v14l11-7z"/>
                                </svg>
                                Écouter
                            </button>
                        ` : ''}
                        <button class="icon-btn" onclick="editListening(${item.id})" title="Modifier">
                            <svg class="svg-icon" viewBox="0 0 24 24">
                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                            </svg>
                        </button>
                        <button class="icon-btn" onclick="deleteListening(${item.id})" title="Supprimer">
                            <svg class="svg-icon" viewBox="0 0 24 24">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `).join('');
        }

        function editListening(id) {
            const item = listeningList.find(l => l.id === id);
            if (!item) return;

            document.getElementById('edit-listening-id').value = id;
            document.getElementById('edit-listening-type').value = item.type;
            document.getElementById('edit-listening-title').value = item.title;
            document.getElementById('edit-listening-media-url').value = item.mediaUrl || '';
            document.getElementById('edit-listening-transcript-text').value = item.transcriptText || '';
            document.getElementById('edit-listening-progress').value = item.progress || 'not-started';
            document.getElementById('edit-listening-note').value = item.note || '';

            openModal('edit-listening-modal');
        }

        function deleteListening(id) {
            if (confirm('Supprimer ce média ?')) {
                listeningList = listeningList.filter(l => l.id !== id);
                syncToFirebase(); // Auto-save listeningList to Firebase
                renderListeningList();
            }
        }

        function setupListeningListeners() {
            const addListeningBtn = document.getElementById('add-listening-btn');
            const listeningForm = document.getElementById('listening-form');
            
            if (!addListeningBtn || !listeningForm) {
                console.warn('⚠️ Listening elements not found');
                return;
            }
            
            addListeningBtn.addEventListener('click', () => {
                openModal('listening-modal');
            });

            listeningForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const transcriptText = document.getElementById('listening-transcript-text').value.trim();
            const parsedTranscript = transcriptText ? parseTranscript(transcriptText) : null;
            
            const item = {
                id: Date.now(),
                type: document.getElementById('listening-type').value,
                title: document.getElementById('listening-title').value.trim(),
                mediaUrl: document.getElementById('listening-media-url').value.trim(),
                transcriptText: transcriptText,
                transcript: parsedTranscript,
                progress: document.getElementById('listening-progress').value,
                note: document.getElementById('listening-note').value.trim() || '',
                created: new Date().toISOString()
            };

            // Validate required field
            if (!item.title) {
                alert('Veuillez entrer un titre');
                return;
            }

            listeningList.push(item);
                syncToFirebase(); // Auto-save listeningList to Firebase
            
            // Log action for presence tracking
            logAction(ACTION_TYPES.LISTENING);
            
            renderListeningList();
            closeModal('listening-modal');
            
            document.getElementById('listening-form').reset();
        });

        // EDIT LISTENING FORM SUBMISSION
        document.getElementById('edit-listening-form').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const id = parseInt(document.getElementById('edit-listening-id').value);
            const index = listeningList.findIndex(l => l.id === id);
            
            if (index === -1) return;

            const transcriptText = document.getElementById('edit-listening-transcript-text').value.trim();
            const parsedTranscript = transcriptText ? parseTranscript(transcriptText) : null;

            listeningList[index] = {
                ...listeningList[index],
                type: document.getElementById('edit-listening-type').value,
                title: document.getElementById('edit-listening-title').value.trim(),
                mediaUrl: document.getElementById('edit-listening-media-url').value.trim(),
                transcriptText: transcriptText,
                transcript: parsedTranscript,
                progress: document.getElementById('edit-listening-progress').value,
                note: document.getElementById('edit-listening-note').value.trim() || ''
            };

            // Validate required field
            if (!listeningList[index].title) {
                alert('Veuillez entrer un titre');
                return;
            }            syncToFirebase(); // Auto-save listeningList to Firebase
            renderListeningList();
            closeModal('edit-listening-modal');
        });
        }

        // ============================================
        // RESOURCES LIST - FIXED WITH EDIT
        // ============================================
        function renderResourcesList() {
            const grid = document.getElementById('resources-grid');
            const filterType = document.getElementById('filter-resources-type')?.value || '';
            
            // Filter resources by type
            let filteredResources = resourcesList;
            if (filterType) {
                filteredResources = resourcesList.filter(r => r.type === filterType);
            }
            
            if (filteredResources.length === 0) {
                grid.innerHTML = `
                    <div class="empty">
                        <div class="empty-icon">
                            <svg class="svg-icon-lg" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.3;">
                                <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
                            </svg>
                        </div>
                        <div class="empty-text">${resourcesList.length === 0 ? 'Rien ici encore...' : 'Aucune ressource ne correspond à ce filtre.'}</div>
                    </div>
                `;
                return;
            }

            const typeLabels = {
                website: 'Site Web',
                youtube: 'YouTube',
                app: 'Application',
                podcast: 'Podcast',
                book: 'Livre',
                tool: 'Outil',
                course: 'Cours',
                other: 'Autre'
            };

            // Sort by most recent first
            const sortedResourcesList = [...filteredResources].sort((a, b) => b.id - a.id);

            grid.innerHTML = sortedResourcesList.map(item => `
                <div class="resource-card">
                    <div class="resource-info">
                        <div class="resource-type">${typeLabels[item.type] || item.type}</div>
                        <div class="resource-title">${item.name}</div>
                        ${item.description ? `<div class="resource-note" style="margin-bottom: 0.5rem;">${item.description}</div>` : ''}
                        ${item.link ? `<a href="${item.link}" class="resource-link" target="_blank" rel="noopener noreferrer">${item.link}</a>` : ''}
                        ${item.note ? `<div class="resource-note">${item.note}</div>` : ''}
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="icon-btn" onclick="editResource(${item.id})" title="Modifier">
                            <svg class="svg-icon" viewBox="0 0 24 24">
                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                            </svg>
                        </button>
                        <button class="icon-btn" onclick="deleteResource(${item.id})" title="Supprimer">
                            <svg class="svg-icon" viewBox="0 0 24 24">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `).join('');
        }

        // Render resources in each section's dropdown
        function renderSectionResources() {
            const sections = ['lire', 'ecouter', 'parler', 'ecrire'];
            const typeIcons = {
                website: 'M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM7 18H5V6h2v12zm4 0H9V6h2v12zm4 0h-2V6h2v12zm4 0h-2V6h2v12z',
                youtube: 'M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81z',
                app: 'M4 6h16v12H4V6m16-2H4c-1.11 0-2 .89-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.11-.9-2-2-2z',
                podcast: 'M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z',
                book: 'M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z',
                tool: 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z',
                course: 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z',
                other: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z'
            };

            sections.forEach(sectionId => {
                const container = document.getElementById(`${sectionId}-resources`);
                if (!container) return;

                const grid = container.querySelector('.section-resources-grid');
                if (!grid) return;

                const sectionResources = resourcesList.filter(r => 
                    r.sections && r.sections.includes(sectionId)
                );

                if (sectionResources.length === 0) {
                    grid.innerHTML = `
                        <div style="text-align: center; padding: 2rem; color: var(--text-soft); font-size: 0.9rem;">
                            <p>Aucune ressource pour cette section.</p>
                            <p style="font-size: 0.85rem; margin-top: 0.5rem;">Ajoute des ressources dans <em>La Réserve</em> et sélectionne cette section.</p>
                        </div>
                    `;
                    return;
                }

                grid.innerHTML = sectionResources.map(item => `
                    <div class="resource-mini-card">
                        <div class="resource-mini-card-icon">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="${typeIcons[item.type] || typeIcons.other}"/>
                            </svg>
                        </div>
                        <div class="resource-mini-card-title">${item.name}</div>
                        ${item.description ? `<div class="resource-mini-card-desc">${item.description}</div>` : ''}
                        ${item.link ? `
                            <a href="${item.link}" class="resource-mini-card-link" target="_blank" rel="noopener noreferrer">
                                Ouvrir
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                                </svg>
                            </a>
                        ` : ''}
                    </div>
                `).join('');
            });
        }

        // Setup dropdown toggle functionality
        function setupResourceDropdowns() {
            document.querySelectorAll('.resources-toggle-btn').forEach(btn => {
                // Mark the last SVG as the chevron for rotation
                const svgs = btn.querySelectorAll('svg');
                if (svgs.length > 0) svgs[svgs.length - 1].classList.add('resources-chevron');
                
                btn.addEventListener('click', () => {
                    const section = btn.getAttribute('data-section');
                    const content = document.getElementById(`${section}-resources`);
                    
                    if (content) {
                        const isActive = content.classList.contains('active');
                        content.classList.toggle('active');
                        btn.classList.toggle('active');
                    }
                });
            });
        }

        function editResource(id) {
            const item = resourcesList.find(r => r.id === id);
            if (!item) return;

            document.getElementById('edit-resources-id').value = id;
            document.getElementById('edit-resources-type').value = item.type;
            document.getElementById('edit-resources-name').value = item.name;
            document.getElementById('edit-resources-description').value = item.description || '';
            document.getElementById('edit-resources-link').value = item.link || '';
            document.getElementById('edit-resources-note').value = item.note || '';

            // Populate section checkboxes
            const sections = item.sections || [];
            document.querySelectorAll('.edit-resources-section-checkbox').forEach(cb => {
                cb.checked = sections.includes(cb.value);
            });

            openModal('edit-resources-modal');
        }

        function deleteResource(id) {
            if (confirm('Supprimer cette ressource ?')) {
                resourcesList = resourcesList.filter(r => r.id !== id);
                syncToFirebase(); // Auto-save resourcesList to Firebase
                renderResourcesList();
                renderSectionResources(); // Update section resources
            }
        }

        function setupResourcesListeners() {
            console.log('🔧 Setting up resources listeners...');
            const addResourceBtn = document.getElementById('add-resource-btn');
            const resourcesForm = document.getElementById('resources-form');
            
            console.log('  - Add resource button:', addResourceBtn ? '✅ Found' : '❌ NOT FOUND');
            console.log('  - Resources form:', resourcesForm ? '✅ Found' : '❌ NOT FOUND');
            
            if (!addResourceBtn || !resourcesForm) {
                console.warn('⚠️ Resources elements not found');
                return;
            }
            
            addResourceBtn.addEventListener('click', () => {
                console.log('🎯 Add resource button clicked!');
                // Check all section checkboxes by default when adding new resource
                document.querySelectorAll('.resources-section-checkbox').forEach(cb => {
                    cb.checked = true;
                });
                openModal('resources-modal');
            });
            
            console.log('✅ Resources listeners attached!');

            resourcesForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Get selected sections
            const selectedSections = Array.from(document.querySelectorAll('.resources-section-checkbox:checked'))
                .map(cb => cb.value);
            
            const item = {
                id: Date.now(),
                type: document.getElementById('resources-type').value,
                name: document.getElementById('resources-name').value.trim(),
                description: document.getElementById('resources-description').value.trim() || '',
                link: document.getElementById('resources-link').value.trim(),
                note: document.getElementById('resources-note').value.trim() || '',
                sections: selectedSections, // Store selected sections
                created: new Date().toISOString()
            };

            // Validate required field
            if (!item.name) {
                alert('Veuillez entrer un nom');
                return;
            }

            resourcesList.push(item);
                syncToFirebase(); // Auto-save resourcesList to Firebase
            renderResourcesList();
            renderSectionResources(); // Render resources in sections
            closeModal('resources-modal');
        });

        // EDIT RESOURCES FORM SUBMISSION
        document.getElementById('edit-resources-form').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const id = parseInt(document.getElementById('edit-resources-id').value);
            const index = resourcesList.findIndex(r => r.id === id);
            
            if (index === -1) return;

            // Get selected sections
            const selectedSections = Array.from(document.querySelectorAll('.edit-resources-section-checkbox:checked'))
                .map(cb => cb.value);

            resourcesList[index] = {
                ...resourcesList[index],
                type: document.getElementById('edit-resources-type').value,
                name: document.getElementById('edit-resources-name').value.trim(),
                description: document.getElementById('edit-resources-description').value.trim() || '',
                link: document.getElementById('edit-resources-link').value.trim(),
                note: document.getElementById('edit-resources-note').value.trim() || '',
                sections: selectedSections // Update sections
            };

            // Validate required field
            if (!resourcesList[index].name) {
                alert('Veuillez entrer un nom');
                return;
            }            syncToFirebase(); // Auto-save resourcesList to Firebase
            renderResourcesList();
            renderSectionResources(); // Render resources in sections
            closeModal('edit-resources-modal');
        });
        }

        // ============================================
        // INTERACTIVE READING PASSAGES
        // ============================================
        
        // Add new passage
        document.getElementById('add-passage-form').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const linkedReadingId = document.getElementById('passage-linked-reading').value;
            const modal = document.getElementById('add-passage-modal');
            const editingId = modal.dataset.editingId;
            
            if (editingId) {
                // EDIT existing passage
                const passage = readingPassages.find(p => p.id === parseInt(editingId));
                if (passage) {
                    passage.title = document.getElementById('passage-title').value.trim();
                    passage.source = document.getElementById('passage-source').value.trim();
                    passage.text = document.getElementById('passage-text').value.trim();
                    passage.linkedReadingId = linkedReadingId ? parseInt(linkedReadingId) : null;
                    
                    syncToFirebase();
                    showToast('✓ Texte modifié avec succès !');
                }
                // Clear editing mode
                delete modal.dataset.editingId;
            } else {
                // CREATE new passage
                const passage = {
                    id: Date.now(),
                    title: document.getElementById('passage-title').value.trim(),
                    source: document.getElementById('passage-source').value.trim(),
                    text: document.getElementById('passage-text').value.trim(),
                    linkedReadingId: linkedReadingId ? parseInt(linkedReadingId) : null,
                    created: new Date().toISOString(),
                    unknownWords: []
                };
                
                readingPassages.push(passage);
                syncToFirebase();
                
                // Log reading action
                logAction(ACTION_TYPES.READING);
            }
            
            document.getElementById('add-passage-form').reset();
            closeModal('add-passage-modal');
            renderReadingPassages();
        });
        
        function renderReadingPassages() {
            const container = document.getElementById('reading-passages-container');
            if (!container) return;
            
            if (readingPassages.length === 0) {
                container.innerHTML = `
                    <div class="empty">
                        <div class="empty-icon">
                            <svg class="svg-icon-lg" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.3;">
                                <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/>
                            </svg>
                        </div>
                        <div class="empty-text">Ajoute ton premier texte pour commencer</div>
                    </div>
                `;
                return;
            }
            
            const sortedPassages = [...readingPassages].sort((a, b) => b.id - a.id);
            
            container.innerHTML = sortedPassages.map(passage => {
                const words = passage.text.split(/\s+/);
                const totalWords = words.length;
                const uniqueWords = [...new Set(words.map(w => w.toLowerCase().replace(/[.,!?;:…—\-"'«»]/g, '')))];
                
                // Count words in vocabulary
                const wordsInVocab = uniqueWords.filter(word => 
                    vocabulary.some(v => v.french.toLowerCase() === word)
                ).length;
                
                // Unknown words marked in this passage
                const unknownCount = passage.unknownWords.length;
                
                // NEW LOGIC: All words are assumed known EXCEPT those marked unknown
                // Comprehension = (total unique - unknown marked) / total unique
                const knownPercent = uniqueWords.length > 0 
                    ? Math.round(((uniqueWords.length - unknownCount) / uniqueWords.length) * 100) 
                    : 100; // Default to 100% if no words
                
                return `
                    <div class="reading-passage-card" id="passage-card-${passage.id}">
                        <div class="reading-passage-header">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
                                    <div class="reading-passage-title">${passage.title}</div>
                                    <div style="display: flex; gap: 0.3rem;">
                                        <button class="icon-btn" onclick="copyPassageText(${passage.id})" title="Copier le texte" style="opacity: 0.5; transition: opacity 0.2s;">
                                            <svg class="svg-icon" viewBox="0 0 24 24" style="width: 18px; height: 18px;">
                                                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                                            </svg>
                                        </button>
                                        <button class="icon-btn" onclick="editPassage(${passage.id})" title="Éditer" style="opacity: 0.5; transition: opacity 0.2s;">
                                            <svg class="svg-icon" viewBox="0 0 24 24" style="width: 18px; height: 18px;">
                                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                                            </svg>
                                        </button>
                                        <button class="icon-btn" onclick="deletePassage(${passage.id})" title="Supprimer" style="opacity: 0.5; transition: opacity 0.2s;">
                                            <svg class="svg-icon" viewBox="0 0 24 24" style="width: 18px; height: 18px;">
                                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
                                    ${passage.source ? `<div class="reading-passage-meta" style="font-style: italic; color: var(--text-soft);">${passage.source}</div>` : ''}
                                    ${passage.linkedReadingId ? `
                                        <button onclick="viewLinkedReading(${passage.linkedReadingId})" 
                                            style="display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.7rem; background: var(--crimson); color: white; border: none; border-radius: 20px; cursor: pointer; font-size: 0.85rem; font-weight: 500; transition: all 0.2s;"
                                            onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 2px 8px rgba(190, 31, 46, 0.3)';"
                                            onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none';">
                                            <svg viewBox="0 0 24 24" fill="currentColor" style="width: 14px; height: 14px;">
                                                <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/>
                                            </svg>
                                            ${getLinkedReadingTitle(passage.linkedReadingId)}
                                        </button>
                                    ` : ''}
                                    <div class="reading-passage-meta" style="color: var(--text-soft); font-size: 0.85rem;">${new Date(passage.created).toLocaleDateString('fr-FR', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}</div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 2rem; align-items: center;">
                                <div style="display: flex; gap: 1.5rem; padding: 0.75rem 1.5rem; background: linear-gradient(135deg, rgba(26, 35, 64, 0.03) 0%, rgba(190, 31, 46, 0.03) 100%); border-radius: 12px; border: 1px solid rgba(26, 35, 64, 0.08);">
                                    <div style="text-align: center;">
                                        <div style="font-size: 1.5rem; font-weight: 600; font-family: 'Cormorant Garamond', serif; color: var(--navy);">${totalWords}</div>
                                        <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-soft); margin-top: 2px;">mots</div>
                                    </div>
                                    <div style="width: 1px; background: rgba(26, 35, 64, 0.1);"></div>
                                    <div style="text-align: center;">
                                        <div style="font-size: 1.5rem; font-weight: 600; font-family: 'Cormorant Garamond', serif; color: #4CAF50;">${wordsInVocab}</div>
                                        <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-soft); margin-top: 2px;">jardin</div>
                                    </div>
                                    <div style="width: 1px; background: rgba(26, 35, 64, 0.1);"></div>
                                    <div style="text-align: center;">
                                        <div style="font-size: 1.5rem; font-weight: 600; font-family: 'Cormorant Garamond', serif; color: #FFB74D;">${unknownCount}</div>
                                        <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-soft); margin-top: 2px;">inconnus</div>
                                    </div>
                                    <div style="width: 1px; background: rgba(26, 35, 64, 0.1);"></div>
                                    <div style="text-align: center;">
                                        <div style="font-size: 1.5rem; font-weight: 600; font-family: 'Cormorant Garamond', serif; color: var(--crimson);">${knownPercent}<span style="font-size: 0.9rem;">%</span></div>
                                        <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-soft); margin-top: 2px;">compris</div>
                                    </div>
                                </div>
                                <button class="btn btn-secondary" onclick="togglePassageExpansion(${passage.id})" style="padding: 0.5rem 1rem; white-space: nowrap;">
                                    <svg id="expand-icon-${passage.id}" viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;">
                                        <path d="M7 10l5 5 5-5z"/>
                                    </svg>
                                    <span id="expand-text-${passage.id}">Réduire</span>
                                </button>
                            </div>
                        </div>
                        
                        <div class="reading-passage-content" id="passage-content-${passage.id}">
                            <div class="reading-passage-text" data-passage-id="${passage.id}">
                                ${renderInteractiveText(passage)}
                            </div>
                            
                            <div class="reading-progress-bar">
                                <div class="reading-progress-label">Compréhension: ${knownPercent}%</div>
                                <div class="reading-progress-track">
                                    <div class="reading-progress-fill" style="width: ${knownPercent}%"></div>
                                </div>
                            </div>
                            
                            <div style="margin-top: 1.5rem; display: flex; gap: 0.75rem; flex-wrap: wrap;">
                                <button class="btn btn-primary" onclick="toggleMultiWordSelection(${passage.id})" style="flex: 1;">
                                    <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;">
                                        <path d="M3 5h2V3c-1.1 0-2 .9-2 2zm0 8h2v-2H3v2zm4 8h2v-2H7v2zM3 9h2V7H3v2zm10-6h-2v2h2V3zm6 0v2h2c0-1.1-.9-2-2-2zM5 21v-2H3c0 1.1.9 2 2 2zm-2-4h2v-2H3v2zM9 3H7v2h2V3zm2 18h2v-2h-2v2zm8-8h2v-2h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2zm0-12h2V7h-2v2zm0 8h2v-2h-2v2zm-4 4h2v-2h-2v2zm0-16h2V3h-2v2z"/>
                                    </svg>
                                    Rechercher une expression
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            // Attach click handlers to words
            attachWordClickHandlers();
        }
        
        function renderInteractiveText(passage) {
            // Split text by paragraphs first (double newline or single newline)
            const paragraphs = passage.text.split(/\n\n+|\n/);
            
            return paragraphs.map(para => {
                if (!para.trim()) return ''; // Skip empty paragraphs
                
                // Split paragraph into words while preserving punctuation
                const words = para.match(/[\wàâäæçéèêëïîôùûüÿœ'-]+|[^\wàâäæçéèêëïîôùûüÿœ'-]+/gi) || [];
                
                const processedWords = words.map(token => {
                    // Check if it's a word (not punctuation)
                    if (/[\wàâäæçéèêëïîôùûüÿœ'-]+/i.test(token)) {
                        const normalizedWord = token.toLowerCase();
                        
                        // Check if word exists in user's vocabulary (already learned!)
                        const inVocabulary = vocabulary.some(v => v.french.toLowerCase() === normalizedWord);
                        
                        // Check if marked as unknown in this passage
                        const isUnknown = passage.unknownWords.includes(normalizedWord);
                        
                        let className = 'word';
                        if (inVocabulary) className += ' known'; // Green - in Le Jardin!
                        else if (isUnknown) className += ' unknown'; // Yellow - marked unknown
                        // Everything else is assumed known (no special class)
                        
                        return `<span class="${className}" data-word="${token}">${token}</span>`;
                    } else {
                        // Punctuation or whitespace
                        return token;
                    }
                }).join('');
                
                return `<p style="margin-bottom: 1em;">${processedWords}</p>`;
            }).join('');
        }
        
        function attachWordClickHandlers() {
            document.querySelectorAll('.reading-passage-text .word').forEach(wordEl => {
                wordEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const word = wordEl.dataset.word;
                    const passageId = parseInt(wordEl.closest('.reading-passage-text').dataset.passageId);
                    
                    // Store passage context for later
                    window.currentReadingPassageId = passageId;
                    
                    // Open the SAME dictionary lookup modal as listening section!
                    openDictionaryLookup(word);
                });
            });
        }
        
        // Multi-word selection mode
        let selectionModeActive = false;
        let activePassageId = null;
        
        window.toggleMultiWordSelection = function(passageId) {
            selectionModeActive = !selectionModeActive;
            activePassageId = passageId;
            
            if (selectionModeActive) {
                document.body.classList.add('selection-mode-active');
                showSelectionToolbar(passageId);
            } else {
                document.body.classList.remove('selection-mode-active');
                hideSelectionToolbar();
            }
        };
        
        function showSelectionToolbar(passageId) {
            // Remove existing toolbar if any
            hideSelectionToolbar();
            
            const toolbar = document.createElement('div');
            toolbar.id = 'selection-toolbar';
            toolbar.className = 'selection-mode-toolbar';
            toolbar.innerHTML = `
                <span style="font-weight: 500;">✨ Sélectionnez une expression ou collocation à rechercher</span>
                <button onclick="lookupSelectedWords(` + passageId + `)">🔍 Rechercher l'expression</button>
                <button onclick="toggleMultiWordSelection(` + passageId + `)" style="background: transparent; color: white; border: 2px solid white;">Annuler</button>
            `;
            document.body.appendChild(toolbar);
        }
        
        function hideSelectionToolbar() {
            const toolbar = document.getElementById('selection-toolbar');
            if (toolbar) toolbar.remove();
        }
        
        window.lookupSelectedWords = function(passageId) {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();
            
            if (!selectedText) {
                alert('Veuillez sélectionner du texte d\'abord');
                return;
            }
            
            // Clean the text a bit but keep it as a phrase
            const cleanedPhrase = selectedText.replace(/\s+/g, ' ').trim();
            
            if (!cleanedPhrase) {
                alert('Aucun texte trouvé dans la sélection');
                return;
            }
            
            // Store passage context
            window.currentReadingPassageId = passageId;
            
            // Extract individual words for breakdown option
            const words = selectedText.match(/[\wàâäæçéèêëïîôùûüÿœ'-]+/gi) || [];
            const wordCount = words.length;
            
            if (wordCount === 1) {
                // Single word - use normal lookup
                openDictionaryLookup(cleanedPhrase);
            } else {
                // Multiple words - open phrase lookup modal
                openPhraseLookup(cleanedPhrase, words, passageId);
            }
            
            // Clear selection
            selection.removeAllRanges();
        };
        
        
        window.closeMultiWordModal = function() {
            const modal = document.getElementById('multi-word-lookup-modal');
            if (modal) {
                modal.remove();
            }
        };
        
        // NEW: Phrase lookup for expressions and collocations
        window.openPhraseLookup = function(phrase, words, passageId) {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'multi-word-lookup-modal';
            modal.style.display = 'flex';
            
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h2 class="modal-title">🔍 Expression / Collocation</h2>
                        <button class="close-btn" onclick="closeMultiWordModal()">&times;</button>
                    </div>
                    
                    <div style="padding: 1.5rem;">
                        <div style="background: var(--cream-light); padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; border-left: 4px solid var(--crimson);">
                            <div style="font-size: 1.4rem; font-weight: 500; color: var(--navy); margin-bottom: 0.5rem;">
                                "${phrase}"
                            </div>
                            <div style="font-size: 0.9rem; color: var(--text-soft);">
                                ${words.length} mot${words.length > 1 ? 's' : ''}
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 1.5rem;">
                            <label class="form-label" style="margin-bottom: 1rem;">Rechercher l'expression complète dans:</label>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                                <button onclick="searchPhrase('google', '` + phrase.replace(/'/g, "\\'") + `')" class="btn btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                                    </svg>
                                    Google
                                </button>
                                
                                <button onclick="searchPhrase('reverso', '` + phrase.replace(/'/g, "\\'") + `')" class="btn btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <line x1="2" y1="12" x2="22" y2="12"></line>
                                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                                    </svg>
                                    Reverso Context
                                </button>
                                
                                <button onclick="searchPhrase('linguee', '` + phrase.replace(/'/g, "\\'") + `')" class="btn btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                    Linguee
                                </button>
                                
                                <button onclick="searchPhrase('wordreference', '` + phrase.replace(/'/g, "\\'") + `')" class="btn btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                    </svg>
                                    WordReference
                                </button>
                            </div>
                        </div>
                        
                        <div style="border-top: 1px solid var(--whisper); padding-top: 1.5rem; margin-top: 1rem;">
                            <button onclick="showIndividualWords('` + phrase.replace(/'/g, "\\'") + `', ` + JSON.stringify(words) + `)" class="btn btn-secondary" style="width: 100%;">
                                📝 Ou voir les mots individuels
                            </button>
                        </div>
                    </div>
                    
                    <div class="form-actions">
                        <button class="btn btn-secondary" onclick="closeMultiWordModal()">Fermer</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeMultiWordModal();
                }
            });
        };
        
        // Search phrase in different services
        window.searchPhrase = function(service, phrase) {
            let url;
            const encodedPhrase = encodeURIComponent(phrase);
            
            switch(service) {
                case 'google':
                    url = `https://www.google.com/search?q=${encodedPhrase}`;
                    break;
                case 'reverso':
                    url = `https://context.reverso.net/translation/french-english/${encodedPhrase.replace(/%20/g, '+')}`;
                    break;
                case 'linguee':
                    url = `https://www.linguee.com/french-english/search?query=${encodedPhrase}`;
                    break;
                case 'wordreference':
                    url = `https://www.wordreference.com/fren/${encodedPhrase}`;
                    break;
                default:
                    url = `https://www.google.com/search?q=${encodedPhrase}`;
            }
            
            window.open(url, '_blank', 'noopener,noreferrer');
        };
        
        // Show individual words breakdown
        window.showIndividualWords = function(phrase, words) {
            const uniqueWords = [...new Set(words.map(w => w.toLowerCase()))];
            const wordsList = uniqueWords.map(word => {
                const inVocab = vocabulary.some(v => v.french.toLowerCase() === word);
                return `
                    <div style="padding: 0.75rem; background: ${inVocab ? 'rgba(144, 238, 144, 0.1)' : 'rgba(255, 215, 0, 0.1)'}; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 1.1rem;">${word}</span>
                        ${inVocab ? '<span style="color: #4CAF50; font-size: 0.85rem;">✓ Dans le vocabulaire</span>' : '<button class="btn btn-primary" onclick="openDictionaryLookup(\'' + word + '\'); closeMultiWordModal()" style="padding: 0.4rem 1rem; font-size: 0.9rem;">Rechercher</button>'}
                    </div>
                `;
            }).join('');
            
            // Update modal content
            const modal = document.getElementById('multi-word-lookup-modal');
            if (modal) {
                modal.querySelector('.modal-content').innerHTML = `
                    <div class="modal-header">
                        <h2 class="modal-title">Mots individuels</h2>
                        <button class="close-btn" onclick="closeMultiWordModal()">&times;</button>
                    </div>
                    <div style="padding: 1.5rem;">
                        <div style="background: var(--cream-light); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; font-style: italic; color: var(--text-soft);">
                            Expression originale: "${phrase}"
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 60vh; overflow-y: auto;">
                            ${wordsList}
                        </div>
                    </div>
                    <div class="form-actions">
                        <button class="btn btn-secondary" onclick="closeMultiWordModal()">Fermer</button>
                    </div>
                `;
            }
        };
        
        // Fold/unfold passages
        window.togglePassageExpansion = function(passageId) {
            const content = document.getElementById(`passage-content-${passageId}`);
            const icon = document.getElementById(`expand-icon-${passageId}`);
            const text = document.getElementById(`expand-text-${passageId}`);
            
            if (!content) return;
            
            if (content.style.display === 'none') {
                // Expand
                content.style.display = 'block';
                icon.innerHTML = '<path d="M7 10l5 5 5-5z"/>';
                text.textContent = 'Réduire';
            } else {
                // Collapse
                content.style.display = 'none';
                icon.innerHTML = '<path d="M7 14l5-5 5 5z"/>';
                text.textContent = 'Développer';
            }
        };
        
        // Helper functions for reading list linking
        window.getLinkedReadingTitle = function(readingId) {
            const item = readingList.find(r => r.id === readingId);
            return item ? item.title : 'Élément supprimé';
        };
        
        window.viewLinkedReading = function(readingId) {
            const item = readingList.find(r => r.id === readingId);
            if (!item) {
                alert('Cet élément a été supprimé de votre liste de lecture');
                return;
            }
            
            // Scroll to reading section and highlight the item
            document.getElementById('lire').scrollIntoView({ behavior: 'smooth' });
            
            // Could optionally open edit modal or show details
            setTimeout(() => {
                alert(`📚 "${item.title}"\nType: ${item.type}\nStatut: ${item.status}`);
            }, 500);
        };
        
        // View interactive text linked to a reading list item
        window.viewLinkedPassage = function(readingId) {
            const readingItem = readingList.find(r => r.id === readingId);
            if (!readingItem || !readingItem.linkedPassageId) {
                showToast('Aucun texte interactif lié à cet élément');
                return;
            }
            
            const linkedPassage = readingPassages.find(p => p.id === readingItem.linkedPassageId);
            if (!linkedPassage) {
                showToast('Le texte interactif lié n\'existe plus');
                return;
            }
            
            // Scroll to the passage
            document.getElementById('lire').scrollIntoView({ behavior: 'smooth' });
            
            setTimeout(() => {
                const passageCard = document.getElementById(`passage-card-${linkedPassage.id}`);
                if (passageCard) {
                    passageCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Highlight it briefly
                    passageCard.style.boxShadow = '0 0 0 3px var(--crimson)';
                    setTimeout(() => {
                        passageCard.style.boxShadow = '';
                    }, 2000);
                }
            }, 500);
        };
        
        // Populate linked reading dropdown when modal opens
        function populateLinkedReadingDropdown() {
            const select = document.getElementById('passage-linked-reading');
            if (!select) return;
            
            // Clear existing options except first
            select.innerHTML = '<option value="">-- Sélectionner un élément --</option>';
            
            // Add reading list items
            readingList.forEach(item => {
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = `${item.title} (${item.type})`;
                select.appendChild(option);
            });
        }
        
        // Mark word as unknown in the reading passage
        window.markWordAsUnknownInPassage = function(word) {
            const passageId = window.currentReadingPassageId;
            if (!passageId) return;
            
            const passage = readingPassages.find(p => p.id === passageId);
            if (!passage) return;
            
            const normalizedWord = word.toLowerCase();
            
            if (!passage.unknownWords.includes(normalizedWord)) {
                passage.unknownWords.push(normalizedWord);
                syncToFirebase();
                renderReadingPassages();
            }
        };
        
        window.unmarkWord = function(word, passageId) {
            const passage = readingPassages.find(p => p.id === passageId);
            if (!passage) return;
            
            passage.unknownWords = passage.unknownWords.filter(w => w !== word);
            syncToFirebase();
            renderReadingPassages();
        };
        
        window.deletePassage = function(passageId) {
            if (!confirm('Supprimer ce texte?')) return;
            
            readingPassages = readingPassages.filter(p => p.id !== passageId);
            syncToFirebase();
            renderReadingPassages();
        };
        
        // Copy passage text to clipboard
        window.copyPassageText = function(passageId) {
            const passage = readingPassages.find(p => p.id === passageId);
            if (!passage) return;
            
            navigator.clipboard.writeText(passage.text).then(() => {
                showToast('✓ Texte copié dans le presse-papier !');
            }).catch(err => {
                console.error('Copy failed:', err);
                showToast('❌ Erreur lors de la copie');
            });
        };
        
        // Edit passage
        window.editPassage = function(passageId) {
            const passage = readingPassages.find(p => p.id === passageId);
            if (!passage) return;
            
            // Pre-fill the form with existing data
            document.getElementById('passage-title').value = passage.title;
            document.getElementById('passage-source').value = passage.source || '';
            document.getElementById('passage-text').value = passage.text;
            document.getElementById('passage-linked-reading').value = passage.linkedReadingId || '';
            
            // Store the passage ID for updating
            document.getElementById('add-passage-modal').dataset.editingId = passageId;
            
            // Open modal
            openModal('add-passage-modal');
        };

        // ============================================
        // SPEAKING - FIXED VERSION
        // ============================================
        function initializeSpeechRecognition() {
            const startSpeakingBtn = document.getElementById('start-speaking');
            const spokenText = document.getElementById('spoken-text');
            const indicator = document.getElementById('speaking-indicator');
            const controls = document.getElementById('recording-controls');
            
            if (!startSpeakingBtn) return;
            
            let mediaRecorder;
            let audioChunks = [];
            let isRecording = false;
            
            startSpeakingBtn.addEventListener('click', async function() {
                if (!isRecording) {
                    // Start recording
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        mediaRecorder = new MediaRecorder(stream);
                        audioChunks = [];
                        
                        mediaRecorder.ondataavailable = (event) => {
                            audioChunks.push(event.data);
                        };
                        
                        mediaRecorder.onstop = () => {
                            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                            const reader = new FileReader();
                            reader.readAsDataURL(audioBlob);
                            reader.onloadend = () => {
                                currentRecording = reader.result; // Base64 audio
                                spokenText.innerHTML = `
                                    <audio controls style="width: 100%; margin-top: 1rem;">
                                        <source src="${reader.result}" type="audio/webm">
                                    </audio>
                                `;
                                controls.style.display = 'flex';
                            };
                            
                            // Stop all tracks
                            stream.getTracks().forEach(track => track.stop());
                        };
                        
                        mediaRecorder.start();
                        isRecording = true;
                        startSpeakingBtn.textContent = 'Arrêter';
                        startSpeakingBtn.classList.add('btn-danger');
                        indicator.style.display = 'block';
                        spokenText.textContent = 'Enregistrement en cours...';
                        
                    } catch (error) {
                        spokenText.textContent = 'Erreur: Permission microphone refusée. Autorise-le dans les paramètres du navigateur.';
                        console.error('Microphone error:', error);
                    }
                } else {
                    // Stop recording
                    mediaRecorder.stop();
                    isRecording = false;
                    startSpeakingBtn.innerHTML = `
                        <svg class="mic-icon" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                        </svg>
                        Commencer à parler
                    `;
                    startSpeakingBtn.classList.remove('btn-danger');
                    indicator.style.display = 'none';
                }
            });
        }

        // Practice prompt selection
        document.getElementById('save-recording').addEventListener('click', () => {
            if (!currentRecording) {
                alert('Enregistre d\'abord un audio');
                return;
            }

            const question = document.getElementById('parler-question').value.trim();

            const recording = {
                id: Date.now(),
                question: question || 'Sans question',
                audioData: currentRecording, // Base64 audio
                note: document.getElementById('recording-note').value.trim() || '',
                created: new Date().toISOString()
            };

            recordings.push(recording);
                syncToFirebase(); // Auto-save recordings to Firebase
            
            // Log action for presence tracking
            logAction(ACTION_TYPES.SPEAKING);
            
            // Clear UI
            document.getElementById('spoken-text').textContent = '';
            document.getElementById('recording-note').value = '';
            document.getElementById('parler-question').value = '';
            const recordingControls = document.getElementById('recording-controls');
            if (recordingControls) recordingControls.style.display = 'none';
            currentRecording = null;

            renderRecordings();
            alert('Sauvegardé ✓');
        });

        // Audio upload handler
        document.getElementById('audio-upload-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                currentRecording = event.target.result;
                const spokenText = document.getElementById('spoken-text');
                const controls = document.getElementById('recording-controls');
                
                spokenText.innerHTML = `
                    <audio controls style="width: 100%; margin-top: 1rem;">
                        <source src="${event.target.result}" type="${file.type}">
                    </audio>
                `;
                controls.style.display = 'flex';
            };
            reader.readAsDataURL(file);
            
            // Reset input
            e.target.value = '';
        });

        function renderRecordings() {
            const list = document.getElementById('recordings-list');
            const statsDiv = document.getElementById('practice-stats');
            
            if (recordings.length === 0) {
                statsDiv.style.display = 'none';
                list.innerHTML = `
                    <div class="empty">
                        <div class="empty-icon">
                            <svg class="svg-icon-lg" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.3;">
                                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
                            </svg>
                        </div>
                        <div class="empty-text">Rien ici encore...</div>
                    </div>
                `;
                return;
            }

            // Show stats
            statsDiv.style.display = 'grid';
            
            // Calculate stats
            const totalRecordings = recordings.length;
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            const thisWeekRecordings = recordings.filter(r => new Date(r.created) >= oneWeekAgo).length;
            
            document.getElementById('total-recordings').textContent = totalRecordings;
            document.getElementById('this-week-recordings').textContent = thisWeekRecordings;
            document.getElementById('total-words-spoken').textContent = 'N/A';

            // Sort by most recent first
            const sortedRecordings = [...recordings].sort((a, b) => b.id - a.id);

            list.innerHTML = sortedRecordings.map(rec => {
                const date = new Date(rec.created);
                const dateStr = date.toLocaleDateString('fr-FR', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
                const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                
                return `
                    <div class="recording-card">
                        <div class="recording-header">
                            <div>
                                <div class="recording-date">${dateStr} à ${timeStr}</div>
                            </div>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="icon-btn" onclick="editRecording(${rec.id})" title="Modifier">
                                    <svg class="svg-icon" viewBox="0 0 24 24">
                                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                                    </svg>
                                </button>
                                <button class="icon-btn" onclick="deleteRecording(${rec.id})" title="Supprimer">
                                    <svg class="svg-icon" viewBox="0 0 24 24">
                                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        ${rec.question ? `<div style="font-weight: 500; color: var(--crimson); margin-bottom: 0.75rem; font-size: 1rem;">Q: ${rec.question}</div>` : ''}
                        ${rec.audioData ? `
                            <audio controls style="width: 100%; margin: 1rem 0;">
                                <source src="${rec.audioData}" type="audio/webm">
                            </audio>
                        ` : ''}
                        ${rec.note ? `<div class="recording-note">${rec.note}</div>` : ''}
                    </div>
                `;
            }).join('');
        }

        function editRecording(id) {
            const rec = recordings.find(r => r.id === id);
            if (!rec) return;

            document.getElementById('edit-recording-id').value = id;
            document.getElementById('edit-recording-question').value = rec.question || '';
            document.getElementById('edit-recording-note').value = rec.note || '';

            openModal('edit-recording-modal');
        }

        // EDIT RECORDING FORM SUBMISSION
        document.getElementById('edit-recording-form').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const id = parseInt(document.getElementById('edit-recording-id').value);
            const index = recordings.findIndex(r => r.id === id);
            
            if (index === -1) return;

            recordings[index] = {
                ...recordings[index],
                question: document.getElementById('edit-recording-question').value.trim(),
                note: document.getElementById('edit-recording-note').value.trim() || ''
            };
                syncToFirebase(); // Auto-save recordings to Firebase
            renderRecordings();
            closeModal('edit-recording-modal');
        });

        function deleteRecording(id) {
            if (confirm('Supprimer cet enregistrement ?')) {
                recordings = recordings.filter(r => r.id !== id);
                syncToFirebase(); // Auto-save recordings to Firebase
                renderRecordings();
            }
        }

        // ============================================
        // WRITING - FIXED WITH EDIT
        // ============================================
        const writingArea = document.getElementById('writing-area');
        const wordCountEl = document.getElementById('word-count');
        const writingTitle = document.getElementById('writing-title');
        const wordGoalEl = document.getElementById('word-goal');
        
        // Word count goal system (click 3x to set)
        let clickCount = 0;
        let clickTimer = null;
        let wordGoal = null;

        writingArea.addEventListener('input', () => {
            const text = writingArea.value.trim();
            const words = text ? text.split(/\s+/).length : 0;
            
            if (wordGoal) {
                const percentage = Math.min(100, Math.round((words / wordGoal) * 100));
                wordCountEl.textContent = `${words}/${wordGoal} mots (${percentage}%)`;
                wordCountEl.style.color = words >= wordGoal ? 'var(--gold)' : 'var(--text-soft)';
            } else {
                wordCountEl.textContent = `${words} mot${words !== 1 ? 's' : ''}`;
            }
        });

        wordCountEl.addEventListener('click', () => {
            clickCount++;
            
            clearTimeout(clickTimer);
            
            if (clickCount === 3) {
                const goal = prompt('Objectif de mots (ex: 500):', '500');
                if (goal && !isNaN(goal) && parseInt(goal) > 0) {
                    wordGoal = parseInt(goal);
                    wordGoalEl.textContent = `Objectif: ${wordGoal} mots`;
                    wordGoalEl.style.display = 'block';
                    
                    // Trigger update
                    const text = writingArea.value.trim();
                    const words = text ? text.split(/\s+/).length : 0;
                    const percentage = Math.min(100, Math.round((words / wordGoal) * 100));
                    wordCountEl.textContent = `${words}/${wordGoal} mots (${percentage}%)`;
                } else {
                    wordGoal = null;
                    wordGoalEl.style.display = 'none';
                    wordCountEl.textContent = '0 mots';
                }
                clickCount = 0;
            } else {
                clickTimer = setTimeout(() => {
                    clickCount = 0;
                }, 1000);
            }
        });

        // Writing prompts
        const writingPrompts = [
            "Écris sur un moment où tu as changé d'avis sur quelque chose d'important.",
            "Décris un endroit que tu n'oublieras jamais.",
            "Si tu pouvais avoir une conversation avec toi-même à 80 ans, que demanderais-tu?",
            "Raconte une histoire commençant par: 'Je ne savais pas que ce jour changerait tout...'",
            "Qu'est-ce qui te fait te sentir le plus vivant?",
            "Écris une lettre à quelqu'un que tu n'as jamais pu remercier.",
            "Décris ton matin idéal dans 10 ans.",
            "Quel est le meilleur conseil qu'on t'ait jamais donné?",
            "Écris sur une peur que tu as surmontée.",
            "Imagine que tu peux voyager dans le temps. Où vas-tu et pourquoi?",
            "Qu'est-ce que tu ferais si tu savais que tu ne pouvais pas échouer?",
            "Écris sur une personne qui t'a inspiré sans le savoir.",
            "Décris un objet qui a une signification particulière pour toi.",
            "Si tu devais enseigner une chose à tout le monde, ce serait quoi?",
            "Raconte un moment où tu t'es senti vraiment fier de toi.",
            "Qu'est-ce qui te rendait heureux quand tu étais enfant?",
            "Écris sur quelque chose que tu veux apprendre cette année.",
            "Imagine ta vie comme un film. Quelle scène choisirais-tu de rejouer?",
            "Qu'est-ce qui te manquerait le plus si tu déménageais dans un autre pays?",
            "Écris une histoire avec ces trois mots: lune, clé, lettre."
        ];

        const speakingPrompts = [
            "Parle-moi de ton meilleur souvenir d'enfance.",
            "Qu'est-ce qui te passionne en ce moment dans la vie?",
            "Décris ta journée idéale du début à la fin.",
            "Si tu pouvais dîner avec n'importe qui, vivant ou mort, qui choisirais-tu et pourquoi?",
            "Raconte-moi un moment où tu as appris quelque chose d'important sur toi-même.",
            "Quel est ton endroit préféré dans le monde et pourquoi?",
            "Parle-moi d'un livre, film ou chanson qui t'a profondément touché.",
            "Qu'est-ce qui te fait rire aux éclats?",
            "Décris une tradition familiale ou personnelle qui compte pour toi.",
            "Si tu pouvais maîtriser instantanément une compétence, laquelle choisirais-tu?",
            "Raconte une histoire drôle ou embarrassante qui t'est arrivée.",
            "Qu'est-ce qui te motive à te lever le matin?",
            "Parle-moi d'une personne qui a eu une grande influence sur ta vie.",
            "Quel conseil donnerais-tu à ton moi d'il y a cinq ans?",
            "Décris ton endroit préféré pour te détendre et pourquoi.",
            "Si tu pouvais changer une chose dans le monde, ce serait quoi?",
            "Parle-moi d'un défi que tu as surmonté et dont tu es fier.",
            "Qu'est-ce qui te rend unique selon toi?",
            "Raconte un moment où tu as aidé quelqu'un ou quelqu'un t'a aidé.",
            "Si tu avais une journée entière sans aucune obligation, comment la passerais-tu?",
            "Parle-moi de tes rêves ou objectifs pour les années à venir.",
            "Qu'est-ce que tu aimes le plus dans ta routine quotidienne?",
            "Décris un moment récent où tu t'es senti vraiment vivant.",
            "Si tu pouvais vivre dans n'importe quelle époque, laquelle choisirais-tu?",
            "Parle-moi d'une habitude que tu veux développer ou changer."
        ];

        let currentPromptIndex = null;
        let currentSpeakingPromptIndex = null;

        document.getElementById('random-prompt-btn').addEventListener('click', () => {
            let randomIndex;
            do {
                randomIndex = Math.floor(Math.random() * writingPrompts.length);
            } while (randomIndex === currentPromptIndex);
            
            currentPromptIndex = randomIndex;
            const promptEl = document.getElementById('current-prompt');
            promptEl.style.opacity = '0';
            
            setTimeout(() => {
                promptEl.textContent = writingPrompts[randomIndex];
                promptEl.style.transition = 'opacity 0.3s';
                promptEl.style.opacity = '1';
            }, 150);
        });

        // Speaking prompt randomizer
        document.getElementById('random-speaking-prompt-btn').addEventListener('click', () => {
            let randomIndex;
            do {
                randomIndex = Math.floor(Math.random() * speakingPrompts.length);
            } while (randomIndex === currentSpeakingPromptIndex);
            
            currentSpeakingPromptIndex = randomIndex;
            const promptEl = document.getElementById('current-speaking-prompt');
            const questionInput = document.getElementById('parler-question');
            
            promptEl.style.opacity = '0';
            
            setTimeout(() => {
                const selectedPrompt = speakingPrompts[randomIndex];
                promptEl.textContent = selectedPrompt;
                questionInput.value = selectedPrompt; // Also put it in the input field!
                promptEl.style.transition = 'opacity 0.3s';
                promptEl.style.opacity = '1';
            }, 150);
        });

        document.getElementById('save-writing').addEventListener('click', () => {
            const text = writingArea.value.trim();
            if (!text) {
                alert('Écris quelque chose d\'abord');
                return;
            }

            const writing = {
                id: Date.now(),
                title: writingTitle.value.trim() || null,
                text: text,
                created: new Date().toISOString()
            };

            writings.push(writing);
                syncToFirebase(); // Auto-save writings to Firebase

            // Log action for presence tracking
            logAction(ACTION_TYPES.WRITING);

            writingArea.value = '';
            writingTitle.value = '';
            wordCountEl.textContent = '0 mots';
            wordGoal = null;
            wordGoalEl.style.display = 'none';
            
            renderWritingsArchive();
            alert('Sauvegardé ✓');
        });

        function renderWritingsArchive() {
            const archive = document.getElementById('writings-archive');
            
            if (writings.length === 0) {
                archive.innerHTML = `
                    <div class="empty">
                        <div class="empty-icon">
                            <svg class="svg-icon-lg" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.3;">
                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                            </svg>
                        </div>
                        <div class="empty-text">Rien ici encore...</div>
                    </div>
                `;
                return;
            }

            // Sort by most recent first
            const sortedWritings = [...writings].sort((a, b) => b.id - a.id);

            archive.innerHTML = sortedWritings.map(writing => {
                const preview = writing.text.substring(0, 150) + (writing.text.length > 150 ? '...' : '');
                return `
                    <div class="writing-card" data-id="${writing.id}">
                        <div class="writing-card-header" onclick="toggleWritingCard(${writing.id})">
                            <div class="writing-card-title-area">
                                ${writing.title ? `<div class="writing-card-title">${writing.title}</div>` : ''}
                                <div class="writing-card-date">${new Date(writing.created).toLocaleDateString('fr-FR', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}</div>
                                <div class="writing-card-preview">${preview}</div>
                            </div>
                            <button class="writing-card-toggle" onclick="event.stopPropagation(); toggleWritingCard(${writing.id})">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="6 9 12 15 18 9"/>
                                </svg>
                            </button>
                        </div>
                        <div class="writing-card-content">
                            <div class="writing-card-body">
                                <div class="writing-card-text">${writing.text}</div>
                                <div class="writing-card-actions">
                                    <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); copyWritingText(${writing.id})" title="Copier le texte">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px;">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                        </svg>
                                        Copier
                                    </button>
                                    <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); exportWriting(${writing.id}, 'docx')">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px;">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                            <polyline points="14 2 14 8 20 8"/>
                                            <line x1="16" y1="13" x2="8" y2="13"/>
                                            <line x1="16" y1="17" x2="8" y2="17"/>
                                            <polyline points="10 9 9 9 8 9"/>
                                        </svg>
                                        Word
                                    </button>
                                    <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); exportWriting(${writing.id}, 'pdf')">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px;">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                            <polyline points="14 2 14 8 20 8"/>
                                        </svg>
                                        PDF
                                    </button>
                                    <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); editWriting(${writing.id})">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px;">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                        </svg>
                                        Modifier
                                    </button>
                                    <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); deleteWriting(${writing.id})" style="color: var(--crimson);">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px;">
                                            <polyline points="3 6 5 6 21 6"/>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                            <line x1="10" y1="11" x2="10" y2="17"/>
                                            <line x1="14" y1="11" x2="14" y2="17"/>
                                        </svg>
                                        Supprimer
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        window.toggleWritingCard = function(id) {
            const card = document.querySelector(`.writing-card[data-id="${id}"]`);
            if (!card) return;
            
            const content = card.querySelector('.writing-card-content');
            const toggle = card.querySelector('.writing-card-toggle');
            
            content.classList.toggle('expanded');
            toggle.classList.toggle('expanded');
        };

        function editWriting(id) {
            const writing = writings.find(w => w.id === id);
            if (!writing) return;

            document.getElementById('edit-writing-id').value = id;
            document.getElementById('edit-writing-title').value = writing.title || '';
            document.getElementById('edit-writing-text').value = writing.text;

            openModal('edit-writing-modal');
        }

        // EDIT WRITING FORM SUBMISSION
        document.getElementById('edit-writing-form').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const id = parseInt(document.getElementById('edit-writing-id').value);
            const index = writings.findIndex(w => w.id === id);
            
            if (index === -1) return;

            writings[index] = {
                ...writings[index],
                title: document.getElementById('edit-writing-title').value.trim() || null,
                text: document.getElementById('edit-writing-text').value.trim()
            };

            // Validate required field
            if (!writings[index].text) {
                alert('Veuillez entrer un texte');
                return;
            }            syncToFirebase(); // Auto-save writings to Firebase
            renderWritingsArchive();
            closeModal('edit-writing-modal');
        });

        function copyWritingText(id) {
            const writing = writings.find(w => w.id === id);
            if (!writing) return;
            
            navigator.clipboard.writeText(writing.text).then(() => {
                // Show brief confirmation
                const btn = event.target.closest('button');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px;"><polyline points="20 6 9 17 4 12"/></svg>Copié!';
                setTimeout(() => {
                    btn.innerHTML = originalText;
                }, 1500);
            }).catch(err => {
                console.error('Failed to copy:', err);
                alert('Impossible de copier le texte');
            });
        }

        function deleteWriting(id) {
            if (confirm('Supprimer cette écriture ?')) {
                writings = writings.filter(w => w.id !== id);
                syncToFirebase(); // Auto-save writings to Firebase
                renderWritingsArchive();
            }
        }

        // ============================================
        // EXPORT FUNCTIONS FOR WRITING
        // ============================================
        window.exportWriting = function(id, format) {
            const writing = writings.find(w => w.id === id);
            if (!writing) {
                alert('Écriture non trouvée');
                return;
            }

            const title = writing.title || `Écriture_${new Date(writing.created).toLocaleDateString('fr-FR').replace(/\//g, '-')}`;
            const content = writing.text;
            const date = new Date(writing.created).toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            if (format === 'pdf') {
                const { jsPDF } = window.jspdf;
                if (!jsPDF) {
                    alert('Erreur : bibliothèque PDF non chargée');
                    return;
                }

                const doc = new jsPDF();
                const pageWidth = doc.internal.pageSize.getWidth();
                const margin = 20;
                const maxWidth = pageWidth - (margin * 2);

                // Title
                doc.setFontSize(18);
                doc.setFont(undefined, 'bold');
                const titleLines = doc.splitTextToSize(title, maxWidth);
                doc.text(titleLines, margin, 20);

                // Date
                doc.setFontSize(10);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(100);
                doc.text(date, margin, 30);

                // Content
                doc.setFontSize(12);
                doc.setTextColor(0);
                const lines = doc.splitTextToSize(content, maxWidth);
                doc.text(lines, margin, 45);

                doc.save(`${title}.pdf`);
            } else if (format === 'docx') {
                // Create a simple HTML that can be opened as Word
                const html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <title>${title}</title>
                    </head>
                    <body style="font-family: 'Times New Roman', serif; max-width: 21cm; margin: 2cm auto; padding: 2cm;">
                        <h1 style="font-size: 24pt; margin-bottom: 0.5cm;">${title}</h1>
                        <p style="color: #666; font-size: 10pt; margin-bottom: 1cm;">${date}</p>
                        <div style="font-size: 12pt; line-height: 2; white-space: pre-wrap;">${content}</div>
                    </body>
                    </html>
                `;

                const blob = new Blob([html], { type: 'application/msword' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${title}.doc`;
                a.click();
                URL.revokeObjectURL(url);
            }
        };

        // Export all writings
        document.getElementById('export-all-btn').addEventListener('click', () => {
            if (writings.length === 0) {
                alert('Aucune écriture à exporter');
                return;
            }

            const { jsPDF } = window.jspdf;
            if (!jsPDF) {
                alert('Erreur : bibliothèque PDF non chargée');
                return;
            }

            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 20;
            const maxWidth = pageWidth - (margin * 2);
            let yPos = margin;

            const sortedWritings = [...writings].sort((a, b) => b.id - a.id);

            sortedWritings.forEach((writing, index) => {
                if (index > 0) {
                    doc.addPage();
                    yPos = margin;
                }

                const title = writing.title || `Écriture ${index + 1}`;
                const date = new Date(writing.created).toLocaleDateString('fr-FR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                // Title
                doc.setFontSize(16);
                doc.setFont(undefined, 'bold');
                const titleLines = doc.splitTextToSize(title, maxWidth);
                doc.text(titleLines, margin, yPos);
                yPos += (titleLines.length * 7) + 5;

                // Date
                doc.setFontSize(9);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(100);
                doc.text(date, margin, yPos);
                yPos += 10;

                // Content
                doc.setFontSize(11);
                doc.setTextColor(0);
                const lines = doc.splitTextToSize(writing.text, maxWidth);
                doc.text(lines, margin, yPos);
            });

            doc.save('Mes_Écrits.pdf');
        });

        // ============================================
        // AI ANALYSIS FUNCTIONS
        // ============================================
        let selectedAI = 'claude';
        
        // AI selector
        document.querySelectorAll('.ai-option').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.ai-option').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedAI = btn.dataset.ai;
            });
        });

        // Show/hide custom question field
        document.getElementById('ai-question-select').addEventListener('change', (e) => {
            const customGroup = document.getElementById('custom-question-group');
            customGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
        });

        // Open AI analysis modal
        document.getElementById('ai-analyze-btn').addEventListener('click', () => {
            const text = document.getElementById('writing-area').value.trim();
            if (!text) {
                alert('Écris quelque chose d\'abord pour l\'analyser');
                return;
            }
            openModal('ai-analysis-modal');
        });

        // Send to AI
        document.getElementById('send-to-ai-btn').addEventListener('click', () => {
            const text = document.getElementById('writing-area').value.trim();
            const questionSelect = document.getElementById('ai-question-select').value;
            let question = '';

            if (questionSelect === 'custom') {
                question = document.getElementById('custom-ai-question').value.trim();
                if (!question) {
                    alert('Entre une question personnalisée');
                    return;
                }
            } else {
                const questions = {
                    'analyze': 'Analyse ce texte et donne-moi tes commentaires.',
                    'grammar': 'Vérifie la grammaire et l\'orthographe de ce texte.',
                    'improve': 'Comment puis-je améliorer ce texte?',
                    'style': 'Analyse le style et le ton de ce texte.',
                    'continue': 'Continue ce texte de manière créative.'
                };
                question = questions[questionSelect];
            }

            // Prepare the full prompt
            const fullPrompt = `${question}\n\nTexte:\n${text}`;

            // Open in new tab based on selected AI
            let url;
            if (selectedAI === 'claude') {
                // Encode the prompt for URL
                const encodedPrompt = encodeURIComponent(fullPrompt);
                url = `https://claude.ai/new?q=${encodedPrompt}`;
            } else if (selectedAI === 'chatgpt') {
                url = 'https://chat.openai.com/';
            } else if (selectedAI === 'deepseek') {
                url = 'https://chat.deepseek.com/';
            }

            // Copy to clipboard
            navigator.clipboard.writeText(fullPrompt).then(() => {
                if (selectedAI === 'claude') {
                    window.open(url, '_blank');
                    closeModal('ai-analysis-modal');
                } else {
                    alert(`Question copiée! Je vais ouvrir ${selectedAI.charAt(0).toUpperCase() + selectedAI.slice(1)}. Colle ta question (Ctrl+V / Cmd+V).`);
                    window.open(url, '_blank');
                    closeModal('ai-analysis-modal');
                }
            }).catch(() => {
                alert('Erreur lors de la copie. Voici la question à copier:\n\n' + fullPrompt);
            });
        });

        // ============================================
        // MISTAKE MARKING FEATURE
        // ============================================
        let mistakeMarkingMode = false;
        let markedMistakes = [];

        // ============================================
        // ENHANCED MISTAKE MARKING WITH DOUBLE-CLICK
        // ============================================
        
        document.getElementById('mark-mistakes-btn').addEventListener('click', () => {
            mistakeMarkingMode = !mistakeMarkingMode;
            const btn = document.getElementById('mark-mistakes-btn');
            const btnText = document.getElementById('mark-mistakes-text');
            const writingArea = document.getElementById('writing-area');
            
            if (mistakeMarkingMode) {
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');
                btnText.textContent = 'Terminer';
                writingArea.style.cursor = 'crosshair';
                alert('Mode marquage activé! Double-clique sur un mot ou sélectionne du texte et appuie sur Entrée.');
            } else {
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-secondary');
                btnText.textContent = 'Marquer erreurs';
                writingArea.style.cursor = 'text';
            }
        });

        // Handle double-click on words to mark mistakes
        document.getElementById('writing-area').addEventListener('dblclick', (e) => {
            if (!mistakeMarkingMode) return;
            
            e.preventDefault();
            const textarea = e.target;
            let start = textarea.selectionStart;
            let end = textarea.selectionEnd;
            const text = textarea.value;
            
            // If no selection, find word boundaries around cursor
            if (start === end) {
                const cursorPos = start;
                
                // Go back to find word start
                while (start > 0 && /\S/.test(text[start - 1])) {
                    start--;
                }
                
                // Go forward to find word end
                while (end < text.length && /\S/.test(text[end])) {
                    end++;
                }
            }
            
            if (start === end) return;
            
            const selectedText = text.substring(start, end);
            
            // Create a better prompt with both correction and explanation
            const correction = prompt(`Marquer "${selectedText}" comme erreur\n\nQuelle est la correction?`, selectedText);
            
            if (correction !== null && correction.trim()) {
                const explanation = prompt(`Pourquoi "${selectedText}" est incorrect?\n\n(Optionnel - explique l'erreur)`, '');
                
                const mistakeData = {
                    original: selectedText,
                    correction: correction.trim(),
                    explanation: explanation ? explanation.trim() : '',
                    timestamp: Date.now(),
                    context: text.substring(Math.max(0, start - 30), Math.min(text.length, end + 30))
                };
                
                mistakeCorrections.push(mistakeData);
                markedMistakes.push({
                    start: start,
                    end: end,
                    text: selectedText,
                    note: explanation ? explanation.trim() : `Correction: ${correction.trim()}`,
                    id: Date.now()
                });
                
                // Save after marking mistake
                saveToLocalStorage();
                if (window.syncToFirebase) window.syncToFirebase();
                
                // Visual feedback with explanation if provided
                const beforeText = text.substring(0, start);
                const afterText = text.substring(end);
                const marker = explanation 
                    ? `[❌${selectedText}→${correction.trim()}💡${explanation.trim()}]`
                    : `[❌${selectedText}→${correction.trim()}]`;
                textarea.value = beforeText + marker + afterText;
                
                // Update cursor position
                textarea.selectionStart = textarea.selectionEnd = start;
                
                console.log('Correction enregistrée:', mistakeData);
            }
        });

        // Handle text selection for mistake marking (original functionality)
        document.getElementById('writing-area').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && mistakeMarkingMode) {
                e.preventDefault();
                const textarea = e.target;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                
                if (start === end) {
                    alert('Sélectionne d\'abord le texte à marquer comme erreur, ou double-clique sur un mot');
                    return;
                }
                
                const selectedText = textarea.value.substring(start, end);
                const correction = prompt(`Erreur marquée: "${selectedText}"\n\nQuelle est la correction?`, selectedText);
                
                if (correction !== null && correction.trim()) {
                    const explanation = prompt(`Pourquoi "${selectedText}" est incorrect?\n\n(Optionnel - explique l'erreur)`, '');
                    
                    const mistakeData = {
                        original: selectedText,
                        correction: correction.trim(),
                        explanation: explanation ? explanation.trim() : '',
                        timestamp: Date.now(),
                        context: textarea.value.substring(Math.max(0, start - 30), Math.min(textarea.value.length, end + 30))
                    };
                    
                    mistakeCorrections.push(mistakeData);
                    markedMistakes.push({
                        start: start,
                        end: end,
                        text: selectedText,
                        note: explanation ? explanation.trim() : `Correction: ${correction.trim()}`,
                        id: Date.now()
                    });
                    
                    // Save after marking mistake
                    saveToLocalStorage();
                    if (window.syncToFirebase) window.syncToFirebase();
                    
                    // Visual feedback with explanation if provided
                    const beforeText = textarea.value.substring(0, start);
                    const afterText = textarea.value.substring(end);
                    const marker = explanation 
                        ? `[❌${selectedText}→${correction.trim()}💡${explanation.trim()}]`
                        : `[❌${selectedText}→${correction.trim()}]`;
                    textarea.value = beforeText + marker + afterText;
                    
                    // Update cursor position
                    textarea.selectionStart = textarea.selectionEnd = start;
                    
                    console.log('Correction enregistrée:', mistakeData);
                }
            }
        });

        // ============================================
        // TABS
        // ============================================
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const parent = tab.closest('section');
                const targetId = tab.dataset.tab;
                
                parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                tab.classList.add('active');
                parent.querySelector(`#${targetId}`).classList.add('active');
            });
        });

        // ============================================
        // PDF EXPORT FOR WORDS
        // ============================================
        function saveWordsAsPDF() {
            const { jsPDF } = window.jspdf;
            if (!jsPDF) {
                alert('Erreur : bibliothèque PDF non chargée');
                return;
            }
            
            const doc = new jsPDF();
            
            // Helper function to convert text to Latin1 compatible format
            function cleanText(text) {
                if (!text) return '';
                // Replace common French characters with their closest ASCII equivalents
                const map = {
                    'à': 'a', 'â': 'a', 'á': 'a', 'ä': 'a',
                    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
                    'î': 'i', 'ï': 'i', 'ì': 'i', 'í': 'i',
                    'ô': 'o', 'ö': 'o', 'ò': 'o', 'ó': 'o',
                    'û': 'u', 'ù': 'u', 'ü': 'u', 'ú': 'u',
                    'ç': 'c', 'ñ': 'n',
                    'À': 'A', 'Â': 'A', 'Á': 'A', 'Ä': 'A',
                    'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
                    'Î': 'I', 'Ï': 'I', 'Ì': 'I', 'Í': 'I',
                    'Ô': 'O', 'Ö': 'O', 'Ò': 'O', 'Ó': 'O',
                    'Û': 'U', 'Ù': 'U', 'Ü': 'U', 'Ú': 'U',
                    'Ç': 'C', 'Ñ': 'N'
                };
                return text.split('').map(char => map[char] || char).join('');
            }
            
            // Title
            doc.setFontSize(22);
            doc.setTextColor(139, 38, 53); // crimson
            doc.text(cleanText('Mon Vocabulaire Français'), 20, 20);
            
            doc.setFontSize(10);
            doc.setTextColor(107, 97, 92); // text-soft
            const filterText = Object.values(activeFilters).filter(Boolean).length > 0 
                ? cleanText(`Filtres actifs: ${Object.entries(activeFilters).filter(([k,v]) => v).map(([k,v]) => `${k}:${v}`).join(', ')}`)
                : '';
            doc.text(cleanText(`Genere le ${new Date().toLocaleDateString('fr-FR')} ${filterText}`), 20, 28);
            
            let y = 40;
            const pageHeight = doc.internal.pageSize.height;
            const margin = 20;
            
            // Sort by most recent first
            const filteredVocabulary = getFilteredVocabulary();
            const sortedVocabulary = [...filteredVocabulary].sort((a, b) => b.id - a.id);
            
            sortedVocabulary.forEach((word, index) => {
                // Check if we need a new page
                if (y > pageHeight - 40) {
                    doc.addPage();
                    y = 20;
                }
                
                // Word number and French word
                doc.setFontSize(14);
                doc.setTextColor(27, 43, 58); // navy
                const wordText = word.article ? `${index + 1}. ${cleanText(word.article)} ${cleanText(word.french)}` : `${index + 1}. ${cleanText(word.french)}`;
                doc.text(wordText, margin, y);
                y += 7;
                
                // Meaning - THE IMPORTANT PART
                if (word.meaning) {
                    doc.setFontSize(11);
                    doc.setTextColor(42, 37, 32); // text
                    const meaningText = doc.splitTextToSize(cleanText(`-> ${word.meaning}`), 170);
                    doc.text(meaningText, margin + 5, y);
                    y += meaningText.length * 5;
                }
                
                // Categories on same line
                const categories = [];
                if (word.theme) categories.push(cleanText(word.theme));
                if (word.week) categories.push(`S${word.week}`);
                if (word.quarter) categories.push(cleanText(word.quarter));
                if (word.year) categories.push(word.year);
                
                if (categories.length > 0) {
                    doc.setFontSize(8);
                    doc.setTextColor(107, 97, 92);
                    doc.text(categories.join(' - '), margin + 5, y);
                    y += 5;
                }
                
                // Contexts
                if (word.contexts && word.contexts.length > 0) {
                    doc.setFontSize(9);
                    doc.setTextColor(107, 97, 92);
                    
                    if (word.contexts[0]) {
                        const contextText = doc.splitTextToSize(cleanText(`Ex: ${word.contexts[0]}`), 170);
                        doc.text(contextText, margin + 5, y);
                        y += contextText.length * 4;
                    }
                    
                    if (word.contexts[1]) {
                        const contextText = doc.splitTextToSize(cleanText(`Emotionnel: ${word.contexts[1]}`), 170);
                        doc.text(contextText, margin + 5, y);
                        y += contextText.length * 4;
                    }
                    
                    if (word.contexts[2]) {
                        const contextText = doc.splitTextToSize(cleanText(`Idiomatique: ${word.contexts[2]}`), 170);
                        doc.text(contextText, margin + 5, y);
                        y += contextText.length * 4;
                    }
                }
                
                // Note
                if (word.note) {
                    doc.setFontSize(9);
                    doc.setTextColor(107, 97, 92);
                    const noteText = doc.splitTextToSize(cleanText(`Note: ${word.note}`), 170);
                    doc.text(noteText, margin + 5, y);
                    y += noteText.length * 4;
                }
                
                y += 8; // Space between words
            });
            
            // Save the PDF
            doc.save(`vocabulaire-francais-${new Date().toISOString().split('T')[0]}.pdf`);
        }

        // PDF button visibility and click handler
        function updatePDFButtonVisibility() {
            const menuBtn = document.getElementById('jardin-menu-btn');
            if (menuBtn) menuBtn.style.display = 'flex'; // ALWAYS show menu button (import is useful even without words!)
        }

        // ============================================
        // JARDIN MENU TOGGLE
        // ============================================
        const jardinMenuBtn = document.getElementById('jardin-menu-btn');
        const jardinMenu = document.getElementById('jardin-actions-menu');
        
        if (jardinMenuBtn && jardinMenu) {
            jardinMenuBtn.addEventListener('click', () => {
                jardinMenu.style.display = jardinMenu.style.display === 'none' ? 'block' : 'none';
            });
            
            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!jardinMenuBtn.contains(e.target) && !jardinMenu.contains(e.target)) {
                    jardinMenu.style.display = 'none';
                }
            });
            
            // Connect menu items to original functions
            document.getElementById('menu-save-pdf').addEventListener('click', () => {
                jardinMenu.style.display = 'none';
                saveWordsAsPDF();
            });
            
            document.getElementById('menu-save-csv').addEventListener('click', () => {
                jardinMenu.style.display = 'none';
                saveWordsAsCSV();
            });
            
            document.getElementById('menu-bulk-import').addEventListener('click', () => {
                jardinMenu.style.display = 'none';
                openModal('bulk-import-modal');
            });
        }

        // Keep old event listeners for backward compatibility (in case referenced elsewhere)
        const oldPdfBtn = document.getElementById('save-words-pdf');
        const oldCsvBtn = document.getElementById('save-words-csv');
        const oldImportBtn = document.getElementById('bulk-import-btn');
        
        if (oldPdfBtn) oldPdfBtn.addEventListener('click', saveWordsAsPDF);
        if (oldCsvBtn) oldCsvBtn.addEventListener('click', saveWordsAsCSV);
        if (oldImportBtn) oldImportBtn.addEventListener('click', () => openModal('bulk-import-modal'));

        // ============================================
        // CSV EXPORT FOR ANKI/QUIZLET
        // ============================================
        function saveWordsAsCSV() {
            const filteredVocabulary = getFilteredVocabulary();
            const sortedVocabulary = [...filteredVocabulary].sort((a, b) => b.id - a.id);
            
            // CSV Header
            let csvContent = "French,Meaning,Example Sentence,Theme,Week,Notes\n";
            
            // Add each word
            sortedVocabulary.forEach(word => {
                const french = word.article ? `${word.article} ${word.french}` : word.french;
                const meaning = word.meaning || '';
                const example = word.contexts && word.contexts[0] ? word.contexts[0] : '';
                const theme = word.theme || '';
                const week = word.week ? `Week ${word.week}` : '';
                const note = word.note || '';
                
                // Escape commas and quotes for CSV
                const escapeCsv = (str) => {
                    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                        return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                };
                
                csvContent += `${escapeCsv(french)},${escapeCsv(meaning)},${escapeCsv(example)},${escapeCsv(theme)},${escapeCsv(week)},${escapeCsv(note)}\n`;
            });
            
            // Create download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', `vocabulaire-francais-${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        // CSV export button listener handled above in jardin menu section

        // ============================================
        // BULK IMPORT
        // ============================================
        // Bulk import button listener handled above in jardin menu section

        document.getElementById('bulk-import-form').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const text = document.getElementById('bulk-import-text').value.trim();
            const week = document.getElementById('bulk-week').value;
            const quarter = document.getElementById('bulk-quarter').value;
            const year = document.getElementById('bulk-year').value;
            const defaultTheme = document.getElementById('bulk-theme').value.trim();
            
            if (!text) return;
            
            const lines = text.split('\n').filter(line => line.trim());
            let imported = 0;
            let errors = [];
            
            lines.forEach((line, index) => {
                const parts = line.split('|').map(p => p.trim());
                
                if (parts.length < 2) {
                    errors.push(`Ligne ${index + 1}: Format invalide (besoin de au moins 2 parties)`);
                    return;
                }
                
                const french = parts[0];
                const meaning = parts[1];
                const exampleSentence = parts[2] || ''; // NEW: Example sentence (3rd field)
                const lineTheme = parts[3] || ''; // Theme moved to 4th field
                const finalTheme = lineTheme || defaultTheme; // Use line theme if present, otherwise default
                
                // Detect article
                let article = '';
                let frenchWord = french;
                const articles = ['le ', 'la ', "l'", 'les ', 'un ', 'une ', 'des '];
                for (const art of articles) {
                    if (french.toLowerCase().startsWith(art)) {
                        article = art.trim();
                        frenchWord = french.substring(art.length).trim();
                        break;
                    }
                }
                
                const word = {
                    id: Date.now() + imported,
                    french: frenchWord,
                    article: article,
                    meaning: meaning,
                    theme: finalTheme,
                    week: week,
                    quarter: quarter,
                    year: year,
                    contexts: exampleSentence ? [exampleSentence, '', ''] : ['', '', ''], // Use example if provided
                    note: '',
                    image: '',
                    created: new Date().toISOString(),
                    lastPracticed: null,
                    confidence: 0,
                    timesReviewed: 0
                };
                
                vocabulary.push(word);
                imported++;
            });
                syncToFirebase(); // Auto-save vocabulary to Firebase
            
            // Log action for presence tracking if words were imported
            if (imported > 0) {
                logAction(ACTION_TYPES.NEW_WORD);
            }
            
            renderGarden();
            closeModal('bulk-import-modal');
            
            if (errors.length > 0) {
                alert(`Importé ${imported} mots.\n\nErreurs:\n${errors.join('\n')}`);
            } else {
                alert(`✨ ${imported} mots importés avec succès!`);
            }
            
            document.getElementById('bulk-import-form').reset();
        });

        // ============================================
        // MUSIC PLAYER MODAL
        // ============================================
        function setupMusicPlayer() {
            const modal = document.getElementById('music-modal');
            const audio = document.getElementById('background-music');
            const toggleBtn = document.getElementById('modal-music-toggle');
            const playIcon = toggleBtn?.querySelector('.play-icon');
            const pauseIcon = toggleBtn?.querySelector('.pause-icon');
            const volumeSlider = document.getElementById('modal-volume-slider');
            const trackName = document.getElementById('current-track-name');
            const trackItems = document.querySelectorAll('.music-track-item');

            if (!audio || !modal) return;

            // Set initial volume
            audio.volume = 0.5;

            // Load saved volume
            const savedVolume = localStorage.getItem('musicVolume');
            if (savedVolume && volumeSlider) {
                volumeSlider.value = savedVolume;
                audio.volume = savedVolume / 100;
            }

            // Close on backdrop click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });

            // Toggle play/pause
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                    if (audio.paused) {
                        if (!audio.src) {
                            alert('Sélectionne d\'abord une piste dans la playlist');
                            return;
                        }
                        audio.play();
                        if (playIcon) playIcon.style.display = 'none';
                        if (pauseIcon) pauseIcon.style.display = 'block';
                        
                        // Start musical note animations
                        startMusicNoteAnimations();
                    } else {
                        audio.pause();
                        if (playIcon) playIcon.style.display = 'block';
                        if (pauseIcon) pauseIcon.style.display = 'none';
                        
                        // Stop musical note animations
                        stopMusicNoteAnimations();
                    }
                });
            }

            // Track selection
            trackItems.forEach(item => {
                item.addEventListener('click', () => {
                    const src = item.dataset.src;
                    const name = item.dataset.name;

                    // Update active state
                    trackItems.forEach(t => t.classList.remove('active'));
                    item.classList.add('active');

                    // Load and play
                    audio.src = src;
                    audio.load();
                    if (trackName) trackName.textContent = name;

                    audio.play().then(() => {
                        if (playIcon) playIcon.style.display = 'none';
                        if (pauseIcon) pauseIcon.style.display = 'block';
                        
                        // Start musical note animations
                        startMusicNoteAnimations();
                    }).catch(err => {
                        console.error('Playback error:', err);
                        alert('Fichier audio introuvable. Place les fichiers sound1.mp3, sound2.mp3, etc. dans le même dossier que cette page.');
                        if (playIcon) playIcon.style.display = 'block';
                        if (pauseIcon) pauseIcon.style.display = 'none';
                    });
                });
            });

            // Volume control
            if (volumeSlider) {
                volumeSlider.addEventListener('input', (e) => {
                    audio.volume = e.target.value / 100;
                });

                volumeSlider.addEventListener('change', (e) => {
                    localStorage.setItem('musicVolume', e.target.value);
                });
            }

            // Handle audio errors
            audio.addEventListener('error', () => {
                if (playIcon) playIcon.style.display = 'block';
                if (pauseIcon) pauseIcon.style.display = 'none';
            });

            // Update playing indicator when audio ends
            audio.addEventListener('ended', () => {
                if (playIcon) playIcon.style.display = 'block';
                if (pauseIcon) pauseIcon.style.display = 'none';
            });
        }

        // ============================================
        // NAVIGATION
        // ============================================
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                const room = link.dataset.room;
                
                document.querySelectorAll('.room').forEach(r => r.classList.remove('active'));
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                
                document.getElementById(room).classList.add('active');
                link.classList.add('active');
            });
        });

        // ============================================
        // NOTES SECTION WITH EDIT
        // ============================================
        let activeNoteFilter = 'all';

        function renderNotes() {
            const grid = document.getElementById('notes-grid');
            
            const filteredNotes = activeNoteFilter === 'all' 
                ? notes 
                : notes.filter(n => n.category === activeNoteFilter);
            
            if (filteredNotes.length === 0) {
                grid.innerHTML = `
                    <div class="empty">
                        <div class="empty-icon">
                            <svg class="svg-icon-lg" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.3;">
                                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                            </svg>
                        </div>
                        <div class="empty-text">Rien ici encore...</div>
                    </div>
                `;
                return;
            }

            // Sort by most recent first
            const sortedNotes = [...filteredNotes].sort((a, b) => b.id - a.id);

            grid.innerHTML = sortedNotes.map(note => {
                const categoryColors = {
                    grammaire: 'var(--crimson)',
                    prononciation: 'var(--gold)',
                    phrases: 'var(--navy)',
                    vocabulaire: 'var(--rosy)',
                    culture: 'var(--sage)',
                    autre: 'var(--text-soft)'
                };
                
                const categoryColor = categoryColors[note.category] || 'var(--text-soft)';
                
                return `
                    <div class="note-card">
                        <div class="note-header">
                            <span class="note-category" style="background: ${categoryColor}20; color: ${categoryColor}; border-left: 3px solid ${categoryColor};">
                                ${note.category}
                            </span>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="icon-btn" onclick="editNote(${note.id})" title="Modifier">
                                    <svg class="svg-icon" viewBox="0 0 24 24">
                                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                                    </svg>
                                </button>
                                <button class="icon-btn" onclick="deleteNote(${note.id})">
                                    <svg class="svg-icon" viewBox="0 0 24 24">
                                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <h3 class="note-title">${note.title}</h3>
                        <div class="note-content">${note.content.replace(/\n/g, '<br>')}</div>
                        ${note.link ? `
                            <a href="${note.link}" target="_blank" class="note-link">
                                <svg class="svg-icon" viewBox="0 0 24 24" style="width: 14px; height: 14px;">
                                    <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
                                </svg>
                                Voir la ressource
                            </a>
                        ` : ''}
                        <div class="note-date">${new Date(note.created).toLocaleDateString('fr-FR', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                        })}</div>
                    </div>
                `;
            }).join('');
        }

        function editNote(id) {
            const note = notes.find(n => n.id === id);
            if (!note) return;

            document.getElementById('edit-note-id').value = id;
            document.getElementById('edit-note-category').value = note.category;
            document.getElementById('edit-note-title').value = note.title;
            document.getElementById('edit-note-content').value = note.content;
            document.getElementById('edit-note-link').value = note.link || '';

            openModal('edit-note-modal');
        }

        function deleteNote(id) {
            if (confirm('Supprimer cette note ?')) {
                notes = notes.filter(n => n.id !== id);
                syncToFirebase(); // Auto-save notes to Firebase
                renderNotes();
            }
        }

        // Note filter listeners
        document.querySelectorAll('[data-note-filter]').forEach(btn => {
            btn.addEventListener('click', () => {
                activeNoteFilter = btn.dataset.noteFilter;
                
                document.querySelectorAll('[data-note-filter]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                renderNotes();
            });
        });

        // Note form submission
        document.getElementById('note-form').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const note = {
                id: Date.now(),
                category: document.getElementById('note-category').value,
                title: document.getElementById('note-title').value.trim(),
                content: document.getElementById('note-content').value.trim(),
                link: document.getElementById('note-link').value.trim(),
                created: new Date().toISOString()
            };

            notes.push(note);
                syncToFirebase(); // Auto-save notes to Firebase
            
            renderNotes();
            closeModal('note-modal');
            
            // Reset form
            document.getElementById('note-form').reset();
        });

        // EDIT NOTE FORM SUBMISSION
        document.getElementById('edit-note-form').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const id = parseInt(document.getElementById('edit-note-id').value);
            const index = notes.findIndex(n => n.id === id);
            
            if (index === -1) return;

            notes[index] = {
                ...notes[index],
                category: document.getElementById('edit-note-category').value,
                title: document.getElementById('edit-note-title').value.trim(),
                content: document.getElementById('edit-note-content').value.trim(),
                link: document.getElementById('edit-note-link').value.trim()
            };

            // Validate required fields
            if (!notes[index].title || !notes[index].content) {
                alert('Veuillez remplir tous les champs requis');
                return;
            }            syncToFirebase(); // Auto-save notes to Firebase
            renderNotes();
            closeModal('edit-note-modal');
        });

        // ============================================
        // INITIALIZE - FIXED
        // ============================================
        document.addEventListener('DOMContentLoaded', () => {
            console.log('🏡 DOM Content Loaded - Starting initialization...');
            
            // CRITICAL: Wrap everything in try-catch so buttons always work
            try {
            // EASTER EGGS
            const logoSub = document.getElementById('logo-sub');
            if (logoSub) {
                logoSub.addEventListener('click', () => {
                    logoSubClicks++;
                    clearTimeout(logoSubTimer);
                    logoSubTimer = setTimeout(() => { logoSubClicks = 0; }, 2000);
                    if (logoSubClicks === 3) {
                        logoSubClicks = 0;
                        document.getElementById('music-modal').classList.add('active');
                    }
                });
            }

            const logoMain = document.getElementById('logo-main');
            if (logoMain) {
                logoMain.addEventListener('click', () => {
                    logoMainClicks++;
                    clearTimeout(logoMainTimer);
                    logoMainTimer = setTimeout(() => { logoMainClicks = 0; }, 2000);
                    if (logoMainClicks === 2) {
                        logoMainClicks = 0;
                        document.body.classList.toggle('dark-mode');
                        const _isDark = document.body.classList.contains('dark-mode');
                        localStorage.setItem('darkMode', _isDark);
                        if (_isDark) { randomizeLights(); } else { document.getElementById('houseContainer')?.classList.remove('house-lights-on'); }
                    }
                });
            }

            // Heart triple-click to reload data (romantic easter egg + manual refresh!)
            const floatingHeart = document.getElementById('floating-heart');
            let heartClicks = 0;
            let heartTimer;
            if (floatingHeart) {
                floatingHeart.style.cursor = 'pointer';
                floatingHeart.addEventListener('click', async () => {
                    heartClicks++;
                    clearTimeout(heartTimer);
                    heartTimer = setTimeout(() => { heartClicks = 0; }, 2000);
                    if (heartClicks === 3) {
                        heartClicks = 0;
                        if (window.currentUser && window.currentUser.uid) {
                            console.log('💕 Heart easter egg activated - reloading data');
                            await loadDataFromFirebase(window.currentUser.uid);
                            renderGarden();
                            renderReadingPassages();
                            renderGardenVisual();
                            // Show a heart notification
                            const heartNote = document.getElementById('heart-note');
                            const heartReason = document.getElementById('heart-reason');
                            if (heartNote && heartReason) {
                                heartReason.textContent = '💕 Données rechargées avec amour!';
                                heartNote.classList.add('active');
                                setTimeout(() => heartNote.classList.remove('active'), 3000);
                            }
                        }
                    }
                });
            }

            // NOTE: initializeSRSData() is now called AFTER Firebase loads user data
            // See loadDataFromFirebase() function
            updateSRSStatsDisplay();

            // Initialize celestial atmosphere (stars)
            createTwinklingStars();

            // Initialize presence tracking UI
            updatePresenceUI();
            setupCalendarNavigation();

            // SRS button
            const startSRSBtn = document.getElementById('start-srs-session');
            if (startSRSBtn) {
                startSRSBtn.addEventListener('click', startSRSSession);
            }

            setupImportExport(); // Initialize import/export buttons
            setupTimer(); // Initialize study timer
            setupMusicPlayer(); // Initialize music player
            setupFloatingActions(); // Initialize floating quick actions
            setupFlipCards(); // Initialize flip cards
            renderEntrance();
            renderGarden();
            renderHeatmap(); // NEW: Render activity heatmap
            renderGardenVisual(); // NEW: Render garden visual
            populateJardinFilters(); // NEW
            setupFilterListeners(); // NEW
            renderReadingList();
            renderListeningList();
            renderRecordings();
            renderWritingsArchive();
            renderResourcesList();
            renderNotes();
            setupTranscriptSystem(); // Initialize transcript system
            
            // IMPORTANT: Auto-load user data after login (3 second delay to ensure everything is ready)
            setTimeout(() => {
                if (window.currentUser && window.currentUser.uid) {
                    console.log('🔄 Auto-loading data for logged in user...');
                    loadDataFromFirebase(window.currentUser.uid).then(() => {
                        renderGarden();
                        renderGardenVisual();
                        console.log('✅ Auto-load complete!');
                        
                        // Force re-render everything 1 second later to ensure it shows
                        setTimeout(() => {
                            console.log('🔄 Force re-rendering all sections...');
                            renderGarden();
                            renderReadingList();
                            renderListeningList();
                            renderRecordings();
                            renderWritingsArchive();
                            renderNotes();
                            renderResourcesList();
                            renderSectionResources();
                            renderGarden();
                            renderGardenVisual();
                            console.log('✅ Force re-render complete!');
                        }, 1000);
                    });
                }
            }, 3000); // Wait 3 seconds for everything to be ready
            
            // Resources filter listener
            const resourcesFilter = document.getElementById('filter-resources-type');
            if (resourcesFilter) {
                resourcesFilter.addEventListener('change', renderResourcesList);
            }
            
            // Fix: Properly attach event listener for add word button
            const addWordBtn = document.getElementById('add-word-btn');
            if (addWordBtn) {
                addWordBtn.addEventListener('click', function() {
                    openModal('word-modal');
                });
            }

            // Fix: Initialize image upload handlers
            setupImageUpload('word-image-upload', 'word-image-input', 'word-image-preview');
            setupImageUpload('edit-word-image-upload', 'edit-word-image-input', 'edit-word-image-preview');
            
            // Initialize speech recognition
            initializeSpeechRecognition();

            // Setup all button listeners
            setupReadingListeners();
            setupListeningListeners();
            setupResourcesListeners();
            
            // Setup resource dropdowns and render section resources
            setupResourceDropdowns();
            renderSectionResources();


            // Random house lights when going dark
            function randomizeLights() {
                const container = document.getElementById('houseContainer');
                if (!container) return;
                container.classList.remove('house-lights-on');
                if (Math.random() < 0.5) {
                    container.classList.add('house-lights-on');
                }
            }
            // ============================================
            // DARK MODE TOGGLE
            // ============================================
            const darkModeToggle = document.getElementById('dark-mode-toggle');
            const isDarkMode = localStorage.getItem('darkMode') === 'true';

            if (isDarkMode) {
                document.body.classList.add('dark-mode');
                randomizeLights();
            }

            if (darkModeToggle) {
                darkModeToggle.addEventListener('click', () => {
                    document.body.classList.toggle('dark-mode');
                    const isDark = document.body.classList.contains('dark-mode');
                    localStorage.setItem('darkMode', isDark);
                    
                    if (isDark) { randomizeLights(); } else {
                        document.getElementById('houseContainer')?.classList.remove('house-lights-on');
                    }
                });
            }

            document.getElementById('edit-resources-form').addEventListener('submit', function(e) {
                e.preventDefault();
                
                const id = parseInt(document.getElementById('edit-resources-id').value);
                const index = resourcesList.findIndex(r => r.id === id);
                
                if (index === -1) return;

                resourcesList[index] = {
                    ...resourcesList[index],
                    type: document.getElementById('edit-resources-type').value,
                    name: document.getElementById('edit-resources-name').value.trim(),
                    description: document.getElementById('edit-resources-description').value.trim() || '',
                    link: document.getElementById('edit-resources-link').value.trim(),
                    note: document.getElementById('edit-resources-note').value.trim() || ''
                };
                syncToFirebase(); // Auto-save resourcesList to Firebase
                renderResourcesList();
                closeModal('edit-resources-modal');
            });

            document.getElementById('edit-note-form').addEventListener('submit', function(e) {
                e.preventDefault();
                
                const id = parseInt(document.getElementById('edit-note-id').value);
                const index = notes.findIndex(n => n.id === id);
                
                if (index === -1) return;

                notes[index] = {
                    ...notes[index],
                    category: document.getElementById('edit-note-category').value,
                    title: document.getElementById('edit-note-title').value.trim(),
                    content: document.getElementById('edit-note-content').value.trim(),
                    link: document.getElementById('edit-note-link').value.trim()
                };
                syncToFirebase(); // Auto-save notes to Firebase
                renderNotes();
                closeModal('edit-note-modal');
            });

            document.getElementById('edit-recording-form').addEventListener('submit', function(e) {
                e.preventDefault();
                
                const id = parseInt(document.getElementById('edit-recording-id').value);
                const index = recordings.findIndex(r => r.id === id);
                
                if (index === -1) return;

                recordings[index] = {
                    ...recordings[index],
                    question: document.getElementById('edit-recording-question').value.trim(),
                    note: document.getElementById('edit-recording-note').value.trim() || ''
                };
                syncToFirebase(); // Auto-save recordings to Firebase
                renderRecordings();
                closeModal('edit-recording-modal');
            });

            document.getElementById('edit-writing-form').addEventListener('submit', function(e) {
                e.preventDefault();
                
                const id = parseInt(document.getElementById('edit-writing-id').value);
                const index = writings.findIndex(w => w.id === id);
                
                if (index === -1) return;

                writings[index] = {
                    ...writings[index],
                    text: document.getElementById('edit-writing-text').value.trim()
                };
                syncToFirebase(); // Auto-save writings to Firebase
                renderWritingsArchive();
                closeModal('edit-writing-modal');
            });
            
            console.log('✅ All button listeners attached successfully!');
            
            } catch (error) {
                console.error('❌ CRITICAL ERROR during initialization:', error);
                console.error('Stack trace:', error.stack);
                alert('⚠️ Some features may not work. Error: ' + error.message + '\n\nCheck console for details.');
                
                // Try to at least set up the critical button listeners even if other stuff failed
                try {
                    console.log('🔧 Attempting emergency button setup...');
                    setupReadingListeners();
                    setupListeningListeners();
                    setupResourcesListeners();
                    console.log('✅ Emergency setup complete!');
                } catch (e2) {
                    console.error('❌ Emergency setup also failed:', e2);
                }
            }
        });
        // ============================================
        // TRANSCRIPT SYSTEM WITH AI LOOKUP
        // ============================================
        
        // Storage (transcripts already declared at top with other data arrays)
        let wordLookupCache = JSON.parse(localStorage.getItem('wordLookupCache') || '{}');
        
        // Current lookup state
        let currentLookup = null;

        // Normalize word for lookup
        function normalizeWord(word) {
            return word.toLowerCase()
                .replace(/['']/g, "'")  // normalize apostrophes
                .replace(/[.,!?;:]/g, '')  // remove punctuation
                .trim();
        }

        // Make transcript text clickable
        function makeTranscriptClickable(text, sourceId) {
            // Split into sentences to preserve structure
            const sentences = text.split(/([.!?]+\s)/);
            
            return sentences.map(sentence => {
                // Split sentence into words and punctuation
                const tokens = sentence.split(/(\s+|[''.,!?;:—])/);
                
                return tokens.map(token => {
                    // Skip whitespace and punctuation
                    if (!token.trim() || /^[''.,!?;:—\s]+$/.test(token)) {
                        return token;
                    }
                    
                    const normalized = normalizeWord(token);
                    if (!normalized) return token;
                    
                    return `<span class="clickable-word" data-word="${normalized}" data-source="${sourceId}">${token}</span>`;
                }).join('');
            }).join('');
        }

        // Render transcripts
        function renderTranscripts(type) {
            try {
                const transcripts = type === 'reading' ? readingTranscripts : listeningTranscripts;
                const container = document.getElementById(`${type}-transcripts-container`);
                const section = document.getElementById(`${type}-transcripts-section`);
                
                // Check if elements exist before using them
                if (!container || !section) {
                    console.warn(`⚠️ renderTranscripts(${type}): Missing DOM elements - skipping`);
                    return; // Exit immediately if elements don't exist
                }
                
                // Double-check transcripts array exists
                if (!transcripts) {
                    console.warn(`⚠️ renderTranscripts(${type}): Transcripts array is undefined - skipping`);
                    return;
                }
                
                if (transcripts.length === 0) {
                    if (section && section.style) {
                        section.style.display = 'none';
                    }
                    return;
                }
                
                if (section && section.style) {
                    section.style.display = 'block';
                }
                
                if (!container) return; // Extra safety check
                
                container.innerHTML = transcripts.map(t => `
                <div class="transcript-card" data-transcript-id="${t.id}">
                    <div class="transcript-header" style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 class="transcript-title">${t.title}</h3>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <button class="icon-btn" onclick="copyTranscript('${t.text.replace(/'/g, "\\'")}', this)" title="Copier">
                                <svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                            </button>
                            <button class="icon-btn" onclick="editTranscript('${type}', ${t.id})" title="Modifier">
                                <svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button class="icon-btn transcript-fold-btn" onclick="toggleTranscript(${t.id})" title="Replier/Déplier">
                                <svg class="svg-icon chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </button>
                            <button class="icon-btn" onclick="deleteTranscript('${type}', ${t.id})" title="Supprimer">
                                <svg class="svg-icon" viewBox="0 0 24 24">
                                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="transcript-body" data-id="${t.id}">
                        ${makeTranscriptClickable(t.text, t.id)}
                    </div>
                </div>
            `).join('');
            
            // Attach click listeners to all clickable words
            container.querySelectorAll('.clickable-word').forEach(word => {
                word.addEventListener('click', function() {
                    handleWordClick(this);
                });
            });
            
            } catch (error) {
                console.error(`❌ renderTranscripts(${type}) failed:`, error.message);
                // Silently continue - transcript system is optional
            }
        }

        // Handle word click
        async function handleWordClick(element) {
            const word = element.dataset.word;
            const sourceId = element.dataset.source;
            
            // Get sentence context
            const card = element.closest('.transcript-card');
            const fullText = card.querySelector('.transcript-body').textContent;
            
            // Find sentence containing the word - improved logic
            const sentences = fullText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
            let sentence = '';
            
            // Try to find the exact sentence
            for (let s of sentences) {
                if (s.toLowerCase().includes(word.toLowerCase())) {
                    sentence = s;
                    break;
                }
            }
            
            // Fallback: if no sentence found or sentence is too long, use just the word
            if (!sentence || sentence.length > 200) {
                sentence = word;
            }
            
            // Add punctuation if missing
            if (sentence && !sentence.match(/[.!?]$/)) {
                sentence = sentence + '.';
            }
            
            console.log('Word:', word, '| Extracted sentence:', sentence);
            
            // Open popup immediately
            openModal('word-lookup-modal');
            const lookupInput = document.getElementById('lookup-word-input');
            const lookupContent = document.getElementById('lookup-content');
            const lookupActions = document.getElementById('lookup-actions');
            
            if (lookupInput) lookupInput.value = word;
            if (lookupContent) lookupContent.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-soft);">Chargement...</div>';
            if (lookupActions) lookupActions.style.display = 'none';
            
            // Check cache first
            if (wordLookupCache[word]) {
                console.log('Using cached result for:', word);
                displayLookupResult(wordLookupCache[word], sentence, sourceId);
                return;
            }
            
            // Fetch from AI
            try {
                const result = await fetchWordDefinition(word, sentence);
                
                // Cache the result
                wordLookupCache[word] = result;            // Cache stored in memory only - no Firebase sync needed
                
                displayLookupResult(result, sentence, sourceId);
            } catch (error) {
                console.error('Lookup error:', error);
                document.getElementById('lookup-content').innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: var(--crimson);">
                        Impossible de charger la traduction.
                        <br><br>
                        <button class="btn btn-secondary" onclick="handleWordClick(document.querySelector('[data-word=\\'${word}\\']'))">
                            Réessayer
                        </button>
                    </div>
                `;
            }
        }

        // Fetch word definition from free dictionary API
        async function fetchWordDefinition(word, sentence) {
            // Try free French dictionary API first
            try {
                const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/fr/${encodeURIComponent(word)}`);
                
                if (!response.ok) {
                    throw new Error('Dictionary API failed');
                }
                
                const data = await response.json();
                const entry = data[0];
                
                // Extract info
                const lemma = entry.word || word;
                const meanings = entry.meanings || [];
                const firstMeaning = meanings[0] || {};
                const partOfSpeech = firstMeaning.partOfSpeech || '';
                
                // Get definitions
                const definitions = firstMeaning.definitions || [];
                const translations = definitions.slice(0, 3).map(d => d.definition);
                
                // Get phonetics
                const phonetics = entry.phonetics || [];
                const ipa = phonetics.find(p => p.text)?.text || '';
                
                return {
                    lemma: lemma,
                    partOfSpeech: partOfSpeech,
                    translations: translations.length > 0 ? translations : ['(traduction non disponible)'],
                    ipa: ipa.replace(/[\/\[\]]/g, ''),
                    definition: definitions[0]?.definition || ''
                };
                
            } catch (error) {
                console.error('Dictionary API error:', error);
                
                // Fallback: basic response
                return {
                    lemma: word,
                    partOfSpeech: '',
                    translations: ['Cliquez sur "Sauvegarder" pour ajouter ce mot et ajouter la traduction manuellement'],
                    ipa: '',
                    definition: `Mot trouvé dans: "${sentence}"`
                };
            }
        }

        // Display lookup result
        function displayLookupResult(result, sentence, sourceId) {
            currentLookup = { ...result, sentence, sourceId };
            
            const translationsList = result.translations && result.translations.length > 0
                ? result.translations.map(t => `<li>${t}</li>`).join('')
                : '<li><em>Cliquez sur "Sauvegarder" pour ajouter ce mot et ajouter la traduction manuellement</em></li>';
            
            document.getElementById('lookup-content').innerHTML = `
                <div class="lookup-info">
                    ${result.lemma ? `<div class="lookup-lemma"><strong>Lemme:</strong> ${result.lemma} <em>(${result.partOfSpeech || ''})</em></div>` : ''}
                    ${result.word ? `<div><strong>Mot trouvé dans:</strong> "${sentence}"</div>` : ''}
                    ${result.ipa ? `<div class="lookup-ipa">/${result.ipa}/</div>` : ''}
                    ${result.definition ? `<div style="margin-bottom: 1rem; color: var(--text-soft);">${result.definition}</div>` : ''}
                    <div>
                        <strong>Traductions:</strong>
                        <ul class="lookup-translations">
                            ${translationsList}
                        </ul>
                    </div>
                    <div class="form-group" style="margin-top: 1rem;">
                        <label class="form-label">✏️ Ajouter/modifier la traduction:</label>
                        <input type="text" class="form-input" id="manual-translation-input" placeholder="Entrez la traduction ici..." value="${result.translations && result.translations.length > 0 ? result.translations.join(', ') : ''}">
                    </div>
                    <div class="lookup-sentence">
                        <strong>Contexte:</strong><br>
                        ${sentence}
                    </div>
                </div>
            `;
            
            const lookupActions = document.getElementById('lookup-actions');
            if (lookupActions) lookupActions.style.display = 'flex';
        }

        // Save word to vocabulary
        document.getElementById('save-lookup-word')?.addEventListener('click', function() {
            if (!currentLookup) return;
            
            // Get manual translation if provided
            const manualTranslation = document.getElementById('manual-translation-input')?.value.trim();
            const translation = manualTranslation || (currentLookup.translations && currentLookup.translations.length > 0 ? currentLookup.translations.join(', ') : '');
            
            const word = {
                id: Date.now(),
                french: currentLookup.lemma || currentLookup.word || document.getElementById('lookup-word-input').value,
                meaning: translation,
                article: '',
                gender: '',
                theme: 'De transcription',
                week: '',
                quarter: '',
                year: new Date().getFullYear().toString(),
                contexts: [currentLookup.sentence],
                note: currentLookup.definition || '',
                image: null,
                created: new Date().toISOString(),
                srs: {
                    easeFactor: 2.5,
                    interval: 0,
                    repetitions: 0,
                    dueDate: new Date().toISOString(),
                    lastReviewed: null,
                    status: 'new'
                }
            };
            
            vocabulary.push(word);
                syncToFirebase(); // Auto-save vocabulary to Firebase
            renderGarden();
            updateSRSStatsDisplay();
            
            // Show confirmation
            const lookupContent = document.getElementById('lookup-content');
            if (lookupContent) lookupContent.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--gold);">
                    ✅ Mot ajouté au jardin !
                </div>
            `;
            
            const lookupActions = document.getElementById('lookup-actions');
            if (lookupActions) lookupActions.style.display = 'none';
            
            // Trigger hearts
            for (let i = 0; i < 3; i++) {
                setTimeout(() => createFloatingHeart(), i * 200);
            }
            
            setTimeout(() => closeModal('word-lookup-modal'), 1500);
        });

        // Toggle transcript fold/unfold
        function toggleTranscript(id) {
            const body = document.querySelector(`.transcript-body[data-id="${id}"]`);
            const btn = event.target.closest('.transcript-fold-btn');
            const chevron = btn.querySelector('.chevron-icon');
            
            if (body.classList.contains('folded')) {
                // Unfold
                body.classList.remove('folded');
                chevron.style.transform = 'rotate(0deg)';
                btn.setAttribute('title', 'Replier');
            } else {
                // Fold
                body.classList.add('folded');
                chevron.style.transform = 'rotate(-90deg)';
                btn.setAttribute('title', 'Déplier');
            }
        }

        // Copy transcript to clipboard
        function copyTranscript(text, button) {
            if (!button) {
                console.warn('⚠️ copyTranscript called with null button');
                return;
            }
            
            navigator.clipboard.writeText(text).then(() => {
                const originalHTML = button.innerHTML;
                button.innerHTML = '<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                button.style.color = 'var(--sage)';
                setTimeout(() => {
                    button.innerHTML = originalHTML;
                    button.style.color = '';
                }, 2000);
            }).catch(() => {
                alert('Erreur lors de la copie');
            });
        }

        // Delete transcript
        function deleteTranscript(type, id) {
            if (!confirm('Supprimer cette transcription ?')) return;
            
            if (type === 'reading') {
                readingTranscripts = readingTranscripts.filter(t => t.id !== id);
                syncToFirebase(); // Auto-save readingTranscripts to Firebase
                renderTranscripts('reading');
            } else {
                listeningTranscripts = listeningTranscripts.filter(t => t.id !== id);
                syncToFirebase(); // Auto-save listeningTranscripts to Firebase
                renderTranscripts('listening');
            }
        }
        
        // Edit a transcript
        function editTranscript(type, id) {
            const transcripts = type === 'reading' ? readingTranscripts : listeningTranscripts;
            const transcript = transcripts.find(t => t.id === id);
            
            if (!transcript) return;
            
            // Populate the form with existing data
            const modalId = type === 'reading' ? 'add-reading-transcript-modal' : 'add-listening-transcript-modal';
            const titleField = document.getElementById(`${type}-transcript-title`);
            const textField = document.getElementById(`${type}-transcript-text`);
            const translationField = document.getElementById(`${type}-transcript-translation`);
            const linkedField = document.getElementById(`${type}-transcript-linked-material`);
            
            if (titleField) titleField.value = transcript.title || '';
            if (textField) textField.value = transcript.text || '';
            if (translationField) translationField.value = transcript.translation || '';
            if (linkedField) linkedField.value = transcript.linkedMaterial || '';
            
            // Store the ID being edited
            const form = document.getElementById(`add-${type}-transcript-form`);
            form.dataset.editingId = id;
            
            // Change modal title
            const modalTitle = document.querySelector(`#${modalId} .modal-title`);
            if (modalTitle) modalTitle.textContent = 'Modifier la transcription';
            
            // Open the modal
            openModal(modalId);
        }

        // Setup transcript buttons and forms
        function setupTranscriptSystem() {
            try {
                console.log('🔧 Setting up transcript system...');
            
            // Reading transcript button
            document.getElementById('add-reading-transcript-btn')?.addEventListener('click', () => {
                // Reset form and modal title for new transcript
                const form = document.getElementById('add-reading-transcript-form');
                const modalTitle = document.querySelector('#add-reading-transcript-modal .modal-title');
                if (form) {
                    form.reset();
                    delete form.dataset.editingId;
                }
                if (modalTitle) modalTitle.textContent = 'Ajouter une transcription';
                openModal('add-reading-transcript-modal');
            });
            
            // Listening transcript button
            document.getElementById('add-listening-transcript-btn')?.addEventListener('click', () => {
                // Reset form and modal title for new transcript
                const form = document.getElementById('add-listening-transcript-form');
                const modalTitle = document.querySelector('#add-listening-transcript-modal .modal-title');
                if (form) {
                    form.reset();
                    delete form.dataset.editingId;
                }
                if (modalTitle) modalTitle.textContent = 'Ajouter une transcription';
                openModal('add-listening-transcript-modal');
            });
            
            // Reading transcript form
            document.getElementById('add-reading-transcript-form')?.addEventListener('submit', (e) => {
                e.preventDefault();
                
                const form = e.target;
                const editingId = form.dataset.editingId ? parseInt(form.dataset.editingId) : null;
                
                if (editingId) {
                    // Edit existing transcript
                    const index = readingTranscripts.findIndex(t => t.id === editingId);
                    if (index !== -1) {
                        readingTranscripts[index] = {
                            ...readingTranscripts[index],
                            title: document.getElementById('reading-transcript-title').value.trim(),
                            text: document.getElementById('reading-transcript-text').value.trim(),
                            translation: document.getElementById('reading-transcript-translation')?.value.trim() || '',
                            linkedMaterial: document.getElementById('reading-transcript-linked-material')?.value || '',
                            updated: new Date().toISOString()
                        };
                    }
                    delete form.dataset.editingId;
                } else {
                    // Create new transcript
                    const transcript = {
                        id: Date.now(),
                        title: document.getElementById('reading-transcript-title').value.trim(),
                        text: document.getElementById('reading-transcript-text').value.trim(),
                        translation: document.getElementById('reading-transcript-translation')?.value.trim() || '',
                        linkedMaterial: document.getElementById('reading-transcript-linked-material')?.value || '',
                        created: new Date().toISOString()
                    };
                    readingTranscripts.push(transcript);
                }
                
                syncToFirebase(); // Auto-save readingTranscripts to Firebase
                renderTranscripts('reading');
                closeModal('add-reading-transcript-modal');
                
                // Reset modal title
                const modalTitle = document.querySelector('#add-reading-transcript-modal .modal-title');
                if (modalTitle) modalTitle.textContent = 'Ajouter une transcription';
                
                e.target.reset();
            });
            
            // Listening transcript form
            document.getElementById('add-listening-transcript-form')?.addEventListener('submit', (e) => {
                e.preventDefault();
                
                const form = e.target;
                const editingId = form.dataset.editingId ? parseInt(form.dataset.editingId) : null;
                
                if (editingId) {
                    // Edit existing transcript
                    const index = listeningTranscripts.findIndex(t => t.id === editingId);
                    if (index !== -1) {
                        listeningTranscripts[index] = {
                            ...listeningTranscripts[index],
                            title: document.getElementById('listening-transcript-title').value.trim(),
                            text: document.getElementById('listening-transcript-text').value.trim(),
                            translation: document.getElementById('listening-transcript-translation')?.value.trim() || '',
                            linkedMaterial: document.getElementById('listening-transcript-linked-material')?.value || '',
                            updated: new Date().toISOString()
                        };
                    }
                    delete form.dataset.editingId;
                } else {
                    // Create new transcript
                    const transcript = {
                        id: Date.now(),
                        title: document.getElementById('listening-transcript-title').value.trim(),
                        text: document.getElementById('listening-transcript-text').value.trim(),
                        translation: document.getElementById('listening-transcript-translation')?.value.trim() || '',
                        linkedMaterial: document.getElementById('listening-transcript-linked-material')?.value || '',
                        created: new Date().toISOString()
                    };
                    listeningTranscripts.push(transcript);
                }
                
                syncToFirebase(); // Auto-save listeningTranscripts to Firebase
                renderTranscripts('listening');
                closeModal('add-listening-transcript-modal');
                
                // Reset modal title
                const modalTitle = document.querySelector('#add-listening-transcript-modal .modal-title');
                if (modalTitle) modalTitle.textContent = 'Ajouter une transcription';
                
                e.target.reset();
            });
            
            // Initial render
            renderTranscripts('reading');
            renderTranscripts('listening');
            
            console.log('✅ Transcript system setup complete');
            
            } catch (error) {
                console.error('❌ setupTranscriptSystem error:', error);
                console.warn('Transcript system failed to initialize, but continuing...');
            }
        }

        // ============================================
        // FIREBASE AUTHENTICATION & CLOUD SYNC
        // ============================================
        
        // Wait for Firebase to load
        window.initFirebaseAuth = function() {
            console.log('🔍 initFirebaseAuth called');
            console.log('firebaseReady:', window.firebaseReady);
            console.log('firebaseAuth:', !!window.firebaseAuth);
            console.log('firebaseDB:', !!window.firebaseDB);
            
            if (!window.firebaseReady || !window.firebaseAuth || !window.firebaseDB) {
                console.log('⏳ Waiting for Firebase to load... retrying in 100ms');
                setTimeout(window.initFirebaseAuth, 100);
                return;
            }
            
            console.log('🔥 Initializing Firebase Auth...');
            
            const { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup } = window.firebaseModules;
            
            // Listen for auth state changes
            onAuthStateChanged(window.firebaseAuth, async (user) => {
                console.log('👤 Auth state changed:', user ? user.email : 'Not logged in');
                
                if (user) {
                    window.currentUser = user;
                    
                    // Show entrance user profile
                    const userProfile = document.getElementById('entrance-user-profile');
                    const userEmail = document.getElementById('entrance-user-email');
                    const userAvatar = document.getElementById('entrance-user-avatar');
                    const loginSection = document.getElementById('entrance-login-section');
                    
                    if (userProfile) userProfile.style.display = 'block';
                    if (userEmail) userEmail.textContent = user.email;
                    if (userAvatar) userAvatar.textContent = user.email[0].toUpperCase();
                    if (loginSection) loginSection.style.display = 'none';
                    
                    // Try to close auth modal, but don't let it break the login flow
                    try {
                        closeModal('auth-modal');
                    } catch (e) {
                        console.warn('⚠️ Could not close auth modal:', e);
                    }
                    
                    // Load data from Firestore
                    console.log('📥 Loading data for user:', user.uid);
                    await loadDataFromFirebase(user.uid);
                    console.log('✅ loadDataFromFirebase completed successfully');
                    console.log('📊 Current state:', {
                        vocabulary: vocabulary.length,
                        readingPassages: readingPassages.length
                    });
                    
                    // Update debug panel
                    if (typeof updateDebugPanel !== 'undefined') {
                        updateDebugPanel();
                    }
                    
                    // Setup real-time sync
                    setupRealtimeSync(user.uid);
                } else {
                    window.currentUser = null;
                    
                    // Hide entrance user profile
                    const userProfile = document.getElementById('entrance-user-profile');
                    const loginSection = document.getElementById('entrance-login-section');
                    
                    if (userProfile) userProfile.style.display = 'none';
                    if (loginSection) loginSection.style.display = 'block';
                    
                    // Load from localStorage when not logged in
                    console.log('📦 Not logged in - loading from localStorage...');
                    loadFromLocalStorage();
                    
                    // Show login modal when not authenticated
                    setTimeout(() => {
                        console.log('🔓 Not logged in - showing auth modal');
                        openModal('auth-modal');
                    }, 500);
                }
            });
            
            // Login form
            const loginForm = document.getElementById('login-form');
            if (loginForm) {
                loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('login-email').value;
                const password = document.getElementById('login-password').value;
                
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.textContent;
                submitBtn.textContent = 'Connexion...';
                submitBtn.disabled = true;
                
                try {
                    await signInWithEmailAndPassword(window.firebaseAuth, email, password);
                    console.log('✅ Successfully logged in!');
                    // Modal will close automatically via onAuthStateChanged
                } catch (error) {
                    console.error('❌ Login error:', error);
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                    
                    // Better error messages in French
                    let errorMsg = 'Erreur de connexion';
                    if (error.code === 'auth/user-not-found') {
                        errorMsg = 'Aucun compte trouvé avec cet email. Voulez-vous créer un compte ?';
                    } else if (error.code === 'auth/wrong-password') {
                        errorMsg = 'Mot de passe incorrect. Réessayez.';
                    } else if (error.code === 'auth/invalid-email') {
                        errorMsg = 'Adresse email invalide.';
                    } else if (error.code === 'auth/invalid-credential') {
                        errorMsg = 'Email ou mot de passe incorrect.';
                    } else {
                        errorMsg = 'Erreur: ' + error.message;
                    }
                    alert(errorMsg);
                }
            });
            }
            
            // Signup form
            const signupForm = document.getElementById('signup-form');
            if (signupForm) {
                signupForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('signup-email').value;
                const password = document.getElementById('signup-password').value;
                
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.textContent;
                submitBtn.textContent = 'Création...';
                submitBtn.disabled = true;
                
                try {
                    await createUserWithEmailAndPassword(window.firebaseAuth, email, password);
                    console.log('✅ Account created successfully!');
                    // Modal will close automatically via onAuthStateChanged
                } catch (error) {
                    console.error('❌ Signup error:', error);
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                    
                    // Better error messages in French
                    let errorMsg = 'Erreur de création de compte';
                    if (error.code === 'auth/email-already-in-use') {
                        errorMsg = 'Cet email est déjà utilisé. Essayez de vous connecter.';
                    } else if (error.code === 'auth/weak-password') {
                        errorMsg = 'Le mot de passe doit contenir au moins 6 caractères.';
                    } else if (error.code === 'auth/invalid-email') {
                        errorMsg = 'Adresse email invalide.';
                    } else {
                        errorMsg = 'Erreur: ' + error.message;
                    }
                    alert(errorMsg);
                }
            });
            }
            
            // Google sign in
            const googleSigninBtn = document.getElementById('google-signin-btn');
            if (googleSigninBtn) {
                googleSigninBtn.addEventListener('click', async () => {
                const provider = new GoogleAuthProvider();
                try {
                    await signInWithPopup(window.firebaseAuth, provider);
                } catch (error) {
                    alert('Erreur: ' + error.message);
                }
            });
            }
            
            // Logout handler
            const logoutBtn = document.getElementById('entrance-logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', async () => {
                await signOut(window.firebaseAuth);
            });
            }
            
            // Toggle between login/signup
            const showSignupBtn = document.getElementById('show-signup');
            if (showSignupBtn) {
                showSignupBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const loginView = document.getElementById('auth-login-view');
                const signupView = document.getElementById('auth-signup-view');
                const modalTitle = document.getElementById('auth-modal-title');
                
                if (loginView) loginView.style.display = 'none';
                if (signupView) signupView.style.display = 'block';
                if (modalTitle) modalTitle.textContent = 'Créer un compte';
            });
            }
            
            const showLoginBtn = document.getElementById('show-login');
            if (showLoginBtn) {
                showLoginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const loginView = document.getElementById('auth-login-view');
                const signupView = document.getElementById('auth-signup-view');
                const modalTitle = document.getElementById('auth-modal-title');
                
                if (signupView) signupView.style.display = 'none';
                if (loginView) loginView.style.display = 'block';
                if (modalTitle) modalTitle.textContent = 'Connexion';
            });
            }
        }
        
        // Load all data from Firebase
        async function loadDataFromFirebase(userId) {
            console.log('🔍 loadDataFromFirebase called for userId:', userId);
            console.log('🔍 window.firebaseModules exists?', !!window.firebaseModules);
            console.log('🔍 window.firebaseDB exists?', !!window.firebaseDB);
            
            const { doc, getDoc } = window.firebaseModules;
            
            try {
                console.log('📡 Fetching user document...');
                const userDocRef = doc(window.firebaseDB, 'users', userId);
                console.log('📡 Doc ref created:', userDocRef);
                const userDoc = await getDoc(userDocRef);
                console.log('📄 User doc received');
                console.log('📄 User doc exists?', userDoc.exists());
                
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    console.log('📦 Raw data object keys:', Object.keys(data));
                    console.log('📦 Data received:', {
                        vocabulary: data.vocabulary?.length || 0,
                        readingList: data.readingList?.length || 0,
                        listeningList: data.listeningList?.length || 0,
                        recordings: data.recordings?.length || 0,
                        writings: data.writings?.length || 0,
                        notes: data.notes?.length || 0,
                        resourcesList: data.resourcesList?.length || 0,
                        readingTranscripts: data.readingTranscripts?.length || 0,
                        listeningTranscripts: data.listeningTranscripts?.length || 0,
                        readingPassages: data.readingPassages?.length || 0,
                        presenceData: Object.keys(data.presenceData || {}).length || 0,
                        mistakeCorrections: data.mistakeCorrections?.length || 0
                    });
                    
                    // Load all data directly into memory
                    if (data.vocabulary) {
                        vocabulary = data.vocabulary;
                        console.log('✅ Loaded', vocabulary.length, 'vocabulary items');
                    }
                    
                    if (data.readingList) {
                        readingList = data.readingList;
                    }
                    
                    if (data.listeningList) {
                        listeningList = data.listeningList;
                    }
                    
                    if (data.recordings) {
                        recordings = data.recordings;
                    }
                    
                    if (data.writings) {
                        writings = data.writings;
                    }
                    
                    if (data.notes) {
                        notes = data.notes;
                    }
                    
                    if (data.resourcesList) {
                        resourcesList = data.resourcesList;
                    }
                    
                    if (data.readingTranscripts) {
                        readingTranscripts = data.readingTranscripts;
                    }
                    
                    if (data.listeningTranscripts) {
                        listeningTranscripts = data.listeningTranscripts;
                    }
                    
                    if (data.readingPassages) {
                        readingPassages = data.readingPassages;
                        console.log('✅ Loaded', readingPassages.length, 'reading passages');
                    }
                    
                    if (data.presenceData) {
                        presenceData = data.presenceData;
                        console.log('✅ Loaded', Object.keys(presenceData).length, 'days of presence data');
                    }
                    
                    if (data.mistakeCorrections) {
                        mistakeCorrections = data.mistakeCorrections;
                        console.log('✅ Loaded', mistakeCorrections.length, 'mistake corrections');
                    }
                    
                    // CRITICAL: Rebuild presence data from ALL existing entries
                    // This ensures calendar shows entries that were created before presence tracking was added
                    rebuildPresenceDataFromEntries();
                    
                    console.log('✅ Data loaded from Firebase into memory!');
                    
                    // Update debug panel
                    updateDebugPanel();
                    
                    // Try to render if functions exist, otherwise they'll render when page loads
                    if (typeof renderGarden !== 'undefined') {
                        console.log('🎨 Rendering all sections with loaded data...');
                        renderGarden();
                        console.log('  ✅ renderGarden() complete');
                        renderReadingList();
                        console.log('  ✅ renderReadingList() complete');
                        renderReadingPassages();
                        console.log('  ✅ renderReadingPassages() complete');
                        renderListeningList();
                        console.log('  ✅ renderListeningList() complete');
                        renderRecordings();
                        console.log('  ✅ renderRecordings() complete');
                        renderWritingsArchive();
                        console.log('  ✅ renderWritingsArchive() complete');
                        renderNotes();
                        console.log('  ✅ renderNotes() complete');
                        renderResourcesList();
                        console.log('  ✅ renderResourcesList() complete');
                        renderTranscripts('reading');
                        console.log('  ✅ renderTranscripts(reading) complete');
                        renderTranscripts('listening');
                        console.log('  ✅ renderTranscripts(listening) complete');
                        renderSectionResources();
                        console.log('  ✅ renderSectionResources() complete');
                        initializeSRSData();
                        updateSRSStatsDisplay();
                        updatePresenceUI();
                        console.log('  ✅ updatePresenceUI() complete');
                        console.log('✅ All sections rendered with Firebase data');
                    } else {
                        console.log('⏳ Render functions not ready - data will render when page loads');
                    }
                } else {
                    console.log('ℹ️ No existing data found - new user');
                    // First time user - try to migrate from localStorage if it exists
                    const localVocab = localStorage.getItem('vocabulary');
                    const localReadings = localStorage.getItem('readingList');
                    const localListening = localStorage.getItem('listeningList');
                    const localRecordings = localStorage.getItem('recordings');
                    const localWritings = localStorage.getItem('writings');
                    const localNotes = localStorage.getItem('notes');
                    const localResources = localStorage.getItem('resourcesList');
                    const localReadingTranscripts = localStorage.getItem('readingTranscripts');
                    const localListeningTranscripts = localStorage.getItem('listeningTranscripts');
                    
                    if (localVocab || localReadings || localListening || localRecordings || localWritings || localNotes || localResources || localReadingTranscripts || localListeningTranscripts) {
                        console.log('📦 Migrating data from localStorage to Firebase...');
                        
                        if (localVocab) vocabulary = JSON.parse(localVocab);
                        if (localReadings) readingList = JSON.parse(localReadings);
                        if (localListening) listeningList = JSON.parse(localListening);
                        if (localRecordings) recordings = JSON.parse(localRecordings);
                        if (localWritings) writings = JSON.parse(localWritings);
                        if (localNotes) notes = JSON.parse(localNotes);
                        if (localResources) resourcesList = JSON.parse(localResources);
                        if (localReadingTranscripts) readingTranscripts = JSON.parse(localReadingTranscripts);
                        if (localListeningTranscripts) listeningTranscripts = JSON.parse(localListeningTranscripts);
                        
                        // Save migrated data to Firebase
                        await saveDataToFirebase();
                        
                        // Clear localStorage after successful migration
                        localStorage.removeItem('vocabulary');
                        localStorage.removeItem('readingList');
                        localStorage.removeItem('listeningList');
                        localStorage.removeItem('recordings');
                        localStorage.removeItem('writings');
                        localStorage.removeItem('notes');
                        localStorage.removeItem('resourcesList');
                        localStorage.removeItem('readingTranscripts');
                        localStorage.removeItem('listeningTranscripts');
                        
                        console.log('✅ Migration complete!');
                        
                        // Rebuild presence data from migrated entries
                        rebuildPresenceDataFromEntries();
                        
                        // Render all data
                        renderGarden();
                        renderReadingList();
                        renderReadingPassages();
                        renderListeningList();
                        renderRecordings();
                        renderWritingsArchive();
                        renderNotes();
                        renderResourcesList();
                        
                        // Initialize SRS data now that vocabulary is loaded
                        initializeSRSData();
                        updateSRSStatsDisplay();
                    } else {
                        // Brand new user with no data - just initialize empty SRS
                        initializeSRSData();
                        updateSRSStatsDisplay();
                    }
                }
            } catch (error) {
                console.error('❌ Error loading from Firebase:', error);
                console.error('   Error type:', error.constructor.name);
                console.error('   Error message:', error.message);
                console.error('   Error stack:', error.stack);
                alert('Failed to load data: ' + error.message);
            }
        }
        
        // UPDATE DEBUG PANEL
        function updateDebugPanel() {
            const loggedInEl = document.getElementById('debug-logged-in');
            const firebaseEl = document.getElementById('debug-firebase-ready');
            const vocabEl = document.getElementById('debug-vocab-count');
            const passagesEl = document.getElementById('debug-passages-count');
            
            if (loggedInEl) {
                loggedInEl.innerHTML = window.currentUser 
                    ? `👤 Logged in: <span style="color: #4CAF50;">✓ ${window.currentUser.email || 'YES'}</span>`
                    : `👤 Logged in: <span style="color: #FF6B6B;">✗ NO</span>`;
            }
            
            if (firebaseEl) {
                firebaseEl.innerHTML = window.firebaseReady 
                    ? `🔥 Firebase: <span style="color: #4CAF50;">✓ Ready</span>`
                    : `🔥 Firebase: <span style="color: #FF6B6B;">✗ Not Ready</span>`;
            }
            
            if (vocabEl) {
                vocabEl.innerHTML = `📚 Vocabulary: <span style="color: #4CAF50;">${vocabulary.length}</span>`;
            }
            
            if (passagesEl) {
                passagesEl.innerHTML = `📖 Passages: <span style="color: #4CAF50;">${readingPassages.length}</span>`;
            }
        }
        
        // FORCE RELOAD DATA
        window.forceReloadData = async function() {
            if (!window.currentUser) {
                alert('❌ Not logged in! Please log in first.');
                return;
            }
            
            if (!window.firebaseReady) {
                alert('❌ Firebase not ready! Refresh the page.');
                return;
            }
            
            alert('🔄 Reloading data from Firebase...');
            
            try {
                await loadDataFromFirebase(window.currentUser.uid);
                updateDebugPanel();
                alert('✅ Data reloaded successfully!');
            } catch (error) {
                alert('❌ Error: ' + error.message);
            }
        };
        
        // Update debug panel every 2 seconds
        setInterval(updateDebugPanel, 2000);
        setTimeout(updateDebugPanel, 500); // Initial update
        
        function setupRealtimeSync(userId) {
            console.log('🔄 Real-time sync is active for user:', userId);
        }
        
        // ============================================
        // EMBEDDED MEDIA PLAYERS
        // ============================================
        
        function getEmbeddedPlayer(url) {
            if (!url) return '';
            
            // YouTube
            const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/;
            const youtubeMatch = url.match(youtubeRegex);
            if (youtubeMatch) {
                const videoId = youtubeMatch[1];
                return `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0;">
                    <iframe 
                        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" 
                        src="https://www.youtube.com/embed/${videoId}" 
                        frameborder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowfullscreen>
                    </iframe>
                </div>`;
            }
            
            // Audio files (MP3, WAV, OGG)
            if (url.match(/\.(mp3|wav|ogg|m4a)(\?.*)?$/i)) {
                return `<div style="margin: 1rem 0;">
                    <audio controls style="width: 100%; max-width: 500px;">
                        <source src="${url}" type="audio/mpeg">
                        Votre navigateur ne supporte pas l'élément audio.
                    </audio>
                </div>`;
            }
            
            // Video files (MP4, WEBM)
            if (url.match(/\.(mp4|webm|mov)(\?.*)?$/i)) {
                return `<div style="margin: 1rem 0;">
                    <video controls style="width: 100%; max-width: 600px; border-radius: 8px;">
                        <source src="${url}" type="video/mp4">
                        Votre navigateur ne supporte pas l'élément vidéo.
                    </video>
                </div>`;
            }
            
            return '';
        }
        
        // ============================================
        // AUTO-TRANSLATION (FREE API)
        // ============================================
        
        async function translateText(frenchText) {
            if (!frenchText.trim()) {
                alert('Veuillez entrer du texte à traduire');
                return null;
            }
            
            try {
                // Using MyMemory Translation API (FREE, no key needed!)
                const response = await fetch(
                    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(frenchText)}&langpair=fr|en`
                );
                
                const data = await response.json();
                
                if (data.responseStatus === 200 && data.responseData) {
                    return data.responseData.translatedText;
                } else {
                    throw new Error('Translation failed');
                }
            } catch (error) {
                console.error('Translation error:', error);
                alert('Erreur de traduction. Vérifiez votre connexion internet.');
                return null;
            }
        }
        
        // Translation button for reading transcripts
        const translateReadingBtn = document.getElementById('translate-reading-btn');
        if (translateReadingBtn) {
            translateReadingBtn.addEventListener('click', async () => {
                const frenchText = document.getElementById('reading-transcript-text').value;
                const translationField = document.getElementById('reading-transcript-translation');
                
                translateReadingBtn.disabled = true;
                translateReadingBtn.textContent = 'Traduction en cours...';
                
                const translation = await translateText(frenchText);
                
                if (translation) {
                    translationField.value = translation;
                }
                
                translateReadingBtn.disabled = false;
                translateReadingBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M10 14h4"></path>
                    </svg>
                    Traduire automatiquement
                `;
            });
        }
        
        // Translation button for listening transcripts
        const translateListeningBtn = document.getElementById('translate-listening-btn');
        if (translateListeningBtn) {
            translateListeningBtn.addEventListener('click', async () => {
                const frenchText = document.getElementById('listening-transcript-text').value;
                const translationField = document.getElementById('listening-transcript-translation');
                
                translateListeningBtn.disabled = true;
                translateListeningBtn.textContent = 'Traduction en cours...';
                
                const translation = await translateText(frenchText);
                
                if (translation) {
                    translationField.value = translation;
                }
                
                translateListeningBtn.disabled = false;
                translateListeningBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M10 14h4"></path>
                    </svg>
                    Traduire automatiquement
                `;
            });
        }
        
        // ============================================
        // TRANSCRIPTION LINKING
        // ============================================
        
        // Populate dropdowns with existing materials when opening transcript modals
        function populateTranscriptLinkingDropdowns() {
            // For reading transcripts - link to reading materials
            const readingDropdown = document.getElementById('reading-transcript-linked-material');
            if (readingDropdown && readingList) {
                readingDropdown.innerHTML = '<option value="">Aucun lien</option>';
                readingList.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = item.title;
                    readingDropdown.appendChild(option);
                });
            }
            
            // For listening transcripts - link to listening materials
            const listeningDropdown = document.getElementById('listening-transcript-linked-material');
            if (listeningDropdown && listeningList) {
                listeningDropdown.innerHTML = '<option value="">Aucun lien</option>';
                listeningList.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = item.title;
                    listeningDropdown.appendChild(option);
                });
            }
        }
        
        // Populate listening form with existing transcripts
        function populateListeningTranscriptDropdown() {
            const dropdown = document.getElementById('listening-linked-transcript');
            if (dropdown && listeningTranscripts) {
                dropdown.innerHTML = '<option value="">Aucune transcription</option>';
                listeningTranscripts.forEach(transcript => {
                    const option = document.createElement('option');
                    option.value = transcript.id;
                    option.textContent = transcript.title;
                    dropdown.appendChild(option);
                });
            }
        }
        
        // Call these when opening modals
        document.querySelectorAll('[onclick*="add-reading-transcript-modal"]').forEach(btn => {
            btn.addEventListener('click', populateTranscriptLinkingDropdowns);
        });
        
        document.querySelectorAll('[onclick*="add-listening-transcript-modal"]').forEach(btn => {
            btn.addEventListener('click', populateTranscriptLinkingDropdowns);
        });
        
        // Populate transcript dropdown when opening add-listening modal
        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('add-listening-btn')?.addEventListener('click', populateListeningTranscriptDropdown);
        });

        // Initialize Firebase Auth (Firebase module will call this when ready)
        console.log('📋 initFirebaseAuth function defined and ready');

        // ============================================
        // DICTIONARY LOOKUP FUNCTIONALITY
        // ============================================
        
        let selectedWordForLookup = '';
        
        // Make transcript text clickable when user pastes/loads it
        document.getElementById('listening-transcript-text')?.addEventListener('input', function() {
            makeListeningTranscriptClickable();
        });
        
        function makeListeningTranscriptClickable() {
            const text = document.getElementById('listening-transcript-text')?.value.trim();
            const transcriptArea = document.getElementById('listening-clickable-transcript-area');
            
            if (!text) {
                if (transcriptArea) transcriptArea.style.display = 'none';
                return;
            }
            
            // Split text into words while preserving punctuation
            const words = text.split(/(\s+|[.,!?;:…—\-\n]+)/);
            
            const clickableHTML = words.map(word => {
                // If it's a word (not whitespace/punctuation), make it clickable
                if (word.trim() && /[a-zA-ZÀ-ÿ]/.test(word)) {
                    const cleanWord = word.trim();
                    return `<span class="clickable-word" data-word="${cleanWord}" style="cursor: pointer; padding: 2px 4px; border-radius: 3px; transition: background 0.2s;">${word}</span>`;
                }
                return word;
            }).join('');
            
            const clickableTranscript = document.getElementById('listening-clickable-transcript');
            if (clickableTranscript) clickableTranscript.innerHTML = clickableHTML;
            if (transcriptArea) transcriptArea.style.display = 'block';
            
            // Add event listeners to all clickable words
            document.querySelectorAll('#listening-clickable-transcript .clickable-word').forEach(span => {
                span.addEventListener('click', function() {
                    const word = this.getAttribute('data-word');
                    openDictionaryLookup(word);
                });
                span.addEventListener('mouseover', function() {
                    this.style.background = '#ffd700';
                });
                span.addEventListener('mouseout', function() {
                    this.style.background = 'transparent';
                });
            });
        }
        
        function escapeForJS(str) {
            return str.replace(/'/g, "\\'").replace(/"/g, "&quot;").replace(/\n/g, ' ');
        }
        
        function openDictionaryLookup(word) {
            // Clean the word (remove punctuation)
            const cleanWord = word.replace(/[.,!?;:…—\-"'«»]/g, '').trim();
            
            selectedWordForLookup = cleanWord;
            document.getElementById('dictionary-word-input').value = cleanWord;
            
            // Show/hide reading passage quick actions
            const quickActions = document.getElementById('reading-passage-quick-actions');
            if (quickActions) {
                if (window.currentReadingPassageId) {
                    quickActions.style.display = 'block';
                } else {
                    quickActions.style.display = 'none';
                }
            }
            
            // Show the modal
            document.getElementById('dictionary-lookup-modal').classList.add('active');
            
            // Fetch translation
            fetchTranslationForLookup(cleanWord);
        }
        
        async function fetchTranslationForLookup(word) {
            const translationDisplay = document.getElementById('translation-display');
            const translationText = document.getElementById('translation-text');
            const translationLoading = document.getElementById('translation-loading');
            
            if (!translationDisplay || !translationText || !translationLoading) {
                console.warn('Translation elements not found');
                return;
            }
            
            // Clear previous value
            translationText.value = '';
            
            // Show loading
            translationDisplay.style.display = 'block';
            translationLoading.style.display = 'block';
            translationText.style.display = 'none';
            
            try {
                const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=fr|en`);
                const data = await response.json();
                
                if (data && data.responseData && data.responseData.translatedText) {
                    const translation = data.responseData.translatedText;
                    // Check if translation is valid and not just the same as input
                    if (translation && translation.toLowerCase() !== word.toLowerCase()) {
                        translationText.value = translation;
                    } else {
                        translationText.value = 'Traduction non disponible - veuillez entrer manuellement';
                    }
                    translationText.style.display = 'block';
                    translationLoading.style.display = 'none';
                } else {
                    translationText.value = 'Traduction non disponible - veuillez entrer manuellement';
                    translationText.style.display = 'block';
                    translationLoading.style.display = 'none';
                }
            } catch (error) {
                console.error('Translation error:', error);
                translationText.value = 'Erreur de traduction - veuillez entrer manuellement';
                translationText.style.display = 'block';
                translationLoading.style.display = 'none';
            }
        }
        
        function addWordToJardinFromLookup() {
            const word = document.getElementById('dictionary-word-input').value.trim();
            const translation = document.getElementById('translation-text').value;
            
            if (!word) {
                alert('Veuillez entrer un mot');
                return;
            }
            
            // If coming from reading passage, mark as unknown
            if (window.currentReadingPassageId) {
                markWordAsUnknownInPassage(word);
                window.currentReadingPassageId = null; // Reset
            }
            
            // Close the dictionary modal
            closeDictionaryLookup();
            
            // Open the word modal with pre-filled data
            document.getElementById('word-modal').classList.add('active');
            document.getElementById('word-input').value = word;
            document.getElementById('meaning-input').value = translation && translation !== 'Chargement...' && translation !== 'Traduction non disponible' && translation !== 'Erreur de traduction' ? translation : '';
            
            // Focus on the meaning input if translation didn't work
            if (!document.getElementById('meaning-input').value) {
                document.getElementById('meaning-input').focus();
            }
        }
        
        function closeDictionaryLookup() {
            document.getElementById('dictionary-lookup-modal').classList.remove('active');
            window.currentReadingPassageId = null; // Reset passage context
        }
        
        window.markWordAsUnknownInPassageFromModal = function() {
            const word = document.getElementById('dictionary-word-input').value.trim();
            if (word && window.currentReadingPassageId) {
                markWordAsUnknownInPassage(word);
                closeDictionaryLookup();
            }
        };
        
        // Toggle transcript collapse/expand
        let transcriptExpanded = true;
        document.getElementById('toggle-transcript-btn')?.addEventListener('click', function() {
            const transcript = document.getElementById('listening-clickable-transcript');
            const chevron = document.getElementById('transcript-chevron');
            const toggleText = document.getElementById('transcript-toggle-text');
            
            if (transcriptExpanded) {
                // Collapse
                transcript.style.maxHeight = '0px';
                transcript.style.padding = '0 1.5rem';
                transcript.style.overflow = 'hidden';
                chevron.style.transform = 'rotate(-90deg)';
                toggleText.textContent = 'Déplier';
                transcriptExpanded = false;
            } else {
                // Expand
                transcript.style.maxHeight = '400px';
                transcript.style.padding = '1.5rem';
                transcript.style.overflow = 'auto';
                chevron.style.transform = 'rotate(0deg)';
                toggleText.textContent = 'Replier';
                transcriptExpanded = true;
            }
        });
        
        function openDictionary(type) {
            const word = document.getElementById('dictionary-word-input').value.trim();
            
            if (!word) {
                alert('Veuillez entrer un mot');
                return;
            }
            
            let url = '';
            
            switch(type) {
                case 'collins':
                    url = `https://www.collinsdictionary.com/dictionary/french-english/${encodeURIComponent(word)}`;
                    break;
                case 'reverso':
                    url = `https://context.reverso.net/translation/french-english/${encodeURIComponent(word)}`;
                    break;
                case 'linguee':
                    url = `https://www.linguee.com/french-english/search?query=${encodeURIComponent(word)}`;
                    break;
            }
            
            if (url) {
                window.open(url, '_blank');
            }
        }
        
        // Open dictionary from word lookup modal
        function openDictionaryFromLookup(type) {
            const word = document.getElementById('lookup-word-input').value.trim();
            
            if (!word) {
                alert('Veuillez entrer un mot');
                return;
            }
            
            let url = '';
            
            switch(type) {
                case 'collins':
                    url = `https://www.collinsdictionary.com/dictionary/french-english/${encodeURIComponent(word)}`;
                    break;
                case 'reverso':
                    url = `https://context.reverso.net/translation/french-english/${encodeURIComponent(word)}`;
                    break;
                case 'linguee':
                    url = `https://www.linguee.com/french-english/search?query=${encodeURIComponent(word)}`;
                    break;
            }
            
            if (url) {
                window.open(url, '_blank');
            }
        }
        
        // Close modal when clicking outside
        document.getElementById('dictionary-lookup-modal')?.addEventListener('click', function(e) {
            if (e.target === this) {
                closeDictionaryLookup();
            }
        });
        
        // Also trigger makeListeningTranscriptClickable when modal is opened
        const listeningTranscriptModal = document.querySelector('[onclick*="add-listening-transcript-modal"]');
        if (listeningTranscriptModal) {
            listeningTranscriptModal.addEventListener('click', function() {
                setTimeout(makeListeningTranscriptClickable, 100);
            });
        }

        // ============================================
        // ENHANCED LISTENING PLAYER FUNCTIONALITY
        // ============================================
        
        let youtubePlayer = null;
        let currentListeningItem = null;
        let playerUpdateInterval = null;
        let isLooping = false;
        let abRepeatMode = false;
        let abRepeatStart = null;
        let abRepeatEnd = null;

        // Load YouTube IFrame API
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        // YouTube API ready callback
        window.onYouTubeIframeAPIReady = function() {
            console.log('✅ YouTube IFrame API ready!');
        };

        // Parse transcript from various formats
        window.parseTranscript = function(text) {
            if (!text || !text.trim()) return null;

            const lines = text.split('\n').filter(l => l.trim());
            const parsed = [];
            let currentTime = null;
            let currentText = '';

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // Skip empty lines
                if (!line) continue;

                // Try to match various timestamp formats
                // Format 1: [00:15] or [0:15]
                let match = line.match(/^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*(.*)$/);
                
                // Format 2: 00:15:00 --> 00:18:00 (SRT format)
                if (!match) {
                    match = line.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*-->\s*/);
                    if (match && i + 1 < lines.length) {
                        const nextLine = lines[i + 1].trim();
                        currentTime = parseInt(match[1]) * 60 + parseInt(match[2]) + (match[3] ? parseInt(match[3]) : 0);
                        currentText = nextLine;
                        i++; // Skip the text line since we just read it
                        parsed.push({ time: currentTime, text: currentText });
                        continue;
                    }
                }

                // Format 3: Plain timestamp at start
                if (!match) {
                    match = line.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(.+)$/);
                }

                if (match) {
                    const minutes = parseInt(match[1]);
                    const seconds = parseInt(match[2]);
                    const milliseconds = match[3] ? parseInt(match[3]) : 0;
                    currentTime = minutes * 60 + seconds + milliseconds;
                    currentText = match[4] || '';
                    
                    if (currentText) {
                        parsed.push({ time: currentTime, text: currentText });
                    }
                } else if (currentTime !== null && line && !line.match(/^\d+$/)) {
                    // If we have a time but no new timestamp, this is continuation text
                    currentText += ' ' + line;
                    if (parsed.length > 0) {
                        parsed[parsed.length - 1].text = currentText;
                    }
                }
            }

            return parsed.length > 0 ? parsed : null;
        };

        // Fetch YouTube title
        window.fetchYouTubeTitle = async function() {
            const url = document.getElementById('listening-media-url').value.trim();
            const videoId = extractYouTubeID(url);
            
            if (!videoId) {
                alert('URL YouTube invalide. Exemple: https://youtube.com/watch?v=VIDEO_ID');
                return;
            }

            const btn = document.getElementById('fetch-yt-title-btn');
            btn.disabled = true;
            btn.innerHTML = '<span style="opacity: 0.6;">Chargement...</span>';

            try {
                // Using oEmbed API (no API key needed!)
                const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
                const data = await response.json();
                
                if (data.title) {
                    document.getElementById('listening-title').value = data.title;
                    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px; margin-right: 0.4rem; vertical-align: middle;"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>Fait !';
                    setTimeout(() => {
                        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px; margin-right: 0.4rem; vertical-align: middle;"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>Auto-remplir';
                        btn.disabled = false;
                    }, 2000);
                } else {
                    throw new Error('Titre non trouvé');
                }
            } catch (error) {
                console.error('Error fetching YouTube title:', error);
                alert('Impossible de récupérer le titre. Vérifiez l\'URL.');
                btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px; margin-right: 0.4rem; vertical-align: middle;"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>Auto-remplir';
                btn.disabled = false;
            }
        };

        // Fetch YouTube title for edit form
        window.fetchYouTubeTitleEdit = async function() {
            const url = document.getElementById('edit-listening-media-url').value.trim();
            const videoId = extractYouTubeID(url);
            
            if (!videoId) {
                alert('URL YouTube invalide');
                return;
            }

            try {
                const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
                const data = await response.json();
                
                if (data.title) {
                    document.getElementById('edit-listening-title').value = data.title;
                }
            } catch (error) {
                console.error('Error fetching title:', error);
                alert('Impossible de récupérer le titre');
            }
        };

        // Extract YouTube video ID from URL
        function extractYouTubeID(url) {
            if (!url) return null;
            
            // Standard watch URL
            let match = url.match(/[?&]v=([^&]+)/);
            if (match) return match[1];
            
            // Short URL
            match = url.match(/youtu\.be\/([^?&]+)/);
            if (match) return match[1];
            
            // Embed URL
            match = url.match(/youtube\.com\/embed\/([^?&]+)/);
            if (match) return match[1];
            
            return null;
        }

        // Open listening player
        window.openListeningPlayer = function(itemId) {
            console.log('🎵 openListeningPlayer called for itemId:', itemId);
            
            // FORCE reload from localStorage to ensure fresh data
            try {
                const freshData = localStorage.getItem('listeningList');
                if (freshData) {
                    const freshList = JSON.parse(freshData);
                    console.log('🔄 Force-reloaded listeningList from localStorage');
                    listeningList = freshList;
                }
            } catch (e) {
                console.error('Failed to reload from localStorage:', e);
            }
            
            const item = listeningList.find(l => l.id === itemId);
            if (!item) {
                console.error('❌ Item not found!');
                alert('ERROR: Item not found! ID: ' + itemId);
                return;
            }

            console.log('📦 Found item:', item.title);
            console.log('📝 Item.transcript exists?', !!item.transcript);
            console.log('📝 Item.transcript type:', typeof item.transcript);
            console.log('📝 Item.transcript length:', item.transcript ? item.transcript.length : 'N/A');
            console.log('📝 Item.transcript value:', item.transcript);
            console.log('📝 Item.transcriptText exists?', !!item.transcriptText);
            console.log('📝 Item.transcriptText:', item.transcriptText);
            
            // If transcript is missing but transcriptText exists, re-parse it
            if (!item.transcript && item.transcriptText) {
                console.log('⚠️ Transcript missing but text exists - reparsing...');
                item.transcript = window.parseTranscript(item.transcriptText);
                console.log('✅ Reparsed transcript:', item.transcript);
            }
            
            currentListeningItem = item;
            
            // Set title
            const playerTitle = document.getElementById('player-title');
            if (playerTitle) playerTitle.textContent = item.title;

            // Show modal
            const playerModal = document.getElementById('listening-player-modal');
            if (playerModal) playerModal.style.display = 'flex';

            // Set progress select
            const progressSelect = document.getElementById('player-progress-select');
            if (progressSelect) {
                progressSelect.value = item.progress || 'not-started';
                updateProgressStars(item.progress || 'not-started');
            }

            // Load YouTube player
            const videoId = extractYouTubeID(item.mediaUrl);
            if (videoId) {
                const youtubeWrapper = document.getElementById('youtube-player-wrapper');
                if (youtubeWrapper) youtubeWrapper.style.display = 'block';
                
                if (youtubePlayer) {
                    youtubePlayer.loadVideoById(videoId);
                } else {
                    youtubePlayer = new YT.Player('youtube-player', {
                        height: '100%',
                        width: '100%',
                        videoId: videoId,
                        playerVars: {
                            'playsinline': 1
                        },
                        events: {
                            'onReady': onPlayerReady,
                            'onStateChange': onPlayerStateChange
                        }
                    });
                }
            }

            // Load transcript
            console.log('🔄 Calling loadTranscript with:', item.transcript);
            loadTranscript(item.transcript);

            // Start tracking time for highlighting
            startPlayerTracking();
        };

        // Close listening player
        window.closeListeningPlayer = function() {
            const playerModal = document.getElementById('listening-player-modal');
            if (playerModal) playerModal.style.display = 'none';
            
            if (youtubePlayer) {
                youtubePlayer.pauseVideo();
            }
            
            stopPlayerTracking();
            currentListeningItem = null;
            abRepeatMode = false;
            isLooping = false;
        };

        function onPlayerReady(event) {
            console.log('Player ready!');
        }

        function onPlayerStateChange(event) {
            const playIcon = document.getElementById('play-icon');
            const pauseIcon = document.getElementById('pause-icon');
            
            if (event.data === YT.PlayerState.PLAYING) {
                if (playIcon) playIcon.style.display = 'none';
                if (pauseIcon) pauseIcon.style.display = 'block';
            } else {
                if (playIcon) playIcon.style.display = 'block';
                if (pauseIcon) pauseIcon.style.display = 'none';
            }
        }

        // Player controls
        window.togglePlayPause = function() {
            if (!youtubePlayer) return;
            
            const state = youtubePlayer.getPlayerState();
            if (state === YT.PlayerState.PLAYING) {
                youtubePlayer.pauseVideo();
            } else {
                youtubePlayer.playVideo();
            }
        };

        window.skipBackward = function() {
            if (!youtubePlayer) return;
            const currentTime = youtubePlayer.getCurrentTime();
            youtubePlayer.seekTo(Math.max(0, currentTime - 5), true);
        };

        window.skipForward = function() {
            if (!youtubePlayer) return;
            const currentTime = youtubePlayer.getCurrentTime();
            youtubePlayer.seekTo(currentTime + 5, true);
        };

        window.setSpeed = function(speed) {
            if (!youtubePlayer) return;
            youtubePlayer.setPlaybackRate(speed);
            
            // Update active button
            document.querySelectorAll('.speed-btn').forEach(btn => {
                btn.classList.remove('active');
                if (parseFloat(btn.dataset.speed) === speed) {
                    btn.classList.add('active');
                }
            });
        };

        window.toggleLoop = function() {
            isLooping = !isLooping;
            const btn = document.getElementById('loop-btn');
            if (isLooping) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        };

        window.toggleABRepeat = function() {
            if (!youtubePlayer) return;

            if (!abRepeatMode) {
                // Set point A
                abRepeatStart = youtubePlayer.getCurrentTime();
                abRepeatEnd = null;
                abRepeatMode = true;
                const abBtn = document.getElementById('ab-repeat-btn');
                const abIndicator = document.getElementById('ab-indicator');
                const abRange = document.getElementById('ab-range');
                
                if (abBtn) abBtn.classList.add('active');
                if (abIndicator) abIndicator.style.display = 'block';
                if (abRange) abRange.textContent = formatTime(abRepeatStart) + ' - ?';
            } else if (abRepeatStart !== null && abRepeatEnd === null) {
                // Set point B
                abRepeatEnd = youtubePlayer.getCurrentTime();
                if (abRepeatEnd <= abRepeatStart) {
                    alert('Le point B doit être après le point A !');
                    return;
                }
                const abRange = document.getElementById('ab-range');
                if (abRange) abRange.textContent = formatTime(abRepeatStart) + ' - ' + formatTime(abRepeatEnd);
            }
        };

        window.clearABRepeat = function() {
            abRepeatMode = false;
            abRepeatStart = null;
            abRepeatEnd = null;
            const abBtn = document.getElementById('ab-repeat-btn');
            const abIndicator = document.getElementById('ab-indicator');
            
            if (abBtn) abBtn.classList.remove('active');
            if (abIndicator) abIndicator.style.display = 'none';
        };

        // Update progress
        window.updatePlayerProgress = function() {
            if (!currentListeningItem) return;
            
            const newProgress = document.getElementById('player-progress-select').value;
            updateProgressStars(newProgress);
            
            // Update in listeningList
            const index = listeningList.findIndex(l => l.id === currentListeningItem.id);
            if (index !== -1) {
                listeningList[index].progress = newProgress;
                currentListeningItem.progress = newProgress;
                syncToFirebase();
                renderListeningList();
            }
        };

        function updateProgressStars(progress) {
            const starsContainer = document.getElementById('progress-stars');
            const starCounts = {
                'not-started': 0,
                'working': 3,
                'reviewing': 4,
                'mastered': 5
            };
            
            const activeCount = starCounts[progress] || 0;
            const stars = [];
            
            for (let i = 0; i < 5; i++) {
                if (i < activeCount) {
                    stars.push('<span class="star">⭐</span>');
                } else {
                    stars.push('<span class="star inactive">☆</span>');
                }
            }
            
            starsContainer.innerHTML = stars.join('');
        }

        // Load and render transcript
        function loadTranscript(transcript) {
            console.log('📝 loadTranscript called with:', transcript);
            console.log('📝 Transcript type:', typeof transcript);
            console.log('📝 Transcript length:', transcript ? transcript.length : 'null');
            
            // VISIBLE DEBUG FOR PHONE
            if (!transcript) {
                alert('DEBUG: transcript is null or undefined');
            } else if (transcript.length === 0) {
                alert('DEBUG: transcript exists but length is 0');
            } else {
                alert('DEBUG: transcript has ' + transcript.length + ' lines! First line: ' + JSON.stringify(transcript[0]));
            }
            
            const container = document.getElementById('transcript-content');
            
            if (!transcript || transcript.length === 0) {
                console.log('⚠️ No transcript available - showing placeholder');
                container.innerHTML = '<p style="color: var(--text-soft); text-align: center; padding: 2rem;">Aucune transcription disponible</p>';
                return;
            }

            console.log('✅ Loading transcript with', transcript.length, 'lines');
            
            // Store known/unknown words status
            if (!window.transcriptWordStatus) {
                window.transcriptWordStatus = {};
            }
            
            container.innerHTML = transcript.map((line, index) => {
                // Split line into words and make each clickable
                const words = line.text.split(/(\s+|[.,!?;:—])/);
                const clickableText = words.map(token => {
                    // Skip whitespace and punctuation
                    if (!token.trim() || /^[.,!?;:—\s]+$/.test(token)) {
                        return token;
                    }
                    
                    const normalizedWord = token.toLowerCase().replace(/[.,!?;:—]/g, '');
                    const status = window.transcriptWordStatus[normalizedWord] || '';
                    const colorClass = status === 'unknown' ? 'word-unknown' : status === 'known' ? 'word-known' : '';
                    
                    return `<span class="clickable-transcript-word ${colorClass}" data-word="${normalizedWord}" data-original="${token}">${token}</span>`;
                }).join('');
                
                return `
                    <div class="transcript-line" data-time="${line.time}">
                        <span class="transcript-timestamp" onclick="jumpToTime(${line.time})">${formatTime(line.time)}</span>
                        <span class="transcript-text">${clickableText}</span>
                    </div>
                `;
            }).join('');
            
            // Attach click listeners to words
            container.querySelectorAll('.clickable-transcript-word').forEach(wordEl => {
                wordEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const word = wordEl.dataset.word;
                    const original = wordEl.dataset.original;
                    handleWordClick(word, original, wordEl);
                });
            });
        }

        window.jumpToTime = function(time) {
            if (!youtubePlayer) return;
            youtubePlayer.seekTo(time, true);
            youtubePlayer.playVideo();
        };

        function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        // Player tracking for transcript highlighting and A-B repeat
        function startPlayerTracking() {
            stopPlayerTracking();
            
            playerUpdateInterval = setInterval(() => {
                if (!youtubePlayer || !currentListeningItem) return;
                
                try {
                    const currentTime = youtubePlayer.getCurrentTime();
                    
                    // Highlight current transcript line
                    if (currentListeningItem.transcript) {
                        highlightCurrentLine(currentTime);
                    }
                    
                    // Handle A-B repeat
                    if (abRepeatMode && abRepeatStart !== null && abRepeatEnd !== null) {
                        if (currentTime >= abRepeatEnd) {
                            youtubePlayer.seekTo(abRepeatStart, true);
                        }
                    }
                    
                    // Handle simple loop
                    if (isLooping && youtubePlayer.getPlayerState() === YT.PlayerState.ENDED) {
                        youtubePlayer.seekTo(0, true);
                        youtubePlayer.playVideo();
                    }
                } catch (e) {
                    // Player might not be ready yet
                }
            }, 200);
        }

        function stopPlayerTracking() {
            if (playerUpdateInterval) {
                clearInterval(playerUpdateInterval);
                playerUpdateInterval = null;
            }
        }

        function highlightCurrentLine(currentTime) {
            const lines = document.querySelectorAll('.transcript-line');
            let activeIndex = -1;
            
            // Find the current line
            for (let i = 0; i < lines.length; i++) {
                const lineTime = parseFloat(lines[i].dataset.time);
                if (currentTime >= lineTime) {
                    activeIndex = i;
                } else {
                    break;
                }
            }
            
            // Update highlights
            lines.forEach((line, index) => {
                if (index === activeIndex) {
                    line.classList.add('active');
                } else {
                    line.classList.remove('active');
                }
            });
            
            // Auto-scroll to active line
            if (activeIndex >= 0 && lines[activeIndex]) {
                lines[activeIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

    </script>

    <!-- Firebase Status Bar (visible on screen for mobile debugging) -->
    <!-- Floating Quick Actions -->
    <div class="floating-actions" id="floating-actions">
        <button class="floating-btn-main" id="floating-main" aria-label="Quick actions">
            <svg class="plus-icon" viewBox="0 0 24 24" fill="#A64253" stroke="none">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            <svg class="close-icon" viewBox="0 0 24 24" fill="none" stroke="#A64253" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>

        <div class="floating-menu" id="floating-menu">
            <button class="floating-btn-action" id="quick-add-word" title="Ajouter un mot">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22c4.97 0 9-4.03 9-9-4.97 0-9 4.03-9 9zM5.6 10.25c0 1.38 1.12 2.5 2.5 2.5.53 0 1.01-.16 1.42-.44l-.02.19c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5l-.02-.19c.4.28.89.44 1.42.44 1.38 0 2.5-1.12 2.5-2.5 0-1.25-.93-2.3-2.14-2.46.4-.49.64-1.1.64-1.79 0-1.38-1.12-2.5-2.5-2.5-.53 0-1.01.16-1.42.44l.02-.19C12.5 2.12 11.38 1 10 1S7.5 2.12 7.5 3.5l.02.19c-.4-.28-.89-.44-1.42-.44-1.38 0-2.5 1.12-2.5 2.5 0 .69.24 1.3.64 1.79-1.21.16-2.14 1.21-2.14 2.46z"/>
                </svg>
                <span>Mot</span>
            </button>

            <button class="floating-btn-action" id="quick-start-timer" title="Démarrer le minuteur">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span>Timer</span>
            </button>

            <button class="floating-btn-action" id="quick-flip-cards" title="Pratiquer avec cartes">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                    <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
                <span>Cartes</span>
            </button>
        </div>
    </div>

    <!-- Music Player Modal -->
    <div class="music-modal" id="music-modal">
        <div class="music-modal-content">
            <button class="music-modal-close" id="close-music-modal" onclick="document.getElementById('music-modal').classList.remove('active')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>

            <div class="music-modal-title">Musique d'ambiance</div>
            <div class="music-modal-subtitle">Étudie avec des sons apaisants</div>

            <div class="music-player-card">
                <div class="music-album-art">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                    </svg>
                    <div class="music-wave"></div>
                </div>

                <div class="music-now-playing">
                    <div class="music-track-name" id="current-track-name">Sélectionne une piste</div>
                    <div class="music-track-artist">Musique d'étude</div>
                </div>

                <div class="music-controls-main">
                    <button class="music-play-btn" id="modal-music-toggle">
                        <svg class="play-icon" viewBox="0 0 24 24">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                        <svg class="pause-icon" viewBox="0 0 24 24" style="display: none;">
                            <rect x="6" y="4" width="4" height="16"></rect>
                            <rect x="14" y="4" width="4" height="16"></rect>
                        </svg>
                    </button>
                </div>

                <div class="music-volume-section">
                    <svg class="music-volume-icon" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" stroke-width="2" fill="none"></path>
                    </svg>
                    <input type="range" class="music-volume-slider" id="modal-volume-slider" min="0" max="100" value="50">
                </div>
            </div>

            <div class="music-playlist">
                <div class="music-playlist-title">Playlist</div>
                
                <div class="music-track-item" data-src="sound1.mp3" data-name="Ambient Study">
                    <div class="music-track-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="12" r="2"></circle>
                            <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path>
                        </svg>
                    </div>
                    <div class="music-track-info">
                        <div class="music-track-info-name">Ambient Study</div>
                        <div class="music-track-info-duration">Lofi ambiance</div>
                    </div>
                </div>

                <div class="music-track-item" data-src="sound2.mp3" data-name="Peaceful Piano">
                    <div class="music-track-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 2v19.5L3 18v-3h-.5A2.5 2.5 0 0 1 0 12.5v-9A2.5 2.5 0 0 1 2.5 1H3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1zM0 12.5v.5h2.5a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 0-.5-.5H0v2.5z"></path>
                        </svg>
                    </div>
                    <div class="music-track-info">
                        <div class="music-track-info-name">Peaceful Piano</div>
                        <div class="music-track-info-duration">Piano classique</div>
                    </div>
                </div>

                <div class="music-track-item" data-src="sound3.mp3" data-name="Nature Sounds">
                    <div class="music-track-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.30C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z"></path>
                        </svg>
                    </div>
                    <div class="music-track-info">
                        <div class="music-track-info-name">Nature Sounds</div>
                        <div class="music-track-info-duration">Forêt & oiseaux</div>
                    </div>
                </div>

                <div class="music-track-item" data-src="sound4.mp3" data-name="Lo-fi Beats">
                    <div class="music-track-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                            <path d="M16 3h-2v4h2V3zM10 3H8v4h2V3z"></path>
                        </svg>
                    </div>
                    <div class="music-track-info">
                        <div class="music-track-info-name">Lo-fi Beats</div>
                        <div class="music-track-info-duration">Chill hip-hop</div>
                    </div>
                </div>

                <div class="music-track-item" data-src="sound5.mp3" data-name="Café Ambiance">
                    <div class="music-track-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z"></path>
                        </svg>
                    </div>
                    <div class="music-track-info">
                        <div class="music-track-info-name">Café Ambiance</div>
                        <div class="music-track-info-duration">Café parisien</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Hidden audio element -->
    <audio id="background-music" loop></audio>

    <!-- Firebase Auth Modal -->
    <div class="modal" id="auth-modal">
        <div class="modal-content" style="max-width: 450px;">
            <div class="modal-header">
                <h2 class="modal-title" id="auth-modal-title">Connexion</h2>
                <button class="close-btn" onclick="closeModal('auth-modal')">&times;</button>
            </div>
            
            <div id="auth-login-view">
                <form id="login-form">
                    <div class="form-group">
                        <label class="form-label">Email</label>
                        <input type="email" class="form-input" id="login-email" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Mot de passe</label>
                        <input type="password" class="form-input" id="login-password" required>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary" style="width: 100%;">Se connecter</button>
                    </div>
                </form>
                
                <div style="text-align: center; margin: 1.5rem 0; color: var(--text-soft);">ou</div>
                
                <button class="btn btn-secondary" id="google-signin-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                    <svg width="18" height="18" viewBox="0 0 18 18">
                        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                        <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
                        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
                    </svg>
                    Continuer avec Google
                </button>
                
                <div style="text-align: center; margin-top: 1.5rem;">
                    <a href="#" id="show-signup" style="color: var(--crimson); text-decoration: none;">Pas encore de compte ? S'inscrire</a>
                </div>
            </div>
            
            <div id="auth-signup-view" style="display: none;">
                <form id="signup-form">
                    <div class="form-group">
                        <label class="form-label">Email</label>
                        <input type="email" class="form-input" id="signup-email" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Mot de passe</label>
                        <input type="password" class="form-input" id="signup-password" required minlength="6">
                        <small style="color: var(--text-soft);">Minimum 6 caractères</small>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary" style="width: 100%;">Créer un compte</button>
                    </div>
                </form>
                
                <div style="text-align: center; margin-top: 1.5rem;">
                    <a href="#" id="show-login" style="color: var(--crimson); text-decoration: none;">Déjà un compte ? Se connecter</a>
                </div>
            </div>
        </div>
    </div>

    <!-- Service Worker Registration -->
    <script>
        // Register Service Worker for PWA functionality
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./service-worker.js')
                    .then((registration) => {
                        console.log('✅ Service Worker registered successfully:', registration.scope);
                        
                        // Check for updates
                        registration.addEventListener('updatefound', () => {
                            const newWorker = registration.installing;
                            console.log('🔄 Service Worker update found!');
                        });
                    })
                    .catch((error) => {
                        console.log('❌ Service Worker registration failed:', error);
                    });
            });

            // Handle service worker updates
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!refreshing) {
                    refreshing = true;
                    window.location.reload();
                }
            });
        }

        // Prompt for installation
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later
            deferredPrompt = e;
            
            // Show the install button!
            console.log('💾 PWA Install prompt available');
            const installContainer = document.getElementById('install-button-container');
            if (installContainer) {
                installContainer.style.display = 'block';
            }
        });

        // Handle install button click
        const installBtn = document.getElementById('pwa-install-btn');
        if (installBtn) {
            installBtn.addEventListener('click', async () => {
                if (!deferredPrompt) {
                    console.log('⚠️ No install prompt available');
                    return;
                }

                // Show the install prompt
                deferredPrompt.prompt();

                // Wait for the user to respond
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response: ${outcome}`);

                if (outcome === 'accepted') {
                    console.log('✅ User accepted install');
                } else {
                    console.log('❌ User dismissed install');
                }

                // Clear the deferred prompt
                deferredPrompt = null;

                // Hide the button
                const installContainer = document.getElementById('install-button-container');
                if (installContainer) {
                    installContainer.style.display = 'none';
                }
            });
        }

        // Track installation
        window.addEventListener('appinstalled', () => {
            console.log('✅ PWA installed successfully!');
            deferredPrompt = null;
            
            // Hide the button
            const installContainer = document.getElementById('install-button-container');
            if (installContainer) {
                installContainer.style.display = 'none';
            }
        });
    </script>

    <!-- Word Analysis Popup -->
    <div id="word-analysis-overlay" class="word-analysis-overlay" style="display: none;" onclick="closeWordAnalysisPopup()"></div>
    <div id="word-analysis-popup" class="word-analysis-popup" style="display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3 style="font-family: 'Cormorant Garamond', serif; font-size: 1.5rem; margin: 0;">Analyser le mot</h3>
            <button onclick="closeWordAnalysisPopup()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-soft);">&times;</button>
        </div>
        
        <div class="form-group">
            <label class="form-label">Le mot</label>
            <input type="text" class="form-input" id="word-analysis-word" style="font-size: 1.2rem; font-weight: 500;">
        </div>
        
        <div class="form-group">
            <label class="form-label">Ma signification</label>
            <textarea class="form-textarea" id="word-analysis-meaning" placeholder="Écris ce que ce mot signifie pour toi..." rows="3"></textarea>
        </div>
        
        <div style="margin: 1rem 0; padding: 1rem; background: var(--whisper); border-radius: 8px;">
            <div style="font-size: 0.9rem; font-weight: 500; margin-bottom: 0.5rem; color: var(--text-soft);">📚 Dictionnaires:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                <a id="link-wordreference" href="#" target="_blank" class="btn btn-secondary" style="font-size: 0.85rem; padding: 0.4rem 0.8rem; text-decoration: none;">
                    WordReference
                </a>
                <a id="link-reverso" href="#" target="_blank" class="btn btn-secondary" style="font-size: 0.85rem; padding: 0.4rem 0.8rem; text-decoration: none;">
                    Reverso
                </a>
                <a id="link-collins" href="#" target="_blank" class="btn btn-secondary" style="font-size: 0.85rem; padding: 0.4rem 0.8rem; text-decoration: none;">
                    Collins
                </a>
                <a id="link-larousse" href="#" target="_blank" class="btn btn-secondary" style="font-size: 0.85rem; padding: 0.4rem 0.8rem; text-decoration: none;">
                    Larousse
                </a>
            </div>
        </div>
        
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1.5rem;">
            <button class="btn btn-secondary" onclick="markWordUnknown()" style="flex: 1; min-width: 150px; background: #ff a500; color: white; border: none;">
                🟠 Je ne connais pas
            </button>
            <button class="btn btn-primary" onclick="addWordToJardin()" style="flex: 1; min-width: 150px; background: var(--sage); border: none;">
                🟢 Ajouter au Jardin
            </button>
        </div>
        
        <button class="btn btn-secondary" onclick="closeWordAnalysisPopup()" style="width: 100%; margin-top: 1rem;">
            Fermer
        </button>
    </div>

    <style>
        /* Multi-select inline button */
        .multi-select-inline-btn {
            background: white;
            border: 2px solid var(--rose);
            color: var(--rose);
            width: 32px;
            height: 32px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            padding: 0;
        }
        
        .multi-select-inline-btn:hover {
            background: var(--rose);
            color: white;
        }
        
        .multi-select-inline-btn.active {
            background: var(--rose);
            color: white;
        }
        
        .multi-select-inline-btn:active {
            transform: scale(0.9);
        }
        
        /* Multi-select mode styles */
        .multi-select-active .clickable-transcript-word {
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .clickable-transcript-word.selected {
            background: rgba(139, 70, 84, 0.3);
            border-radius: 3px;
            padding: 2px 4px;
            margin: 0 -4px;
            box-shadow: 0 0 0 2px var(--rose);
        }
        
        #multi-select-toolbar {
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--rose);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 30px;
            box-shadow: 0 8px 24px rgba(139, 70, 84, 0.4);
            display: none;
            align-items: center;
            gap: 1rem;
            z-index: 1000;
            animation: slideUp 0.3s ease;
            flex-wrap: wrap;
            max-width: 90%;
        }
        
        @keyframes slideUp {
            from {
                transform: translateX(-50%) translateY(100%);
                opacity: 0;
            }
            to {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
            }
        }
        
        #multi-select-toolbar.show {
            display: flex;
        }
        
        .toolbar-btn {
            background: white;
            color: var(--rose);
            border: none;
            padding: 0.6rem 1.5rem;
            border-radius: 20px;
            font-weight: 500;
            cursor: pointer;
            font-size: 1rem;
            transition: all 0.2s ease;
            white-space: nowrap;
        }
        
        .toolbar-btn:active {
            transform: scale(0.95);
        }
        
        .toolbar-count {
            font-weight: 600;
            font-size: 1.1rem;
        }
    </style>

    <script>
        let currentAnalyzingWord = null;
        let currentAnalyzingOriginal = null;
        let multiSelectMode = false;
        let selectedWords = new Set();
        let selectedWordElements = new Map(); // Track word -> elements
        
        function toggleMultiSelectMode() {
            multiSelectMode = !multiSelectMode;
            const toggleBtn = document.getElementById('multi-select-toggle');
            const hint = document.getElementById('multi-select-hint');
            const transcriptDiv = document.getElementById('transcript-content');
            
            if (multiSelectMode) {
                toggleBtn.classList.add('active');
                hint.style.display = 'inline';
                if (transcriptDiv) transcriptDiv.classList.add('multi-select-active');
            } else {
                toggleBtn.classList.remove('active');
                hint.style.display = 'none';
                if (transcriptDiv) transcriptDiv.classList.remove('multi-select-active');
                clearSelection();
            }
        }
        
        function clearSelection() {
            selectedWords.clear();
            selectedWordElements.clear();
            document.querySelectorAll('.clickable-transcript-word.selected').forEach(el => {
                el.classList.remove('selected');
            });
            updateToolbar();
        }
        
        function updateToolbar() {
            const toolbar = document.getElementById('multi-select-toolbar');
            const count = document.getElementById('selected-count');
            
            if (selectedWords.size > 0) {
                toolbar.classList.add('show');
                count.textContent = selectedWords.size;
            } else {
                toolbar.classList.remove('show');
            }
        }
        
        function handleWordClick(word, original, element) {
            if (multiSelectMode) {
                // Toggle selection
                if (selectedWords.has(word)) {
                    selectedWords.delete(word);
                    element.classList.remove('selected');
                    if (selectedWordElements.has(word)) {
                        selectedWordElements.get(word).forEach(el => el.classList.remove('selected'));
                        selectedWordElements.delete(word);
                    }
                } else {
                    selectedWords.add(word);
                    element.classList.add('selected');
                    // Mark all instances of this word
                    const allInstances = document.querySelectorAll(`.clickable-transcript-word[data-word="${word}"]`);
                    allInstances.forEach(el => el.classList.add('selected'));
                    selectedWordElements.set(word, Array.from(allInstances));
                }
                updateToolbar();
            } else {
                // Single word analysis (original behavior)
                openWordAnalysisPopup(word, original);
            }
        }
        
        function analyzeSelectedWords() {
            if (selectedWords.size === 0) return;
            
            const words = Array.from(selectedWords);
            const wordText = Array.from(selectedWordElements.keys())
                .map(word => {
                    const el = document.querySelector(`.clickable-transcript-word[data-word="${word}"]`);
                    return el ? el.textContent : word;
                })
                .join(', ');
            
            // Store selected words for batch operations
            window._batchSelectedWords = words;
            
            // Open the analysis popup
            openWordAnalysisPopup(words[0], wordText);
        }
        
        function openWordAnalysisPopup(word, original) {
            currentAnalyzingWord = word;
            currentAnalyzingOriginal = original;
            
            document.getElementById('word-analysis-overlay').style.display = 'block';
            document.getElementById('word-analysis-popup').style.display = 'block';
            document.getElementById('word-analysis-word').value = original;
            document.getElementById('word-analysis-meaning').value = '';
            document.getElementById('word-analysis-meaning').focus();
            
            // Update dictionary links
            const cleanWord = word.toLowerCase();
            document.getElementById('link-wordreference').href = `https://www.wordreference.com/fren/${encodeURIComponent(cleanWord)}`;
            document.getElementById('link-reverso').href = `https://context.reverso.net/translation/french-english/${encodeURIComponent(cleanWord)}`;
            document.getElementById('link-collins').href = `https://www.collinsdictionary.com/dictionary/french-english/${encodeURIComponent(cleanWord)}`;
            document.getElementById('link-larousse').href = `https://www.larousse.fr/dictionnaires/francais/${encodeURIComponent(cleanWord)}`;
        }
        
        function closeWordAnalysisPopup() {
            document.getElementById('word-analysis-overlay').style.display = 'none';
            document.getElementById('word-analysis-popup').style.display = 'none';
            currentAnalyzingWord = null;
            currentAnalyzingOriginal = null;
            window._batchSelectedWords = null;
            if (multiSelectMode) {
                clearSelection();
            }
        }
        
        function markWordUnknown() {
            if (!currentAnalyzingWord) return;
            
            // Check if this is a batch operation
            const batchWords = window._batchSelectedWords || [currentAnalyzingWord];
            
            // Mark word(s) as unknown (orange)
            if (!window.transcriptWordStatus) window.transcriptWordStatus = {};
            
            batchWords.forEach(word => {
                window.transcriptWordStatus[word] = 'unknown';
                
                // Update all instances of this word in transcript
                document.querySelectorAll(`.clickable-transcript-word[data-word="${word}"]`).forEach(el => {
                    el.classList.remove('word-known', 'selected');
                    el.classList.add('word-unknown');
                });
            });
            
            const count = batchWords.length;
            alert(`✅ ${count} mot${count > 1 ? 's' : ''} marqué${count > 1 ? 's' : ''} comme inconnu${count > 1 ? 's' : ''} (orange)`);
            closeWordAnalysisPopup();
        }
        
        function addWordToJardin() {
            if (!currentAnalyzingWord) return;
            
            const wordText = document.getElementById('word-analysis-word').value.trim();
            const meaning = document.getElementById('word-analysis-meaning').value.trim();
            
            if (!meaning) {
                alert('Ajoute une signification pour ce mot!');
                return;
            }
            
            // Check if this is a batch operation
            const batchWords = window._batchSelectedWords || [currentAnalyzingWord];
            
            // Add to vocabulary (Le Jardin)
            const newWord = {
                id: Date.now(),
                word: wordText,
                meaning: meaning,
                article: '',
                gender: '',
                theme: 'transcription',
                week: '',
                quarter: '',
                year: new Date().getFullYear().toString(),
                image: '',
                favorite: false,
                created: new Date().toISOString()
            };
            
            vocabulary.push(newWord);
            syncToFirebase();
            
            // Mark word(s) as known (green)
            if (!window.transcriptWordStatus) window.transcriptWordStatus = {};
            
            batchWords.forEach(word => {
                window.transcriptWordStatus[word] = 'known';
                
                // Update all instances of this word in transcript
                document.querySelectorAll(`.clickable-transcript-word[data-word="${word}"]`).forEach(el => {
                    el.classList.remove('word-unknown', 'selected');
                    el.classList.add('word-known');
                });
            });
            
            // Clear batch words
            window._batchSelectedWords = null;
            clearSelection();
            
            const count = batchWords.length;
            alert(`✅ ${count} mot${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''} au Jardin! (vert)`);
            closeWordAnalysisPopup();
        }
    </script>

    <!-- Multi-select toolbar -->
    <div id="multi-select-toolbar">
        <span class="toolbar-count"><span id="selected-count">0</span> mot(s) sélectionné(s)</span>
        <button class="toolbar-btn" onclick="analyzeSelectedWords()">✨ Analyser</button>
    </div>

</body>
</html>
