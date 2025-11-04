import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Stars } from '@react-three/drei';

function Floating({ children, speed = 0.2, rotation = [0.1, 0.2, 0.05], radius = 0.6, offset = 0 }) {
  const ref = useRef();
  useFrame((state) => {
    const t = state.clock.getElapsedTime() * speed + offset;
    ref.current.rotation.x += rotation[0] * 0.01;
    ref.current.rotation.y += rotation[1] * 0.01;
    ref.current.rotation.z += rotation[2] * 0.01;
    ref.current.position.x = Math.cos(t) * radius;
    ref.current.position.y = Math.sin(t * 0.9) * (radius * 0.6);
  });
  return <group ref={ref}>{children}</group>;
}

function NeonTorus({ color = '#ff1cf7', emissive = '#ff1cf7', position = [0, 0, 0], scale = 1, wire = false }) {
  const geoArgs = useMemo(() => [1, 0.32, 256, 48], []);
  return (
    <mesh position={position} scale={scale} castShadow>
      <torusKnotGeometry args={geoArgs} />
      {wire ? (
        <meshBasicMaterial color={color} wireframe />
      ) : (
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={1.2}
          metalness={0.6}
          roughness={0.2}
        />
      )}
    </mesh>
  );
}

function Scene({ palette }) {
  const p = palette || {
    pink: '#ff1cf7',
    blue: '#00f0ff',
    purple: '#8a2be2',
    magenta: '#ff4dff',
    cyan: '#00e6ff'
  };

  return (
    <>
      <color attach="background" args={["#07070a"]} />
      <fog attach="fog" args={["#07070a", 6, 16]} />

      {/* Subtle star field for depth */}
      <Stars radius={80} depth={20} count={800} factor={3} saturation={0} fade speed={0.6} />

      {/* Lights */}
      <ambientLight intensity={0.3} />
      <pointLight position={[4, 2, 4]} intensity={1.1} color={p.blue} />
      <pointLight position={[-4, -2, 2]} intensity={0.8} color={p.magenta} />

      {/* Floating neon forms */}
      <Floating rotation={[0.15, 0.25, 0.1]} speed={0.3} radius={0.8}>
        <NeonTorus color={p.pink} emissive={p.pink} position={[0, 0, 0]} scale={1.8} />
      </Floating>

      <Floating rotation={[0.1, -0.2, 0.05]} speed={0.22} radius={1.2} offset={1.3}>
        <NeonTorus color={p.blue} emissive={p.blue} position={[-2.2, -0.8, -0.8]} scale={1.2} />
      </Floating>

      <Floating rotation={[0.2, 0.1, -0.1]} speed={0.18} radius={1.4} offset={2.4}>
        <NeonTorus color={p.purple} emissive={p.purple} position={[2.2, 0.9, -1.2]} scale={1.05} wire />
      </Floating>

      {/* Postprocessing for neon bloom */}
      <EffectComposer>
        <Bloom intensity={1.1} luminanceThreshold={0.05} luminanceSmoothing={0.12} radius={0.9} mipmapBlur />
        <Vignette eskil={false} offset={0.15} darkness={0.65} />
      </EffectComposer>
    </>
  );
}

export default function HeroCanvas({ palette }) {
  return (
    <Canvas
      dpr={[1, 2]}
      shadows
      camera={{ position: [0, 0, 6], fov: 45 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <Scene palette={palette} />
    </Canvas>
  );
}

