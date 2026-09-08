(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMPlayerStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function text(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function rawStatus(player) {
    if (typeof player === 'string') return text(player);
    if (!player || typeof player !== 'object') return '';
    return text(player.raw || player.injuryStatus || player.injury_status || player.status);
  }

  function classify(rawValue) {
    const raw = text(rawValue);
    const value = raw.toLowerCase();
    if (!value) return { category:'UNKNOWN', label:'Unknown', available:true, severity:0.55 };
    if (value === 'ir' || value.includes('injured reserve') || value.includes('reserve/injured')) return { category:'IR', label:'IR', available:false, severity:1 };
    if (value === 'pup' || value.includes('physically unable to perform')) return { category:'PUP', label:'PUP', available:false, severity:1 };
    if (value.includes('questionable')) return { category:'QUESTIONABLE', label:'Questionable', available:true, severity:0.45 };
    if (value.includes('doubtful')) return { category:'DOUBTFUL', label:'Doubtful', available:true, severity:0.75 };
    if (value === 'out' || value.includes('inactive')) return { category:'OUT', label:'Out', available:false, severity:1 };
    if (value === 'active' || value === 'healthy' || value === 'probable') return { category:'ACTIVE', label:'Active', available:true, severity:0.05 };
    return { category:'UNKNOWN', label:raw || 'Unknown', available:true, severity:0.55 };
  }

  function normalizePlayerStatus(player) {
    const raw = rawStatus(player);
    const classified = classify(raw);
    return Object.freeze({ raw: raw || 'Unknown', ...classified });
  }

  function statusRisk(statusInput, freshnessInput = {}) {
    const status = statusInput && statusInput.category ? statusInput : normalizePlayerStatus(statusInput);
    const freshness = text(freshnessInput?.status).toLowerCase();
    const penalties = {
      fresh: { risk:0, confidence:1, stale:false },
      stale: { risk:0.15, confidence:0.65, stale:true },
      disconnected: { risk:0.25, confidence:0.4, stale:true },
      unknown: { risk:0.2, confidence:0.5, stale:true }
    };
    const policy = penalties[freshness] || penalties.unknown;
    return Object.freeze({
      category: status.category,
      risk: Math.min(1, Number((status.severity + policy.risk).toFixed(2))),
      confidenceMultiplier: policy.confidence,
      stale: policy.stale,
      shouldMonitor: status.category !== 'ACTIVE' || policy.stale,
      available: status.available
    });
  }

  return { normalizePlayerStatus, statusRisk };
});
