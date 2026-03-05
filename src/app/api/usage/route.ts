import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'

function getMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * GET: returns the current monthly search count for an authenticated user.
 * The client calls this on login to seed the localStorage cache with the
 * authoritative Firestore value, ensuring the display is accurate even
 * if the user clears their local storage on another device.
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    const uid = decoded.uid
    const month = getMonthKey()

    const snap = await getAdminDb().collection('userUsage').doc(uid).get()

    if (!snap.exists) return NextResponse.json({ searchCount: 0, monthKey: month })

    const data = snap.data()!
    const searchCount = data.monthKey === month ? (data.searchCount ?? 0) : 0

    return NextResponse.json({ searchCount, monthKey: month })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
