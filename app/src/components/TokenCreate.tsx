import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useAccount } from 'wagmi';
import { Contract, ethers } from 'ethers';
import { isAddress } from 'viem';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { CONFIDENTIAL_TOKEN_FACTORY_ABI, DEFAULT_FACTORY_ADDRESS, type Address } from '../config/contracts';
import '../styles/TokenCreate.css';

const DEFAULT_TOTAL_SUPPLY = '100000000000';
const DEFAULT_PRICE_PER_TOKEN_ETH = '0.0001';
const MAX_UINT64 = (1n << 64n) - 1n;

function normalizeAddress(value: string): Address | null {
  if (!value) return null;
  if (!isAddress(value)) return null;
  return value as Address;
}

export function TokenCreate() {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();

  const [factoryAddressInput, setFactoryAddressInput] = useState<string>(DEFAULT_FACTORY_ADDRESS ?? '');
  const factoryAddress = useMemo(() => normalizeAddress(factoryAddressInput.trim()), [factoryAddressInput]);

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [totalSupply, setTotalSupply] = useState(DEFAULT_TOTAL_SUPPLY);
  const [priceEth, setPriceEth] = useState(DEFAULT_PRICE_PER_TOKEN_ETH);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdToken, setCreatedToken] = useState<Address | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreatedToken(null);
    setTxHash(null);

    if (!address || !signerPromise) {
      setError('Connect your wallet to create a token.');
      return;
    }
    if (!factoryAddress) {
      setError('Enter a valid factory address.');
      return;
    }
    const trimmedName = name.trim();
    const trimmedSymbol = symbol.trim();
    if (!trimmedName || !trimmedSymbol) {
      setError('Token name and symbol are required.');
      return;
    }

    let supply: bigint;
    try {
      supply = BigInt(totalSupply);
    } catch {
      setError('Total supply must be an integer (uint64).');
      return;
    }
    if (supply <= 0n || supply > MAX_UINT64) {
      setError('Total supply must fit in uint64 and be greater than 0.');
      return;
    }

    let priceWei: bigint;
    try {
      priceWei = ethers.parseEther(priceEth);
    } catch {
      setError('Price must be a valid ETH value (example: 0.0001).');
      return;
    }

    setIsSubmitting(true);
    try {
      const signer = await signerPromise;
      if (!signer) {
        setError('Signer not available.');
        return;
      }

      const factory = new Contract(factoryAddress, CONFIDENTIAL_TOKEN_FACTORY_ABI, signer);
      const tx = await factory.createToken(trimmedName, trimmedSymbol, supply, priceWei);
      setTxHash(tx.hash);
      const receipt = await tx.wait();

      const iface = new ethers.Interface(CONFIDENTIAL_TOKEN_FACTORY_ABI);
      const created = receipt?.logs
        ?.map((log: unknown) => {
          try {
            return iface.parseLog(log as any);
          } catch {
            return null;
          }
        })
        .find((parsed: any) => parsed?.name === 'TokenCreated');

      const tokenAddress = created?.args?.token as Address | undefined;
      setCreatedToken(tokenAddress ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="token-create">
      <div className="token-card">
        <h2 className="token-card-title">Create a confidential token</h2>
        <p className="token-card-subtitle">
          Creates an ERC7984 token and mints the full supply to the token contract for sale.
        </p>

        <form onSubmit={submit} className="token-form">
          <label className="token-label">
            Factory address (Sepolia)
            <input
              className="token-input"
              placeholder="0x..."
              value={factoryAddressInput}
              onChange={(e) => setFactoryAddressInput(e.target.value)}
            />
          </label>

          <div className="token-grid">
            <label className="token-label">
              Name
              <input className="token-input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>

            <label className="token-label">
              Symbol
              <input className="token-input" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
            </label>
          </div>

          <div className="token-grid">
            <label className="token-label">
              Total supply (base units, uint64)
              <input className="token-input" value={totalSupply} onChange={(e) => setTotalSupply(e.target.value)} />
              <span className="token-hint">Default: {DEFAULT_TOTAL_SUPPLY} (decimals are fixed at 6)</span>
            </label>

            <label className="token-label">
              Price per 1 token (ETH)
              <input className="token-input" value={priceEth} onChange={(e) => setPriceEth(e.target.value)} />
              <span className="token-hint">This price is for 1 token (1e6 base units).</span>
            </label>
          </div>

          <button className="token-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create Token'}
          </button>
        </form>

        {error ? <div className="token-error">{error}</div> : null}

        {txHash ? (
          <div className="token-result">
            <div>
              Transaction: <code className="token-code">{txHash}</code>
            </div>
          </div>
        ) : null}

        {createdToken ? (
          <div className="token-result">
            <div>
              Token address: <code className="token-code">{createdToken}</code>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
