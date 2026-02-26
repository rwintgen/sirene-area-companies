'use client'

import { useState, useEffect } from 'react'

export default function CompanyList({
  companies,
  selectedCompany,
  onCompanySelect,
  isDark,
}: {
  companies: any[]
  selectedCompany: any
  onCompanySelect: (company: any) => void
  isDark: boolean
}) {
  const [page, setPage] = useState(1)
  const itemsPerPage = 20
  const totalPages = Math.ceil(companies.length / itemsPerPage)

  useEffect(() => {
    setPage(1)
  }, [companies])

  const handlePageChange = (newPage: number) => {
    if (newPage > 0 && newPage <= totalPages) {
      setPage(newPage)
    }
  }

  const paginatedCompanies = companies.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  )

  const t = isDark
    ? {
        emptyText: 'text-gray-400',
        label: 'text-gray-400',
        badge: 'text-gray-500 bg-gray-800/50',
        itemHover: 'hover:bg-white/5',
        itemSelectedBg: 'bg-blue-500/15 border-blue-500/40 shadow-sm shadow-blue-500/10',
        itemText: 'text-gray-200',
        itemSub: 'text-gray-500',
        paginationBorder: 'border-white/5',
        paginationBtn: 'text-gray-400 hover:text-white disabled:hover:text-gray-400',
        paginationNum: 'text-gray-500',
      }
    : {
        emptyText: 'text-gray-500',
        label: 'text-gray-500',
        badge: 'text-gray-500 bg-gray-100',
        itemHover: 'hover:bg-gray-100',
        itemSelectedBg: 'bg-blue-50 border-blue-300 shadow-sm shadow-blue-100',
        itemText: 'text-gray-800',
        itemSub: 'text-gray-400',
        paginationBorder: 'border-gray-200',
        paginationBtn: 'text-gray-500 hover:text-gray-900 disabled:hover:text-gray-500',
        paginationNum: 'text-gray-400',
      }

  if (companies.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 ${t.emptyText}`}>
        <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <p className="text-sm">Draw a polygon on the map to find companies</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className={`text-xs font-semibold uppercase tracking-wider ${t.label}`}>
          Results
        </h2>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${t.badge}`}>
          {companies.length} found
        </span>
      </div>

      <ul className="flex-1 space-y-1 overflow-y-auto">
        {paginatedCompanies.map((company) => {
          const isSelected = selectedCompany?.siret === company.siret
          return (
            <li
              key={company.siret}
              onClick={() => onCompanySelect(company)}
              className={`cursor-pointer rounded-lg px-3 py-2.5 transition-all duration-150 border ${
                isSelected
                  ? t.itemSelectedBg
                  : `border-transparent ${t.itemHover}`
              }`}
            >
              <p className={`text-sm font-medium leading-tight ${isSelected ? 'text-blue-500' : t.itemText}`}>
                {company.name}
              </p>
              <p className={`text-xs mt-0.5 ${t.itemSub}`}>
                {company.postalCode} {company.city}
              </p>
            </li>
          )
        })}
      </ul>

      {totalPages > 1 && (
        <div className={`flex items-center justify-between pt-3 mt-3 border-t ${t.paginationBorder}`}>
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
            className={`text-xs font-medium disabled:opacity-30 transition-colors px-2 py-1 ${t.paginationBtn}`}
          >
            ← Prev
          </button>
          <span className={`text-xs ${t.paginationNum}`}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page === totalPages}
            className={`text-xs font-medium disabled:opacity-30 transition-colors px-2 py-1 ${t.paginationBtn}`}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
