/**
 * firebase.js — Firebase 초기화 + Firestore/Auth 공통 헬퍼
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import {
    getFirestore, doc, setDoc, getDoc, getDocs, deleteDoc,
    collection, query, where, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";
import {
    getAuth, GoogleAuthProvider, signInWithCredential, signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";
import {
    getFunctions, httpsCallable
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-functions.js";

const firebaseConfig = {
    apiKey: "AIzaSyBz_-F3Gp7bK2DvWBGfwjf6jevSnFaHess",
    authDomain: "biblealimi.firebaseapp.com",
    projectId: "biblealimi",
    storageBucket: "biblealimi.firebasestorage.app",
    messagingSenderId: "407329001149",
    appId: "1:407329001149:web:ba286301f3d0ad5d55f1d4",
    measurementId: "G-BG79MS3FZP"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
// Phase E-8/C: suProxy 등 Callable Function 호출용. region은 functions/src와 일치.
const functions = getFunctions(app, "asia-northeast3");

export {
    db, auth, functions,
    doc, setDoc, getDoc, getDocs, deleteDoc,
    collection, query, where, orderBy, limit, serverTimestamp,
    GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged,
    httpsCallable
};
