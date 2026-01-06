import { useEffect, useState, useCallback } from 'react';
import { sdk } from "@farcaster/frame-sdk";
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createWalletClient, custom, parseEther } from 'viem'; 
import { soneiumMinato } from './components/providers';
import FlappyGame from './components/FlappyGame';
import './App.css';

const MAX_COINS_PER_DAY = 10;
const PRIZE_POOL_ADDRESS = "0xC3623db6400d497E424075E4eaa3723849E618d5";

// --- CONTRACT ABI ---
const PRIZE_POOL_ABI = [
  {
    "inputs": [{"internalType": "uint256", "name": "amount", "type": "uint256"}],
    "name": "claimPrize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

function App() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  
  // App State
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastScore, setLastScore] = useState<number | null>(null);
  
  // Daily Progress State
  const [dailyTotal, setDailyTotal] = useState(0);
  const [claimableBalance, setClaimableBalance] = useState(0);
  const [isClaiming, setIsClaiming] = useState(false);
  
  // Farcaster State
  const [farcasterUser, setFarcasterUser] = useState<{username?: string, fid?: number} | null>(null);
  const [isAdded, setIsAdded] = useState(false); // Track if added to client

  // 1. Initialize Farcaster SDK
  useEffect(() => {
    async function initSDK() {
      try {
        const context = await sdk.context;
        if (context?.user) {
          setFarcasterUser(context.user);
        }
        
        // Check if the frame is already added to the user's client
        if (context?.client?.added) {
          setIsAdded(true);
        }

        // Notify Farcaster the frame is ready to be shown
        await sdk.actions.ready(); 
      } catch (error) {
        console.warn('Running outside of Farcaster context');
      }
    }
    initSDK();
  }, []);

  // 2. Load Progress from LocalStorage
  useEffect(() => {
    const currentAddress = wallets[0]?.address || 'guest';
    const today = new Date().toDateString();
    const storageKey = `flappy_progress_${currentAddress}_${today}`;
    
    const storedData = localStorage.getItem(storageKey);

    if (storedData) {
      const { total, claimable } = JSON.parse(storedData);
      setDailyTotal(total || 0);
      setClaimableBalance(claimable !== undefined ? claimable : 0);
    } else {
      setDailyTotal(0);
      setClaimableBalance(0);
    }
  }, [wallets, authenticated]);

  const saveProgress = (newTotal: number, newBalance: number) => {
    const currentAddress = wallets[0]?.address || 'guest';
    const today = new Date().toDateString();
    const storageKey = `flappy_progress_${currentAddress}_${today}`;
    
    localStorage.setItem(storageKey, JSON.stringify({
      total: newTotal,
      claimable: newBalance
    }));
  };

  const handleCoinCollected = () => {
    if (dailyTotal < MAX_COINS_PER_DAY) {
      const newTotal = dailyTotal + 1;
      const newBalance = claimableBalance + 1;
      
      setDailyTotal(newTotal);
      setClaimableBalance(newBalance);
      saveProgress(newTotal, newBalance);
    }
  };

  const handleGameOver = (score: number) => {
    setIsPlaying(false);
    setLastScore(score);
  };

  const resetCoins = () => {
    setDailyTotal(0);
    setClaimableBalance(0);
    saveProgress(0, 0);
  };

  // --- FEATURE: SHARE (Viral Loop) ---
  const handleShare = useCallback(() => {
    const text = `I just scored ${lastScore} in Flappy Gargoyle! Can you beat me? Play now on Soneium 👇`;
    // Create a Warpcast intent URL
    const shareUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(window.location.href)}`;
    
    sdk.actions.openUrl(shareUrl);
  }, [lastScore]);

  // --- FEATURE: ADD FRAME (Retention) ---
  const handleAddFrame = useCallback(async () => {
    try {
      await sdk.actions.addFrame();
      setIsAdded(true);
    } catch (e) {
      console.error("Failed to add frame", e);
    }
  }, []);

  // --- FEATURE: CLOSE FRAME ---
  const handleClose = useCallback(() => {
    sdk.actions.close();
  }, []);

  const handleClaim = async () => {
    if (!wallets[0]) {
        alert("Please connect your wallet first.");
        return;
    }
    if (claimableBalance === 0) {
        alert("No unclaimed coins available!");
        return;
    }

    setIsClaiming(true);
    
    try {
        const wallet = wallets[0];
        await wallet.switchChain(soneiumMinato.id);
        
        const provider = await wallet.getEthereumProvider();
        const walletClient = createWalletClient({
            account: wallet.address as `0x${string}`,
            chain: {
                id: soneiumMinato.id,
                name: soneiumMinato.name,
                nativeCurrency: soneiumMinato.nativeCurrency,
                rpcUrls: soneiumMinato.rpcUrls,
                testnet: true
            },
            transport: custom(provider)
        });

        const amountToClaim = parseEther(claimableBalance.toString());

        const hash = await walletClient.writeContract({
            address: PRIZE_POOL_ADDRESS,
            abi: PRIZE_POOL_ABI,
            functionName: 'claimPrize',
            args: [amountToClaim],
            chain: soneiumMinato as any,
            gas: BigInt(250000) 
        });

        alert(`Success! Claim transaction sent.\nHash: ${hash}`);

        // Reset claimable only
        setClaimableBalance(0);
        saveProgress(dailyTotal, 0);

    } catch (error: any) {
        console.error("Claim error:", error);
        if (!error.message.includes("User rejected")) {
           alert(`Transaction failed: ${error.shortMessage || error.message}`);
        }
    } finally {
        setIsClaiming(false);
    }
  };

  if (!ready) return <div className="loading">Loading...</div>;

  return (
    <div className="app-container">
      <div className="game-wrapper">
        <FlappyGame 
          isPlaying={isPlaying} 
          onGameOver={handleGameOver}
          coinsToday={dailyTotal} 
          maxCoins={MAX_COINS_PER_DAY}
          onCoinCollect={handleCoinCollected}
        />

        {!isPlaying && (
          <div className="menu-overlay">
            
            {/* Top Bar */}
            <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: '8px', zIndex: 50 }}>
               {authenticated && (
                  <button className="btn-icon" onClick={logout} title="Logout">🚪</button>
               )}
               <button className="btn-icon" onClick={handleClose} title="Close">✕</button>
            </div>

            <h1>FLAPPY GARGOYLE</h1>
            
            {farcasterUser && (
              <p className="player-tag">Player: @{farcasterUser.username}</p>
            )}

            <div className="stats-box">
              <span>DAILY PROGRESS: {dailyTotal} / {MAX_COINS_PER_DAY}</span>
              <button onClick={resetCoins} className="reset-link">(Dev Reset)</button>
            </div>

            {lastScore !== null && (
              <div className="score-display">
                <h2>Score: {lastScore}</h2>
                <button className="btn-share" onClick={handleShare}>
                  Share to Warpcast 📢
                </button>
              </div>
            )}

            <div className="action-area">
              {!authenticated ? (
                <button className="btn-primary" onClick={login}>
                  CONNECT WALLET
                </button>
              ) : (
                <>
                  <button className="btn-success" onClick={() => setIsPlaying(true)}>
                    {lastScore !== null ? 'PLAY AGAIN' : 'START GAME'}
                  </button>
                  
                  <button 
                    className="btn-primary"
                    onClick={handleClaim}
                    disabled={isClaiming || claimableBalance === 0}
                    style={{ 
                        opacity: (isClaiming || claimableBalance === 0) ? 0.6 : 1,
                        cursor: (isClaiming || claimableBalance === 0) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isClaiming ? 'CLAIMING...' : `CLAIM ${claimableBalance} TOKENS`}
                  </button>
                </>
              )}

              {/* Retention: Add to Client Button */}
              {!isAdded && (
                 <button className="btn-secondary" onClick={handleAddFrame}>
                   ➕ ADD FRAME
                 </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;