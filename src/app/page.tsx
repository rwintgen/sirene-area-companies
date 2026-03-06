'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import CompanyList from '@/components/CompanyList'
import SearchBar from '@/components/SearchBar'
import AuthModal from '@/components/AuthModal'
import CompanyDetail from '@/components/CompanyDetail'
import ExportModal from '@/components/ExportModal'
import ColumnConfig from '@/components/ColumnConfig'
import Paywall from '@/components/Paywall'
import AIOverview from '@/components/AIOverview'
import SettingsModal from '@/components/SettingsModal'
import { Modal, CloseButton } from '@/components/ui'
import { applyPresets } from '@/lib/presets'
import {
  type UserTier,
  getUserKey,
  getResultLimit,
  canSearch,
  incrementSearchCount,
  getSearchCount,
  getSavedSearchLimit,
  canUseAI,
  canUseAIOverview,
  getAIOverviewCount,
  incrementAIOverviewCount,
  TIER_LIMITS,
} from '@/lib/usage'
import { auth, db } from '@/lib/firebase'
import { useAuthState } from 'react-firebase-hooks/auth'
import { signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore'
const Map = dynamic(() => import('@/components/Map'), { ssr: false })

const HIDDEN_COLS = ['Géolocalisation de l\'établissement']
const DEFAULT_LIST_COLS = ['Dénomination de l\'unité légale', 'Code postal de l\'établissement', 'Commune de l\'établissement']
const DEFAULT_POPUP_COLS = ['Dénomination de l\'unité légale', 'SIRET', 'Code postal de l\'établissement', 'Commune de l\'établissement']

export default function Home() {
  const [companies, setCompanies] = useState([])
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [searchArea, setSearchArea] = useState(null)
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null)
  const [restoreGeometry, setRestoreGeometry] = useState<{ geometry: any; ts: number } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSampleData, setIsSampleData] = useState<boolean | null>(null)
  const [isTruncated, setIsTruncated] = useState(false)
  const [resultLimit, setResultLimit] = useState<number | null>(null)
  const [themeMode, setThemeMode] = useState<'system' | 'light' | 'dark'>('system')
  const [systemDark, setSystemDark] = useState(true)
  const [mapStyle, setMapStyle] = useState<'default' | 'themed' | 'satellite'>('themed')
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [user] = useAuthState(auth)
  const [authOpen, setAuthOpen] = useState(false)
  const [expandedCompany, setExpandedCompany] = useState<any>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [paywallFeature, setPaywallFeature] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchExpanded, setSearchExpanded] = useState(false)
  const isSigningIn = useRef(false)
  const profileLoaded = useRef(false)
  const searchAbort = useRef<AbortController | null>(null)
  const [prefsSaved, setPrefsSaved] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [usageOpen, setUsageOpen] = useState(() => {
    try { return localStorage.getItem('pdm_usage_open') === '1' } catch { return false }
  })
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false)
  const [aiCompany, setAICompany] = useState<any>(null)
  const [aiToken, setAIToken] = useState('')
  const [aiSavedOverview, setAISavedOverview] = useState<{ text: string; sources: string[] } | null>(null)
  const [aiCacheMap, setAICacheMap] = useState<Record<string, boolean>>({})
  const [savedSearchCount, setSavedSearchCount] = useState(0)
  const [searchCount, setSearchCount] = useState(0)
  const [aiOverviewCount, setAIOverviewCount] = useState(0)
  const [aiOverviewsList, setAIOverviewsList] = useState<{ siret: string; companyName: string; city: string; createdAt: string }[]>([])
  const [userTier, setUserTier] = useState<UserTier>('free')
  const [discountInfo, setDiscountInfo] = useState<{ code: string; plan: string; expiresAt: string } | null>(null)

  const prefsKey = (uid: string) => `prefs_${uid}`

  const [columns, setColumns] = useState<string[]>([])
  const [displayColumns, setDisplayColumns] = useState<string[]>([])
  const [listColumns, setListColumns] = useState<string[]>(DEFAULT_LIST_COLS)
  const [popupColumns, setPopupColumns] = useState<string[]>(DEFAULT_POPUP_COLS)

  const [fieldsModalTab, setFieldsModalTab] = useState<'list' | 'popup' | null>(null)

  const [sortCriteria, setSortCriteria] = useState<{ column: string; dir: 'asc' | 'desc' }[]>([])
  const [filters, setFilters] = useState<{ column: string; operator: 'contains' | 'equals' | 'empty'; negate: boolean; value: string }[]>([])
  const [activePresets, setActivePresets] = useState<string[]>([])

  const isDark = themeMode === 'system' ? systemDark : themeMode === 'dark'

  /** Listen to OS color-scheme changes for system theme mode. */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(mq.matches)
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  /** Initialise search count from localStorage on mount, then sync from Firestore for logged-in users. */
  useEffect(() => {
    const uKey = getUserKey(user?.uid ?? null)
    setSearchCount(getSearchCount(uKey))
    setAIOverviewCount(getAIOverviewCount(uKey))
    if (!user) return
    user.getIdToken().then((token) =>
      fetch('/api/usage', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data && typeof data.searchCount === 'number') {
            setSearchCount(data.searchCount)
            const uKey2 = getUserKey(user.uid)
            try {
              localStorage.setItem(`pdm_usage_${uKey2}`, JSON.stringify({ searchCount: data.searchCount, aiOverviewCount: data.aiOverviewCount ?? 0, monthKey: data.monthKey }))
            } catch {}
          }
          if (data && typeof data.aiOverviewCount === 'number') {
            setAIOverviewCount(data.aiOverviewCount)
          }
          if (data?.aiOverviews) setAIOverviewsList(data.aiOverviews)
          if (data?.tier) setUserTier(data.tier as UserTier)
          setDiscountInfo(data?.discount ?? null)
        })
        .catch(() => {})
    ).catch(() => {})
  }, [user])

  /**
   * Load user preferences on auth change.
   * localStorage is applied first to avoid a flash of defaults,
   * then Firestore is fetched for cross-device sync.
   */
  useEffect(() => {
    if (!user) { profileLoaded.current = false; return }
    const key = prefsKey(user.uid)
    try {
      const cached = localStorage.getItem(key)
      if (cached) {
        const p = JSON.parse(cached)
        if (Array.isArray(p.listColumns) && p.listColumns.length > 0) setListColumns(p.listColumns)
        if (Array.isArray(p.popupColumns) && p.popupColumns.length > 0) setPopupColumns(p.popupColumns)
        if (p.mapStyle) setMapStyle(p.mapStyle)
        if (p.themeMode) setThemeMode(p.themeMode)
        else if (typeof p.isDark === 'boolean') setThemeMode(p.isDark ? 'dark' : 'light')
      }
    } catch (_) {}
    getDoc(doc(db, 'userProfiles', user.uid))
      .then((snap) => {
        if (snap.exists()) {
          const p = snap.data()
          if (Array.isArray(p.listColumns) && p.listColumns.length > 0) setListColumns(p.listColumns)
          if (Array.isArray(p.popupColumns) && p.popupColumns.length > 0) setPopupColumns(p.popupColumns)
          if (p.mapStyle) setMapStyle(p.mapStyle)
          if (p.themeMode) setThemeMode(p.themeMode)
          else if (typeof p.isDark === 'boolean') setThemeMode(p.isDark ? 'dark' : 'light')
          try { localStorage.setItem(key, JSON.stringify(p)) } catch (_) {}
        }
        profileLoaded.current = true
      })
      .catch((e) => {
        console.warn('Firestore prefs load failed, using local cache:', e)
        profileLoaded.current = true
      })
  }, [user])

  /**
   * Persist preferences: writes to localStorage immediately for zero-latency,
   * then debounces a Firestore write by 1 s to avoid excessive network calls.
   */
  useEffect(() => {
    if (!user || !profileLoaded.current) return
    const prefs = { listColumns, popupColumns, mapStyle, themeMode }
    try { localStorage.setItem(prefsKey(user.uid), JSON.stringify(prefs)) } catch (_) {}
    const timer = setTimeout(() => {
      setDoc(doc(db, 'userProfiles', user.uid), prefs, { merge: true })
        .then(() => { setPrefsSaved(true); setTimeout(() => setPrefsSaved(false), 2000) })
        .catch((e) => console.warn('Firestore prefs save failed:', e))
    }, 1000)
    return () => clearTimeout(timer)
  }, [user, listColumns, popupColumns, mapStyle, themeMode])

  useEffect(() => {
    fetch('/api/search')
      .then((r) => r.json())
      .then((data) => {
        if (data.columns) {
          setColumns(data.columns)
          const display = data.columns.filter((c: string) => !HIDDEN_COLS.includes(c))
          setDisplayColumns(display)
          setListColumns((prev) => prev.filter((c) => display.includes(c)))
          setPopupColumns((prev) => prev.filter((c) => display.includes(c)))
        }
        if (typeof data.sampleData === 'boolean') setIsSampleData(data.sampleData)
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const handleLocate = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
      (err) => console.warn('Geolocation denied:', err)
    )
  }

  const handleSearch = async (geometry: any) => {
    if (searchAbort.current) {
      searchAbort.current.abort()
      searchAbort.current = null
    }
    if (!geometry) {
      setCompanies([])
      setSearchArea(null)
      setSelectedCompany(null)
      setActiveSearchId(null)
      setIsTruncated(false)
      setResultLimit(null)
      setIsLoading(false)
      return
    }
    if (!geometry.coordinates || !Array.isArray(geometry.coordinates)) {
      console.error('Invalid geometry:', geometry)
      return
    }
    const uKey = getUserKey(user?.uid ?? null)
    // Anonymous users: enforce limit client-side. Logged-in users: server enforces.
    if (!user && !canSearch(uKey, userTier)) {
      const limit = TIER_LIMITS[userTier].searchesPerMonth
      setPaywallFeature(`more than ${limit} searches per month`)
      return
    }
    const controller = new AbortController()
    searchAbort.current = controller
    setIsLoading(true)
    try {
      const tierLimit = getResultLimit(userTier)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (user) {
        try { headers['Authorization'] = `Bearer ${await user.getIdToken()}` } catch {}
      }
      const response = await fetch('/api/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({ geometry, limit: tierLimit }),
        signal: controller.signal,
      })
      if (response.status === 429) {
        const limit = TIER_LIMITS[userTier].searchesPerMonth
        setPaywallFeature(`more than ${limit} searches per month`)
        return
      }
      if (!response.ok) {
        const error = await response.json()
        console.error('Search error:', error)
        return
      }
      const data = await response.json()
      if (user && typeof data.searchCountAfter === 'number') {
        // Server is authoritative for logged-in users — update state and local cache
        setSearchCount(data.searchCountAfter)
        try {
          const monthKey = new Date().toISOString().slice(0, 7)
          localStorage.setItem(`pdm_usage_${uKey}`, JSON.stringify({ searchCount: data.searchCountAfter, monthKey }))
        } catch {}
      } else if (!user) {
        // Anonymous users: increment local counter
        const newCount = incrementSearchCount(uKey)
        setSearchCount(newCount)
      }
      setCompanies(data.companies)
      setSearchArea(geometry)
      setSelectedCompany(null)
      setActiveSearchId(null)
      if (typeof data.sampleData === 'boolean') setIsSampleData(data.sampleData)
      if (typeof data.truncated === 'boolean') setIsTruncated(data.truncated)
      if (typeof data.resultLimit === 'number') setResultLimit(data.resultLimit)
      if (data.columns && columns.length === 0) {
        setColumns(data.columns)
        const display = data.columns.filter((c: string) => !HIDDEN_COLS.includes(c))
        setDisplayColumns(display)
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return
      console.error('Failed to search:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSortChange = useCallback((criteria: { column: string; dir: 'asc' | 'desc' }[]) => {
    setSortCriteria(criteria)
  }, [])

  const handleSaveSearch = useCallback(async (name: string) => {
    if (!user || !searchArea) return
    const maxSaved = getSavedSearchLimit(userTier)
    if (maxSaved !== Infinity && savedSearchCount >= maxSaved) {
      setPaywallFeature(`more than ${maxSaved} saved searches`)
      return
    }
    setSavedSearchCount((c) => c + 1)
    await addDoc(collection(db, 'savedAreas'), {
      name,
      userId: user.uid,
      geometryJson: JSON.stringify(searchArea),
      filtersJson: JSON.stringify(filters),
      sortCriteriaJson: JSON.stringify(sortCriteria),
      presetsJson: JSON.stringify(activePresets),
      timestamp: new Date(),
    })
  }, [user, searchArea, filters, sortCriteria, activePresets, userTier, savedSearchCount])

  const handleSignInPrompt = useCallback(() => { setAuthOpen(true) }, [])

  /**
   * Derived company list with active filters applied.
   * Used to keep map markers in sync with the filtered list view.
   */
  const mapCompanies = useMemo(() => {
    let result: any[] = [...companies]
    if (filters.length > 0) {
      for (const f of filters) {
        if (!f.column) continue
        result = result.filter((c: any) => {
          const val = (c.fields?.[f.column] ?? '').toString().toLowerCase()
          let match: boolean
          switch (f.operator) {
            case 'contains': match = val.includes(f.value.toLowerCase()); break
            case 'equals': match = val === f.value.toLowerCase(); break
            case 'empty': match = val.length === 0; break
            default: match = true
          }
          return f.negate ? !match : match
        })
      }
    }
    result = applyPresets(result, activePresets)
    return result
  }, [companies, filters, activePresets])

  const usageWarnings = useMemo(() => {
    const limits = TIER_LIMITS[userTier]
    const warnings: string[] = []
    if (limits.searchesPerMonth !== Infinity && searchCount >= limits.searchesPerMonth * 0.8) {
      warnings.push(`${searchCount}/${limits.searchesPerMonth} monthly searches used`)
    }
    if (limits.savedSearches !== Infinity && savedSearchCount >= limits.savedSearches * 0.8) {
      warnings.push(`${savedSearchCount}/${limits.savedSearches} saved searches used`)
    }
    return warnings
  }, [userTier, searchCount, savedSearchCount])

  const handleSignOut = async () => {
    await signOut(auth)
    setUserTier('free')
    setDiscountInfo(null)
  }

  const handleDeleteAccount = useCallback(async () => {
    if (!user) return
    try {
      const token = await user.getIdToken()
      await fetch('/api/account/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      await signOut(auth)
      setUserTier('free')
      setDiscountInfo(null)
    } catch {}
  }, [user])

  const handleExpand = useCallback(async (company: any) => {
    setExpandedCompany(company)
    const siret = company.fields?.SIRET || company.fields?.siret
    if (siret && user && !(siret in aiCacheMap)) {
      try {
        const token = await user.getIdToken()
        const res = await fetch(`/api/ai-overview?siret=${encodeURIComponent(siret)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setAICacheMap((prev) => ({ ...prev, [siret]: data.cached }))
        }
      } catch { /* non-critical */ }
    }
  }, [user, aiCacheMap])

  const handleAskAI = useCallback(async (_company: any) => {
    const uKey = getUserKey(user?.uid ?? null)
    if (!canUseAIOverview(uKey, userTier)) {
      const limit = TIER_LIMITS[userTier].aiOverviewsPerMonth
      setPaywallFeature(limit === 0 ? 'AI Overview' : `more than ${limit} AI overviews per month`)
      return
    }
    const newCount = incrementAIOverviewCount(uKey)
    setAIOverviewCount(newCount)
    const fields = _company.fields ?? {}
    const siret = fields.SIRET || fields.siret || ''
    const companyName = fields["Dénomination de l'unité légale"] || fields.denominationUniteLegale || ''
    const city = fields["Commune de l'établissement"] || fields.communeEtablissement || ''
    if (siret) {
      setAIOverviewsList((prev) => [{ siret, companyName, city, createdAt: new Date().toISOString() }, ...prev.filter((e) => e.siret !== siret)])
    }
    const token = user ? await user.getIdToken() : ''
    setAIToken(token)
    setAISavedOverview(null)
    setAICompany(_company)
  }, [userTier, user])

  const handleViewAI = useCallback(async (_company: any) => {
    if (!user) return
    const siret = _company.fields?.SIRET || _company.fields?.siret
    if (!siret) return
    try {
      const token = await user.getIdToken()
      const res = await fetch(`/api/ai-overview?siret=${encodeURIComponent(siret)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.cached) {
          setAIToken(token)
          setAISavedOverview({ text: data.text, sources: data.sources })
          setAICompany(_company)
          return
        }
      }
    } catch { /* fall through to generate */ }
    handleAskAI(_company)
  }, [user, handleAskAI])

  /** Open a cached AI overview from the settings modal AI overviews list. */
  const handleViewAIBySiret = useCallback(async (siret: string) => {
    if (!user) return
    try {
      const token = await user.getIdToken()
      const res = await fetch(`/api/ai-overview?siret=${encodeURIComponent(siret)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.cached) {
          const entry = aiOverviewsList.find((e) => e.siret === siret)
          const fakeCompany = { fields: { SIRET: siret, "Dénomination de l'unité légale": entry?.companyName ?? siret, "Commune de l'établissement": entry?.city ?? '' } }
          setAIToken(token)
          setAISavedOverview({ text: data.text, sources: data.sources })
          setAICompany(fakeCompany)
        }
      }
    } catch {}
  }, [user, aiOverviewsList])

  /** Redirect the user to a Stripe Checkout session for the selected plan. */
  const handleCheckout = useCallback(async (planId: string, billing: 'monthly' | 'yearly') => {
    if (!user) { setAuthOpen(true); return }
    try {
      const token = await user.getIdToken()
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId, billing }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {}
  }, [user])

  /** Redirect paid users to the Stripe Customer Portal for subscription management. */
  const handleManagePlan = useCallback(async () => {
    if (!user) return
    if (discountInfo) {
      setPaywallFeature('plan')
      return
    }
    try {
      const token = await user.getIdToken()
      const res = await fetch('/api/portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {}
  }, [user, discountInfo])

  /** Redeem a discount code — called from the Paywall component. */
  const handleRedeemCode = useCallback(async (code: string): Promise<{ error?: string }> => {
    if (!user) { setAuthOpen(true); return { error: 'Please sign in first' } }
    try {
      const token = await user.getIdToken()
      const res = await fetch('/api/discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) return { error: data.error ?? 'Failed to redeem code' }
      if (data.plan) setUserTier(data.plan)
      if (data.plan) setDiscountInfo({ code, plan: data.plan, expiresAt: data.expiresAt })
      return {}
    } catch {
      return { error: 'Network error — please try again' }
    }
  }, [user])

  /** Revert a discount-based upgrade back to the free tier. */
  const handleRevertDiscount = useCallback(async () => {
    if (!user) return
    setRevertConfirmOpen(true)
  }, [user])

  /** Actually performs the revert after user confirms. */
  const confirmRevertDiscount = useCallback(async () => {
    if (!user) return
    try {
      const token = await user.getIdToken()
      await fetch('/api/discount/revert', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      setUserTier('free')
      setDiscountInfo(null)
      setRevertConfirmOpen(false)
      setPaywallFeature(null)
    } catch {}
  }, [user])

  const d = isDark
    ? {
        main: 'bg-gray-950',
        sidebar: 'bg-gray-900',
        headerBorder: 'border-white/5',
        title: 'text-white',
        iconBtn: 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-300 hover:text-white',
        themeBtnBg: 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-300 hover:text-white',
        dropdownBg: 'bg-gray-900 border-white/10',
        dropdownLabel: 'text-gray-600',
        dropdownActive: 'text-white bg-white/10',
        dropdownItem: 'text-gray-400 hover:text-gray-200 hover:bg-white/5',
        tabActive: 'text-white border-white/60',
        tab: 'text-gray-600 hover:text-gray-400 border-transparent',
        tabBorder: 'border-white/5',
        check: 'border-white/20 bg-white/5',
        checkActive: 'border-gray-400 bg-gray-400',
        colItem: 'text-gray-400 hover:bg-white/5',
        allBtn: 'text-gray-600 hover:text-gray-400',
        userName: 'text-gray-400',
        signOutBtn: 'text-gray-500 hover:text-red-400',
        signInBtn: 'text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border-white/10',
        savedAreasBorder: 'border-white/5',
        footer: 'border-white/5',
        footerText: 'text-gray-600',
        loadingBg: 'bg-gray-900/90 text-white border-white/10',
      }
    : {
        main: 'bg-gray-100',
        sidebar: 'bg-white',
        headerBorder: 'border-gray-200',
        title: 'text-gray-900',
        iconBtn: 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-600 hover:text-gray-900',
        themeBtnBg: 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-600 hover:text-gray-900',
        dropdownBg: 'bg-white border-gray-200',
        dropdownLabel: 'text-gray-400',
        dropdownActive: 'text-gray-900 bg-gray-100',
        dropdownItem: 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
        tabActive: 'text-gray-900 border-violet-600',
        tab: 'text-gray-400 hover:text-gray-600 border-transparent',
        tabBorder: 'border-gray-100',
        check: 'border-gray-300 bg-white',
        checkActive: 'border-violet-600 bg-violet-600',
        colItem: 'text-gray-600 hover:bg-gray-50',
        allBtn: 'text-gray-400 hover:text-gray-600',
        userName: 'text-gray-500',
        signOutBtn: 'text-gray-400 hover:text-red-500',
        signInBtn: 'text-gray-700 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border-gray-200',
        savedAreasBorder: 'border-gray-200',
        footer: 'border-gray-200',
        footerText: 'text-gray-400',
        loadingBg: 'bg-white/90 text-gray-900 border-gray-200',
      }

  return (
    <>
      <main className={`flex h-screen ${d.main}`}>
      {/* Map */}
      <div className="flex-1 h-full relative">
        <Map
          companies={mapCompanies}
          selectedCompany={selectedCompany}
          onSearch={handleSearch}
          onCompanySelect={setSelectedCompany}
          onExpand={handleExpand}
          onLocate={handleLocate}
          isDark={isDark}
          mapStyle={mapStyle}
          userLocation={userLocation}
          popupColumns={popupColumns}
          restoreGeometry={restoreGeometry}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
        {isLoading && (
          <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-[1000] backdrop-blur-sm text-sm font-medium px-4 py-2 rounded-full shadow-lg border ${d.loadingBg}`}>
            <span className="inline-block animate-pulse">Searching...</span>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div
          className={`flex-shrink-0 h-full transition-[width] duration-300 ease-in-out overflow-hidden ${d.sidebar} ${
            sidebarOpen ? 'w-[380px]' : 'w-0'
          }`}
        >
          <div className="min-w-[380px] w-[380px] h-full flex flex-col">
        {/* Sample data banner */}
        {isSampleData && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-600 dark:text-amber-400">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span className="text-[11px] font-medium">Running on sample data — full dataset not connected</span>
          </div>
        )}
        {isTruncated && resultLimit !== null && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-600 dark:text-amber-400">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[11px] font-medium">
              Showing first {resultLimit.toLocaleString()} results — zoom in or refine your area
            </span>
          </div>
        )}
        {usageWarnings.map((msg) => (
          <div key={msg} className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-600 dark:text-amber-400">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span className="text-[11px] font-medium">{msg} — <button onClick={() => setPaywallFeature('higher usage limits')} className="underline hover:no-underline">upgrade</button></span>
          </div>
        ))}
        {/* Header */}
        <div className={`px-5 pt-5 pb-4 border-b ${d.headerBorder}`}>
          <div className="flex items-center justify-between">
            <img src="/logo-full.png" alt="Public Data Maps" className={`h-12 w-auto ${isDark ? 'invert' : ''}`} />

            <div className="flex items-center gap-1.5">
              {/* Search toggle */}
              <button
                onClick={() => setSearchExpanded(!searchExpanded)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${
                  searchExpanded
                    ? isDark ? 'bg-white/15 border-white/25 text-white' : 'bg-violet-50 border-violet-300 text-violet-600'
                    : d.iconBtn
                }`}
                data-tooltip="Search a place" data-tooltip-pos="bottom"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              {/* Profile */}
              <button
                  onClick={() => { setSettingsModalOpen(true); setSearchExpanded(false) }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all overflow-hidden ${d.iconBtn}`}
                  data-tooltip={user ? 'Account' : 'Settings'} data-tooltip-pos="left"
                >
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="w-full h-full rounded-lg object-cover" />
                  ) : user ? (
                    <span className="w-full h-full rounded-lg bg-violet-600 flex items-center justify-center text-white text-xs font-semibold">
                      {(user.displayName?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                    </span>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  )}
                </button>
            </div>
          </div>

          {searchExpanded && (
            <div className="mt-3">
              <SearchBar isDark={isDark} onSelect={(lat, lon) => { setUserLocation([lat, lon]); setSearchExpanded(false) }} />
            </div>
          )}
        </div>

        {/* Company List */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
          <CompanyList
            companies={companies}
            selectedCompany={selectedCompany}
            onCompanySelect={setSelectedCompany}
            onExpand={handleExpand}
            isDark={isDark}
            listColumns={listColumns}
            columns={displayColumns}
            sortCriteria={sortCriteria}
            onSortChange={handleSortChange}
            filters={filters}
            onFiltersChange={setFilters}
            activePresets={activePresets}
            onPresetsChange={setActivePresets}
            canSave={!!user && !!searchArea}
            hasSearchArea={!!searchArea}
            onSaveSearch={handleSaveSearch}
            onSignInPrompt={handleSignInPrompt}
          />
        </div>

        {/* Footer */}
        <div className={`flex-shrink-0 px-5 py-3 border-t flex items-center ${d.footer}`}>
          <p className={`text-[10px] flex-1 ${d.footerText}`}>
            Data source: SIRENE (INSEE) &middot; Open Data
          </p>
          <button
            onClick={() => { if (!user) { setAuthOpen(true) } else { setExportOpen(true) } }}
            disabled={companies.length === 0}
            className={`text-[10px] font-medium flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-all ${
              companies.length > 0
                ? isDark ? 'text-gray-300 border-white/15 hover:border-white/30 hover:bg-white/5' : 'text-violet-600 border-violet-300 hover:border-violet-400 hover:bg-violet-50'
                : isDark ? 'text-gray-700 border-white/5 cursor-not-allowed' : 'text-gray-400 border-gray-200 cursor-not-allowed'
            }`}
            data-tooltip={user ? 'Export search results' : 'Sign in to export'} data-tooltip-pos="left"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
        </div>
          </div>
        </div>
    </main>

    {authOpen && (
      <AuthModal
        isDark={isDark}
        onClose={() => setAuthOpen(false)}
        isSigningIn={isSigningIn}
      />
    )}

    {settingsModalOpen && (
      <SettingsModal
        isDark={isDark}
        onClose={() => setSettingsModalOpen(false)}
        user={user ? { uid: user.uid, email: user.email ?? null, displayName: user.displayName ?? null, photoURL: user.photoURL ?? null } : null}
        userTier={userTier}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        mapStyle={mapStyle}
        setMapStyle={setMapStyle}
        listColumns={listColumns}
        popupColumns={popupColumns}
        onFieldsModal={setFieldsModalTab}
        onManagePlan={handleManagePlan}
        onPaywall={setPaywallFeature}
        onDeleteAccount={handleDeleteAccount}
        onSignOut={handleSignOut}
        onSignIn={() => setAuthOpen(true)}
        prefsSaved={prefsSaved}
        searchCount={searchCount}
        aiOverviewCount={aiOverviewCount}
        aiOverviewsList={aiOverviewsList}
        savedSearchCount={savedSearchCount}
        usageOpen={usageOpen}
        onUsageToggle={() => { const next = !usageOpen; setUsageOpen(next); try { localStorage.setItem('pdm_usage_open', next ? '1' : '0') } catch {} }}
        onRestoreSearch={(geo, restoredFilters, restoredSortCriteria, restoredPresets, id) => {
          handleSearch(geo)
          setFilters(restoredFilters)
          setSortCriteria(restoredSortCriteria)
          setActivePresets(restoredPresets)
          setActiveSearchId(id)
          setRestoreGeometry({ geometry: geo, ts: Date.now() })
        }}
        onDeleteCurrentSearch={() => handleSearch(null)}
        onSavedSearchCountChange={setSavedSearchCount}
        activeSearchId={activeSearchId}
        onViewAIOverview={handleViewAIBySiret}
      />
    )}

    {expandedCompany && (
      <CompanyDetail
        company={expandedCompany}
        displayColumns={displayColumns}
        isDark={isDark}
        onClose={() => setExpandedCompany(null)}
        onAskAI={handleAskAI}
        onViewAI={handleViewAI}
        hasCachedOverview={!!(expandedCompany.fields?.SIRET && aiCacheMap[expandedCompany.fields.SIRET])}
      />
    )}

    {aiCompany && (
      <AIOverview
        company={aiCompany}
        isDark={isDark}
        onClose={() => { setAICompany(null); setAISavedOverview(null); const siret = aiCompany.fields?.SIRET; if (siret) setAICacheMap((prev) => ({ ...prev, [siret]: true })) }}
        userToken={aiToken}
        savedOverview={aiSavedOverview}
      />
    )}

    {exportOpen && (
      <ExportModal
        companies={mapCompanies}
        displayColumns={displayColumns}
        isDark={isDark}
        onClose={() => setExportOpen(false)}
      />
    )}

    {paywallFeature && (
      <Paywall
        isDark={isDark}
        featureName={paywallFeature}
        onClose={() => setPaywallFeature(null)}
        currentTier={userTier}
        onCheckout={handleCheckout}
        onRedeemCode={handleRedeemCode}
        onRevertDiscount={handleRevertDiscount}
        discountInfo={discountInfo}
      />
    )}

    {revertConfirmOpen && (
      <Modal isDark={isDark} onClose={() => setRevertConfirmOpen(false)} zIndex="z-[9600]" className={`w-[360px] p-6 ${isDark ? 'bg-gray-900 border-white/10' : 'bg-white border-gray-200'}`}>
        {(handleClose) => (<>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Revert to free plan?</h3>
            <CloseButton onClick={handleClose} isDark={isDark} />
          </div>
          <div className={`text-xs leading-relaxed space-y-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            <p>This action is <strong className={isDark ? 'text-white' : 'text-gray-900'}>definitive</strong>. Your discount code will be marked as used and <strong className={isDark ? 'text-white' : 'text-gray-900'}>cannot be redeemed again</strong>.</p>
            <p>You will immediately lose access to premium features and revert to the free plan limits.</p>
          </div>
          <div className="flex gap-2 mt-5">
            <button
              onClick={() => handleClose()}
              className={`flex-1 text-xs font-medium py-2 rounded-lg border transition-colors ${
                isDark
                  ? 'border-white/10 text-gray-300 hover:bg-white/5'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Keep my plan
            </button>
            <button
              onClick={confirmRevertDiscount}
              className={`flex-1 text-xs font-medium py-2 rounded-lg border transition-colors ${
                isDark
                  ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                  : 'border-red-200 text-red-600 hover:bg-red-50'
              }`}
            >
              Revert to free
            </button>
          </div>
        </>)}
      </Modal>
    )}

    {fieldsModalTab && (
        <ColumnConfig
          columns={displayColumns}
          listColumns={listColumns}
          popupColumns={popupColumns}
          onListColumnsChange={setListColumns}
          onPopupColumnsChange={setPopupColumns}
          isDark={isDark}
          initialTab={fieldsModalTab}
          onClose={() => setFieldsModalTab(null)}
        />
    )}
    </>
  )
}
