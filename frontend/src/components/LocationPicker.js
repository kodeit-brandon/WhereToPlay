import { useEffect, useRef, useState } from 'react';

// 기본 지도 중심: 잠실역 부근
export const DEFAULT_CENTER = { lat: 37.5133, lng: 127.1001 };
// 키가 틀리거나 도메인이 등록되지 않으면 kakao.maps.load 콜백이 영영 오지 않으므로 시간 제한을 둔다
const LOAD_TIMEOUT_MS = 10000;
const MAX_RESULTS = 5;

const round6 = (n) => Math.round(n * 1e6) / 1e6;

/** 카카오 검색 콜백을 Promise로 (결과 없음/에러는 빈 배열) */
function searchAsync(fn, maps) {
  return new Promise((resolve) => {
    fn((result, status) => resolve(status === maps.services.Status.OK && Array.isArray(result) ? result : []));
  });
}

/**
 * 키워드(Places) + 주소(Geocoder) 검색 결과를 합쳐 최대 5개로.
 * 주소 검색 결과를 먼저(정확한 주소를 입력한 경우), 그다음 장소 결과. 같은 좌표는 하나만.
 */
async function searchPlaces(query, services) {
  const { maps } = window.kakao;
  const [addresses, places] = await Promise.all([
    services.geocoder ? searchAsync((cb) => services.geocoder.addressSearch(query, cb, { size: MAX_RESULTS }), maps) : [],
    services.places ? searchAsync((cb) => services.places.keywordSearch(query, cb, { size: MAX_RESULTS }), maps) : [],
  ]);

  const fromAddress = addresses.map((a) => ({
    key: `addr-${a.x}-${a.y}`,
    kind: 'address',
    name: a.road_address?.building_name || '', // 주소 검색엔 장소명이 없을 수 있음
    address: a.road_address?.address_name || a.address_name,
    subAddress: a.road_address ? a.address?.address_name || a.address_name : '',
    lat: Number(a.y),
    lng: Number(a.x),
  }));
  const fromPlaces = places.map((p) => ({
    key: `place-${p.id || `${p.x}-${p.y}`}`,
    kind: 'place',
    name: p.place_name,
    address: p.road_address_name || p.address_name,
    subAddress: p.road_address_name ? p.address_name : '',
    category: (p.category_name || '').split('>').pop().trim(),
    lat: Number(p.y),
    lng: Number(p.x),
  }));

  const seen = new Set();
  return [...fromAddress, ...fromPlaces]
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
    .filter((r) => {
      const k = `${r.lat.toFixed(5)},${r.lng.toFixed(5)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX_RESULTS);
}

/**
 * 카카오맵 위치 선택기
 * - (searchable) 지도 위 검색창: 주소/장소명 검색 → 결과 클릭 시 지도 이동 + 핀 + onPlaceSelect
 * - 지도를 드래그하면 화면 중앙에 마커가 따라오고, 멈추면 그 좌표를 onChange 로 알려준다.
 * - 지도를 터치(클릭)하면 그 지점으로 이동하면서 마커가 꽂힌다.
 * - 좌표가 바뀌면 카카오 Geocoder 로 주소를 찾아 onAddress 로 알려준다.
 * - public/index.html 의 카카오맵 SDK(autoload=false, libraries=services)를 사용한다.
 */
export default function LocationPicker({ onChange, onAddress, onPlaceSelect, searchable = false, className = '' }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const servicesRef = useRef({ geocoder: null, places: null });
  // 검색 결과로 이동했을 때는 그 결과의 주소를 그대로 쓰고, 역지오코딩으로 덮어쓰지 않는다
  const skipGeocodeAt = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | unavailable
  const [locating, setLocating] = useState(false);

  // 검색 상태
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null); // null: 닫힘, []: 결과 없음
  const [searching, setSearching] = useState(false);
  const searchBoxRef = useRef(null);

  // 부모가 렌더할 때마다 지도를 다시 만들지 않도록 콜백은 ref로 들고 있는다
  const cb = useRef({ onChange, onAddress, onPlaceSelect });
  cb.current = { onChange, onAddress, onPlaceSelect };

  useEffect(() => {
    const kakao = window.kakao;
    if (!kakao?.maps?.load) {
      setStatus('unavailable');
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled && !mapRef.current) setStatus('unavailable');
    }, LOAD_TIMEOUT_MS);
    kakao.maps.load(() => {
      clearTimeout(timer);
      if (cancelled || !containerRef.current) return;
      const { maps } = kakao;
      const center = new maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng);
      const map = new maps.Map(containerRef.current, { center, level: 3 });
      const marker = new maps.Marker({ position: center, map });
      const geocoder = maps.services?.Geocoder ? new maps.services.Geocoder() : null;
      const places = maps.services?.Places ? new maps.services.Places() : null;
      mapRef.current = map;
      servicesRef.current = { geocoder, places };

      const report = () => {
        const c = map.getCenter();
        const lat = round6(c.getLat());
        const lng = round6(c.getLng());
        cb.current.onChange?.({ lat, lng });

        const skip = skipGeocodeAt.current;
        skipGeocodeAt.current = null;
        if (skip && Math.abs(skip.lat - lat) < 1e-6 && Math.abs(skip.lng - lng) < 1e-6) return;

        geocoder?.coord2Address(lng, lat, (result, st) => {
          if (st !== maps.services.Status.OK || !result?.[0]) return;
          const addr = result[0].road_address?.address_name || result[0].address?.address_name;
          if (addr) cb.current.onAddress?.(addr);
        });
      };

      // 드래그 중에는 마커가 중심을 따라오고, 멈추면(idle) 좌표 확정
      maps.event.addListener(map, 'center_changed', () => marker.setPosition(map.getCenter()));
      maps.event.addListener(map, 'idle', report);
      // 터치/클릭한 곳으로 이동 → 마커 꽂힘
      maps.event.addListener(map, 'click', (e) => map.panTo(e.latLng));

      setStatus('ready');
      report();
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      mapRef.current = null;
    };
  }, []);

  // 검색 결과 바깥을 누르면 닫기
  useEffect(() => {
    if (results === null) return undefined;
    const onDown = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) setResults(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [results]);

  const runSearch = async () => {
    const q = query.trim();
    if (!q || status !== 'ready') return;
    setSearching(true);
    try {
      setResults(await searchPlaces(q, servicesRef.current));
    } finally {
      setSearching(false);
    }
  };

  const selectResult = (r) => {
    const { kakao } = window;
    const map = mapRef.current;
    if (!map || !kakao) return;
    setResults(null);
    setQuery(r.name || r.address);
    skipGeocodeAt.current = { lat: round6(r.lat), lng: round6(r.lng) };
    map.setLevel?.(3);
    // 중심 이동 → center_changed(마커 이동) → idle(좌표 onChange)
    map.setCenter(new kakao.maps.LatLng(r.lat, r.lng));
    cb.current.onAddress?.(r.address);
    cb.current.onPlaceSelect?.({ name: r.name, address: r.address, lat: round6(r.lat), lng: round6(r.lng) });
  };

  const goToMyLocation = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { kakao } = window;
        mapRef.current?.setCenter(new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
        setLocating(false);
      },
      () => {
        window.alert('현재 위치를 가져올 수 없어요. 위치 권한을 확인해 주세요.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  if (status === 'unavailable') {
    return (
      <div className={`flex flex-col items-center justify-center bg-gray-100 text-center px-6 ${className}`} role="note">
        <p className="text-4xl" aria-hidden>🗺️</p>
        <p className="mt-3 text-sm font-bold text-gray-700">카카오맵을 불러오지 못했어요</p>
        <p className="mt-1 text-xs text-gray-500">
          frontend/.env.local 의 REACT_APP_KAKAO_MAP_KEY 와 카카오 개발자 콘솔의 도메인 등록을 확인해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* 검색창 (지도 바로 위) — 바깥 폼이 제출되지 않도록 form 태그 대신 div + Enter 처리 */}
      {searchable && (
        <div ref={searchBoxRef} className="relative z-20 p-3 bg-white border-b border-gray-100">
          <div className="flex gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  runSearch();
                } else if (e.key === 'Escape') {
                  setResults(null);
                }
              }}
              placeholder="주소 또는 장소명 검색 (예: 잠실종합운동장)"
              aria-label="주소 또는 장소명 검색"
              disabled={status !== 'ready'}
              className="flex-1 min-w-0 h-11 px-4 rounded-xl bg-gray-100 text-[14px] text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-mint-500/40"
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={status !== 'ready' || !query.trim() || searching}
              className="shrink-0 h-11 px-4 rounded-xl bg-gray-900 text-white text-sm font-bold transition enabled:active:scale-95 disabled:bg-gray-300"
            >
              {searching ? '검색 중' : '검색'}
            </button>
          </div>

          {results !== null && (
            <ul
              role="listbox"
              aria-label="검색 결과"
              className="absolute left-3 right-3 top-full mt-1 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
            >
              {results.length === 0 ? (
                <li className="px-4 py-5 text-center text-sm text-gray-400">검색 결과가 없어요. 다른 이름이나 주소로 찾아보세요.</li>
              ) : (
                results.map((r) => (
                  <li key={r.key} role="option" aria-selected="false">
                    <button
                      type="button"
                      onClick={() => selectResult(r)}
                      className="w-full text-left px-4 py-3 hover:bg-mint-50 active:bg-mint-50 border-b border-gray-50 last:border-0"
                    >
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden>{r.kind === 'place' ? '📍' : '🏠'}</span>
                        <span className="font-bold text-[14px] text-gray-900 truncate">{r.name || r.address}</span>
                        {r.category && <span className="shrink-0 text-[11px] text-gray-400">{r.category}</span>}
                      </span>
                      {r.name && <span className="block mt-0.5 pl-6 text-xs text-gray-500 truncate">{r.address}</span>}
                      {r.subAddress && <span className="block pl-6 text-[11px] text-gray-400 truncate">지번 {r.subAddress}</span>}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      <div className={`relative ${className}`}>
        <div ref={containerRef} className="absolute inset-0" data-testid="kakao-map" />
        {status === 'loading' && <div className="absolute inset-0 bg-gray-100 animate-pulse" />}
        {status === 'ready' && (
          <>
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-gray-900/80 text-white text-xs font-bold shadow pointer-events-none whitespace-nowrap">
              지도를 움직이거나 터치해서 위치를 맞춰주세요
            </div>
            <button
              type="button"
              onClick={goToMyLocation}
              disabled={locating}
              className="absolute bottom-3 right-3 z-10 px-3 h-10 rounded-full bg-white shadow-md text-sm font-bold text-gray-700 active:scale-95 transition disabled:opacity-60"
            >
              {locating ? '찾는 중…' : '📍 내 위치'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
