import { useEffect, useState, useRef } from 'react';
import { db } from '../firebase';
import { ref, onValue, onDisconnect, set, remove } from 'firebase/database';

interface PresenceProps {
    user: { uid: string; displayName: string | null; photoURL: string | null };
    roomId: string;
}

export const Presence = ({ user, roomId }: PresenceProps) => {
    const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!user || !roomId) return;

        const connectedRef = ref(db, '.info/connected');
        const userRef = ref(db, `rooms/${roomId}/users/${user.uid}`);

        const unsubscribe = onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                const adjectives = ['Cool', 'Swift', 'Bright', 'Bold', 'Zen', 'Creative'];
                const nouns = ['Designer', 'Artist', 'Architect', 'Creator', 'Thinker'];
                const randomName = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;

                const userData = {
                    id: user.uid,
                    name: user.displayName || randomName,
                    color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`,
                    last_seen: Date.now()
                };

                onDisconnect(userRef).remove();
                set(userRef, userData);

                // Update lastActive immediately on join
                set(ref(db, `rooms_meta/${roomId}/lastActive`), Date.now());
            }
        });

        // Keep-alive: Update lastActive every minute
        const interval = setInterval(() => {
            set(ref(db, `rooms_meta/${roomId}/lastActive`), Date.now());
        }, 60000);

        return () => {
            unsubscribe();
            clearInterval(interval);
            remove(userRef);
        };
    }, [user, roomId]);

    useEffect(() => {
        if (!roomId) return;
        const allUsersRef = ref(db, `rooms/${roomId}/users`);
        const unsubscribe = onValue(allUsersRef, (snap) => {
            const val = snap.val();
            setOnlineUsers(val ? Object.values(val) : []);
        });
        return () => unsubscribe();
    }, [roomId]);

    // Click outside listener for the menu
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const visibleUsers = onlineUsers.slice(0, 3);
    const hasMore = onlineUsers.length > 3;

    const handleShare = () => {
        try {
            navigator.clipboard.writeText(window.location.href);
            // Visual feedback instead of just an alert
            const btn = document.getElementById('share-btn');
            if (btn) {
                const originalText = btn.innerHTML;
                btn.innerHTML = '<span>✅</span><span>Copied!</span>';
                btn.style.backgroundColor = '#10b981';
                btn.style.borderColor = '#10b981';
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.style.backgroundColor = '';
                    btn.style.borderColor = '';
                }, 2000);
            }
        } catch (err) {
            console.error(err);
            alert("Board link: " + window.location.href);
        }
    };

    return (
        <div className="presence-container" style={{ position: 'relative' }}>
            {/* Stable container for icons and dropdown */}
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <div
                    className="flex flex-row items-center -space-x-2 cursor-pointer group select-none"
                    onClick={() => setShowMenu(!showMenu)}
                    title="View all participants"
                    style={{ flexShrink: 0 }}
                >
                    {visibleUsers.map((u) => (
                        <div
                            key={u.id}
                            className="avatar flex-none"
                            style={{ backgroundColor: u.color, zIndex: 1 }}
                        >
                            {u.name.substring(0, 1)}
                        </div>
                    ))}

                    {hasMore && (
                        <div className="avatar flex-none bg-slate-100 text-slate-500 font-bold border-slate-200" style={{ fontSize: '10px' }}>
                            ...
                        </div>
                    )}
                </div>

                {/* Dropdown Menu - absolutely positioned relative to the icon group wrapper */}
                {showMenu && (
                    <div
                        ref={menuRef}
                        className="glass-card p-4 rounded-[28px] z-[2000] animate-fade-in-up"
                        style={{
                            position: 'absolute',
                            top: '48px', // Directly below the 32px icons
                            left: '0',
                            width: '280px',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)',
                            pointerEvents: 'auto'
                        }}
                    >
                        <div className="mb-3 px-1 flex justify-between items-center">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Connected ({onlineUsers.length})</h3>
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        </div>
                        <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
                            {onlineUsers.map(u => (
                                <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-all">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: u.color }}>
                                        {u.name.substring(0, 1)}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-800 truncate">{u.name}</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Online</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="header-divider" style={{ margin: '0 8px', height: '24px', flexShrink: 0 }}></div>

            <button
                id="share-btn"
                onClick={handleShare}
                className="btn-premium !py-2 !px-5 !text-[11px] !bg-slate-900 !text-white !border-slate-900 hover:!bg-black active:!scale-95 shadow-lg shadow-slate-100 flex items-center gap-2 shrink-0"
            >
                <span style={{ fontSize: '14px' }}>🔗</span>
                <span className="font-bold">Share Link</span>
            </button>
        </div>
    );
};
