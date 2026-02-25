import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  projectId: "test-firebase-ed0a6",
  appId: "1:590276637809:web:154f2046331cce9f2617d0",
  storageBucket: "test-firebase-ed0a6.appspot.com",
  apiKey: "AIzaSyBM-SlSxzLSO40Tk45Y1KkPPyWG3sJQHWo",
  authDomain: "test-firebase-ed0a6.firebaseapp.com",
  messagingSenderId: "590276637809",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
