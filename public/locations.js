(() => {
  const statusEl = document.getElementById('locationsStatus');
  const listEl = document.getElementById('locationsList');
  const updatedEl = document.getElementById('locationsUpdated');

  function locationsApiUrl() {
    try {
      const pageOrigin = window.location.origin;
      const backend = new URL(window.BACKEND_URL || pageOrigin);
      if (backend.origin === pageOrigin) return '/api/public/locations';
      return `${backend.origin}/api/public/locations`;
    } catch (_) {
      return '/api/public/locations';
    }
  }

  function groupByDistrict(bundles) {
    const map = new Map();
    for (const bundle of bundles) {
      const district = bundle.district || 'Other';
      if (!map.has(district)) map.set(district, []);
      map.get(district).push(bundle);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
  }

  function renderLocations(bundles) {
    if (!listEl) return;

    if (!bundles.length) {
      listEl.innerHTML = '<p class="locations-empty">No published locations yet. Check back after new bundles are added in the app.</p>';
      listEl.hidden = false;
      return;
    }

    const grouped = groupByDistrict(bundles);
    const html = grouped.map(([district, districtBundles]) => {
      const bundleHtml = districtBundles.map((bundle) => {
        const subpoints = bundle.subpoints || [];
        const subpointItems = subpoints.length
          ? subpoints.map((sp) => `<li>${escapeHtml(sp.name)}</li>`).join('')
          : '<li class="locations-muted">No subpoints listed yet</li>';

        return `
          <article class="locations-bundle">
            <h3 class="locations-bundle__title">${escapeHtml(bundle.name)}</h3>
            <p class="locations-bundle__meta">Bundle · ${subpoints.length} subpoint${subpoints.length === 1 ? '' : 's'}</p>
            <ul class="locations-subpoints">${subpointItems}</ul>
          </article>
        `;
      }).join('');

      return `
        <section class="locations-district">
          <h2 class="locations-district__title">${escapeHtml(district)}</h2>
          <div class="locations-district__bundles">${bundleHtml}</div>
        </section>
      `;
    }).join('');

    listEl.innerHTML = html;
    listEl.hidden = false;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatUpdatedAt(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch (_) {
      return '';
    }
  }

  async function loadLocations() {
    if (statusEl) {
      statusEl.textContent = 'Loading locations…';
      statusEl.className = 'locations-status';
    }
    if (listEl) listEl.hidden = true;
    if (updatedEl) updatedEl.hidden = true;

    try {
      const response = await fetch(locationsApiUrl(), { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Unable to load locations (${response.status})`);
      }

      if (statusEl) statusEl.hidden = true;
      renderLocations(data.bundles || []);

      if (updatedEl && data.updatedAt) {
        const count = data.count || {};
        const summary = [
          count.districts != null ? `${count.districts} district${count.districts === 1 ? '' : 's'}` : null,
          count.bundles != null ? `${count.bundles} bundle${count.bundles === 1 ? '' : 's'}` : null,
          count.subpoints != null ? `${count.subpoints} subpoint${count.subpoints === 1 ? '' : 's'}` : null,
        ].filter(Boolean).join(' · ');

        updatedEl.textContent = summary
          ? `${summary}. Updated ${formatUpdatedAt(data.updatedAt)}.`
          : `Updated ${formatUpdatedAt(data.updatedAt)}.`;
        updatedEl.hidden = false;
      }
    } catch (error) {
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent = error.message || 'Failed to load locations. Please try again later.';
        statusEl.className = 'locations-status locations-status--error';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', loadLocations);
})();
