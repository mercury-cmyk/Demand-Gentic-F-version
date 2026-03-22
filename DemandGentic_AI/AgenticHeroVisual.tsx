import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Sphere, PerspectiveCamera, Stars, Text } from '@react-three/drei';
import * as THREE from 'three';
import { AGENTS, BRAND } from '../../../shared/brand-messaging';

/**
 * Represents a specialized Agent in the Council
 */
const AgentNode = ({ position, color, label, isActive }: { position: [number, number, number], color: string, label: string, isActive: boolean }) => {
  const meshRef = useRef(null);
  
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
    
      
        
          
        
      
      
        {label}
      
    
  );
};

/**
 * A visual pulse that travels from the core to an agent
 */
const Shockwave = ({ end, color }: { end: [number, number, number], color: string }) => {
  const meshRef = useRef(null);
  const startTime = useRef(null);

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
    
      
    
  );
};

/**
 * The Central Reasoning Core
 */
const ReasoningCore = ({ isAnyActive }: { isAnyActive: boolean }) => {
  const coreRef = useRef(null);

  useFrame((state) => {
    if (coreRef.current) {
      coreRef.current.rotation.y += isAnyActive ? 0.02 : 0.005;
      coreRef.current.rotation.z += isAnyActive ? 0.01 : 0.002;
    }
  });

  return (
    
      {/* Inner Core - The Human Strategy */}
      
        
      
      {/* Outer Shell - The AI Execution Layer */}
      
        
      
    
  );
};

/**
 * Connections between Core and Agents
 */
const ReasoningBeams = ({ agentPositions, activeIndex }: { agentPositions: [number, number, number][], activeIndex: number | null }) => {
  return (
    
      {agentPositions.map((pos, i) => (
        
          
            
          
          
        
      ))}
    
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
    
      
        
        
        
        
        
        

        = 0} />
        
        {activeAgentId && activeIndex !== -1 && (
          
        )}

        = 0 ? activeIndex : null} />

        {AGENTS.map((agent, index) => (
          
        ))}

        {/* The Memory Grid */}
        
      

      {/* Overlay Branding */}
      
        {BRAND.company.productName} // Agentic Execution Layer v2.0
      
    
  );
};

function getAgentColor(colorName: string): string {
  const colors: Record = {
    emerald: '#10b981',
    amber: '#f59e0b',
    blue: '#3b82f6',
    violet: '#8b5cf6',
    indigo: '#6366f1',
    rose: '#f43f5e',
  };
  return colors[colorName] || '#ffffff';
}