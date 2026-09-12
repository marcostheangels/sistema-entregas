import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, ref, get } from 'firebase/database';

const app = initializeApp({
  apiKey: "AIzaSyDY7Ea1B6ofAHSmFyyXPnUp9SdebZbF1EU",
  authDomain: "entregadores-e-empresas.firebaseapp.com",
  databaseURL: "https://entregadores-e-empresas-default-rtdb.firebaseio.com",
  projectId: "entregadores-e-empresas",
}, 'diag-entrega');
const auth = getAuth(app);
const db = getDatabase(app);

const EMAIL = process.argv[2];
const SENHA = process.argv[3];
const PEDIDO = process.argv[4] || '-P17R43IHGV63i6oyuiH';

await signInWithEmailAndPassword(auth, EMAIL, SENHA);

const [eSnap, rSnap] = await Promise.all([
  get(ref(db, 'entregas/' + PEDIDO)),
  get(ref(db, 'rastreio/' + PEDIDO)),
]);

console.log('entregas/' + PEDIDO + ':', JSON.stringify(eSnap.val(), null, 2));
console.log('rastreio/' + PEDIDO + ':', JSON.stringify(rSnap.val(), null, 2));
process.exit(0);
