# AntiCanvas - Collaborative Real-time Whiteboard

A high-performance, real-time digital canvas built with React, Fabric.js, and Firebase.

## Features

- **Real-time Collaboration**: See changes from other users instantly.
- **Presence System**: See who else is currently on the board with active user avatars.
- **Sticky Notes**: Create and move sticky notes across the canvas.
- **Drawing Mode**: Free-hand drawing with real-time sync.
- **Conflict Resolution**: Powered by Firebase Transactions to prevent state desync.
- **Premium UI**: Modern dark-themed interface with smooth animations and glassmorphism.

## Tech Stack

- **Framework**: React (TypeScript) via Vite
- **Canvas Engine**: Fabric.js (@5.3.0)
- **Backend / Real-time**: Firebase (Realtime Database, Authentication)
- **Styling**: Vanilla CSS with a curated design system

## Getting Started

### 1. Prerequisites
- [Bun](https://bun.sh/) installed.

### 2. Setup Firebase
1. Create a project in [Firebase Console](https://console.firebase.google.com/).
2. Enable **Anonymous Authentication** in the Auth section.
3. Create a **Realtime Database** and set rules to allow read/write:
  ```json
  {
    "rules": {
      "rooms_meta": {
        ".read": "auth != null",
        "$roomId": {
          // Only allow creating a new room, not overwriting existing ones
          ".write": "auth != null && (!data.exists() || data.child('creator').val() == auth.uid)",
          // Validate room structure
          ".validate": "newData.hasChildren(['name', 'createdAt'])"
        }
      },
      "rooms": {
        "$roomId": {
          // Anyone logged in can read/write to room objects once they know the ID
          // (Lobby system handles the password gating via the app logic)
          ".read": "auth != null",
          ".write": "auth != null",
          
          "objects": {
            "$objId": {
              // Ensure nobody can delete the whole objects list at once
              ".write": "auth != null"
            }
          },
          "users": {
            "$uid": {
              // A user can only modify their own presence data
              ".write": "auth != null && $uid === auth.uid"
            }
          }
        }
      }
    }
  }
   ```
4. Copy your web app config and paste it into a `.env` file (see `.env.example`).

### 3. Installation
```bash
bun install
```

### 4. Run Locally
```bash
bun run dev
```

## How it Works

- **Presence**: Uses Firebase's `.info/connected` to track user online status and Cleanup on disconnect via `onDisconnect`.
- **Sync**: Objects (sticky notes, paths) are assigned a unique ID via Firebase `push()`. Every movement or modification triggers a `runTransaction` to update the central state.
- **Fabric.js Integration**: Custom logic to serialize/deserialize objects while preserving unique IDs across clients.
