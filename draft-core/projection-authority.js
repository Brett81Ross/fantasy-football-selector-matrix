(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMProjectionAuthority = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PRIMARY_AUTHORITY = Object.freeze({
    id: 'matrix-forecast',
    label: 'Matrix Forecast',
    forwardLooking: true,
    requiresCommercialLicense: false,
    basis: 'CactusByte-derived forecast from permitted NFL data inputs'
  });

  const HISTORICAL_BASELINE = Object.freeze({
    id: 'nflverse-historical',
    label: 'Historical baseline',
    forwardLooking: false,
    requiresCommercialLicense: false,
    basis: 'nflverse roster and historical performance data'
  });

  const EXTERNAL_AUTHORITIES = Object.freeze({
    fantasypros: Object.freeze({
      id: 'fantasypros',
      label: 'FantasyPros Projection',
      forwardLooking: true,
      requiresCommercialLicense: true
    }),
    sleeper: Object.freeze({
      id: 'sleeper',
      label: 'Sleeper Projection',
      forwardLooking: true,
      requiresCommercialLicense: true
    })
  });

  function selectProjectionAuthority(options = {}) {
    const licensed = typeof options.licensedExternal === 'string' ? options.licensedExternal.trim().toLowerCase() : '';
    if (licensed && EXTERNAL_AUTHORITIES[licensed]) return EXTERNAL_AUTHORITIES[licensed];
    if (options.matrixForecastReady === true) return PRIMARY_AUTHORITY;
    return HISTORICAL_BASELINE;
  }

  function freshnessState({ generatedAt, nowMs = Date.now(), maxAgeMs }) {
    if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) return 'unavailable';
    const maxAge = Number(maxAgeMs);
    if (!Number.isFinite(maxAge) || maxAge < 0) return 'unavailable';
    const age = Math.max(0, Number(nowMs) - Date.parse(generatedAt));
    return age <= maxAge ? 'fresh' : 'stale';
  }

  function presentationLabel(authority, freshness) {
    const source = authority && typeof authority === 'object' ? authority : HISTORICAL_BASELINE;
    const label = source.id === HISTORICAL_BASELINE.id ? 'Historical baseline' : (source.label || source.id || 'Forecast');
    return freshness === 'stale' ? `${label} · STALE` : label;
  }

  return {
    PRIMARY_AUTHORITY,
    HISTORICAL_BASELINE,
    EXTERNAL_AUTHORITIES,
    selectProjectionAuthority,
    freshnessState,
    presentationLabel
  };
});