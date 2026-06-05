/**
 * Mirrors lib/config/play_billing_config.dart (India INR reference pricing).
 */
window.TlangauPricing = {
  monthlyPerService: 29,
  yearlyPerService: 199,
  monthlyCheckout: { 1: 29, 2: 49, 3: 99 },
  yearlyCheckout: { 1: 199, 2: 399, 3: 599 },
  yearlySave: {
    ring: 'Save 43%',
    message: 'Save 33%',
    broadcast: 'Save 50%',
  },
  paidServices: [
    {
      id: 'ring',
      title: 'Bawlhhlawh paih tur hriattirna',
      subtitle: 'Ring notification',
      color: '#AD131D',
    },
    {
      id: 'message',
      title: 'Information Notice',
      subtitle: 'Message notification',
      color: '#3B8C19',
    },
    {
      id: 'broadcast',
      title: 'Broadcast Message',
      subtitle: 'Multi-bundle broadcast',
      color: '#1565C0',
    },
  ],
  freeServices: [
    { title: 'Statistics & Insights', subtitle: 'Always included' },
    { title: 'Polls', subtitle: 'Always included' },
  ],
  stores: {
    ios: 'https://apps.apple.com/app/id6769981685',
    android:
      'https://play.google.com/store/apps/details?id=com.ruatfela.tlangau.tlangau',
  },
  formatInr(amount) {
    return `₹${amount.toFixed(0)}.00`;
  },
  checkoutTotal(period, count) {
    const map =
      period === 'yearly' ? this.yearlyCheckout : this.monthlyCheckout;
    if (count <= 0) return 0;
    if (count >= 3) return map[3];
    return map[count];
  },
  perService(period) {
    return period === 'yearly' ? this.yearlyPerService : this.monthlyPerService;
  },
};

function formatPeriodLabel(period) {
  return period === 'yearly' ? 'year' : 'month';
}

function bindPlatformToggle(root, onChange) {
  const buttons = root.querySelectorAll('[data-platform]');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const platform = btn.getAttribute('data-platform');
      buttons.forEach((b) => b.classList.toggle('is-active', b === btn));
      onChange(platform);
    });
  });
  return buttons[0]?.getAttribute('data-platform') || 'ios';
}

function bindPeriodToggle(root, onChange) {
  const buttons = root.querySelectorAll('[data-period]');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const period = btn.getAttribute('data-period');
      buttons.forEach((b) => b.classList.toggle('is-active', b === btn));
      onChange(period);
    });
  });
  return buttons[0]?.getAttribute('data-period') || 'monthly';
}

function renderServiceCheckboxes(container, selected, period, platform, onUpdate) {
  const p = window.TlangauPricing;
  container.innerHTML = '';

  p.paidServices.forEach((svc) => {
    const checked = selected.has(svc.id);
    const row = document.createElement('label');
    row.className = 'premium-service-row';
    row.innerHTML = `
      <input type="checkbox" value="${svc.id}" ${checked ? 'checked' : ''} />
      <span class="premium-service-icon" style="background:${svc.color}22;color:${svc.color}">●</span>
      <span class="premium-service-text">
        <strong>${svc.title}</strong>
        <small>${svc.subtitle}</small>
      </span>
      <span class="premium-service-price">
        ${p.formatInr(p.perService(period))}
        ${
          period === 'yearly' && platform === 'ios' && p.yearlySave[svc.id]
            ? `<span class="save-tag">${p.yearlySave[svc.id]}</span>`
            : period === 'yearly' && platform === 'android' && p.yearlySave[svc.id]
              ? `<span class="save-tag">${p.yearlySave[svc.id]}</span>`
              : ''
        }
      </span>
    `;
    row.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) selected.add(svc.id);
      else selected.delete(svc.id);
      onUpdate();
    });
    container.appendChild(row);
  });

  const freeWrap = document.createElement('div');
  freeWrap.className = 'premium-free-list';
  freeWrap.innerHTML = '<p class="premium-free-heading">Included free</p>';
  p.freeServices.forEach((f) => {
    const line = document.createElement('div');
    line.className = 'premium-free-row';
    line.innerHTML = `<span>${f.title}</span><span class="free-badge">FREE</span>`;
    freeWrap.appendChild(line);
  });
  container.appendChild(freeWrap);
}

