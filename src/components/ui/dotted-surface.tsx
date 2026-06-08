'use client';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

type DottedSurfaceProps = Omit<React.ComponentProps<'div'>, 'ref'>;

export function DottedSurface({ className, ...props }: DottedSurfaceProps) {
    const { resolvedTheme } = useTheme();

    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<{
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
        particles: THREE.Points[];
        animationId: number;
        count: number;
    } | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const SEPARATION = 150;
        const AMOUNTX = 40;
        const AMOUNTY = 60;

        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0xffffff, 2000, 10000);

        const w = containerRef.current.clientWidth || window.innerWidth;
        const h = containerRef.current.clientHeight || window.innerHeight;

        const camera = new THREE.PerspectiveCamera(60, w / h, 1, 10000);
        camera.position.set(0, 355, 1220);

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(w, h);
        renderer.setClearColor(scene.fog.color, 0);

        containerRef.current.appendChild(renderer.domElement);

        const positions: number[] = [];
        const colors: number[] = [];

        const geometry = new THREE.BufferGeometry();

        for (let ix = 0; ix < AMOUNTX; ix++) {
            for (let iy = 0; iy < AMOUNTY; iy++) {
                positions.push(
                    ix * SEPARATION - (AMOUNTX * SEPARATION) / 2,
                    0,
                    iy * SEPARATION - (AMOUNTY * SEPARATION) / 2,
                );
                // Normalized 0-1 colors: white in dark mode, dark in light mode
                const v = resolvedTheme === 'dark' ? 0.78 : 0.1;
                colors.push(v, v, v);
            }
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 8,
            vertexColors: true,
            transparent: true,
            opacity: 0.2, // subtle — won't distract the user
            sizeAttenuation: true,
        });

        const points = new THREE.Points(geometry, material);
        scene.add(points);

        let count = 0;
        let animationId = 0;

        const animate = () => {
            animationId = requestAnimationFrame(animate);

            const posAttr = geometry.attributes.position;
            const pos = posAttr.array as Float32Array;

            let i = 0;
            for (let ix = 0; ix < AMOUNTX; ix++) {
                for (let iy = 0; iy < AMOUNTY; iy++) {
                    pos[i * 3 + 1] =
                        Math.sin((ix + count) * 0.3) * 50 +
                        Math.sin((iy + count) * 0.5) * 50;
                    i++;
                }
            }
            posAttr.needsUpdate = true;

            renderer.render(scene, camera);
            count += 0.1;
        };

        const handleResize = () => {
            if (!containerRef.current) return;
            const nw = containerRef.current.clientWidth || window.innerWidth;
            const nh = containerRef.current.clientHeight || window.innerHeight;
            camera.aspect = nw / nh;
            camera.updateProjectionMatrix();
            renderer.setSize(nw, nh);
        };

        window.addEventListener('resize', handleResize);
        animate();

        sceneRef.current = { scene, camera, renderer, particles: [points], animationId, count };

        return () => {
            window.removeEventListener('resize', handleResize);
            if (sceneRef.current) {
                cancelAnimationFrame(sceneRef.current.animationId);
                sceneRef.current.scene.traverse((obj: THREE.Object3D) => {
                    if (obj instanceof THREE.Points) {
                        obj.geometry.dispose();
                        if (Array.isArray(obj.material)) {
                            (obj.material as THREE.Material[]).forEach((m) => m.dispose());
                        } else {
                            (obj.material as THREE.Material).dispose();
                        }
                    }
                });
                sceneRef.current.renderer.dispose();
                if (containerRef.current && sceneRef.current.renderer.domElement) {
                    containerRef.current.removeChild(sceneRef.current.renderer.domElement);
                }
            }
        };
    }, [resolvedTheme]);

    return (
        <div
            ref={containerRef}
            className={cn('pointer-events-none absolute inset-0', className)}
            {...props}
        />
    );
}
