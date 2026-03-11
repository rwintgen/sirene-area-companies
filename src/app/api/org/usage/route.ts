/**
 * GET /api/org/usage — Returns aggregated usage data for all organization members.
 * Accessible to owner and admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
import { getMember, listMembers, canViewDashboard } from '@/lib/org'

function getMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let decoded
  try {
    decoded = await getAdminAuth().verifyIdToken(token)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await getAdminDb().collection('userProfiles').doc(decoded.uid).get()
  const orgId = profile.data()?.orgId
  if (!orgId) return NextResponse.json({ error: 'Not in an organization' }, { status: 404 })

  const member = await getMember(orgId, decoded.uid)
  if (!member || !canViewDashboard(member.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const members = await listMembers(orgId)
  const month = getMonthKey()
  const adminDb = getAdminDb()

  const profileDocs = await Promise.all(
    members.map((m) => adminDb.collection('userProfiles').doc(m.uid).get()),
  )

  const savedSearchCounts = await Promise.all(
    members.map((m) => adminDb.collection('userProfiles').doc(m.uid).collection('savedSearches').count().get()),
  )

  const orgDoc = await adminDb.collection('organizations').doc(orgId).get()
  const orgQuickFiltersCount = (orgDoc.data()?.settings?.customQuickFilters ?? []).length

  const memberUsage = members.map((m, i) => {
    const data = profileDocs[i].exists ? profileDocs[i].data()! : {}
    const isCurrent = data.monthKey === month
    return {
      uid: m.uid,
      displayName: m.displayName,
      email: m.email,
      role: m.role,
      searchCount: isCurrent ? (data.searchCount ?? 0) : 0,
      aiOverviewCount: isCurrent ? (data.aiOverviewCount ?? 0) : 0,
      lastActiveAt: data.lastActiveAt ?? null,
      savedSearches: savedSearchCounts[i].data().count,
      customQuickFilters: Array.isArray(data.customPresets) ? data.customPresets.length : 0,
    }
  })

  const totalSearches = memberUsage.reduce((sum, m) => sum + m.searchCount, 0)
  const totalAiOverviews = memberUsage.reduce((sum, m) => sum + m.aiOverviewCount, 0)
  const totalSavedSearches = memberUsage.reduce((sum, m) => sum + m.savedSearches, 0)
  const totalCustomQuickFilters = memberUsage.reduce((sum, m) => sum + m.customQuickFilters, 0)

  return NextResponse.json({
    month,
    totalSearches,
    totalAiOverviews,
    totalSavedSearches,
    totalCustomQuickFilters,
    orgQuickFiltersCount,
    members: memberUsage,
  })
}
