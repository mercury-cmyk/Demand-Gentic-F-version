import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Sphere, PerspectiveCamera, Stars, Text } from '@react-three/drei';
import * as THREE from 'three';
import { AGENTS, BRAND } from '../../../shared/brand-messaging';

/**
 * Represents a specialized Agent in the Council
 */
const AgentNode = ({ position, color, label, isActive }: { position: [number, number, number], color: string, label: string, isActive: boolean }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      // Subtle floating movement
      meshRef.current.position.y += Math.sin(state.clock.getElapsedTime() + position[0]) * 0.002;

      if (isActive) {
        // Active rotation and pulsing scale to "change shape" dynamically
        meshRef.current.rotation.y += 0.05;
        meshRef.current.rotation.z += 0.02;
        const s = 1.2 + Math.sin(state.clock.getElapsedTime() * 8) * 0.1;
        meshRef.current.scale.set(s, s, s);
      } else {
        meshRef.current.rotation.y += 0.005;
        meshRef.current.scale.set(1, 1, 1);
      }
    }
  });

  return (
    <group position={position}>
      <Float speed={isActive ? 4 : 2} rotationIntensity={isActive ? 1.5 : 0.5} floatIntensity={isActive ? 2 : 1}>
        <Sphere args={[0.4, 32, 32]} ref={meshRef}>
          <MeshDistortMaterial
            color={color}
            speed={isActive ? 4 : 1}
            distort={isActive ? 0.4 : 0.2}
            radius={1}
            emissive={color}
            emissiveIntensity={isActive ? 3 : 0.5}
          />
        </Sphere>
      </Float>
      <Text
        position={[0, -0.7, 0]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
        font="/fonts/Inter-Bold.woff"
      >
        {label}
      </Text>
    </group>
  );
};

/**
 * A visual pulse that travels from the core to an agent
 */
const Shockwave = ({ end, color }: { end: [number, number, number], color: string }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const startTime = useRef<number | null>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    if (startTime.current === null) startTime.current = state.clock.getElapsedTime();
    
    const elapsed = state.clock.getElapsedTime() - startTime.current;
    const duration = 0.7; // duration of the pulse in seconds
    const progress = Math.min(elapsed / duration, 1);
    
    // Radiate from center (0,0,0) to the agent position
    meshRef.current.position.set(
      end[0] * progress,
      end[1] * progress,
      end[2] * progress
    );

    // The pulse grows as it travels
    const s = 0.1 + progress * 0.6;
    meshRef.current.scale.set(s, s, s);
    
    if (meshRef.current.material instanceof THREE.MeshStandardMaterial) {
      meshRef.current.material.opacity = (1 - progress) * 0.9;
    }
  });

  return (
    <Sphere args={[1, 16, 16]} ref={meshRef}>
      <meshStandardMaterial 
        color={color} 
        emissive={color} 
        emissiveIntensity={8} 
        transparent 
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </Sphere>
  );
};

/**
 * The Central Reasoning Core
 */
const ReasoningCore = ({ isAnyActive }: { isAnyActive: boolean }) => {
  const coreRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (coreRef.current) {
      coreRef.current.rotation.y += isAnyActive ? 0.02 : 0.005;
      coreRef.current.rotation.z += isAnyActive ? 0.01 : 0.002;
    }
  });

  return (
    <group ref={coreRef}>
      {/* Inner Core - The Human Strategy */}
      <Sphere args={[1, 64, 64]}>
        <meshStandardMaterial
          color="#8b5cf6"
          emissive="#c084fc"
          emissiveIntensity={isAnyActive ? 2.5 : 1.2}
          wireframe
        />
      </Sphere>
      {/* Outer Shell - The AI Execution Layer */}
      <Sphere args={[1.2, 32, 32]}>
        <meshStandardMaterial
          color="#4f46e5"
          transparent
          opacity={0.1}
          wireframe
        />
      </Sphere>
    </group>
  );
};

/**
 * Connections between Core and Agents
 */
const ReasoningBeams = ({ agentPositions, activeIndex }: { agentPositions: [number, number, number][], activeIndex: number | null }) => {
  return (
    <group>
      {agentPositions.map((pos, i) => (
        <line key={i}>
          <bufferGeometry>
            <float32BufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([0, 0, 0, ...pos])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial 
            color={i === activeIndex ? "#a855f7" : "#6366f1"} 
            transparent 
            opacity={i === activeIndex ? 0.8 : 0.15} 
          />
        </line>
      ))}
    </group>
  );
};

export const AgenticHeroVisual = ({ activeAgentId }: { activeAgentId?: string | null }) => {
  // Map our agents from brand-messaging.ts to 3D positions
  const agentPositions: [number, number, number][] = useMemo(() => [
    [3, 2, -1],   // Research
    [4, -1, 0],   // Voice
    [2, -3, 1],   // Email
    [-3, 2, 1],   // Content
    [-4, -1, 0],  // Pipeline
    [-2, -3, -1], // QA
  ], []);

  const activeIndex = useMemo(() => 
    activeAgentId ? AGENTS.findIndex(a => a.id === activeAgentId) : -1
  , [activeAgentId]);

  // Trigger a subtle sound effect when an agent becomes active
  useEffect(() => {
    if (activeAgentId) {
      const audio = new Audio('/sounds/agent-activate.mp3');
      audio.volume = 0.1; // Keep it very subtle for a professional CRM feel
      audio.play().catch(() => { /* Browsers may block audio until the first user interaction */ });
    }
  }, [activeAgentId]);

  return (
    <div className="w-full h-[600px] relative bg-slate-950 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 0, 10]} fov={50} />
        <ambientLight intensity={0.2} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#8b5cf6" />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#4f46e5" />
        
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

        <ReasoningCore isAnyActive={activeIndex >= 0} />
        
        {activeAgentId && activeIndex !== -1 && (
          <Shockwave 
            key={activeAgentId} 
            end={agentPositions[activeIndex]} 
            color={getAgentColor(AGENTS[activeIndex].color)} 
          />
        )}

        <ReasoningBeams agentPositions={agentPositions} activeIndex={activeIndex >= 0 ? activeIndex : null} />

        {AGENTS.map((agent, index) => (
          <AgentNode
            key={agent.id}
            position={agentPositions[index]}
            color={getAgentColor(agent.color)}
            label={agent.title}
            isActive={agent.id === activeAgentId}
          />
        ))}

        {/* The Memory Grid */}
        <gridHelper args={[20, 20, 0x334155, 0x1e293b]} position={[0, -5, 0]} />
      </Canvas>

      {/* Overlay Branding */}
      <div className="absolute bottom-8 left-8 text-slate-400 font-mono text-xs tracking-widest uppercase">
        {BRAND.company.productName} // Agentic Execution Layer v2.0
      </div>
    </div>
  );
};

function getAgentColor(colorName: string): string {
  const colors: Record<string, string> = {
    emerald: '#10b981',
    amber: '#f59e0b',
    blue: '#3b82f6',
    violet: '#8b5cf6',
    indigo: '#6366f1',
    rose: '#f43f5e',
  };
  return colors[colorName] || '#ffffff';
}