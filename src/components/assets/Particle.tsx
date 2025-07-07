import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

interface ParticleProps {
  x: number;
  y: number;
}

const Particle: React.FC<ParticleProps> = ({ x, y }) => {
  const particleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const particle = particleRef.current;
    if (particle) {
      gsap.fromTo(particle,
        {
          opacity: 1,
          scale: 1,
          x: x,
          y: y,
        },
        {
          opacity: 0,
          scale: 0,
          x: x + (Math.random() - 0.5) * 200,
          y: y + (Math.random() - 0.5) * 200,
          duration: 0.8,
          ease: 'easeOutQuad',
          onComplete: () => particle.remove(),
        }
      );
    }
  }, [x, y]);

  return (
    <div
      ref={particleRef}
      className="absolute bg-white rounded-full"
      style={{
        width: '8px',
        height: '8px',
        left: 0,
        top: 0,
        transform: `translate(-50%, -50%)`,
      }}
    />
  );
};

export default Particle;
