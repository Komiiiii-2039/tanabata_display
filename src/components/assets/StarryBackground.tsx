import React from 'react';
import Image from 'next/image';

const StarryBackground = () => (
  <Image
    src="/assets/background.png"
    alt="Starry Background"
    fill
    className="absolute top-0 left-0 w-full h-full object-cover"
  />
);

export default StarryBackground;