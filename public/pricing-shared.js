/**
 * Website premium pricing — Android (Play) vs iOS (App Store) India tiers.
 */
window.TlangauPricing = {
  platformPricing: {
    android: {
      monthlyPerService: 10,
      yearlyPerService: 100,
      monthlyCheckout: { 1: 10, 2: 20, 3: 30 },
      yearlyCheckout: { 1: 100, 2: 200, 3: 300 },
      yearlySaveBundle: { 1: 'Save 17%', 2: 'Save 17%', 3: 'Save 17%' },
    },
    ios: {
      monthlyPerService: 29,
      yearlyPerService: 199,
      monthlyCheckout: { 1: 29, 2: 49, 3: 99 },
      yearlyCheckout: { 1: 199, 2: 399, 3: 599 },
      yearlySaveBundle: { 1: 'Save 43%', 2: 'Save 33%', 3: 'Save 50%' },
    },
  },
  paidServices: [
    {
      id: 'ring',
      title: 'Bawlhhlawh paih tur hriattirna',
      subtitle: 'Ring notification',
      icon: '&#128260;',
      color: '#AD131D',
    },
    {
      id: 'message',
      title: 'Information Notice',
      subtitle: 'Message notification',
      icon: '&#128172;',
      color: '#3B8C19',
    },
    {
      id: 'broadcast',
      title: 'Broadcast Message',
      subtitle: 'Broadcast message',
      icon: '&#128226;',
      color: '#1565C0',
    },
  ],
  freeServices: [
    { title: 'Statistics & Insights', icon: '&#128202;' },
    { title: 'Polls', icon: '&#128203;' },
  ],
  stores: {
    ios: 'https://apps.apple.com/app/id6769981685',
    android:
      'https://play.google.com/store/apps/details?id=com.ruatfela.tlangau.tlangau',
  },
  tier(platform) {
    return this.platformPricing[platform] || this.platformPricing.android;
  },
  formatInr(amount) {
    return Number(amount).toFixed(0);
  },
  formatInrDisplay(amount) {
    return `&#8377;${this.formatInr(amount)}.00`;
  },
  checkoutTotal(platform, period, count) {
    const tier = this.tier(platform);
    const map =
      period === 'yearly' ? tier.yearlyCheckout : tier.monthlyCheckout;
    if (count <= 0) {
      return period === 'yearly' ? tier.yearlyPerService : tier.monthlyPerService;
    }
    if (count >= 3) return map[3];
    return map[count];
  },
  perService(platform, period) {
    const tier = this.tier(platform);
    return period === 'yearly' ? tier.yearlyPerService : tier.monthlyPerService;
  },
  yearlySaveForBundle(platform, count) {
    if (count < 1 || count > 3) return null;
    const tier = this.tier(platform);
    return tier.yearlySaveBundle?.[count] || null;
  },
};

function formatPeriodLabel(period) {
  return period === 'yearly' ? 'year' : 'month';
}

function bindToggleGroup(root, attr, onChange) {
  if (!root) return null;
  const buttons = root.querySelectorAll(`[${attr}]`);
  let current = null;
  buttons.forEach((btn) => {
    if (btn.classList.contains('is-active')) {
      current = btn.getAttribute(attr);
    }
    btn.addEventListener('click', () => {
      const value = btn.getAttribute(attr);
      buttons.forEach((b) => b.classList.toggle('is-active', b === btn));
      onChange(value);
    });
  });
  return current || buttons[0]?.getAttribute(attr);
}

function renderInteractiveServices(container, selected, period, platform, onUpdate) {
  const p = window.TlangauPricing;
  container.innerHTML = '';

  p.paidServices.forEach((svc) => {
    const checked = selected.has(svc.id);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `pricing-service-pick${checked ? ' is-selected' : ''}`;
    row.setAttribute('aria-pressed', checked ? 'true' : 'false');
    row.innerHTML = `
      <span class="pricing-service-pick__icon" style="color:${svc.color}">${svc.icon}</span>
      <span class="pricing-service-pick__text">
        <strong>${svc.subtitle}</strong>
      </span>
      <span class="pricing-service-pick__price">${p.formatInrDisplay(p.perService(platform, period))}</span>
    `;
    row.addEventListener('click', () => {
      if (selected.has(svc.id)) selected.delete(svc.id);
      else selected.add(svc.id);
      onUpdate();
    });
    container.appendChild(row);
  });

  p.freeServices.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'pricing-service-pick pricing-service-pick--free';
    row.innerHTML = `
      <span class="pricing-service-pick__icon">${f.icon}</span>
      <span class="pricing-service-pick__text"><strong>${f.title}</strong></span>
      <span class="free-badge">FREE</span>
    `;
    container.appendChild(row);
  });
}

