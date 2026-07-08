/**
 * Cyber 3D Experience Layer — Three.js + GSAP
 * Tách biệt hoàn toàn khỏi logic shop (API, payment, dressroom, admin).
 * Chỉ: canvas nền, scroll reveal, card tilt. Không sửa data-* / event handlers có sẵn.
 */
(function (global) {
    'use strict';

    const CFG = {
        particleCount: global.matchMedia('(max-width: 768px)').matches ? 900 : 2200,
        pixelRatioCap: global.matchMedia('(max-width: 768px)').matches ? 1.25 : 2,
        colors: { cyan: 0x22d3ee, purple: 0x8b5cf6, core: 0x06b6d4 },
        tiltMax: 10,
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

    /* ═══════════════════════════════════════════
       THREE.JS — AI Core + Particle Network
       ═══════════════════════════════════════════ */
    function initThree(host) {
        if (reducedMotion || !global.THREE) return null;

        const THREE = global.THREE;
        const w = host.clientWidth || global.innerWidth;
        const h = host.clientHeight || global.innerHeight;

        renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
        });
        renderer.setSize(w, h, false);
        renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, CFG.pixelRatioCap));
        renderer.setClearColor(0x000000, 0);
        host.appendChild(renderer.domElement);

        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0xf0f9ff, 0.045);

        camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
        camera.position.set(0, 0.2, 5.2);

        const ambient = new THREE.AmbientLight(0xe0f2fe, 0.65);
        scene.add(ambient);

        const cyanLight = new THREE.PointLight(CFG.colors.cyan, 2.2, 18);
        cyanLight.position.set(2.5, 1.5, 3);
        scene.add(cyanLight);

        const purpleLight = new THREE.PointLight(CFG.colors.purple, 1.6, 16);
        purpleLight.position.set(-2, -0.8, 2);
        scene.add(purpleLight);

        coreGroup = new THREE.Group();
        coreGroup.position.set(1.4, 0.1, 0);

        const innerGeo = new THREE.IcosahedronGeometry(0.55, 1);
        const innerMat = new THREE.MeshPhysicalMaterial({
            color: CFG.colors.core,
            emissive: CFG.colors.cyan,
            emissiveIntensity: 0.85,
            metalness: 0.35,
            roughness: 0.2,
            transparent: true,
            opacity: 0.92,
        });
        const innerCore = new THREE.Mesh(innerGeo, innerMat);
        coreGroup.add(innerCore);

        const shellGeo = new THREE.TorusKnotGeometry(0.78, 0.14, 120, 16);
        const shellMat = new THREE.MeshPhysicalMaterial({
            color: CFG.colors.purple,
            emissive: CFG.colors.purple,
            emissiveIntensity: 0.35,
            metalness: 0.7,
            roughness: 0.15,
            wireframe: false,
            transparent: true,
            opacity: 0.88,
        });
        const shell = new THREE.Mesh(shellGeo, shellMat);
        coreGroup.add(shell);

        const wireGeo = new THREE.TorusKnotGeometry(0.95, 0.03, 80, 12);
        const wireMat = new THREE.MeshBasicMaterial({
            color: CFG.colors.cyan,
            transparent: true,
            opacity: 0.45,
            wireframe: true,
        });
        const wireAura = new THREE.Mesh(wireGeo, wireMat);
        coreGroup.add(wireAura);

        const ringGeo = new THREE.RingGeometry(1.15, 1.22, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: CFG.colors.cyan,
            transparent: true,
            opacity: 0.22,
            side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        coreGroup.add(ring);

        scene.add(coreGroup);

        const pGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(CFG.particleCount * 3);
        const pColors = new Float32Array(CFG.particleCount * 3);
        const c1 = new THREE.Color(CFG.colors.cyan);
        const c2 = new THREE.Color(CFG.colors.purple);

        for (let i = 0; i < CFG.particleCount; i++) {
            const r = 2.5 + Math.random() * 4;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = (Math.random() - 0.5) * 3.5;
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 1;
            const mix = Math.random();
            const col = c1.clone().lerp(c2, mix);
            pColors[i * 3] = col.r;
            pColors[i * 3 + 1] = col.g;
            pColors[i * 3 + 2] = col.b;
        }
        pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));

        const pMat = new THREE.PointsMaterial({
            size: global.innerWidth < 768 ? 0.028 : 0.022,
            vertexColors: true,
            transparent: true,
            opacity: 0.75,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        particles = new THREE.Points(pGeo, pMat);
        scene.add(particles);

        const gridHelper = new THREE.GridHelper(14, 28, 0x22d3ee, 0xc4b5fd);
        gridHelper.material.opacity = 0.08;
        gridHelper.material.transparent = true;
        gridHelper.position.y = -2.2;
        scene.add(gridHelper);

        return { innerCore, shell, wireAura, ring, cyanLight, purpleLight };
    }

    function animateThree(meshes) {
        if (!renderer || !scene || !camera || !running) return;

        const t = performance.now() * 0.001;
        mouse.tx += (mouse.x - mouse.tx) * 0.06;
        mouse.ty += (mouse.y - mouse.ty) * 0.06;

        if (coreGroup) {
            coreGroup.rotation.y = t * 0.22 + mouse.tx * 0.45 + scrollProgress * 0.6;
            coreGroup.rotation.x = mouse.ty * 0.28;
            coreGroup.position.y = Math.sin(t * 0.8) * 0.12;
        }

        if (particles) {
            particles.rotation.y = t * 0.04;
            particles.rotation.x = mouse.ty * 0.08;
        }

        if (meshes) {
            meshes.shell.rotation.x = t * 0.35;
            meshes.wireAura.rotation.z = -t * 0.5;
            meshes.ring.rotation.z = t * 0.15;
            meshes.cyanLight.position.x = 2.5 + mouse.tx * 0.8;
            meshes.purpleLight.position.y = -0.8 + mouse.ty * 0.5;
        }

        camera.position.x += (mouse.tx * 0.35 - camera.position.x) * 0.04;
        camera.position.y += (0.2 + mouse.ty * 0.2 - camera.position.y) * 0.04;
        camera.position.z = 5.2 + scrollProgress * 1.8;
        camera.lookAt(0.6, 0, 0);

        renderer.render(scene, camera);
        animId = global.requestAnimationFrame(() => animateThree(meshes));
    }

    function onResize(host) {
        if (!renderer || !camera) return;
        const w = host.clientWidth || global.innerWidth;
        const h = host.clientHeight || global.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
    }

    /* ═══════════════════════════════════════════
       GSAP — ScrollTrigger Reveal
       ═══════════════════════════════════════════ */
    const revealRegistry = new WeakSet();

    function initGSAP() {
        if (reducedMotion || !global.gsap) return;
        if (global.ScrollTrigger) {
            global.gsap.registerPlugin(global.ScrollTrigger);
        }

        const main = document.querySelector('.app-main');
        if (main && global.ScrollTrigger) {
            global.ScrollTrigger.create({
                trigger: main,
                start: 'top top',
                end: 'bottom bottom',
                onUpdate: (self) => {
                    scrollProgress = self.progress;
                },
            });
        }

        global.addEventListener('hashchange', () => {
            global.setTimeout(scanRevealTargets, 120);
        });
    }

    function runReveal(el) {
        if (revealRegistry.has(el) || reducedMotion || !global.gsap) {
            el.classList.remove('fx-reveal-pending');
            el.classList.add('fx-reveal-done');
            return;
        }
        revealRegistry.add(el);
        el.classList.remove('fx-reveal-pending');
        global.gsap.fromTo(el,
            { opacity: 0, y: 48, rotateX: 8, transformPerspective: 900 },
            {
                opacity: 1,
                y: 0,
                rotateX: 0,
                duration: 0.85,
                ease: 'power3.out',
                onComplete: () => el.classList.add('fx-reveal-done'),
            }
        );
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
                if (el.classList.contains('fx-reveal-done') || revealRegistry.has(el)) return;
                if (!el.classList.contains('fx-reveal-pending')) {
                    el.classList.add('fx-reveal-pending');
                }
                const rect = el.getBoundingClientRect();
                if (rect.top < global.innerHeight * 0.92) {
                    runReveal(el);
                }
            });
        });

        document.querySelectorAll('.product-card, .dr-item-card').forEach((card) => {
            if (!card.classList.contains('fx-reveal-pending') && !revealRegistry.has(card)) {
                card.classList.add('fx-reveal-pending');
                if (card.getBoundingClientRect().top < global.innerHeight * 0.95) {
                    runReveal(card);
                }
            }
        });
    }

    /* ═══════════════════════════════════════════
       3D TILT — Product / Dressroom cards
       ═══════════════════════════════════════════ */
    const tiltRegistry = new WeakSet();

    function bindTilt(card) {
        if (tiltRegistry.has(card) || reducedMotion) return;
        tiltRegistry.add(card);
        card.classList.add('fx-tilt');

        let raf = 0;
        const onMove = (e) => {
            const rect = card.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;
            card.style.setProperty('--fx-mx', (x * 100) + '%');
            card.style.setProperty('--fx-my', (y * 100) + '%');
            if (raf) return;
            raf = global.requestAnimationFrame(() => {
                raf = 0;
                const rotY = (x - 0.5) * CFG.tiltMax * 2;
                const rotX = (0.5 - y) * CFG.tiltMax * 2;
                card.style.transform = 'perspective(800px) rotateX(' + rotX.toFixed(2) + 'deg) rotateY(' + rotY.toFixed(2) + 'deg) translateZ(8px)';
            });
        };

        const onEnter = () => card.classList.add('is-hover');
        const onLeave = () => {
            card.classList.remove('is-hover');
            card.style.transform = '';
            card.style.removeProperty('--fx-mx');
            card.style.removeProperty('--fx-my');
        };

        card.addEventListener('mouseenter', onEnter, { passive: true });
        card.addEventListener('mouseleave', onLeave, { passive: true });
        card.addEventListener('mousemove', onMove, { passive: true });
    }

    function scanTiltTargets(root) {
        (root || document).querySelectorAll('.product-card, .dr-item-card, .glass-card.hover-lift').forEach(bindTilt);
    }

    /* ═══════════════════════════════════════════
       DOM Observer — auto-enhance dynamic UI
       ═══════════════════════════════════════════ */
    function initObservers() {
        const grids = ['products-grid', 'dr-items-grid', 'dr-outfits-list', 'my-orders-list'];
        grids.forEach((id) => {
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
                let viewChanged = false;
                mutations.forEach((m) => {
                    if (m.type === 'attributes' && m.attributeName === 'class') viewChanged = true;
                });
                if (viewChanged) {
                    global.setTimeout(() => {
                        scanRevealTargets();
                        scanTiltTargets(app);
                    }, 80);
                }
            });
            app.querySelectorAll('section[id^="view-"]').forEach((sec) => {
                viewObs.observe(sec, { attributes: true, attributeFilter: ['class'] });
            });
        }

        const authObs = new MutationObserver(() => {
            if (!document.getElementById('auth-screen').classList.contains('hidden')) {
                global.setTimeout(scanRevealTargets, 100);
            }
        });
        const auth = document.getElementById('auth-screen');
        if (auth) authObs.observe(auth, { attributes: true, attributeFilter: ['class'] });
    }

    /* ═══════════════════════════════════════════
       BOOT
       ═══════════════════════════════════════════ */
    function boot() {
        document.body.classList.add('fx-cyber-enabled');

        const host = document.getElementById('cyber-3d-canvas-host');
        if (!host) return;

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
            meshes = initThree(host);
            if (meshes) {
                global.addEventListener('resize', () => onResize(host), { passive: true });
                animateThree(meshes);
            }
        }

        initGSAP();
        initObservers();
        scanTiltTargets(document);
        scanRevealTargets();

        global.addEventListener('scroll', () => {
            if (!global._fxScrollTick) {
                global._fxScrollTick = true;
                global.requestAnimationFrame(() => {
                    global._fxScrollTick = false;
                    scanRevealTargets();
                });
            }
        }, { passive: true });

        global.CyberFX = {
            refresh: () => {
                scanTiltTargets(document);
                scanRevealTargets();
            },
            destroy: () => {
                running = false;
                cancelAnimationFrame(animId);
                if (renderer) {
                    renderer.dispose();
                    host.innerHTML = '';
                }
            },
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);