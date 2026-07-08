/**
 * Cyber AI Universe — 3D overlay (Three.js + GSAP)
 * Chỉ thêm hiệu ứng lớp phủ. Không sửa logic shop / API / HTML data.
 */
(function (global) {
    'use strict';

    const CFG = {
        particleCount: global.matchMedia('(max-width: 768px)').matches ? 900 : 2400,
        pixelRatioCap: global.matchMedia('(max-width: 768px)').matches ? 1.25 : 2,
        colors: { cyan: 0x22d3ee, purple: 0xa855f7, core: 0x06b6d4 },
        tiltMax: 12,
    };

    const reducedMotion = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let renderer = null;
    let scene = null;
    let camera = null;
    let coreGroup = null;
    let particles = null;
    let animId = 0;
    let mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    let scrollProgress = 0;
    let running = true;
    let floatTimelines = [];

    /* ═══════════════════════════════════════════
       THREE.JS — Particle System + AI Energy Core
       ═══════════════════════════════════════════ */
    function initThree(canvas) {
        if (reducedMotion || !global.THREE || !canvas) return null;

        const THREE = global.THREE;
        const w = global.innerWidth;
        const h = global.innerHeight;

        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
        });
        renderer.setSize(w, h, false);
        renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, CFG.pixelRatioCap));
        renderer.setClearColor(0x000000, 0);

        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x030712, 0.038);

        camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
        camera.position.set(0, 0.15, 5.5);

        scene.add(new THREE.AmbientLight(0xe0f2fe, 0.55));

        const cyanLight = new THREE.PointLight(CFG.colors.cyan, 2.4, 20);
        cyanLight.position.set(2.2, 1.2, 3);
        scene.add(cyanLight);

        const purpleLight = new THREE.PointLight(CFG.colors.purple, 1.8, 18);
        purpleLight.position.set(-2.2, -0.6, 2.5);
        scene.add(purpleLight);

        coreGroup = new THREE.Group();
        coreGroup.position.set(0, 0, 0);

        const innerGeo = new THREE.IcosahedronGeometry(0.62, 1);
        const innerMat = new THREE.MeshPhysicalMaterial({
            color: CFG.colors.core,
            emissive: CFG.colors.cyan,
            emissiveIntensity: 0.9,
            metalness: 0.4,
            roughness: 0.18,
            transparent: true,
            opacity: 0.94,
        });
        const innerCore = new THREE.Mesh(innerGeo, innerMat);
        coreGroup.add(innerCore);

        const shellGeo = new THREE.TorusKnotGeometry(0.88, 0.15, 128, 18);
        const shellMat = new THREE.MeshPhysicalMaterial({
            color: CFG.colors.purple,
            emissive: CFG.colors.purple,
            emissiveIntensity: 0.4,
            metalness: 0.75,
            roughness: 0.12,
            transparent: true,
            opacity: 0.9,
        });
        const shell = new THREE.Mesh(shellGeo, shellMat);
        coreGroup.add(shell);

        const wireGeo = new THREE.TorusKnotGeometry(1.05, 0.035, 90, 14);
        const wireAura = new THREE.Mesh(wireGeo, new THREE.MeshBasicMaterial({
            color: CFG.colors.cyan,
            transparent: true,
            opacity: 0.42,
            wireframe: true,
        }));
        coreGroup.add(wireAura);

        const ringGeo = new THREE.RingGeometry(1.25, 1.32, 72);
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
            color: CFG.colors.cyan,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
        }));
        ring.rotation.x = Math.PI / 2;
        coreGroup.add(ring);

        const orbitGeo = new THREE.TorusGeometry(1.55, 0.018, 8, 96);
        const orbit = new THREE.Mesh(orbitGeo, new THREE.MeshBasicMaterial({
            color: CFG.colors.purple,
            transparent: true,
            opacity: 0.35,
        }));
        orbit.rotation.x = Math.PI / 3;
        coreGroup.add(orbit);

        scene.add(coreGroup);

        const pGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(CFG.particleCount * 3);
        const pColors = new Float32Array(CFG.particleCount * 3);
        const c1 = new THREE.Color(CFG.colors.cyan);
        const c2 = new THREE.Color(CFG.colors.purple);

        for (let i = 0; i < CFG.particleCount; i++) {
            const r = 2.2 + Math.random() * 4.5;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = (Math.random() - 0.5) * 4;
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 0.5;
            const col = c1.clone().lerp(c2, Math.random());
            pColors[i * 3] = col.r;
            pColors[i * 3 + 1] = col.g;
            pColors[i * 3 + 2] = col.b;
        }
        pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));

        particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
            size: global.innerWidth < 768 ? 0.03 : 0.024,
            vertexColors: true,
            transparent: true,
            opacity: 0.78,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        }));
        scene.add(particles);

        const grid = new THREE.GridHelper(16, 32, 0x22d3ee, 0x7c3aed);
        grid.material.opacity = 0.06;
        grid.material.transparent = true;
        grid.position.y = -2.4;
        scene.add(grid);

        return { innerCore, shell, wireAura, ring, orbit, cyanLight, purpleLight };
    }

    function animateThree(meshes) {
        if (!renderer || !scene || !camera || !running) return;

        const t = performance.now() * 0.001;
        mouse.tx += (mouse.x - mouse.tx) * 0.055;
        mouse.ty += (mouse.y - mouse.ty) * 0.055;

        if (coreGroup) {
            coreGroup.rotation.y = t * 0.28 + mouse.tx * 0.5 + scrollProgress * 0.5;
            coreGroup.rotation.x = Math.sin(t * 0.4) * 0.12 + mouse.ty * 0.32;
            coreGroup.position.y = Math.sin(t * 0.7) * 0.14;
        }

        if (particles) {
            particles.rotation.y = t * 0.035 + mouse.tx * 0.12;
            particles.rotation.x = mouse.ty * 0.06;
        }

        if (meshes) {
            meshes.shell.rotation.x = t * 0.4;
            meshes.shell.rotation.z = t * 0.18;
            meshes.wireAura.rotation.z = -t * 0.55;
            meshes.ring.rotation.z = t * 0.2;
            meshes.orbit.rotation.y = t * 0.65;
            meshes.cyanLight.position.x = 2.2 + mouse.tx * 0.9;
            meshes.purpleLight.position.y = -0.6 + mouse.ty * 0.6;
        }

        camera.position.x += (mouse.tx * 0.4 - camera.position.x) * 0.04;
        camera.position.y += (0.15 + mouse.ty * 0.22 - camera.position.y) * 0.04;
        camera.position.z = 5.5 + scrollProgress * 1.6;
        camera.lookAt(mouse.tx * 0.3, mouse.ty * 0.2, 0);

        renderer.render(scene, camera);
        animId = global.requestAnimationFrame(() => animateThree(meshes));
    }

    function onResize() {
        if (!renderer || !camera) return;
        const w = global.innerWidth;
        const h = global.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
    }

    /* ═══════════════════════════════════════════
       GSAP — Hero reveal, floating, scroll reveal
       ═══════════════════════════════════════════ */
    const revealRegistry = new WeakSet();
    const floatRegistry = new WeakSet();

    function initGSAP() {
        if (!global.gsap) return;
        if (global.ScrollTrigger) {
            global.gsap.registerPlugin(global.ScrollTrigger);
        }

        const main = document.querySelector('.app-main');
        if (main && global.ScrollTrigger) {
            global.ScrollTrigger.create({
                trigger: main,
                start: 'top top',
                end: 'bottom bottom',
                onUpdate: (self) => { scrollProgress = self.progress; },
            });
        }

        global.addEventListener('hashchange', () => {
            global.setTimeout(scanRevealTargets, 120);
        });
    }

    function animateHero() {
        if (reducedMotion || !global.gsap) return;

        const hero = document.querySelector('.shop-hero');
        if (hero) {
            global.gsap.fromTo(hero,
                { opacity: 0, y: 40, scale: 0.98 },
                { opacity: 1, y: 0, scale: 1, duration: 1.1, ease: 'power3.out', delay: 0.15 }
            );
        }

        const floatIcons = document.querySelectorAll('.hero-float-layer .float-card');
        if (floatIcons.length) {
            global.gsap.fromTo(floatIcons,
                { opacity: 0, scale: 0, z: -120 },
                {
                    opacity: 1,
                    scale: 1,
                    z: 0,
                    duration: 0.9,
                    stagger: 0.12,
                    ease: 'back.out(1.6)',
                    delay: 0.4,
                }
            );
            floatIcons.forEach((fc, i) => {
                global.gsap.to(fc, {
                    y: '+=14',
                    rotation: i % 2 ? 6 : -6,
                    duration: 2.2 + i * 0.3,
                    repeat: -1,
                    yoyo: true,
                    ease: 'sine.inOut',
                });
            });
        }
    }

    function runReveal(el) {
        if (revealRegistry.has(el) || !global.gsap) {
            el.classList.remove('cyber-reveal-pending');
            el.classList.add('cyber-reveal-done');
            return;
        }
        if (reducedMotion) {
            el.classList.remove('cyber-reveal-pending');
            el.classList.add('cyber-reveal-done');
            return;
        }
        revealRegistry.add(el);
        el.classList.remove('cyber-reveal-pending');
        global.gsap.fromTo(el,
            { opacity: 0, y: 52, rotateX: 10, transformPerspective: 900 },
            {
                opacity: 1,
                y: 0,
                rotateX: 0,
                duration: 0.9,
                ease: 'power3.out',
                onComplete: () => el.classList.add('cyber-reveal-done'),
            }
        );
    }

    function animateProductCardFloat(card) {
        if (floatRegistry.has(card) || reducedMotion || !global.gsap) return;
        floatRegistry.add(card);
        card.classList.add('cyber-float-card');

        global.gsap.fromTo(card,
            { opacity: 0, y: 80, z: -200, rotateX: 18, scale: 0.85 },
            {
                opacity: 1,
                y: 0,
                z: 0,
                rotateX: 0,
                scale: 1,
                duration: 1,
                ease: 'power3.out',
            }
        );

        const tl = global.gsap.to(card, {
            y: '+=10',
            duration: 2.4 + Math.random() * 0.8,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
            delay: Math.random() * 0.5,
        });
        floatTimelines.push(tl);
    }

    function scanRevealTargets() {
        const selectors = [
            '.app-section:not(.hidden)',
            '.app-section:not(.hidden) .section-header',
            '.app-section:not(.hidden) .glass-card',
            '.app-section:not(.hidden) .shop-hero',
            '#auth-screen .auth-card',
        ];
        selectors.forEach((sel) => {
            document.querySelectorAll(sel).forEach((el) => {
                if (el.classList.contains('cyber-reveal-done') || revealRegistry.has(el)) return;
                if (!el.classList.contains('cyber-reveal-pending')) {
                    el.classList.add('cyber-reveal-pending');
                }
                if (el.getBoundingClientRect().top < global.innerHeight * 0.92) {
                    runReveal(el);
                }
            });
        });

        document.querySelectorAll('.product-card').forEach((card) => {
            if (!floatRegistry.has(card)) {
                if (card.getBoundingClientRect().top < global.innerHeight * 0.95) {
                    animateProductCardFloat(card);
                }
            }
        });

        document.querySelectorAll('.dr-item-card').forEach((card) => {
            if (!card.classList.contains('cyber-reveal-pending') && !revealRegistry.has(card)) {
                card.classList.add('cyber-reveal-pending');
                if (card.getBoundingClientRect().top < global.innerHeight * 0.95) {
                    runReveal(card);
                }
            }
        });
    }

    /* ═══════════════════════════════════════════
       3D TILT — Product & outfit cards
       ═══════════════════════════════════════════ */
    const tiltRegistry = new WeakSet();

    function bindTilt(card) {
        if (tiltRegistry.has(card) || reducedMotion) return;
        tiltRegistry.add(card);
        card.classList.add('cyber-tilt-target');

        let raf = 0;
        const onMove = (e) => {
            const rect = card.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;
            card.style.setProperty('--cyber-mx', (x * 100) + '%');
            card.style.setProperty('--cyber-my', (y * 100) + '%');
            if (raf) return;
            raf = global.requestAnimationFrame(() => {
                raf = 0;
                const rotY = (x - 0.5) * CFG.tiltMax * 2;
                const rotX = (0.5 - y) * CFG.tiltMax * 2;
                card.style.transform =
                    'perspective(900px) rotateX(' + rotX.toFixed(2) + 'deg) rotateY(' +
                    rotY.toFixed(2) + 'deg) translateZ(12px)';
            });
        };

        const onEnter = () => card.classList.add('cyber-tilt-active');
        const onLeave = () => {
            card.classList.remove('cyber-tilt-active');
            card.style.transform = '';
            card.style.removeProperty('--cyber-mx');
            card.style.removeProperty('--cyber-my');
        };

        card.addEventListener('mouseenter', onEnter, { passive: true });
        card.addEventListener('mouseleave', onLeave, { passive: true });
        card.addEventListener('mousemove', onMove, { passive: true });
    }

    function scanTiltTargets(root) {
        (root || document).querySelectorAll('.product-card, .dr-item-card').forEach(bindTilt);
    }

    /* ═══════════════════════════════════════════
       Wallet hologram + QR reveal
       ═══════════════════════════════════════════ */
    function enhanceWallet() {
        const qrPanel = document.getElementById('qr-panel');
        if (qrPanel && !qrPanel.classList.contains('cyber-hologram-panel')) {
            qrPanel.classList.add('cyber-hologram-panel');
        }

        const balance = document.getElementById('wallet-balance');
        if (balance) balance.classList.add('cyber-balance-glow');
    }

    function revealQRPanel(panel) {
        if (!panel || panel.classList.contains('hidden')) return;
        panel.classList.add('cyber-qr-reveal');
        if (reducedMotion || !global.gsap) return;

        global.gsap.fromTo(panel,
            { opacity: 0, y: 36, skewX: 2 },
            {
                opacity: 1,
                y: 0,
                skewX: 0,
                duration: 0.65,
                ease: 'power2.out',
                onComplete: () => {
                    global.gsap.to(panel, {
                        x: 3,
                        duration: 0.05,
                        repeat: 3,
                        yoyo: true,
                        ease: 'none',
                        onComplete: () => { panel.style.transform = ''; },
                    });
                },
            }
        );
    }

    function initWalletObserver() {
        const qrPanel = document.getElementById('qr-panel');
        if (!qrPanel) return;

        enhanceWallet();

        const obs = new MutationObserver(() => {
            if (!qrPanel.classList.contains('hidden')) {
                revealQRPanel(qrPanel);
            } else {
                qrPanel.classList.remove('cyber-qr-reveal');
            }
        });
        obs.observe(qrPanel, { attributes: true, attributeFilter: ['class'] });

        const balance = document.getElementById('wallet-balance');
        if (balance) {
            const balObs = new MutationObserver(() => {
                if (reducedMotion || !global.gsap) return;
                global.gsap.fromTo(balance,
                    { scale: 1.06, textShadow: '0 0 40px rgba(34,211,238,1)' },
                    { scale: 1, duration: 0.5, ease: 'power2.out' }
                );
            });
            balObs.observe(balance, { childList: true, characterData: true, subtree: true });
        }
    }

    /* ═══════════════════════════════════════════
       Dressroom — Holo chamber + neon ripple
       ═══════════════════════════════════════════ */
    function enhanceDressroom() {
        const preview = document.getElementById('dr-preview');
        if (!preview) return;
        const chamber = preview.closest('.glass-card');
        if (chamber && !chamber.classList.contains('cyber-holo-chamber')) {
            chamber.classList.add('cyber-holo-chamber');
        }
    }

    function spawnRipple(e, container) {
        const rect = container.getBoundingClientRect();
        const ripple = document.createElement('span');
        ripple.className = 'cyber-ripple';
        ripple.style.left = (e.clientX - rect.left) + 'px';
        ripple.style.top = (e.clientY - rect.top) + 'px';
        container.style.position = container.style.position || 'relative';
        container.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
    }

    function initDressroomEffects() {
        enhanceDressroom();

        const dressroom = document.getElementById('view-dressroom');
        if (!dressroom) return;

        dressroom.addEventListener('click', (e) => {
            const target = e.target.closest('.dr-item-card, .dr-outfit-item, #dr-outfits-list button, #dr-outfits-list .dr-item-card');
            if (!target) return;
            const host = target.closest('.glass-card') || target;
            spawnRipple(e, host);
        }, { passive: true });

        const drObs = new MutationObserver(() => enhanceDressroom());
        drObs.observe(dressroom, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    /* ═══════════════════════════════════════════
       Admin cyberpunk dashboard
       ═══════════════════════════════════════════ */
    function enhanceAdmin() {
        const adminContent = document.getElementById('admin-content');
        if (!adminContent) return;
        if (!adminContent.classList.contains('hidden')) {
            adminContent.classList.add('cyber-admin-dashboard');
        }
        const obs = new MutationObserver(() => {
            if (!adminContent.classList.contains('hidden')) {
                adminContent.classList.add('cyber-admin-dashboard');
                global.setTimeout(scanRevealTargets, 80);
            }
        });
        obs.observe(adminContent, { attributes: true, attributeFilter: ['class'] });
    }

    /* ═══════════════════════════════════════════
       DOM Observer — dynamic UI
       ═══════════════════════════════════════════ */
    function initObservers() {
        ['products-grid', 'dr-items-grid', 'dr-outfits-list', 'my-orders-list'].forEach((id) => {
            const node = document.getElementById(id);
            if (!node) return;
            const obs = new MutationObserver(() => {
                scanTiltTargets(node);
                global.setTimeout(scanRevealTargets, 50);
            });
            obs.observe(node, { childList: true, subtree: true });
        });

        const app = document.getElementById('app');
        if (app) {
            const viewObs = new MutationObserver((mutations) => {
                let changed = false;
                mutations.forEach((m) => {
                    if (m.type === 'attributes' && m.attributeName === 'class') changed = true;
                });
                if (changed) {
                    global.setTimeout(() => {
                        scanRevealTargets();
                        scanTiltTargets(app);
                        enhanceDressroom();
                        enhanceWallet();
                    }, 80);
                }
            });
            app.querySelectorAll('section[id^="view-"]').forEach((sec) => {
                viewObs.observe(sec, { attributes: true, attributeFilter: ['class'] });
            });
        }

        const auth = document.getElementById('auth-screen');
        if (auth) {
            const authObs = new MutationObserver(() => {
                if (!auth.classList.contains('hidden')) {
                    global.setTimeout(scanRevealTargets, 100);
                }
            });
            authObs.observe(auth, { attributes: true, attributeFilter: ['class'] });
        }
    }

    /* ═══════════════════════════════════════════
       BOOT
       ═══════════════════════════════════════════ */
    function boot() {
        document.body.classList.add('cyber-universe');

        const canvas = document.getElementById('webgl-canvas');
        if (!canvas) return;

        global.addEventListener('mousemove', (e) => {
            mouse.x = (e.clientX / global.innerWidth - 0.5) * 2;
            mouse.y = (e.clientY / global.innerHeight - 0.5) * 2;
        }, { passive: true });

        global.addEventListener('visibilitychange', () => {
            running = !document.hidden;
            if (running && renderer) {
                cancelAnimationFrame(animId);
                animateThree(meshes);
            }
        });

        let meshes = null;
        if (!reducedMotion) {
            meshes = initThree(canvas);
            if (meshes) {
                global.addEventListener('resize', onResize, { passive: true });
                animateThree(meshes);
            }
        }

        initGSAP();
        animateHero();
        initObservers();
        initWalletObserver();
        initDressroomEffects();
        enhanceAdmin();
        scanTiltTargets(document);
        scanRevealTargets();

        global.addEventListener('scroll', () => {
            if (!global._cyberScrollTick) {
                global._cyberScrollTick = true;
                global.requestAnimationFrame(() => {
                    global._cyberScrollTick = false;
                    scanRevealTargets();
                });
            }
        }, { passive: true });

        global.CyberUniverse = {
            refresh: () => {
                scanTiltTargets(document);
                scanRevealTargets();
                enhanceDressroom();
                enhanceWallet();
            },
            destroy: () => {
                running = false;
                cancelAnimationFrame(animId);
                floatTimelines.forEach((tl) => tl.kill());
                if (renderer) renderer.dispose();
            },
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);