function updateHeroPrice(root, platform, period, selectedCount) {
  const p = window.TlangauPricing;
  const amountEl = root.querySelector('[data-total-amount]');
  const suffixEl = root.querySelector('[data-price-suffix]');
  const saveEl = root.querySelector('[data-bundle-save]');
  const hintEl = root.querySelector('[data-hint]');
  const storeLabel = root.querySelector('[data-store-label]');
  const getBtn = root.querySelector('[data-get-store]');
  const storeName = platform === 'ios' ? 'App Store' : 'Google Play';

  const total = p.checkoutTotal(platform, period, selectedCount);
  const displayAmount = selectedCount === 0 ? p.perService(platform, period) : total;
  if (amountEl) amountEl.textContent = p.formatInr(displayAmount);
  if (suffixEl) {
    suffixEl.textContent =
      selectedCount === 0
        ? `/service / ${formatPeriodLabel(period)}`
        : selectedCount === 1
          ? `/service / ${formatPeriodLabel(period)}`
          : `/ ${formatPeriodLabel(period)} (${selectedCount} services)`;
  }
  if (saveEl) {
    saveEl.textContent = '';
    saveEl.hidden = true;
  }
  if (hintEl) {
    hintEl.textContent =
      selectedCount === 0
        ? `Tap Ring, Message, or Broadcast — ${storeName} pricing (India).`
        : `${selectedCount} service${selectedCount > 1 ? 's' : ''} · checkout total for ${storeName}.`;
  }
  if (storeLabel) storeLabel.textContent = storeName;
  if (getBtn) getBtn.href = p.stores[platform];
}

function updateSelectionSave(root, platform, period, selectedCount) {
  const el = root.querySelector('[data-selection-save]');
  if (!el) return;
  const save =
    period === 'yearly' && selectedCount > 0
      ? window.TlangauPricing.yearlySaveForBundle(
          platform,
          Math.min(selectedCount, 3),
        )
      : null;
  if (save) {
    el.innerHTML = `<span class="save-tag">${save}</span>`;
    el.hidden = false;
  } else {
    el.innerHTML = '';
    el.hidden = true;
  }
}

function initPricingExplorer(rootId) {
  const root = document.getElementById(rootId);
  if (!root) return;

  const selected = new Set();
  let platform = 'ios';
  let period = 'monthly';
  const servicesEl = root.querySelector('[data-services]');

  function refresh() {
    renderInteractiveServices(servicesEl, selected, period, platform, refresh);
    updateHeroPrice(root, platform, period, selected.size);
    updateSelectionSave(root, platform, period, selected.size);
  }

  platform =
    bindToggleGroup(root.querySelector('[data-platform-toggle]'), 'data-platform', (v) => {
      platform = v;
      refresh();
    }) || platform;
  period =
    bindToggleGroup(root.querySelector('[data-period-toggle]'), 'data-period', (v) => {
      period = v;
      refresh();
    }) || period;
  refresh();
}

function bundleSaveTagHtml(platform, count) {
  const tag = window.TlangauPricing.yearlySaveForBundle(platform, count);
  return tag ? ` <span class="save-tag">${tag}</span>` : '';
}

function renderStoreCard(container, platform) {
  const p = window.TlangauPricing;
  const tier = p.tier(platform);
  const storeName = platform === 'ios' ? 'App Store' : 'Google Play';
  const isIos = platform === 'ios';

  container.className = `store-pricing-card store-pricing-card--${platform}`;
  container.innerHTML = `
    <div class="store-pricing-card__head">
      <h2>${isIos ? 'iPhone' : 'Android'}</h2>
      <p>via ${storeName}</p>
    </div>
    <div class="store-pricing-card__period">
      <h3>Monthly</h3>
      <ul class="store-price-list">
        ${p.paidServices
          .map(
            (s) =>
              `<li><span>${s.subtitle}</span><span>${p.formatInrDisplay(tier.monthlyPerService)}</span></li>`
          )
          .join('')}
        <li class="bundle-line"><span>1 service</span><span>${p.formatInrDisplay(tier.monthlyCheckout[1])}</span></li>
        <li class="bundle-line"><span>2 services</span><span>${p.formatInrDisplay(tier.monthlyCheckout[2])}</span></li>
        <li class="bundle-line"><span>3 services</span><span>${p.formatInrDisplay(tier.monthlyCheckout[3])}</span></li>
      </ul>
    </div>
    <div class="store-pricing-card__period">
      <h3>Yearly</h3>
      <ul class="store-price-list">
        ${p.paidServices
          .map(
            (s) =>
              `<li><span>${s.subtitle}</span><span>${p.formatInrDisplay(tier.yearlyPerService)}</span></li>`
          )
          .join('')}
        <li class="bundle-line"><span>1 service${bundleSaveTagHtml(platform, 1)}</span><span>${p.formatInrDisplay(tier.yearlyCheckout[1])}</span></li>
        <li class="bundle-line"><span>2 services${bundleSaveTagHtml(platform, 2)}</span><span>${p.formatInrDisplay(tier.yearlyCheckout[2])}</span></li>
        <li class="bundle-line"><span>3 services${bundleSaveTagHtml(platform, 3)}</span><span>${p.formatInrDisplay(tier.yearlyCheckout[3])}</span></li>
      </ul>
    </div>
    <div class="store-pricing-card__free">
      <p>Included free</p>
      ${p.freeServices
        .map(
          (f) =>
            `<div class="premium-free-row"><span>${f.title}</span><span class="free-badge">FREE</span></div>`
        )
        .join('')}
    </div>
    <a class="btn btn-large btn-primary store-get-btn" href="${p.stores[platform]}" target="_blank" rel="noopener noreferrer">GET</a>
  `;
}

function initStorePricingGrid(rootId) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const ios = root.querySelector('[data-store-card="ios"]');
  const android = root.querySelector('[data-store-card="android"]');
  if (ios) renderStoreCard(ios, 'ios');
  if (android) renderStoreCard(android, 'android');
}

document.addEventListener('DOMContentLoaded', () => {
  initPricingExplorer('pricing-explorer');
  initStorePricingGrid('store-pricing-grid');
});
