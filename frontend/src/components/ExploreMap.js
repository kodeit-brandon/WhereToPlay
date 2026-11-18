import { useEffect, useRef, useState } from 'react';
import { sportEmoji } from './VenueList';

const DEFAULT_CENTER = { lat: 37.5133, lng: 127.1001 }; // 잠실
const LOAD_TIMEOUT_MS = 10000;

// 마커(CustomOverlay) 스타일 — 선택 여부에 따라 바뀐다
const PIN_BASE =
  'flex items-center gap-1 pl-1.5 pr-2.5 h-8 rounded-full shadow-lg border-2 text-xs font-black whitespace-nowrap transition-transform';
const PIN_IDLE = 'bg-white text-gray-800 border-white';
const PIN_ACTIVE = 'bg-mint-500 text-white border-mint-500 scale-110';

/**
 * 탐색용 카카오맵: 장소를 이모지 핀(CustomOverlay)으로 표시
 * - venues 가 바뀌면 핀을 다시 그리고 모두 보이도록 범위를 맞춘다
 * - 핀 클릭 → onSelect(venueId), 빈 곳 클릭 → onSelect(null)
 * - '내 주변' 버튼: Geolocation 으로 현재 위치로 이동 + 파란 점 표시
 */
export default function ExploreMap({ venues, selectedId, onSelect, onFallback, className = '' }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const pinsRef = useRef(new Map()); // venueId → { overlay, el }
  const myLocRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [status, setStatus] = useState('loading'); // loading | ready | unavailable
  const [locating, setLocating] = useState(false);

  // 지도 생성 (한 번)
  useEffect(() => {
    const kakao = window.kakao;
    if (!kakao?.maps?.load) {
      setStatus('unavailable');
      return undefined;
    }
    let cancelled = false;
    const pins = pinsRef.current;
    const timer = setTimeout(() => !cancelled && !mapRef.current && setStatus('unavailable'), LOAD_TIMEOUT_MS);
    kakao.maps.load(() => {
      clearTimeout(timer);
      if (cancelled || !containerRef.current) return;
      const map = new kakao.maps.Map(containerRef.current, {
        center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
        level: 7,
      });
      kakao.maps.event.addListener(map, 'click', () => onSelectRef.current(null));
      mapRef.current = map;
      setStatus('ready');
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      pins.forEach(({ overlay }) => overlay.setMap(null));
      pins.clear();
      mapRef.current = null;
    };
  }, []);

  // 장소 핀 다시 그리기 + 범위 맞추기
  useEffect(() => {
    const map = mapRef.current;
    const kakao = window.kakao;
    if (status !== 'ready' || !map) return;

    pinsRef.current.forEach(({ overlay }) => overlay.setMap(null));
    pinsRef.current.clear();

    const withCoords = venues.filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng));
    withCoords.forEach((v) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `${PIN_BASE} ${PIN_IDLE}`;
      el.setAttribute('aria-label', `${v.name} 지도 핀`);
      el.innerHTML = `<span aria-hidden="true">${sportEmoji(v.sport)}</span><span></span>`;
      el.lastChild.textContent = v.name.length > 10 ? `${v.name.slice(0, 10)}…` : v.name;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectRef.current(v.id);
      });
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(v.lat, v.lng),
        content: el,
        yAnchor: 1.2,
        clickable: true,
        map,
      });
      pinsRef.current.set(v.id, { overlay, el });
    });

    if (withCoords.length === 1) {
      map.setCenter(new kakao.maps.LatLng(withCoords[0].lat, withCoords[0].lng));
      map.setLevel(4);
    } else if (withCoords.length > 1) {
      const bounds = new kakao.maps.LatLngBounds();
      withCoords.forEach((v) => bounds.extend(new kakao.maps.LatLng(v.lat, v.lng)));
      map.setBounds(bounds, 60, 40, 220, 40); // 하단 카드 공간을 남긴다
    }
  }, [venues, status]);

  // 선택 핀 강조 + 이동
  useEffect(() => {
    pinsRef.current.forEach(({ el, overlay }, venueId) => {
      const active = venueId === selectedId;
      el.className = `${PIN_BASE} ${active ? PIN_ACTIVE : PIN_IDLE}`;
      el.setAttribute('aria-pressed', String(active));
      overlay.setZIndex?.(active ? 10 : 1);
    });
    const v = venues.find((x) => x.id === selectedId);
    if (v && mapRef.current && window.kakao) mapRef.current.panTo(new window.kakao.maps.LatLng(v.lat, v.lng));
  }, [selectedId, venues]);

  const goToMyLocation = () => {
    if (!navigator.geolocation) {
      window.alert('이 브라우저에서는 현재 위치를 사용할 수 없어요.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { kakao } = window;
        const map = mapRef.current;
        if (!map) return;
        const here = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        map.setCenter(here);
        map.setLevel(5);
        if (!myLocRef.current) {
          const dot = document.createElement('div');
          dot.className = 'w-4 h-4 rounded-full bg-blue-500 ring-4 ring-blue-500/30 border-2 border-white shadow';
          dot.setAttribute('aria-label', '내 위치');
          myLocRef.current = new kakao.maps.CustomOverlay({ position: here, content: dot, map });
        } else {
          myLocRef.current.setPosition(here);
        }
      },
      () => {
        setLocating(false);
        window.alert('현재 위치를 가져올 수 없어요. 위치 권한을 확인해 주세요.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  if (status === 'unavailable') {
    return (
      <div className={`flex flex-col items-center justify-center bg-gray-100 text-center px-6 ${className}`} role="note">
        <p className="text-4xl" aria-hidden>🗺️</p>
        <p className="mt-3 text-sm font-bold text-gray-700">카카오맵을 불러오지 못했어요</p>
        <p className="mt-1 text-xs text-gray-500">REACT_APP_KAKAO_MAP_KEY 설정과 카카오 개발자 콘솔의 도메인 등록을 확인해 주세요.</p>
        {onFallback && (
          <button type="button" onClick={onFallback} className="mt-4 px-4 py-2 rounded-full bg-mint-500 text-white text-sm font-bold">
            📋 목록으로 보기
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="absolute inset-0" data-testid="explore-map" />
      {status === 'loading' && <div className="absolute inset-0 bg-gray-100 animate-pulse" />}
      {status === 'ready' && (
        <button
          type="button"
          onClick={goToMyLocation}
          disabled={locating}
          className="absolute top-3 right-3 z-10 px-3 h-10 rounded-full bg-white shadow-md text-sm font-bold text-gray-700 active:scale-95 transition disabled:opacity-60"
        >
          {locating ? '찾는 중…' : '📍 내 주변 보기'}
        </button>
      )}
    </div>
  );
}
