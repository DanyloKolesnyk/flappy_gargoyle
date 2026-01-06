import { useEffect, useRef, useState } from 'react';

interface GameProps {
  isPlaying: boolean;
  onGameOver: (score: number) => void;
  coinsToday: number;
  maxCoins: number;
  onCoinCollect: () => void;
}

export default function FlappyGame({ 
  isPlaying, 
  onGameOver, 
  coinsToday, 
  maxCoins, 
  onCoinCollect 
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  
  // Refs
  const onCoinCollectRef = useRef(onCoinCollect);
  const onGameOverRef = useRef(onGameOver);
  const sessionCoins = useRef(coinsToday);

  useEffect(() => { onCoinCollectRef.current = onCoinCollect; }, [onCoinCollect]);
  useEffect(() => { onGameOverRef.current = onGameOver; }, [onGameOver]);
  useEffect(() => { sessionCoins.current = coinsToday; }, [coinsToday]);

  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  const gameState = useRef({
    birdY: 300,
    birdVel: 0,
    pipes: [] as any[],
    coins: [] as any[],
    score: 0,
    frame: 0,
    active: false
  });

  const assets = useRef({
    bg: new Image(),
    bird: new Image(),
    top: new Image(),
    bot: new Image(),
    coin: new Image()
  });

  // Load Assets once
  useEffect(() => {
    assets.current.bg.src = '/bg.png';
    assets.current.bird.src = '/gorgoyle.png';
    assets.current.top.src = '/top.png';
    assets.current.bot.src = '/bot.png';
    assets.current.coin.src = '/coin.png';
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const maxWidth = window.innerWidth > 480 ? 480 : window.innerWidth;
      setDimensions({ width: maxWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    handleResize(); 
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (isPlaying) {
      const startY = dimensions.height > 0 ? dimensions.height / 2 : 300;
      gameState.current = {
        birdY: startY, 
        birdVel: 0, 
        pipes: [], 
        coins: [], 
        score: 0, 
        frame: 0, 
        active: true
      };
      loop();
    }

    function loop() {
      if (!gameState.current.active) return;
      
      // We wrap the whole cycle in try-catch to keep the game alive
      try {
        update();
        draw();
      } catch (e) {
        console.error("Game loop error (ignoring to keep playing):", e);
      }
      
      requestRef.current = requestAnimationFrame(loop);
    }

    function update() {
      const state = gameState.current;
      const GRAVITY = 0.25;
      const PIPE_SPEED = 2.5; 
      const PIPE_SPAWN_RATE = 120; 
      const PIPE_GAP = 170; 
      
      const BIRD_HITBOX = 16;
      const COIN_SIZE = 30;

      // Physics
      state.birdVel += GRAVITY;
      state.birdY += state.birdVel;
      state.frame++;

      if (isNaN(state.birdY)) state.birdY = dimensions.height / 2;

      // Floor/Ceiling
      if (state.birdY + (BIRD_HITBOX/2) > dimensions.height || state.birdY - (BIRD_HITBOX/2) < 0) {
        endGame();
      }

      // Spawn Pipes
      if (state.frame % PIPE_SPAWN_RATE === 0) {
        const minPipe = 80;
        const maxPipe = dimensions.height - PIPE_GAP - minPipe;
        const safeMax = maxPipe > minPipe ? maxPipe : minPipe + 50;
        const h = Math.floor(Math.random() * (safeMax - minPipe)) + minPipe;
        
        state.pipes.push({ x: dimensions.width, top: h, bottom: h + PIPE_GAP, passed: false });

        // Spawn Coin (Rare: 6% chance)
        if (sessionCoins.current < maxCoins && Math.random() < 0.06) {
            state.coins.push({
              x: dimensions.width + 25, 
              y: h + (PIPE_GAP / 2) - (COIN_SIZE / 2),
              collected: false
            });
        }
      }

      // Update Pipes
      for (let i = state.pipes.length - 1; i >= 0; i--) {
        const p = state.pipes[i];
        p.x -= PIPE_SPEED;

        const pHitboxX = p.x + (52/2) - (40/2);
        const birdLeft = 30 - (BIRD_HITBOX/2);
        const birdRight = 30 + (BIRD_HITBOX/2);
        const birdTop = state.birdY - (BIRD_HITBOX/2);
        const birdBottom = state.birdY + (BIRD_HITBOX/2);
        const pipeRight = pHitboxX + 40;

        if (birdRight > pHitboxX && birdLeft < pipeRight) {
             if (birdTop < p.top || birdBottom > p.bottom) endGame();
        }

        if (!p.passed && p.x + 52 < 30) {
           state.score++;
           p.passed = true;
        }
        if (p.x + 52 < -50) state.pipes.splice(i, 1);
      }

      // Update Coins
      for (let i = state.coins.length - 1; i >= 0; i--) {
        const c = state.coins[i];
        c.x -= PIPE_SPEED;

        const dx = 30 - (c.x + COIN_SIZE/2);
        const dy = state.birdY - (c.y + COIN_SIZE/2);
        const dist = Math.sqrt(dx*dx + dy*dy);
        const HIT_RADIUS = (BIRD_HITBOX/2) + (COIN_SIZE/2);

        if (!c.collected && dist < HIT_RADIUS) {
          c.collected = true;
          sessionCoins.current += 1;
          onCoinCollectRef.current(); 
        }

        if (c.collected || c.x + COIN_SIZE < -50) {
           if (c.collected) state.coins.splice(i, 1);
           else if (c.x + COIN_SIZE < -50) state.coins.splice(i, 1);
        }
      }
    }

    // Helper to safely draw an image or a fallback rect
    function safeDrawImage(img: HTMLImageElement, x: number, y: number, w: number, h: number, fallbackColor: string) {
      if (!ctx) return;
      try {
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, x, y, w, h);
        } else {
          throw new Error("Image broken");
        }
      } catch (e) {
        // Fallback: Draw a colored rect if image fails
        ctx.fillStyle = fallbackColor;
        ctx.fillRect(x, y, w, h);
      }
    }

    function draw() {
      const state = gameState.current;
      ctx!.clearRect(0, 0, dimensions.width, dimensions.height);

      // BG
      safeDrawImage(assets.current.bg, 0, 0, dimensions.width, dimensions.height, '#1a1a1a');

      // Pipes
      state.pipes.forEach(p => {
        // Top Pipe
        safeDrawImage(assets.current.top, p.x, p.top - 600, 52, 600, '#22c55e');
        // Bottom Pipe
        safeDrawImage(assets.current.bot, p.x, p.bottom, 52, 600, '#22c55e');
      });

      // Coins
      state.coins.forEach(c => {
        if (!c.collected) {
           // We draw the coin manually to support the circular fallback
           try {
             if (assets.current.coin.complete && assets.current.coin.naturalWidth > 0) {
                ctx!.drawImage(assets.current.coin, c.x, c.y, 30, 30);
             } else {
                throw new Error("Coin broken");
             }
           } catch(e) {
              ctx!.fillStyle = '#ffd700';
              ctx!.beginPath();
              ctx!.arc(c.x + 15, c.y + 15, 12, 0, Math.PI * 2);
              ctx!.fill();
              ctx!.strokeStyle = 'white';
              ctx!.stroke();
           }
        }
      });

      // Bird
      try {
        if (assets.current.bird.complete && assets.current.bird.naturalWidth > 0) {
          ctx!.drawImage(assets.current.bird, 30 - 21, state.birdY - 21, 42, 42);
        } else {
          throw new Error("Bird broken");
        }
      } catch (e) {
        ctx!.fillStyle = '#fbbf24';
        ctx!.beginPath();
        ctx!.arc(30, state.birdY, 16, 0, Math.PI * 2);
        ctx!.fill();
      }

      // UI
      ctx!.fillStyle = "white";
      ctx!.font = "bold 24px 'Courier New', sans-serif";
      ctx!.textAlign = "center";
      ctx!.fillText(`${state.score}`, dimensions.width / 2, 80);
      
      ctx!.textAlign = "right";
      ctx!.fillStyle = "#ffd700";
      ctx!.font = "bold 16px Arial";
      ctx!.fillText(`Coins: ${sessionCoins.current}/${maxCoins}`, dimensions.width - 20, 40);
      ctx!.textAlign = "left"; 
    }

    function endGame() {
      gameState.current.active = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      onGameOver(gameState.current.score);
    }

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, dimensions]);

  const handleInput = () => {
    if (gameState.current.active) {
      gameState.current.birdVel = -6; 
    }
  };

  useEffect(() => {
     const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space') handleInput();
     };
     window.addEventListener('keydown', handleKeyDown);
     return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      width={dimensions.width}   
      height={dimensions.height}
      onMouseDown={handleInput}
      onTouchStart={handleInput}
      style={{ 
        display: 'block', 
        touchAction: 'none'
      }} 
    />
  );
}