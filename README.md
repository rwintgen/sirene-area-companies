# Sirene Area Companies (Open Source)

This is a full-stack web app that allows users to draw a custom area on a map of France and get a list of all company headquarters located inside that area. This project is open source and we welcome contributions!

## Contributing

We welcome contributions of all kinds! Please feel free to open an issue or submit a pull request.

## Getting Started (for Contributors)

To get a local copy up and running, follow these simple steps.

### Prerequisites

You need to have Node.js and npm installed on your machine. You will also need a Firebase account.

### Installation & Setup

1.  **Fork the repository** and clone it to your local machine.
2.  **Install NPM packages:**
    ```bash
    npm install
    ```
3.  **Set up your own Firebase Project:**
    1.  Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
    2.  Create a new Web App within your Firebase project.
    3.  Copy the Firebase configuration object provided.
    4.  Create a file named `firebase.ts` inside a `src/lib/` directory.
    5.  Paste your copied Firebase config into `src/lib/firebase.ts`. It should look something like this:
        ```typescript
        import { initializeApp } from "firebase/app";

        const firebaseConfig = {
          apiKey: "AIza....",
          authDomain: "your-project-id.firebaseapp.com",
          projectId: "your-project-id",
          storageBucket: "your-project-id.appspot.com",
          messagingSenderId: "...",
          appId: "1:..."
        };

        const app = initializeApp(firebaseConfig);

        export { app };
        ```
    6.  In the Firebase console, enable the **Firestore** database.

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
5.  Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Roadmap (TODO)

Here are some areas where you can contribute:

- [ ] Implement user authentication with Firebase.
- [ ] Connect the front-end to the Firestore database.
- [ ] Implement the search functionality to query the Firestore database.
- [ ] Deploy the app to Firebase Hosting.
- [ ] Plug in the real SIRENE/PostGIS data source for company data.

