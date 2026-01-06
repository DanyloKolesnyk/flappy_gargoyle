import { PrivyProvider } from '@privy-io/react-auth';

// We keep this ready for the future
export const soneiumMinato = {
  id: 1946,
  name: 'Soneium Minato Testnet',
  network: 'soneium-minato',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.minato.soneium.org'] } },
  blockExplorers: { default: { name: 'Explorer', url: 'https://soneium-minato.blockscout.com/' } },
  testnet: true,
};

export default function Providers({children}: {children: React.ReactNode}) {
  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID || ''} // Set this in your .env file later
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#000000',
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
        supportedChains: [soneiumMinato],
        defaultChain: soneiumMinato,
      }}
    >
      {children}
    </PrivyProvider>
  );
}