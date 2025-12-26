import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { isAddress, type Hex, formatEther, formatUnits } from 'viem';
import { sepolia } from 'wagmi/chains';
import { DEFAULT_FACTORY_ADDRESS, type Address, CONFIDENTIAL_TOKEN_FACTORY_ABI, CONFIDENTIAL_ERC7984_TOKEN_ABI, TOKEN_DECIMALS } from '../config/contracts';
import { TokenCard, type TokenRow } from './TokenCard';
import '../styles/TokenMarketplace.css';

function normalizeAddress(value: string): Address | null {
  if (!value) return null;
  if (!isAddress(value)) return null;
  return value as Address;
}

export function TokenMarketplace() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: sepolia.id });

  const [factoryAddressInput, setFactoryAddressInput] = useState<string>(DEFAULT_FACTORY_ADDRESS ?? '');
  const factoryAddress = useMemo(() => normalizeAddress(factoryAddressInput.trim()), [factoryAddressInput]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [myTokenAddresses, setMyTokenAddresses] = useState<Set<Address>>(new Set());

  const loadIdRef = useRef(0);

  const loadTokens = useCallback(async () => {
    setError(null);
    if (!publicClient) {
      setError('Public client not available.');
      return;
    }
    if (!factoryAddress) {
      setError('Enter a valid factory address.');
      return;
    }

    const loadId = ++loadIdRef.current;
    setIsLoading(true);
    try {
      const [allTokens, myTokens] = await Promise.all([
        publicClient.readContract({
          address: factoryAddress,
          abi: CONFIDENTIAL_TOKEN_FACTORY_ABI,
          functionName: 'getAllTokens',
        }) as Promise<Address[]>,
        address
          ? (publicClient.readContract({
              address: factoryAddress,
              abi: CONFIDENTIAL_TOKEN_FACTORY_ABI,
              functionName: 'getTokensByCreator',
              args: [address as Address],
            }) as Promise<Address[]>)
          : Promise.resolve([] as Address[]),
      ]);

      const mySet = new Set<Address>(myTokens);
      const unique = Array.from(new Set<Address>([...allTokens, ...myTokens]));

      const rows = await Promise.all(
        unique.map(async (tokenAddress) => {
          const [tokenName, tokenSymbol, tokenOwner, remainingForSaleClear, totalSupplyClear, pricePerTokenWei, encryptedBalance] =
            await Promise.all([
              publicClient.readContract({
                address: tokenAddress,
                abi: CONFIDENTIAL_ERC7984_TOKEN_ABI,
                functionName: 'name',
              }) as Promise<string>,
              publicClient.readContract({
                address: tokenAddress,
                abi: CONFIDENTIAL_ERC7984_TOKEN_ABI,
                functionName: 'symbol',
              }) as Promise<string>,
              publicClient.readContract({
                address: tokenAddress,
                abi: CONFIDENTIAL_ERC7984_TOKEN_ABI,
                functionName: 'owner',
              }) as Promise<Address>,
              publicClient.readContract({
                address: tokenAddress,
                abi: CONFIDENTIAL_ERC7984_TOKEN_ABI,
                functionName: 'remainingForSaleClear',
              }) as Promise<bigint>,
              publicClient.readContract({
                address: tokenAddress,
                abi: CONFIDENTIAL_ERC7984_TOKEN_ABI,
                functionName: 'totalSupplyClear',
              }) as Promise<bigint>,
              publicClient.readContract({
                address: tokenAddress,
                abi: CONFIDENTIAL_ERC7984_TOKEN_ABI,
                functionName: 'pricePerTokenWei',
              }) as Promise<bigint>,
              address
                ? (publicClient.readContract({
                    address: tokenAddress,
                    abi: CONFIDENTIAL_ERC7984_TOKEN_ABI,
                    functionName: 'confidentialBalanceOf',
                    args: [address as Address],
                  }) as Promise<Hex>)
                : Promise.resolve(null),
            ]);

          return {
            address: tokenAddress,
            name: tokenName,
            symbol: tokenSymbol,
            owner: tokenOwner,
            remainingForSaleClear,
            totalSupplyClear,
            pricePerTokenWei,
            encryptedBalance: encryptedBalance ?? undefined,
          } satisfies TokenRow;
        }),
      );

      if (loadId !== loadIdRef.current) return;

      rows.sort((a, b) => Number(mySet.has(b.address)) - Number(mySet.has(a.address)));

      setMyTokenAddresses(mySet);
      setTokens(rows);
    } catch (err) {
      if (loadId !== loadIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load tokens.');
    } finally {
      if (loadId === loadIdRef.current) setIsLoading(false);
    }
  }, [address, factoryAddress, publicClient]);

  useEffect(() => {
    if (!factoryAddress) return;
    void loadTokens();
  }, [address, factoryAddress, loadTokens]);

  const stats = useMemo(() => {
    const total = tokens.length;
    const mine = tokens.filter((t) => myTokenAddresses.has(t.address)).length;
    return { total, mine };
  }, [myTokenAddresses, tokens]);

  return (
    <div className="marketplace">
      <div className="marketplace-header">
        <div>
          <h2 className="marketplace-title">Tokens</h2>
          <p className="marketplace-subtitle">
            Loaded: {stats.total} tokens · Yours: {stats.mine}
          </p>
        </div>

        <div className="marketplace-controls">
          <input
            className="marketplace-input"
            placeholder="Factory address (Sepolia) 0x..."
            value={factoryAddressInput}
            onChange={(e) => setFactoryAddressInput(e.target.value)}
          />
          <button className="marketplace-button" onClick={() => void loadTokens()} disabled={isLoading}>
            {isLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {!factoryAddress ? (
        <div className="marketplace-warning">Enter your deployed `ConfidentialTokenFactory` address to load tokens.</div>
      ) : null}

      {error ? <div className="marketplace-error">{error}</div> : null}

      <div className="marketplace-grid">
        {tokens.map((token) => (
          <TokenCard
            key={token.address}
            token={token}
            isMine={myTokenAddresses.has(token.address)}
            onRefresh={() => void loadTokens()}
          />
        ))}
      </div>

      {tokens.length === 0 && factoryAddress && !isLoading && !error ? (
        <div className="marketplace-empty">
          <div>No tokens yet.</div>
          <div className="marketplace-empty-hint">
            Create a token first, then come back here to buy and decrypt balances.
          </div>
        </div>
      ) : null}

      <div className="marketplace-footnote">
        <div>
          Balance handles are encrypted `euint64` values. Click “Decrypt balance” to re-encrypt under your wallet key and
          reveal the clear balance in your browser.
        </div>
        <div>
          Price: {formatEther(tokens[0]?.pricePerTokenWei ?? 0n)} ETH per 1 token · Decimals: {TOKEN_DECIMALS} · Example
          display: {formatUnits(1_000_000n, TOKEN_DECIMALS)} token
        </div>
      </div>
    </div>
  );
}

