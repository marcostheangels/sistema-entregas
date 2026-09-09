// Diagnostico: simula exatamente a leitura do painel Master
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, ref, get } from 'firebase/database';

const app = initializeApp({
  apiKey: "AIzaSyDY7Ea1B6ofAHSmFyyXPnUp9SdebZbF1EU",
  authDomain: "entregadores-e-empresas.firebaseapp.com",
  databaseURL: "https://entregadores-e-empresas-default-rtdb.firebaseio.com",
  projectId: "entregadores-e-empresas",
}, 'diag-master');
const auth = getAuth(app);
const db = getDatabase(app);

const EMAIL = process.argv[2];
const SENHA = process.argv[3];

await signInWithEmailAndPassword(auth, EMAIL, SENHA);
console.log('Login OK');

const [entregasSnap, posicoesSnap] = await Promise.all([
  get(ref(db, 'entregas')),
  get(ref(db, 'posicoes')),
]);

const entregas = [];
entregasSnap.forEach(c => entregas.push({ id: c.key, ...c.val() }));
const posicoes = posicoesSnap.val() || {};
console.log('\nEntregas lidas pelo Master:', entregas.length);
entregas.forEach(e => console.log(`  ${e.id} status=${e.status} entregadorId=${e.entregadorId || 'NULL'} codigo=${e.codigo || '-'} criado=${e.createdAt || e.criadoEm || '?'}`));

console.log('\nPosicoes online (<120s):');
const agora = Date.now();
Object.entries(posicoes).forEach(([id, p]) => {
  if (p && p.online && agora - (p.timestamp || 0) < 120000) {
    const entrega = entregas.find(e => e.entregadorId === id && !['pendente', 'entregue', 'cancelado'].includes(e.status)) || null;
    console.log(`  ${id} online, timestamp=${p.timestamp}, matchEntrega=${entrega ? entrega.id + ' (' + entrega.status + ')' : 'NULL (Livre)'}`);
  }
});
process.exit(0);
