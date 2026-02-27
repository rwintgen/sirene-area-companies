![Public Data Maps](./public/logo-full.png)

# Public Data Maps (France)

A full-stack web app to draw a custom area on a map of France and instantly retrieve a list of company establishments within that area, using the open SIRENE v3 dataset. Built with Next.js, Firebase, and Leaflet.

## Features

- **Draw on the map** — polygon or rectangle selection using Leaflet Draw
- **SIRENE data** — queries a local CSV of French company establishments (SIRET, name, address, geolocation)
- **Company list** — sortable, filterable table with configurable columns
  - Filter operators: `contains`, `equals`, `empty`, with a NOT toggle
  - Sort by any column, ascending or descending
- **Company detail modal** — full field view for any establishment
- **Map markers** — click a pin to see a quick popup; click again to open the detail modal
- **Export** — download current results as CSV or JSON, with field selection
- **Saved searches** — sign in to save, restore, rename, and delete named searches (persisted in Firestore)
- **Map styles** — Default (OpenStreetMap), Themed (CartoCDN light/dark), Satellite (Esri)
- **Dark / Light theme**
- **Geocoding** — search for any location in France to pan the map
- **Geolocate** — jump to your current GPS position

## Tech Stack

| Layer      | Technology                         |
|------------|-------------------------------------|
| Framework  | Next.js 14 (App Router, TypeScript) |
| Styling    | Tailwind CSS 3                      |
| Map        | Leaflet + react-leaflet + leaflet-draw |
| Auth       | Firebase Authentication             |
| Database   | Cloud Firestore                     |
| Data       | SIRENE v3 CSV (local, loaded in-memory) |

---

## Getting Started (for Contributors)

We welcome contributions of all kinds — open an issue or submit a pull request.

### Prerequisites

- Node.js 18+ and npm
- A Google account (for Firebase)

### Installation & Setup

1. **Fork and clone** the repository.

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Firebase:**

   This project uses Firebase for authentication and saving searches. You need your own free Firebase project.

   1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
   2. In **Project Settings → Your apps**, add a **Web** app and copy the `firebaseConfig` object.
   3. Copy the Firebase credentials template:
      ```bash
      cp src/lib/firebase.example.ts src/lib/firebase.ts
      ```
      > `src/lib/firebase.ts` is git-ignored — your keys will not be committed.
   4. Paste your `firebaseConfig` into `src/lib/firebase.ts`.
   5. In the Firebase console, go to **Authentication → Sign-in method** and enable:
      - **Google**
      - **Email/Password**
   6. Go to **Firestore Database**, create a database, and publish the following security rules:
      ```
      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /userProfiles/{userId} {
            allow read, write: if request.auth != null && request.auth.uid == userId;
          }
          match /savedAreas/{docId} {
            allow read, write, delete: if request.auth != null && request.auth.uid == resource.data.userId;
            allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
          }
        }
      }
      ```

4. **Set up the data file:**

   A sample dataset (`data/economicref-france-sirene-v3-sample.csv`) is included so you can run the app immediately.

   To use the full dataset, download it from:
   > [https://public.opendatasoft.com/explore/assets/economicref-france-sirene-v3/](https://public.opendatasoft.com/explore/assets/economicref-france-sirene-v3/)

   Replace the sample file with the full download. The app loads it in-memory on the first request — expect a longer cold start with the full dataset.

   The file must have a `Géolocalisation de l'établissement` column containing WGS84 coordinates in `"lat,lon"` format.

5. **Run the development server:**
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000). Sign in with Google or email/password to save searches.

---

## Deployment

This app requires server-side rendering (Next.js API routes handle the CSV search). **Firebase App Hosting** is the recommended deployment target as it natively supports Next.js SSR.

### Deploy with Firebase App Hosting

1. **Install Firebase CLI** (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```

2. **Log in and initialise App Hosting:**
   ```bash
   firebase login
   firebase experiments:enable webframeworks
   firebase init hosting
   ```
   - Select **Use an existing project** and choose your Firebase project.
   - Choose **Use the current directory** as the public directory — Firebase will detect Next.js automatically.
   - Answer **Yes** to "Configure as a single-page app" → **No**.

3. **Create a `.env.production` file** with your Firebase config exposed as Next.js public env vars (if you refactor to use `NEXT_PUBLIC_` env vars instead of the hardcoded `firebase.ts`). Alternatively, the current approach of keeping credentials in `src/lib/firebase.ts` works for personal/single-owner deployments.

4. **Deploy:**
   ```bash
   firebase deploy
   ```

   Firebase App Hosting will build the Next.js app and deploy both the SSR functions and static assets automatically.

> **Note:** The full SIRENE CSV is large. For production, consider pre-loading it into **Firestore** or a **PostGIS** database and replacing the `/api/search` route with a proper geospatial query. The current in-memory approach works well for the sample dataset.

---

## Project Roadmap

- [x] SIRENE v3 CSV data source
- [x] Draw-based area selection (polygon + rectangle)
- [x] Company list with sort and multi-condition filters
- [x] Company detail modal
- [x] Dark / Light theme
- [x] Multiple map styles (Default, Themed, Satellite)
- [x] Saved searches (Firebase Auth + Firestore)
- [x] Export results (CSV / JSON)
- [x] Geocoding search bar
- [ ] Migrate search backend to PostGIS for full-dataset performance
- [ ] Add other data types beyond companies (e.g. schools, health facilities)
- [ ] Mobile-responsive layout
- [ ] Deploy the app to a hosting service like Vercel or Firebase Hosting.
