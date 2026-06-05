(() => {
  const i18n = {
    en: {
      'how.step1.title': 'Install Tlangau',
      'how.step1.body': 'Download from the App Store (iPhone) or Google Play (Android).',
      'how.step2.title': 'Open Tlangau Premium',
      'how.step2.body': 'In the app, choose the services you need (monthly or yearly) and subscribe securely.',
      'how.step3.title': 'Sign in',
      'how.step3.body': 'Use Sign in with Apple (iOS) or Google (Android) with the same account used for purchase.',
      'how.step4.title': 'Use the server dashboard',
      'how.step4.body': 'Your entitlement activates automatically after payment verification.',
    },
    mizo: {
      'how.step1.title': 'Tlangau install rawh',
      'how.step1.body': 'iPhone a nih chuan App Store aṭangin download rawh; Android a nih chuan Google Play aṭangin download rawh.',
      'how.step2.title': 'Tlangau Premium hawng rawh',
      'how.step2.body': 'App-ah hian monthly emaw yearly emaw thlang la, i mamawh service-te (Ring/Message/Broadcast) thlangin store-ah subscribe rawh.',
      'how.step3.title': 'Sign in rawh',
      'how.step3.body': 'Purchase hmanga account tho angin sign-in rawh—iPhone-ah Sign in with Apple, Android-ah Google.',
      'how.step4.title': 'Server dashboard hmang rawh',
      'how.step4.body': 'Payment verify a nih hnuah entitlement a active a, dashboard hman theih a ni ang.',
    },
  };

  function setLang(lang) {
    const dict = i18n[lang] || i18n.mizo;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const text = dict[key];
      if (typeof text === 'string') el.textContent = text;
    });
  }

  function bindLangToggle() {
    const root = document.querySelector('[data-lang-toggle]');
    if (!root) return;
    const buttons = [...root.querySelectorAll('[data-lang]')];
    if (!buttons.length) return;

    let current = 'mizo';
    buttons.forEach((b) => {
      if (b.classList.contains('is-active')) current = b.getAttribute('data-lang') || current;
      b.addEventListener('click', () => {
        const v = b.getAttribute('data-lang') || 'mizo';
        buttons.forEach((x) => x.classList.toggle('is-active', x === b));
        current = v;
        setLang(current);
      });
    });

    setLang(current);
  }

  function setupStickyGetApp() {
    const el = document.querySelector('.sticky-get-app');
    if (!el) return;

    const shouldShow = () => window.matchMedia('(max-width: 768px)').matches;

    const refresh = () => {
      el.hidden = !shouldShow();
    };
    refresh();
    window.addEventListener('resize', refresh, { passive: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindLangToggle();
    setupStickyGetApp();
  });
})();

