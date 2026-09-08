const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length < 6) {
  console.log('Uso: node update-firebase.js <apiKey> <authDomain> <projectId> <storageBucket> <messagingSenderId> <appId>');
  process.exit(1);
}

const [apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId] = args;

const config = `import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "${apiKey}",
  authDomain: "${authDomain}",
  databaseURL: "https://${projectId}-default-rtdb.firebaseio.com",
  projectId: "${projectId}",
  storageBucket: "${storageBucket}",
  messagingSenderId: "${messagingSenderId}",
  appId: "${appId}"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
`;

const empresaPath = path.join(__dirname, 'empresa', 'src', 'firebase.js');
const entregadorPath = path.join(__dirname, 'entregador', 'src', 'firebase.js');

fs.writeFileSync(empresaPath, config);
fs.writeFileSync(entregadorPath, config);

console.log('Firebase atualizado com sucesso em ambos os apps!');
