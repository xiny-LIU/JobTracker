// FirebaseStore：负责 Google 登录和 Cloud Firestore 云端读写。
// 说明：这个文件使用 Firebase 官方 Web 模块 SDK 的 CDN 引入方式，不需要 npm 或打包工具。
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBeDDg-byQf-mkRlPDijlwAoDyExg4LacQ",
    authDomain: "jobtracker-fcdee.firebaseapp.com",
    projectId: "jobtracker-fcdee",
    storageBucket: "jobtracker-fcdee.firebasestorage.app",
    messagingSenderId: "42260314441",
    appId: "1:42260314441:web:cee2d0ee0522dfb0570298",
    measurementId: "G-VSNHC9N719"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

const FirebaseStore = {
    currentUser: null,
    ready: true,

    getUser() {
        return this.currentUser;
    },

    async signIn() {
        const result = await signInWithPopup(auth, provider);
        this.currentUser = result.user;
        return this.currentUser;
    },

    async signOut() {
        await signOut(auth);
        this.currentUser = null;
    },

    getDocRef() {
        if (!this.currentUser) {
            throw new Error('请先使用 Google 登录');
        }
        return doc(db, 'users', this.currentUser.uid, 'jobtracker', 'main');
    },

    cleanData(data) {
        const copy = JSON.parse(JSON.stringify(data || {}));
        copy.config = { token: '', gistId: '' };
        return copy;
    },

    async upload(data) {
        const clean = this.cleanData(data);
        await setDoc(this.getDocRef(), {
            data: clean,
            updatedAt: serverTimestamp(),
            userEmail: this.currentUser.email || '',
            appName: 'JobTracker'
        }, { merge: true });
    },

    async download() {
        const snap = await getDoc(this.getDocRef());
        if (!snap.exists()) return null;
        const payload = snap.data();
        return payload.data || null;
    }
};

onAuthStateChanged(auth, (user) => {
    FirebaseStore.currentUser = user || null;
    window.dispatchEvent(new CustomEvent('firebase-auth-changed'));
});

window.FirebaseStore = FirebaseStore;
window.dispatchEvent(new CustomEvent('firebase-ready'));
