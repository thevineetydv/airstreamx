# AIrStreamX / Video Hosting App

AIrStreamX is a React + TypeScript + Vite video hosting and streaming application with Firebase authentication, HLS playback, live stream UX, and AI-driven video clipping.

## Project Overview

This repository contains a modern video platform frontend with support for:

- authenticated video upload
- searchable home feed and library
- video watch experience with progress persistence
- channel pages with video and shorts listings
- dedicated Shorts browsing UI
- live stream discovery and viewing
- AI clip generation backend routes
- toast / notification system
- offline detection and graceful UI handling

## Tech Stack

- React 19
- TypeScript
- Vite
- TailwindCSS
- Firebase Auth
- HLS.js
- Framer Motion
- Chart.js / react-chartjs-2
- OpenAI SDK
- Vite PWA plugin

## Architecture

### Entry and Providers

- src/main.tsx
  - mounts React app
  - wraps with BrowserRouter
  - wraps with AuthProvider

### Main App Shell

- src/App.tsx
  - global layout
  - route definitions
  - upload modal control
  - online/offline banner
  - error boundary
  - deferred page loading for non-critical sections

### Shared App Logic

- src/useAppLogic.ts
  - fetches video metadata from backend
  - manages uploads and upload progress
  - stores theme preferences, watch history, and settings in localStorage
  - provides centralized app state for pages and components

### Firebase Integration

- src/firebase.ts
  - initializes Firebase app
  - exposes auth, googleProvider, signInWithGoogle, and logout
  - reads config from VITE_FIREBASE_* environment variables

- src/context/AuthContext.tsx
  - observes Firebase auth state changes
  - refreshes ID tokens automatically every ~55 minutes
  - exposes user, token, login, and logout

### Notifications

- src/context/NotificationContext.tsx
  - provides toast notifications globally
  - used by header, upload modal, and other components

## Core Features

### Video Experiences

- HomeFeed � screen for trending and recent videos
- Watch � video playback with HLS support
- ChannelPage � channel profile and content tabs
- ShortsPage � short-form video viewer
- LiveStream � live stream playback page
- LiveStreamsBrowser � browse active live streams
- GoLiveButton � trigger live streaming flow
- ClipGenerator � AI clip generation experience

### Uploads

- UploadModal � authenticated upload interface
- useAppLogic handles authenticated upload requests and progress
- upload API location is controlled by VITE_API_BASE

### Backend / API Support

- pi/videos.js
  - frontend proxy to backend video list endpoint
  - uses VITE_API_BASE or default backend host

- src/routes/routes_clips.js
  - example Express router for AI clip workflows
  - endpoints:
    - POST /api/clips/upload
    - GET /api/clips/status/:id
    - GET /api/clips/video/:videoId
    - GET /api/clips/download/:clipId
  - integrates Firebase auth, MinIO, PostgreSQL, and transcription queue

## Folder Structure

- src/
  - App.tsx
  - main.tsx
  - irebase.ts
  - useAppLogic.ts
  - 	ypes.ts
  - context/
    - AuthContext.tsx
    - NotificationContext.tsx
  - components/
    - Header.tsx, BottomNav.tsx, UploadModal.tsx, VideoPlayer.tsx, LiveStreamsBrowser.tsx, GoLiveButton.tsx, ShortsSection.tsx, etc.
  - pages/
    - HomeFeed.tsx, Watch.tsx, ChannelPage.tsx, ShortsPage.tsx, LiveStream.tsx, ClipGenerator.tsx, Dashboard.tsx, Settings.tsx, etc.
  - 
outes/
    - 
outes_clips.js
  - pi/
    - ideos.js

## Setup

### Install dependencies

`ash
npm install
`

### Environment variables

Create a .env file in the project root with values for:

`env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
VITE_API_BASE=http://localhost:5000
`

### Run locally

`ash
npm run dev
`

### Build

`ash
npm run build
`

### Preview production build

`ash
npm run preview
`

### Lint

`ash
npm run lint
`

### Type check

`ash
npm run typecheck
`

## Notes and Recommendations

- This repo is frontend-first, but it expects a backend service for /videos, /upload, and other API calls.
- src/routes/routes_clips.js is an example backend route set for AI clip generation. If you want to use it, integrate it with an Express app and supply the required MinIO/PostgreSQL configuration.
- The current Firebase config fallback values in src/firebase.ts look like a sample/demo project; replace them with your own environment values for production.
- src/useAppLogic.ts caches theme, autoplay, and watch position data in localStorage.

## What to inspect next

- src/App.tsx for main route flow and layout rules
- src/useAppLogic.ts for backend fetch, upload, and state handling
- src/context/AuthContext.tsx for Firebase authentication lifecycle
- src/routes/routes_clips.js for AI clip upload API design
