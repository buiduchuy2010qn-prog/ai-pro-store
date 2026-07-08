/**
 * Client-side security helpers: device fingerprint, CSRF, Turnstile, secure API headers.
 */
(function (global) {
    'use strict';

    let _csrfToken = sessionStorage.getItem('csrf_token') || '';
    let _fingerprint = localStorage.getItem('device_fp') || '';
    let _turnstileSiteKey = null;
    let _passwordMinLength = 8;
    const _turnstileWidgets = {};

    async function sha256(text) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function buildFingerprint() {
        if (_fingerprint) return _fingerprint;
        const parts = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            screen.colorDepth,
            Intl.DateTimeFormat().resolvedOptions().timeZone,
            navigator.hardwareConcurrency || 0,
            navigator.platform || '',
        ].join('|');
        _fingerprint = (await sha256(parts)).slice(0, 48);
        localStorage.setItem('device_fp', _fingerprint);
        return _fingerprint;
    }

    async function bootstrap() {
        try {
            const res = await fetch('/api/security/bootstrap');
            const data = await res.json();
            if (data.csrfToken) {
                _csrfToken = data.csrfToken;
                sessionStorage.setItem('csrf_token', _csrfToken);
            }
            if (data.turnstileSiteKey) {
                _turnstileSiteKey = data.turnstileSiteKey;
                loadTurnstileScript();
            }
            if (data.passwordMinLength) {
                _passwordMinLength = data.passwordMinLength;
            }
            return data;
        } catch (_) {
            return {};
        }
    }

    function loadTurnstileScript() {
        if (document.getElementById('cf-turnstile-script')) return;
        const s = document.createElement('script');
        s.id = 'cf-turnstile-script';
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.defer = true;
        document.head.appendChild(s);
    }

    function renderTurnstile(containerId) {
        return new Promise((resolve) => {
            if (!_turnstileSiteKey) {
                resolve(null);
                return;
            }
            const tryRender = () => {
                if (!global.turnstile) {
                    setTimeout(tryRender, 200);
                    return;
                }
                const el = document.getElementById(containerId);
                if (!el) {
                    resolve(null);
                    return;
                }
                el.innerHTML = '';
                const wid = global.turnstile.render(el, {
                    sitekey: _turnstileSiteKey,
                    theme: 'light',
                    callback: () => resolve(wid),
                });
                _turnstileWidgets[containerId] = wid;
                setTimeout(() => resolve(wid), 8000);
            };
            tryRender();
        });
    }

    function getTurnstileResponse(containerId) {
        if (!_turnstileSiteKey) return '';
        const wid = _turnstileWidgets[containerId];
        if (!wid || !global.turnstile) return '';
        try {
            return global.turnstile.getResponse(wid) || '';
        } catch (_) {
            return '';
        }
    }

    function resetTurnstile(containerId) {
        const wid = _turnstileWidgets[containerId];
        if (wid && global.turnstile) {
            try { global.turnstile.reset(wid); } catch (_) {}
        }
    }

    async function secureHeaders(extra) {
        const fp = await buildFingerprint();
        const headers = {
            'X-Device-Fingerprint': fp,
            'X-Request-Id': crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
            ...extra,
        };
        if (_csrfToken) {
            headers['X-CSRF-Token'] = _csrfToken;
        }
        return headers;
    }

    function getPasswordMinLength() {
        return _passwordMinLength;
    }

    function hasTurnstile() {
        return !!_turnstileSiteKey;
    }

    global.SecurityClient = {
        bootstrap,
        buildFingerprint,
        secureHeaders,
        renderTurnstile,
        getTurnstileResponse,
        resetTurnstile,
        getPasswordMinLength,
        hasTurnstile,
    };
})(window);