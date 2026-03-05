/**
 * Firebase Admin SDK singleton.
 *
 * Uses Application Default Credentials (ADC):
 * - Locally: `gcloud auth application-default login` (already set up via gcloud CLI)
 * - App Hosting / Cloud Run: service account attached to the deployment is used automatically
 *
 * Imported only in server-side code (API routes). Never imported from client components.
 */
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]
  return initializeApp()
}

export function getAdminAuth() {
  return getAuth(getAdminApp())
}

export function getAdminDb() {
  return getFirestore(getAdminApp())
}
