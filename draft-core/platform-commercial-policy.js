(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMPlatformCommercialPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const POLICIES = Object.freeze({
    manual: Object.freeze({
      platform:'manual',
      state:'internal',
      allowed:true,
      reason:'No external fantasy-platform API dependency.'
    }),
    sleeper: Object.freeze({
      platform:'sleeper',
      state:'pending_license',
      allowed:false,
      reason:'Sleeper documents its API as free for non-commercial use and requires direct licensing discussion for commercial use.'
    })
  });

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function platformCommercialStatus(platform, approvals = {}) {
    const key = text(platform).toLowerCase();
    if (key === 'manual') return { ...POLICIES.manual };
    if (key === 'sleeper') {
      const evidenceRef = text(approvals.sleeperLicenseApproved === true ? approvals.evidenceRef : '');
      if (approvals.sleeperLicenseApproved === true && evidenceRef) {
        return {
          platform:'sleeper',
          state:'licensed',
          allowed:true,
          evidenceRef,
          reason:'Commercial Sleeper use explicitly approved with recorded evidence.'
        };
      }
      return { ...POLICIES.sleeper };
    }
    return {
      platform:key || 'unknown',
      state:'unreviewed',
      allowed:false,
      reason:'Commercial-use rights have not been reviewed for this platform.'
    };
  }

  return { POLICIES, platformCommercialStatus };
});