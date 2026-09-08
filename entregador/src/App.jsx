import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Auth from './Auth';
import Dashboard from './Dashboard';
import 'leaflet/dist/leaflet.css';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) return <div className="loading">Carregando...</div>;

  return user ? <Dashboard user={user} /> : <Auth onAuth={setUser} />;
}

export default App;
