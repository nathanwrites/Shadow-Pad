import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-content">
          <div className="header-left">
            <h1 className="header-title">
              Shadow Pad
            </h1>
            <p className="header-subtitle">Create and trade confidential ERC7984 tokens on Sepolia</p>
          </div>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
