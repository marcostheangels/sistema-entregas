import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDY7Ea1B6ofAHSmFyyXPnUp9SdebZbF1EU",
  authDomain: "entregadores-e-empresas.firebaseapp.com",
  databaseURL: "https://entregadores-e-empresas-default-rtdb.firebaseio.com",
  projectId: "entregadores-e-empresas",
  storageBucket: "entregadores-e-empresas.firebasestorage.app",
  messagingSenderId: "365779423688",
  appId: "1:365779423688:web:a518b7fee5b849be3bb0fd"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