function updateCheckoutSummary(totalEl, hintEl, btnEl, period, count, platform) {
  const p = window.TlangauPricing;
  const total = p.checkoutTotal(period, count);
  if (totalEl) {
    totalEl.textContent =
      count === 0
        ? '—'
        : `${p.formatInr(total)} / ${formatPeriodLabel(period)}`;
  }
  if (hintEl) {
    const store = platform === 'ios' ? 'App Store' : 'Google Play';
    hintEl.textContent =
      count === 0
        ? 'Select at least one paid service to see your bundle total.'
        : `${count} service${count > 1 ? 's' : ''} · billed in the ${store} (India reference pricing)`;
  }
  if (btnEl) {
    btnEl.disabled = false;
    btnEl.href = p.stores[platform];
  }
}

function initPricingExplorer(rootId) {
  const root = document.getElementById(rootId);
  if (!root) return;

  const p = window.TlangauPricing;
  const selected = new Set();
  let platform = 'ios';
  let period = 'monthly';

  const servicesEl = root.querySelector('[data-services]');
  const totalEl = root.querySelector('[data-total]');
  const hintEl = root.querySelector('[data-hint]');
  const getBtn = root.querySelector('[data-get-store]');

  function refresh() {
    renderServiceCheckboxes(servicesEl, selected, period, platform, refresh);
    updateCheckoutSummary(
      totalEl,
      hintEl,
      getBtn,
      period,
      selected.size,
      platform
    );
    root.querySelectorAll('[data-save-tags]').forEach((el) => {
      el.hidden = period !== 'yearly';
    });
  }

  platform = bindPlatformToggle(root.querySelector('[data-platform-toggle]'), (v) => {
    platform = v;
    refresh();
  });
  period = bindPeriodToggle(root.querySelector('[data-period-toggle]'), (v) => {
    period = v;
    refresh();
  });
  refresh();
}

function renderStoreCard(container, platform) {
  const p = window.TlangauPricing;
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
              `<li><span>${s.title}</span><span>${p.formatInr(p.monthlyPerService)}</span></li>`
          )
          .join('')}
        <li class="bundle-line"><span>1 service checkout</span><span>${p.formatInr(p.monthlyCheckout[1])}</span></li>
        <li class="bundle-line"><span>2 services bundle</span><span>${p.formatInr(p.monthlyCheckout[2])}</span></li>
        <li class="bundle-line"><span>3 services bundle</span><span>${p.formatInr(p.monthlyCheckout[3])}</span></li>
      </ul>
    </div>
    <div class="store-pricing-card__period">
      <h3>Yearly</h3>
      <ul class="store-price-list">
        ${p.paidServices
          .map((s) => {
            const tag =
              p.yearlySave[s.id]
                ? `<span class="save-tag">${p.yearlySave[s.id]}</span>`
                : '';
            return `<li><span>${s.title} ${tag}</span><span>${p.formatInr(p.yearlyPerService)}</span></li>`;
          })
          .join('')}
        <li class="bundle-line"><span>1 service checkout</span><span>${p.formatInr(p.yearlyCheckout[1])}</span></li>
        <li class="bundle-line"><span>2 services bundle</span><span>${p.formatInr(p.yearlyCheckout[2])}</span></li>
        <li class="bundle-line"><span>3 services bundle</span><span>${p.formatInr(p.yearlyCheckout[3])}</span></li>
      </ul>
    </div>
    <div class="store-pricing-card__free">
      <p>Included free</p>
      ${p.freeServices
        .map((f) => `<div class="premium-free-row"><span>${f.title}</span><span class="free-badge">FREE</span></div>`)
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
