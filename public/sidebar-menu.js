/**
 * sidebar-menu.js — Side menu trượt kiểu Locket Dio
 */
(function () {
    'use strict';

    const THEME_KEY = 'shop_theme_mode';
    let isOpen = false;

    const MENU_ITEMS = [
        { id: 'home', label: 'Trang chủ', icon: 'fa-house', action: 'view', view: 'products' },
        { id: 'profile', label: 'Hồ sơ', icon: 'fa-user-circle', action: 'profile' },
        { id: 'orders', label: 'Đơn hàng của tôi', icon: 'fa-shopping-bag', action: 'view', view: 'orders' },
        { id: 'wallet', label: 'Nạp tiền', icon: 'fa-wallet', action: 'view', view: 'wallet', badge: 'hot', badgeText: 'Hot' },
        { id: 'transactions', label: 'Lịch sử giao dịch', icon: 'fa-clock-rotate-left', action: 'view', view: 'transactions' },
        { id: 'coupons', label: 'Quản lý mã giảm giá', icon: 'fa-ticket', action: 'coupons', adminOnly: true, badge: 'beta', badgeText: 'Beta' },
        { id: 'settings', label: 'Cài đặt', icon: 'fa-gear', action: 'settings', badge: 'new', badgeText: 'New' },
    ];

    function $(id) { return document.getElementById(id); }

    function renderNavItems() {
        const nav = $('side-menu-nav');
        if (!nav) return;
        const isAdmin = window.currentUser?.role === 'admin';
        nav.innerHTML = MENU_ITEMS
            .filter(item => !item.adminOnly || isAdmin)
            .map(item => {
                const badge = item.badge
                    ? `<span class="side-menu-badge badge-${item.badge}">${item.badgeText}</span>`
                    : '';
                return `<button type="button" class="side-menu-item" data-side-id="${item.id}" data-side-action="${item.action}"${item.view ? ` data-side-view="${item.view}"` : ''}>
                    <span class="side-menu-item-icon"><i class="fas ${item.icon}"></i></span>
                    <span class="side-menu-item-text">${item.label}</span>
                    ${badge}
                </button>`;
            })
            .join('');
    }

    function refreshUserInfo() {
        const user = window.currentUser;
        const nameEl = $('side-menu-user-name');
        const balEl = $('side-menu-user-balance');
        if (!user) {
            if (nameEl) nameEl.textContent = 'Khách';
            if (balEl) balEl.textContent = '';
            return;
        }
        if (nameEl) nameEl.textContent = user.fullName || user.name || user.email || 'Người dùng';
        if (balEl) balEl.textContent = typeof window.formatMoney === 'function'
            ? window.formatMoney(user.balance)
            : (Number(user.balance || 0).toLocaleString('vi-VN') + 'đ');
        renderNavItems();
    }

    function setActive(view) {
        const map = {
            products: 'home',
            orders: 'orders',
            wallet: 'wallet',
            transactions: 'transactions',
            admin: 'coupons',
        };
        const activeId = map[view] || null;
        document.querySelectorAll('.side-menu-item').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.sideId === activeId);
        });
    }

    function applyTheme(mode) {
        const body = document.body;
        const toggle = $('side-menu-theme-toggle');
        const isDark = mode === 'dark';
        body.classList.toggle('app-dark', isDark);
        body.classList.toggle('app-light', !isDark);
        if (toggle) toggle.classList.toggle('is-dark', isDark);
        try { localStorage.setItem(THEME_KEY, mode); } catch (_) { /* ignore */ }
    }

    function loadTheme() {
        let saved = 'light';
        try { saved = localStorage.getItem(THEME_KEY) || 'light'; } catch (_) { /* ignore */ }
        applyTheme(saved === 'dark' ? 'dark' : 'light');
    }

    function toggleTheme() {
        const isDark = document.body.classList.contains('app-dark');
        applyTheme(isDark ? 'light' : 'dark');
        window.toast?.(isDark ? 'Đã bật giao diện sáng' : 'Đã bật giao diện tối', false, 2200);
    }

    function open() {
        if (isOpen) return;
        isOpen = true;
        refreshUserInfo();
        $('side-menu')?.classList.add('is-open');
        $('side-menu-overlay')?.classList.add('is-open');
        $('side-menu')?.setAttribute('aria-hidden', 'false');
        $('side-menu-overlay')?.setAttribute('aria-hidden', 'false');
        document.body.classList.add('side-menu-open');
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        $('side-menu')?.classList.remove('is-open');
        $('side-menu-overlay')?.classList.remove('is-open');
        $('side-menu')?.setAttribute('aria-hidden', 'true');
        $('side-menu-overlay')?.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('side-menu-open');
        document.querySelectorAll('.side-menu-item').forEach(btn => {
            btn.style.animation = 'none';
            void btn.offsetWidth;
            btn.style.animation = '';
        });
    }

    function handleMenuAction(btn) {
        const action = btn.dataset.sideAction;
        const view = btn.dataset.sideView;
        close();

        if (action === 'view' && view) {
            window.navigateTo?.(view);
            return;
        }
        if (action === 'profile') {
            window.ShopFeatures?.openProfileModal?.('info');
            return;
        }
        if (action === 'settings') {
            window.ShopFeatures?.openProfileModal?.('info');
            window.toast?.('Chỉnh sửa hồ sơ trong mục Thông tin', false, 3000);
            return;
        }
        if (action === 'coupons') {
            if (window.currentUser?.role !== 'admin') {
                window.toast?.('Chỉ admin mới quản lý mã giảm giá', true);
                return;
            }
            window.navigateTo?.('admin');
            window.showAdminTab?.('coupons');
        }
    }

    function handleLogout() {
        close();
        const logoutBtn = $('logout-btn');
        if (logoutBtn) logoutBtn.click();
    }

    function bindEvents() {
        $('side-menu-toggle')?.addEventListener('click', open);
        $('mobile-menu-btn')?.addEventListener('click', e => {
            e.preventDefault();
            open();
        });
        $('side-menu-close')?.addEventListener('click', close);
        $('side-menu-overlay')?.addEventListener('click', close);
        $('side-menu-theme-toggle')?.addEventListener('click', toggleTheme);
        $('side-menu-logout')?.addEventListener('click', handleLogout);

        $('side-menu-nav')?.addEventListener('click', e => {
            const btn = e.target.closest('.side-menu-item');
            if (btn) handleMenuAction(btn);
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && isOpen) close();
        });
    }

    function init() {
        loadTheme();
        renderNavItems();
        refreshUserInfo();
        bindEvents();
    }

    window.SideMenu = { init, open, close, setActive, refresh: refreshUserInfo };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();