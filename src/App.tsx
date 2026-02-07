import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import { ref, get } from 'firebase/database';
import { Whiteboard } from './components/Whiteboard';
import { Presence } from './components/Presence';
import { RoomManager } from './components/RoomManager';
import './index.css';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [currentRoomName, setCurrentRoomName] = useState<string>('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (currentRoomId) {
      get(ref(db, `rooms_meta/${currentRoomId}`)).then(snap => {
        if (snap.exists()) {
          setCurrentRoomName(snap.val().name);
        }
      });
    } else {
      setCurrentRoomName('');
    }
  }, [currentRoomId]);

  const handleLogin = async () => {
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error(error);
      alert("Failed to sign in. Check console for details.");
    }
  };

  if (loading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-white text-slate-800">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="font-bold tracking-widest text-xs uppercase">Initializing</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-slate-50 overflow-hidden relative">
        <div className="z-10 bg-white/50 backdrop-blur-md border border-slate-200 p-12 rounded-[40px] shadow-2xl flex flex-col items-center max-w-md w-full mx-4">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl mb-8 flex items-center justify-center shadow-2xl shadow-blue-200 rotate-12">
            <span className="text-4xl">🎨</span>
            <h1 className="text-5xl font-black text-slate-900 mb-4 tracking-tighter">
              AntiCanvas
            </h1>
          </div>
          <p className="text-slate-500 text-center mb-8 font-medium leading-relaxed">
            Connect and create on a high-fidelity digital workspace. Experience real-time collaboration with zero lag.
          </p>
          <button
            onClick={handleLogin}
            className="w-full py-5 bg-slate-900 hover:bg-black text-white font-bold rounded-2xl shadow-xl transform transition hover:scale-[1.02] active:scale-[0.98]"
          >
            Launch Workspace
          </button>
        </div>
      </div>
    );
  }

  if (!currentRoomId) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center lobby-bg relative p-4">
        <RoomManager onJoin={(id) => setCurrentRoomId(id)} />

        {/* Logged in as badge */}
        <div className="absolute top-8 right-8 bg-white/80 backdrop-blur border border-slate-200 px-5 py-3 rounded-2xl shadow-sm flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"></div>
          <span className="text-sm font-bold text-slate-600 tracking-tight">Active Connection  </span>
          <button onClick={() => auth.signOut()} className="text-[10px] font-black uppercase text-slate-400 hover:text-red-500 ml-4 transition-colors">Sign Out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-white text-slate-800 relative flex flex-col">
      {/* Workspace Header */}
      <header className="workspace-header">
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', height: '100%' }}>
          <button
            onClick={() => setCurrentRoomId(null)}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-500 flex items-center justify-center shrink-0"
            title="Exit to Lobby"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"></path>
              <path d="m12 19-7-7 7-7"></path>
            </svg>
          </button>

          <div className="header-divider" style={{ margin: '0 12px' }}></div>

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0 }}>{currentRoomName}</h2>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px', background: '#ecfdf5', padding: '4px 10px', borderRadius: '100px', border: '1px solid #d1fae5' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]"></div>
              <span style={{ fontSize: '9px', fontWeight: 900, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live</span>
            </div>
          </div>
        </div>

        <Presence user={user} roomId={currentRoomId} />
      </header>

      <main className="flex-1 relative overflow-hidden canvas-container">
        <Whiteboard user={user} roomId={currentRoomId} />
      </main>
    </div>
  );
}

export default App;
