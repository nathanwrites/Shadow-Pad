import { useState } from 'react';
import { Header } from './Header';
import { TokenCreate } from './TokenCreate';
import { TokenMarketplace } from './TokenMarketplace';
import '../styles/TokenCommon.css';
import '../styles/TokenApp.css';

export function TokenApp() {
  const [activeTab, setActiveTab] = useState<'create' | 'market'>('create');

  return (
    <div className="token-app">
      <Header />
      <main className="token-main">
        <div className="token-tabs">
          <nav className="token-tab-nav">
            <button
              onClick={() => setActiveTab('create')}
              className={`token-tab-button ${activeTab === 'create' ? 'active' : 'inactive'}`}
            >
              Create Token
            </button>
            <button
              onClick={() => setActiveTab('market')}
              className={`token-tab-button ${activeTab === 'market' ? 'active' : 'inactive'}`}
            >
              Marketplace
            </button>
          </nav>
        </div>

        {activeTab === 'create' ? <TokenCreate /> : <TokenMarketplace />}
      </main>
    </div>
  );
}
