import { useEffect, useRef, useState } from 'react';

/** 좌표 미리보기용 카카오맵 (마커 1개, 조작 가능). SDK 가 없으면 안내 표시 */
export default function KakaoMapPreview({ lat, lng, className = '' }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [ok, setOk] = useState(Boolean(window.kakao?.maps?.load));

  useEffect(() => {
    const kakao = window.kakao;
    if (!kakao?.maps?.load) {
      setOk(false);
      return undefined;
    }
    let cancelled = false;
    kakao.maps.load(() => {
      if (cancelled || !ref.current) return;
      const pos = new kakao.maps.LatLng(lat, lng);
      if (!mapRef.current) {
        mapRef.current = new kakao.maps.Map(ref.current, { center: pos, level: 3 });
        markerRef.current = new kakao.maps.Marker({ position: pos, map: mapRef.current });
      } else {
        mapRef.current.setCenter(pos);
        markerRef.current.setPosition(pos);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  if (!ok) {
    return (
      <div className={`flex flex-col items-center justify-center bg-gray-100 text-center text-xs text-gray-500 ${className}`}>
        <span className="text-3xl" aria-hidden>🗺️</span>
        <p className="mt-2 font-bold">카카오맵을 불러오지 못했어요</p>
        <p>REACT_APP_KAKAO_MAP_KEY 설정을 확인해 주세요</p>
      </div>
    );
  }
  return <div ref={ref} className={className} data-testid="admin-map-preview" />;
}
