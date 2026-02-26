'use client'

import { MapContainer, TileLayer, FeatureGroup, useMap, Marker, Popup } from 'react-leaflet'
import { EditControl } from 'react-leaflet-draw'
import { useRef, useEffect, useCallback } from 'react'

import L from 'leaflet'
delete (L.Icon.Default.prototype as any)._getIconUrl;

const defaultIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [20, 33],
  iconAnchor: [10, 33],
  popupAnchor: [1, -28],
  shadowSize: [33, 33],
});

const selectedIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [38, 62],
  iconAnchor: [19, 62],
  popupAnchor: [1, -52],
  shadowSize: [62, 62],
});

function SelectedMarkerPopup({ selectedCompany }: { selectedCompany: any }) {
  const map = useMap()
  const markerRef = useRef<L.Marker | null>(null)

  useEffect(() => {
    if (selectedCompany && markerRef.current) {
      map.setView([selectedCompany.lat, selectedCompany.lon], Math.max(map.getZoom(), 13), { animate: true })
      setTimeout(() => {
        markerRef.current?.openPopup()
      }, 300)
    }
  }, [selectedCompany, map])

  if (!selectedCompany) return null

  return (
    <Marker
      ref={markerRef}
      position={[selectedCompany.lat, selectedCompany.lon]}
      icon={selectedIcon}
      zIndexOffset={1000}
    >
      <Popup>
        <div className="min-w-[180px]">
          <p className="font-semibold text-sm leading-tight">{selectedCompany.name}</p>
          <p className="text-xs text-gray-400 mt-1">{selectedCompany.postalCode} {selectedCompany.city}</p>
        </div>
      </Popup>
    </Marker>
  )
}

function LocationUpdater({ userLocation }: { userLocation: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (userLocation) {
      map.flyTo(userLocation, Math.max(map.getZoom(), 12), { animate: true, duration: 1.2 })
    }
  }, [userLocation, map])
  return null
}

export default function Map({
  companies,
  selectedCompany,
  onSearch,
  onCompanySelect,
  isDark,
  mapStyle,
  userLocation,
}: {
  companies: any[]
  selectedCompany: any
  onSearch: (geometry: any) => void
  onCompanySelect: (company: any) => void
  isDark: boolean
  mapStyle: 'themed' | 'default'
  userLocation: [number, number] | null
}) {
  const featureGroupRef = useRef<L.FeatureGroup | null>(null)

  const clearPreviousLayers = useCallback(() => {
    if (featureGroupRef.current) {
      featureGroupRef.current.clearLayers()
    }
  }, [])

  const onCreated = useCallback((e: any) => {
    // Remove all previous drawings, keep only the new one
    if (featureGroupRef.current) {
      featureGroupRef.current.eachLayer((layer: any) => {
        if (layer !== e.layer) {
          featureGroupRef.current?.removeLayer(layer)
        }
      })
    }
    const geo = e.layer.toGeoJSON().geometry
    onSearch(geo)
  }, [onSearch])

  const onEdited = useCallback((e: any) => {
    const layers = e.layers
    let lastGeometry: any = null
    layers.eachLayer((layer: any) => {
      lastGeometry = layer.toGeoJSON().geometry
    })
    if (lastGeometry) {
      onSearch(lastGeometry)
    }
  }, [onSearch])

  const onDeleted = useCallback(() => {
    onSearch(null)
  }, [onSearch])

  return (
    <MapContainer
      center={[46.603354, 1.888334]}
      zoom={6}
      scrollWheelZoom={true}
      className="absolute inset-0 z-0"
    >
      <TileLayer
        key={mapStyle === 'default' ? 'default' : isDark ? 'carto-dark' : 'carto-light'}
        attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url={
          mapStyle === 'default'
            ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            : isDark
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        }
      />
      <FeatureGroup ref={featureGroupRef}>
        <EditControl
          position="topright"
          onCreated={onCreated}
          onEdited={onEdited}
          onDeleted={onDeleted}
          draw={{
            polygon: {
              shapeOptions: {
                color: '#3b82f6',
                weight: 2,
                fillOpacity: 0.15,
              },
              allowIntersection: false,
              showArea: true,
            },
            rectangle: {
              shapeOptions: {
                color: '#3b82f6',
                weight: 2,
                fillOpacity: 0.15,
              },
            },
            circle: false,
            circlemarker: false,
            marker: false,
            polyline: false,
          }}
          edit={{
            edit: {
              selectedPathOptions: {
                color: '#60a5fa',
                fillOpacity: 0.25,
              },
            } as any,
          }}
        />
      </FeatureGroup>
      {companies.map((company) => {
        const isSelected = selectedCompany?.siret === company.siret
        if (isSelected) return null
        return (
          <Marker
            key={company.siret}
            position={[company.lat, company.lon]}
            icon={defaultIcon}
            eventHandlers={{
              click: () => onCompanySelect(company),
            }}
          >
            <Popup>
              <div className="min-w-[160px]">
                <p className="font-semibold text-sm leading-tight">{company.name}</p>
                <p className="text-xs text-gray-400 mt-1">{company.postalCode} {company.city}</p>
              </div>
            </Popup>
          </Marker>
        )
      })}
      <SelectedMarkerPopup selectedCompany={selectedCompany} />
      <LocationUpdater userLocation={userLocation} />
    </MapContainer>
  )
}
