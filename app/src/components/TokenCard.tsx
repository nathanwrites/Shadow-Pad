import { useMemo, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { Contract, ethers } from 'ethers';
import { formatEther, formatUnits, type Hex } from 'viem';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CONFIDENTIAL_ERC7984_TOKEN_ABI, TOKEN_DECIMALS, type Address } from '../config/contracts';
import '../styles/TokenCard.css';

export type TokenRow = {
  address: Address;
  name: string;
  symbol: string;
  owner: Address;
  remainingForSaleClear: bigint;
  totalSupplyClear: bigint;
  pricePerTokenWei: bigint;
  encryptedBalance?: Hex;
};

type Props = {
  token: TokenRow;
  isMine: boolean;
  onRefresh: () => void;
};

const MAX_UINT64 = (1n << 64n) - 1n;
const ZERO_HANDLE = `0x${'0'.repeat(64)}` as Hex;

function isZeroHandle(value: Hex) {
  return value.toLowerCase() === ZERO_HANDLE;
}

export function TokenCard({ token, isMine, onRefresh }: Props) {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [buyAmountTokens, setBuyAmountTokens] = useState('1');
  const [isBuying, setIsBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [lastBuyTx, setLastBuyTx] = useState<string | null>(null);

  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [decryptedBalance, setDecryptedBalance] = useState<bigint | null>(null);

  const saleRemainingDisplay = useMemo(
    () => formatUnits(token.remainingForSaleClear, TOKEN_DECIMALS),
    [token.remainingForSaleClear],
  );
  const totalSupplyDisplay = useMemo(
    () => formatUnits(token.totalSupplyClear, TOKEN_DECIMALS),
    [token.totalSupplyClear],
  );
  const priceDisplay = useMemo(() => formatEther(token.pricePerTokenWei), [token.pricePerTokenWei]);

  const buy = async () => {
    setBuyError(null);
    setLastBuyTx(null);

    if (!address) {
      setBuyError('Connect your wallet to buy tokens.');
      return;
    }
    if (!publicClient) {
      setBuyError('Public client not available.');
      return;
    }
    if (!signerPromise) {
      setBuyError('Signer not available.');
      return;
    }

    let amountBase: bigint;
    try {
      amountBase = ethers.parseUnits(buyAmountTokens, TOKEN_DECIMALS);
    } catch {
      setBuyError('Amount must be a number.');
      return;
    }
    if (amountBase <= 0n || amountBase > MAX_UINT64) {
      setBuyError('Amount must fit in uint64 and be greater than 0.');
      return;
    }
    if (amountBase > token.remainingForSaleClear) {
      setBuyError('Not enough remaining supply for sale.');
      return;
    }

    setIsBuying(true);
    try {
      const requiredWei = (await publicClient.readContract({
        address: token.address,
        abi: CONFIDENTIAL_ERC7984_TOKEN_ABI,
        functionName: 'quoteBuy',
        args: [amountBase],
      })) as bigint;

      const signer = await signerPromise;
      if (!signer) {
        setBuyError('Signer not available.');
        return;
      }

      const contract = new Contract(token.address, CONFIDENTIAL_ERC7984_TOKEN_ABI, signer);
      const tx = await contract.buy(amountBase, { value: requiredWei });
      setLastBuyTx(tx.hash);
      await tx.wait();
      onRefresh();
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : 'Buy failed.');
    } finally {
      setIsBuying(false);
    }
  };

  const decryptBalance = async () => {
    setDecryptError(null);
    setDecryptedBalance(null);

    if (!address) {
      setDecryptError('Connect your wallet to decrypt.');
      return;
    }
    if (!publicClient) {
      setDecryptError('Public client not available.');
      return;
    }
    if (!instance || zamaLoading || zamaError) {
      setDecryptError(zamaError ?? 'Encryption service not ready.');
      return;
    }
    if (!signerPromise) {
      setDecryptError('Signer not available.');
      return;
    }

    setIsDecrypting(true);
    try {
      const encryptedBalance = (await publicClient.readContract({
        address: token.address,
        abi: CONFIDENTIAL_ERC7984_TOKEN_ABI,
        functionName: 'confidentialBalanceOf',
        args: [address as Address],
      })) as Hex;

      if (isZeroHandle(encryptedBalance)) {
        setDecryptedBalance(0n);
        return;
      }

      const signer = await signerPromise;
      if (!signer) throw new Error('Signer not available.');

      const keypair = instance.generateKeypair();
      const handleContractPairs = [{ handle: encryptedBalance, contractAddress: token.address }];
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = [token.address];

      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      const clearValue = result[encryptedBalance] ?? '0';
      setDecryptedBalance(BigInt(clearValue));
    } catch (err) {
      setDecryptError(err instanceof Error ? err.message : 'Decrypt failed.');
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <div className="token-card-shell">
      <div className="token-card-head">
        <div>
          <div className="token-card-name">
            {token.name} <span className="token-card-symbol">({token.symbol})</span>
          </div>
          <div className="token-card-address">
            <code className="token-code">{token.address}</code>
          </div>
        </div>
        {isMine ? <span className="token-badge">Created by you</span> : null}
      </div>

      <div className="token-card-stats">
        <div className="token-stat">
          <div className="token-stat-label">Price</div>
          <div className="token-stat-value">{priceDisplay} ETH / token</div>
        </div>
        <div className="token-stat">
          <div className="token-stat-label">For sale</div>
          <div className="token-stat-value">
            {saleRemainingDisplay} / {totalSupplyDisplay}
          </div>
        </div>
        <div className="token-stat">
          <div className="token-stat-label">Owner</div>
          <div className="token-stat-value">
            <code className="token-code">{token.owner}</code>
          </div>
        </div>
      </div>

      <div className="token-card-section">
        <div className="token-section-title">Buy with ETH</div>
        <div className="token-buy-row">
          <input
            className="token-input"
            value={buyAmountTokens}
            onChange={(e) => setBuyAmountTokens(e.target.value)}
            placeholder="Amount (tokens)"
          />
          <button className="token-primary" onClick={() => void buy()} disabled={isBuying}>
            {isBuying ? 'Buying…' : 'Buy'}
          </button>
        </div>
        {buyError ? <div className="token-error">{buyError}</div> : null}
        {lastBuyTx ? (
          <div className="token-result">
            Transaction: <code className="token-code">{lastBuyTx}</code>
          </div>
        ) : null}
      </div>

      <div className="token-card-section">
        <div className="token-section-title">Your balance (encrypted)</div>
        {address ? (
          <div className="token-balance">
            <div className="token-balance-row">
              <div className="token-balance-label">Handle</div>
              <code className="token-code">{token.encryptedBalance ?? '(load to view)'}</code>
            </div>
            <div className="token-balance-actions">
              <button className="token-secondary" onClick={() => void decryptBalance()} disabled={isDecrypting}>
                {isDecrypting ? 'Decrypting…' : 'Decrypt balance'}
              </button>
              {decryptedBalance !== null ? (
                <div className="token-balance-clear">
                  Clear: <strong>{formatUnits(decryptedBalance, TOKEN_DECIMALS)}</strong>
                </div>
              ) : null}
            </div>
            {decryptError ? <div className="token-error">{decryptError}</div> : null}
          </div>
        ) : (
          <div className="token-muted">Connect your wallet to view and decrypt your balance.</div>
        )}
      </div>
    </div>
  );
}

