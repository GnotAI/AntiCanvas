import { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';
import { db } from '../firebase';
import { ref, onChildAdded, onChildChanged, onChildRemoved, set, push, off, remove } from 'firebase/database';
import type { User } from 'firebase/auth';

interface WhiteboardProps {
    user: User | null;
    roomId: string;
}

export const Whiteboard = ({ user, roomId }: WhiteboardProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasSelection, setHasSelection] = useState(false);
    const isUpdating = useRef(false);

    // Initialize Canvas
    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = new fabric.Canvas(canvasRef.current, {
            height: window.innerHeight,
            width: window.innerWidth,
            backgroundColor: 'transparent',
            isDrawingMode: false,
        });

        // Initialize Brush
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = '#3b82f6';
        canvas.freeDrawingBrush.width = 4;

        setFabricCanvas(canvas);

        const handleSelection = () => setHasSelection(!!canvas.getActiveObject());
        canvas.on('selection:created', handleSelection);
        canvas.on('selection:updated', handleSelection);
        canvas.on('selection:cleared', () => setHasSelection(false));

        const handleResize = () => {
            canvas.setDimensions({ width: window.innerWidth, height: window.innerHeight });
        };
        window.addEventListener('resize', handleResize);

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && !(canvas.getActiveObject() as any)?.isEditing) {
                deleteSelectedTool(canvas);
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('keydown', handleKeyDown);
            canvas.dispose();
        };
    }, []);

    const deleteSelectedTool = (canvas: fabric.Canvas) => {
        const activeObjects = canvas.getActiveObjects();
        if (!activeObjects.length) return;

        activeObjects.forEach((obj) => {
            const id = (obj as any).id;
            if (id && roomId) {
                remove(ref(db, `rooms/${roomId}/objects/${id}`));
            }
            canvas.remove(obj);
        });
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        setHasSelection(false);
    };

    const deleteSelected = () => {
        if (fabricCanvas) deleteSelectedTool(fabricCanvas);
    };

    // Helper to fix Firebase's habit of converting arrays to objects
    const deepRestoreArrays = (obj: any): any => {
        if (obj === null || typeof obj !== 'object') return obj;

        // If it looks like a Firebase-converted array (numeric keys)
        const keys = Object.keys(obj);
        const looksLikeArray = keys.length > 0 && keys.every(k => !isNaN(Number(k)));

        let result = looksLikeArray ? Object.values(obj) : { ...obj };

        if (Array.isArray(result)) {
            return result.map(deepRestoreArrays);
        } else {
            for (const key in result) {
                result[key] = deepRestoreArrays(result[key]);
            }
            return result;
        }
    };

    // Firebase Sync
    useEffect(() => {
        if (!fabricCanvas || !roomId) return;

        fabricCanvas.clear();

        const objectsRef = ref(db, `rooms/${roomId}/objects`);

        const handleChildAdded = (snapshot: any) => {
            const rawVal = snapshot.val();
            const key = snapshot.key;

            // Deeply restore any arrays (especially important for path coordinates)
            const val = deepRestoreArrays(rawVal);

            if (fabricCanvas.getObjects().find((obj: any) => (obj as any).id === key)) return;

            isUpdating.current = true;
            fabric.util.enlivenObjects([val], (objects: fabric.Object[]) => {
                objects.forEach((obj) => {
                    (obj as any).set({ id: key });
                    fabricCanvas.add(obj);
                    if (obj.type === 'textbox') {
                        (obj as fabric.Textbox).exitEditing();
                    }
                });
                isUpdating.current = false;
                fabricCanvas.requestRenderAll();
            }, 'fabric');
        };

        const handleChildChanged = (snapshot: any) => {
            const rawVal = snapshot.val();
            const key = snapshot.key;
            const val = deepRestoreArrays(rawVal);

            const obj = fabricCanvas.getObjects().find((o: any) => (o as any).id === key);
            if (obj) {
                isUpdating.current = true;
                if (fabricCanvas.getActiveObject() !== obj || !(obj as any).isEditing) {
                    obj.set(val);
                    obj.setCoords();
                    fabricCanvas.requestRenderAll();
                }
                isUpdating.current = false;
            }
        };

        const handleChildRemoved = (snapshot: any) => {
            const key = snapshot.key;
            const obj = fabricCanvas.getObjects().find((o: any) => (o as any).id === key);
            if (obj) {
                isUpdating.current = true;
                fabricCanvas.remove(obj);
                isUpdating.current = false;
                fabricCanvas.requestRenderAll();
            }
        };

        onChildAdded(objectsRef, handleChildAdded);
        onChildChanged(objectsRef, handleChildChanged);
        onChildRemoved(objectsRef, handleChildRemoved);
        return () => {
            off(objectsRef, 'child_added', handleChildAdded);
            off(objectsRef, 'child_changed', handleChildChanged);
            off(objectsRef, 'child_removed', handleChildRemoved);
        };
    }, [fabricCanvas, roomId]);

    useEffect(() => {
        if (!fabricCanvas || !roomId) return;

        const syncToFirebase = (obj: any) => {
            if (isUpdating.current || !obj || !(obj as any).id) return;
            const data = obj.toObject(['id', 'user']);
            delete data.version;
            set(ref(db, `rooms/${roomId}/objects/${(obj as any).id}`), data);
        };

        const handleObjectAdded = (e: any) => {
            if (isUpdating.current) return;
            const obj = e.path || e.target;
            if (!obj || (obj as any).id) return;

            const id = push(ref(db, `rooms/${roomId}/objects`)).key;
            if (id) {
                (obj as any).set({ id, user: user?.uid });
                const data = obj.toObject(['id', 'user']);
                delete data.version;
                set(ref(db, `rooms/${roomId}/objects/${id}`), data);
            }
        };

        fabricCanvas.on('object:modified', (e) => syncToFirebase(e.target));
        fabricCanvas.on('object:moving', (e) => syncToFirebase(e.target));
        fabricCanvas.on('object:scaling', (e) => syncToFirebase(e.target));
        fabricCanvas.on('object:rotating', (e) => syncToFirebase(e.target));
        fabricCanvas.on('path:created', handleObjectAdded);
        fabricCanvas.on('text:changed', (e) => syncToFirebase(e.target));

        return () => {
            fabricCanvas.off('object:modified');
            fabricCanvas.off('object:moving');
            fabricCanvas.off('object:scaling');
            fabricCanvas.off('object:rotating');
            fabricCanvas.off('path:created');
            fabricCanvas.off('text:changed');
        };
    }, [fabricCanvas, user, roomId]);

    const addStickyNote = () => {
        if (!fabricCanvas || !roomId) return;
        const note = new fabric.Textbox('', {
            left: Math.random() * 200 + 300,
            top: Math.random() * 200 + 200,
            width: 220,
            fontSize: 22,
            backgroundColor: '#fffbeb',
            padding: 24,
            textAlign: 'center',
            fontFamily: 'Outfit',
            shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.06)', blur: 20, offsetX: 5, offsetY: 5 }),
            cornerStyle: 'circle',
            transparentCorners: false,
            cornerColor: '#3b82f6',
            cornerSize: 10,
            borderDashArray: [5, 5],
        });

        const id = push(ref(db, `rooms/${roomId}/objects`)).key;
        if (id) {
            (note as any).id = id;
            (note as any).user = user?.uid;
            fabricCanvas.add(note);
            fabricCanvas.setActiveObject(note);
            set(ref(db, `rooms/${roomId}/objects/${id}`), note.toObject(['id', 'user']));
        }
    };

    const toggleDrawing = () => {
        if (!fabricCanvas) return;
        const newState = !fabricCanvas.isDrawingMode;
        fabricCanvas.isDrawingMode = newState;
        setIsDrawing(newState);
    };

    return (
        <div className="relative w-full h-full">
            <div className="workspace-toolbar">
                <button
                    onClick={addStickyNote}
                    className="btn-premium !py-2 !px-4 !text-xs"
                    data-tooltip="Add Note"
                >
                    <span style={{ fontSize: '16px' }}>📝</span>
                    <span>Sticky Note</span>
                </button>

                <button
                    onClick={toggleDrawing}
                    className={`btn-premium !py-2 !px-4 !text-xs ${isDrawing ? 'active' : ''}`}
                    data-tooltip="Draw"
                >
                    <span style={{ fontSize: '16px' }}>{isDrawing ? '✨' : '🎨'}</span>
                    <span>{isDrawing ? 'Drawing' : 'Sketch'}</span>
                </button>

                {hasSelection && (
                    <button
                        onClick={deleteSelected}
                        className="btn-premium !py-2 !px-4 !text-xs"
                        style={{ background: '#fef2f2', borderColor: '#fee2e2', color: '#ef4444' }}
                        data-tooltip="Delete Selected"
                    >
                        <span style={{ fontSize: '16px' }}>🗑️</span>
                        <span>Delete</span>
                    </button>
                )}
            </div>

            <canvas ref={canvasRef} />
        </div>
    );
};
