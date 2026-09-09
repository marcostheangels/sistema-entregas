import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDY7Ea1B6ofAHSmFyyXPnUp9SdebZbF1EU",
  authDomain: "entregadores-e-empresas.firebaseapp.com",
  databaseURL: "https://entregadores-e-empresas-default-rtdb.firebaseio.com",
  projectId: "entregadores-e-empresas",
  storageBucket: "entregadores-e-empresas.firebasestorage.app",
  messagingSenderId: "365779423688",
  appId: "1:365779423688:web:a518b7fee5b849be3bb0fd"
};

// Nome unico por app: separa a sessao de login de cada painel no mesmo navegador
export const app = initializeApp(firebaseConfig, 'conecta-empresa');
export const db = getDatabase(app);
export const auth = getAuth(app);
