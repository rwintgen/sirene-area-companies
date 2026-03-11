/**
 * GET /api/org/invite/info?token=xxx — Public (no auth required).
 * Returns invite metadata so the landing page can show org name, inviter, etc.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  try {
    const db = getAdminDb()

    const tokenDoc = await db.collection('inviteTokens').doc(token).get()
    if (!tokenDoc.exists) {
      return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 404 })
    }
    const { orgId, invitationId } = tokenDoc.data()!

    const [orgSnap, inviteSnap] = await Promise.all([
      db.collection('organizations').doc(orgId).get(),
      db.collection('organizations').doc(orgId).collection('invitations').doc(invitationId).get(),
    ])

    if (!inviteSnap.exists) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    const invite = inviteSnap.data()!
    const org = orgSnap.data()

    if (invite.status !== 'pending') {
      return NextResponse.json({ error: `Invitation has already been ${invite.status}` }, { status: 410 })
    }

    const expiresAt = invite.expiresAt?.toDate ? invite.expiresAt.toDate() : new Date(invite.expiresAt)
    if (expiresAt < new Date()) {
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 410 })
    }

    let inviterName: string | null = null
    if (invite.invitedBy) {
      const inviterSnap = await db.collection('userProfiles').doc(invite.invitedBy).get()
      inviterName = inviterSnap.data()?.displayName ?? null
    }

    return NextResponse.json({
      orgName: org?.name ?? 'Unknown organization',
      orgIconUrl: org?.iconUrl ?? null,
      inviterName,
      email: invite.email,
      role: invite.role,
    })
  } catch (err: any) {
    console.error('[invite/info] error:', err)
    return NextResponse.json({ error: 'Failed to load invitation' }, { status: 500 })
  }
}
