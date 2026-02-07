import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { ref, onValue, push, set, get, remove } from 'firebase/database';

interface RoomManagerProps {
    onJoin: (roomId: string) => void;
}

export const RoomManager = ({ onJoin }: RoomManagerProps) => {
    const [rooms, setRooms] = useState<any[]>([]);
    const [newRoomName, setNewRoomName] = useState('');
    const [password, setPassword] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [joiningId, setJoiningId] = useState<string | null>(null);
    const [inputPassword, setInputPassword] = useState('');

    const [activeRooms, setActiveRooms] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const roomsRef = ref(db, 'rooms_meta');
        return onValue(roomsRef, (snap) => {
            const val = snap.val();
            if (val) {
                setRooms(Object.entries(val).map(([id, data]: [string, any]) => ({ id, ...data })));
            } else {
                setRooms([]);
            }
        });
    }, []);

    // Track active status for each room (Presence monitoring)
    useEffect(() => {
        const unsubscribers: (() => void)[] = [];

        rooms.forEach(room => {
            const usersRef = ref(db, `rooms/${room.id}/users`);
            const unsub = onValue(usersRef, (snap) => {
                const count = snap.exists() ? Object.keys(snap.val()).length : 0;
                setActiveRooms(prev => ({ ...prev, [room.id]: count > 0 }));
            });
            unsubscribers.push(unsub);
        });

        return () => unsubscribers.forEach(u => u());
    }, [rooms]);

    // Auto-delete rooms inactive for > 5 minutes (Stable worker)
    useEffect(() => {
        const checkInactivity = async () => {
            try {
                const snap = await get(ref(db, 'rooms_meta'));
                const roomsData = snap.val();
                if (!roomsData) return;

                const now = Date.now();
                const FIVE_MINUTES = 5 * 60 * 1000;

                for (const [id, data] of Object.entries(roomsData) as [string, any][]) {
                    const lastTouch = data.lastActive || data.createdAt;
                    if (now - lastTouch > FIVE_MINUTES) {
                        const usersSnap = await get(ref(db, `rooms/${id}/users`));
                        if (!usersSnap.exists() || Object.keys(usersSnap.val()).length === 0) {
                            console.log(`Cleaning up inactive room: ${data.name}`);
                            await remove(ref(db, `rooms_meta/${id}`));
                            await remove(ref(db, `rooms/${id}`));
                        }
                    }
                }
            } catch (err) {
                console.error("Cleanup error:", err);
            }
        };

        const interval = setInterval(checkInactivity, 60000);
        return () => clearInterval(interval);
    }, []);

    const handleCreate = async () => {
        if (!newRoomName.trim()) return;

        const roomsMetaRef = ref(db, 'rooms_meta');
        const newRoomRef = push(roomsMetaRef);
        const roomId = newRoomRef.key;

        if (roomId) {
            const roomData = {
                name: newRoomName,
                hasPassword: !!password,
                password: password || null,
                createdAt: Date.now()
            };
            try {
                await set(newRoomRef, roomData);
                onJoin(roomId);
            } catch (error: any) {
                console.error("Firebase Error:", error);
                if (error.message.includes('PERMISSION_DENIED')) {
                    alert("Firebase Permission Denied! Please check your Realtime Database Rules tab and set them to: { \".read\": \"auth != null\", \".write\": \"auth != null\" }");
                } else {
                    alert("Failed to create room: " + error.message);
                }
            }
        }
    };

    const handleJoin = async (room: any) => {
        if (room.hasPassword) {
            setJoiningId(room.id);
        } else {
            onJoin(room.id);
        }
    };

    const verifyPassword = async () => {
        const roomRef = ref(db, `rooms_meta/${joiningId}`);
        const snap = await get(roomRef);
        const room = snap.val();

        if (room && room.password === inputPassword) {
            onJoin(joiningId!);
        } else {
            alert("Incorrect password");
        }
    };

    return (
        <div className="z-10 glass-card p-10 rounded-[40px] max-w-7xl w-full mx-8">
            <div className="flex justify-between items-center mb-10">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-1">Workspaces</h2>
                    <p className="text-slate-500 font-medium">Choose a collaborative session or start a new one.</p>
                </div>
                <button
                    onClick={() => { setShowCreate(!showCreate); setJoiningId(null); }}
                    className={`p-4 rounded-2xl transition-all ${showCreate ? 'bg-slate-100 text-slate-600 rotate-45' : 'bg-blue-600 text-white shadow-xl shadow-blue-200'}`}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
            </div>

            {showCreate ? (
                <div className="space-y-6 animate-fade-in-up">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1">Workspace Name</label>
                        <input
                            autoFocus
                            className="w-full input-premium"
                            placeholder="e.g. Marketing Brainstorm"
                            value={newRoomName}
                            onChange={(e) => setNewRoomName(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1">Access Password (Optional)</label>
                        <input
                            className="w-full input-premium"
                            placeholder="Leave blank for public"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={handleCreate}
                        className="w-full btn-primary-premium flex items-center justify-center gap-3"
                    >
                        <span>Create Workspace</span>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                    </button>
                </div>
            ) : joiningId ? (
                <div className="space-y-6 py-4 animate-fade-in-up">
                    <div className="text-center space-y-2">
                        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl mx-auto flex items-center justify-center text-3xl mb-4">🔒</div>
                        <h3 className="text-2xl font-bold text-slate-900">Protected Session</h3>
                        <p className="text-slate-500">This workspace requires a password to enter.</p>
                    </div>
                    <input
                        autoFocus
                        className="w-full input-premium text-center text-2xl tracking-[0.5em] font-mono"
                        type="password"
                        placeholder="••••"
                        value={inputPassword}
                        onChange={(e) => setInputPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && verifyPassword()}
                    />
                    <div style={{ marginTop: '3px' }} className="flex gap-4">
                        <button onClick={() => setJoiningId(null)} className="flex-1 btn-primary-premium">Cancel</button>
                        <div style={{ padding: '3px', display: 'inline-block' }}></div>
                        <button onClick={verifyPassword} className="flex-1 btn-primary-premium">Join Now</button>
                    </div>
                </div>
            ) : (
                <div className="grid gap-4 max-h-[440px] overflow-y-auto pr-2 custom-scrollbar">
                    {(rooms.length === 0) ? (
                        <div className="py-20 text-center space-y-4 rounded-[32px] border-2 border-dashed border-slate-200 bg-slate-50/50">
                            <div className="text-5xl opacity-20">☁️</div>
                            <p className="text-slate-400 font-medium">No active workspaces. Be the first to start one!</p>
                        </div>
                    ) : (
                        rooms.map((room) => (
                            <div
                                key={room.id}
                                onClick={() => handleJoin(room)}
                                className="room-item-premium p-6 rounded-[28px] flex items-center justify-between cursor-pointer group"
                            >
                                <div className="flex items-center gap-5">
                                    {/* <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-2xl group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                        {room.name.substring(0, 1).toUpperCase()}
                                    </div> */}
                                    <div>
                                        <p className="font-bold text-xl text-slate-800 tracking-tight">{room.name.toUpperCase()}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${room.hasPassword ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                {room.hasPassword ? 'Private' : 'Public'}
                                            </span>
                                            <span className="text-xs text-slate-400"> - Created {new Date(room.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', position: 'relative' }}>
                                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', transition: 'all 0.3s', marginRight: '64px' }}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M5 12h14"></path>
                                            <path d="m12 5 7 7-7 7"></path>
                                        </svg>
                                    </div>

                                    {/* High-Visibility Live Status Dot (Anchored to the absolute far right) */}
                                    <div
                                        style={{
                                            position: 'absolute',
                                            right: '30px',
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '50%',
                                            backgroundColor: activeRooms[room.id] ? '#10b981' : '#f43f5e',
                                            border: '4px solid white',
                                            boxShadow: activeRooms[room.id]
                                                ? '0 0 30px rgba(16, 185, 129, 0.9)'
                                                : '0 4px 15px rgba(0, 0, 0, 0.2)',
                                            flexShrink: 0
                                        }}
                                        className={activeRooms[room.id] ? 'animate-pulse' : ''}
                                    />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
