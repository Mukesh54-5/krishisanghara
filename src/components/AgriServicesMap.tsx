import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import type { AgriPlaceItem } from '../types';

interface AgriServicesMapProps {
  center: { lat: number; lng: number };
  centerLabel?: string;
  places?: AgriPlaceItem[];
  selectedPlaceId?: string | null;
  onSelectPlace?: (place: AgriPlaceItem | null) => void;
  onShowRoute?: (place: AgriPlaceItem) => void;
  routeCoordinates?: Array<[number, number]> | null;
  radiusMeters?: number;
  heightClassName?: string;
  zoom?: number;
}

function createPinIcon(options: {
  fill: string;
  border: string;
  innerDot: string;
  size: number;
}): L.DivIcon {
  const { fill, border, innerDot, size } = options;
  const height = Math.round(size * 1.32);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 28 37" aria-hidden="true">
    <path d="M14 1.5C7.1 1.5 1.5 7.1 1.5 14c0 9.4 12.5 21.5 12.5 21.5S26.5 23.4 26.5 14C26.5 7.1 20.9 1.5 14 1.5z" fill="${fill}" stroke="${border}" stroke-width="2"/>
    <circle cx="14" cy="14" r="5" fill="${innerDot}"/>
  </svg>`;

  return L.divIcon({
    html: svg,
    className: 'krishi-leaflet-pin',
    iconSize: [size, height],
    iconAnchor: [size / 2, height],
    popupAnchor: [0, -height + 4],
  });
}

function buildCenterPopupElement(
  titleLabel: string,
  centerLabel: string,
  center: { lat: number; lng: number }
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'p-0.5 text-[#303030] min-w-[180px]';

  const badge = document.createElement('div');
  badge.className = 'text-[11px] font-bold uppercase tracking-wider text-[#207747]';
  badge.textContent = titleLabel;
  wrapper.appendChild(badge);

  const name = document.createElement('div');
  name.className = 'text-xs font-bold text-[#17613A] mt-0.5';
  name.textContent = centerLabel;
  wrapper.appendChild(name);

  const coords = document.createElement('div');
  coords.className = 'text-[11px] text-[#303030]/75 tabular-nums mt-0.5';
  coords.textContent = `${center.lat.toFixed(4)}°N, ${center.lng.toFixed(4)}°E`;
  wrapper.appendChild(coords);

  return wrapper;
}

function buildPlacePopupElement(
  place: AgriPlaceItem,
  labels: {
    directionsShort: string;
    mapsShort: string;
    showRoute: string;
  },
  onShowRoute?: (place: AgriPlaceItem) => void
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'p-0.5 text-[#303030] space-y-1.5 min-w-[200px] max-w-[250px]';

  if (place.primaryType) {
    const typeEl = document.createElement('div');
    typeEl.className = 'text-[11px] font-bold uppercase tracking-wider text-[#F47721]';
    typeEl.textContent = place.primaryType;
    wrapper.appendChild(typeEl);
  }

  const titleEl = document.createElement('h4');
  titleEl.className = 'text-sm font-bold text-[#17613A] leading-snug';
  titleEl.textContent = place.name;
  wrapper.appendChild(titleEl);

  if (typeof place.distanceKm === 'number') {
    const distEl = document.createElement('div');
    distEl.className = 'text-[11px] font-semibold text-[#207747] tabular-nums';
    distEl.textContent = `${place.distanceKm.toFixed(1)} km`;
    wrapper.appendChild(distEl);
  }

  const addrEl = document.createElement('p');
  addrEl.className = 'text-xs text-[#303030]/85 leading-relaxed m-0';
  addrEl.textContent = place.address;
  wrapper.appendChild(addrEl);

  const actions = document.createElement('div');
  actions.className = 'pt-1.5 flex flex-wrap items-center gap-1.5 border-t border-[#E5E7EB]';

  if (onShowRoute) {
    const routeBtn = document.createElement('button');
    routeBtn.type = 'button';
    routeBtn.className =
      'px-2.5 py-1 bg-[#17613A] text-white text-xs font-semibold rounded hover:bg-[#207747] cursor-pointer';
    routeBtn.textContent = labels.showRoute;
    routeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onShowRoute(place);
    });
    actions.appendChild(routeBtn);
  }

  if (place.directionsUri) {
    const dirLink = document.createElement('a');
    dirLink.href = place.directionsUri;
    dirLink.target = '_blank';
    dirLink.rel = 'noopener noreferrer';
    dirLink.className =
      'inline-flex items-center px-2.5 py-1 bg-[#F47721] text-white text-xs font-semibold rounded hover:bg-[#d96312] no-underline';
    dirLink.textContent = labels.directionsShort;
    actions.appendChild(dirLink);
  }

  if (place.osmUri) {
    const osmLink = document.createElement('a');
    osmLink.href = place.osmUri;
    osmLink.target = '_blank';
    osmLink.rel = 'noopener noreferrer';
    osmLink.className =
      'inline-flex items-center px-2 py-1 border border-[#E5E7EB] text-[#17613A] text-xs font-semibold rounded hover:bg-[#F5F8F5] no-underline';
    osmLink.textContent = labels.mapsShort;
    actions.appendChild(osmLink);
  }

  wrapper.appendChild(actions);
  return wrapper;
}

export const AgriServicesMap: React.FC<AgriServicesMapProps> = ({
  center,
  centerLabel,
  places = [],
  selectedPlaceId = null,
  onSelectPlace,
  onShowRoute,
  routeCoordinates = null,
  radiusMeters,
  heightClassName = 'h-[420px] sm:h-[500px]',
  zoom = 12,
}) => {
  const { t } = useTranslation();
  const resolvedCenterLabel = centerLabel || t('agriMap.defaultCenterLabel');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const placeMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const onSelectPlaceRef = useRef(onSelectPlace);
  const onShowRouteRef = useRef(onShowRoute);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    onSelectPlaceRef.current = onSelectPlace;
  }, [onSelectPlace]);

  useEffect(() => {
    onShowRouteRef.current = onShowRoute;
  }, [onShowRoute]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    });

    tileLayer.on('tileerror', () => {
      setTileError(true);
    });
    tileLayer.on('tileload', () => {
      setTileError(false);
    });

    tileLayer.addTo(map);

    const overlayGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    overlayGroupRef.current = overlayGroup;

    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 100);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            map.invalidateSize();
          })
        : null;
    if (resizeObserver && containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.clearTimeout(timer);
      resizeObserver?.disconnect();
      map.remove();
      mapRef.current = null;
      overlayGroupRef.current = null;
      routeLayerRef.current = null;
      placeMarkersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayGroupRef.current;
    if (!map || !overlay) return;

    overlay.clearLayers();
    placeMarkersRef.current.clear();

    if (radiusMeters && radiusMeters > 0) {
      L.circle([center.lat, center.lng], {
        radius: radiusMeters,
        color: '#17613A',
        weight: 1.5,
        dashArray: '6 6',
        fillColor: '#207747',
        fillOpacity: 0.05,
        interactive: false,
      }).addTo(overlay);
    }

    const centerIcon = createPinIcon({
      fill: '#17613A',
      border: '#FFFFFF',
      innerDot: '#F47721',
      size: 32,
    });
    const centerMarker = L.marker([center.lat, center.lng], {
      icon: centerIcon,
      title: resolvedCenterLabel,
      zIndexOffset: 600,
    }).addTo(overlay);
    centerMarker.bindPopup(
      buildCenterPopupElement(t('agriMap.selectedLocation'), resolvedCenterLabel, center),
      { maxWidth: 260 }
    );

    for (const place of places) {
      const isSelected = selectedPlaceId === place.id;
      const icon = createPinIcon({
        fill: isSelected ? '#F47721' : '#207747',
        border: isSelected ? '#B84D08' : '#114B2C',
        innerDot: '#FFFFFF',
        size: isSelected ? 33 : 27,
      });

      const marker = L.marker([place.latitude, place.longitude], {
        icon,
        title: place.name,
        zIndexOffset: isSelected ? 900 : 200,
      }).addTo(overlay);

      marker.bindPopup(
        buildPlacePopupElement(
          place,
          {
            directionsShort: t('agriMap.directionsShort'),
            mapsShort: t('agriMap.mapsShort'),
            showRoute: t('agriMap.showRoute'),
          },
          onShowRouteRef.current
        ),
        { maxWidth: 280 }
      );

      marker.on('click', () => {
        onSelectPlaceRef.current?.(place);
      });

      placeMarkersRef.current.set(place.id, marker);
    }
  }, [center, resolvedCenterLabel, places, selectedPlaceId, radiusMeters, t]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }

    if (routeCoordinates && routeCoordinates.length > 1) {
      const poly = L.polyline(routeCoordinates, {
        color: '#F47721',
        weight: 4.5,
        opacity: 0.9,
      }).addTo(map);
      routeLayerRef.current = poly;
      map.fitBounds(poly.getBounds(), { padding: [48, 48], maxZoom: 15 });
    }
  }, [routeCoordinates]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (routeCoordinates && routeCoordinates.length > 1) {
      return;
    }

    if (selectedPlaceId) {
      const target = places.find((p) => p.id === selectedPlaceId);
      if (target) {
        const nextZoom = Math.max(map.getZoom(), 14);
        map.setView([target.latitude, target.longitude], nextZoom, { animate: true });
        const marker = placeMarkersRef.current.get(target.id);
        if (marker) {
          marker.openPopup();
        }
        return;
      }
    }

    if (places.length > 0) {
      const bounds = L.latLngBounds([[center.lat, center.lng]]);
      for (const p of places) {
        bounds.extend([p.latitude, p.longitude]);
      }
      map.fitBounds(bounds, { padding: [44, 44], maxZoom: 14 });
    } else {
      map.setView([center.lat, center.lng], zoom, { animate: true });
    }
  }, [center, places, selectedPlaceId, zoom, routeCoordinates]);

  return (
    <div
      className={`relative w-full ${heightClassName} rounded-lg overflow-hidden border border-[#E5E7EB] bg-[#F5F8F5]`}
    >
      <div ref={containerRef} className="w-full h-full z-0" />
      {tileError && (
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-[500] bg-white/95 border border-[#E5E7EB] rounded px-3 py-2 text-xs text-[#17613A] shadow-sm">
          <span className="font-semibold">{t('agriMap.mapUnavailableTitle')}:</span>{' '}
          {t('agriMap.mapUnavailableDesc')}
        </div>
      )}
    </div>
  );
};
