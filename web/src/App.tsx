import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { formatUnits, getAddress, isAddress, zeroAddress, type Address, type Hash } from 'viem';
import { loadRuntime, type Runtime } from './config';
import { actions, actionError, amountText, friendlyError, health, limits, parseAmount, projected, type Action, type Snapshot } from './model';
import { assertWallet, readSnapshot, sendAction, switchNetwork, verifyDeployment, type Verified } from './protocol';

type Tx = { kind: string; message: string; hash?: Hash; uncertain?: boolean; error?: boolean };
function Icon({ name = 'arrow' }: { name?: string }) {
  const paths: Record<string, string> = { arrow: 'M5 12h14m-6-6 6 6-6 6', down: 'M12 4v16m-6-6 6 6 6-6', up: 'M12 20V4m-6 6 6-6 6 6', mint: 'M12 4v16M4 12h16', repay: 'M4 12h16', link: 'M8 5H5v14h14v-3M12 5h7v7M10 14l9-9', refresh: 'M19 8a8 8 0 1 0 1 7M19 3v5h-5' };
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] ?? paths.arrow}/></svg>;
}
function Token({ symbol }: { symbol: string }) { return <span className={`token token-${symbol.toLowerCase()}`} aria-hidden="true">{symbol === 'IMD' ? 'i' : symbol === 'COMP' ? 'C' : '↗'}</span>; }
function AddressLink({ address, explorer, label }: { address: Address; explorer: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  return <div className="address-row"><div><span className="muted small">{label}</span><a href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer" className="address" title={address}>{address}<Icon name="link"/></a></div><button className="text-button" type="button" aria-label={`Copy ${label} address`} onClick={async () => { try { await navigator.clipboard.writeText(address); setCopied(true); setCopyError(false); } catch { setCopyError(true); } }}>{copied ? 'Copied' : 'Copy'}</button>{copyError && <span role="status">Select the address to copy it.</span>}</div>;
}
export default function App() {
  const [runtime, setRuntime] = useState<Runtime>();
  const [verified, setVerified] = useState<Verified>();
  const [setupError, setSetupError] = useState('');
  const [setupAttempt, setSetupAttempt] = useState(0);
  const [account, setAccount] = useState<Address>();
  const [walletChain, setWalletChain] = useState<number>();
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [readError, setReadError] = useState('');
  const [reading, setReading] = useState(false);
  const [action, setAction] = useState<Action>('deposit');
  const [amount, setAmount] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [recipient, setRecipient] = useState('');
  const [rightsAmount, setRightsAmount] = useState('');
  const [adminError, setAdminError] = useState('');
  const [rightsError, setRightsError] = useState('');
  const [tx, setTx] = useState<Tx>();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const currentAccount = useRef(account);
  currentAccount.current = account;
  const amountRef = useRef<HTMLInputElement>(null);
  const recipientRef = useRef<HTMLInputElement>(null);
  const rightsRef = useRef<HTMLInputElement>(null);
  const readInFlight = useRef(false);
  const refreshGeneration = useRef(0);

  useEffect(() => {
    let active = true;
    setSetupError(''); setVerified(undefined);
    loadRuntime().then(async config => { if (!active) return; setRuntime(config); const checked = await verifyDeployment(config); if (active) setVerified(checked); }).catch(() => { if (active) setSetupError('Deployment verification is unavailable. Check your connection and retry. Transactions stay disabled until contract checks pass.'); });
    return () => { active = false; };
  }, [setupAttempt]);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;
    const accountsChanged = (...args: unknown[]) => { const addresses = args[0] as string[]; setAccount(addresses?.[0] && isAddress(addresses[0]) ? getAddress(addresses[0]) : undefined); setSnapshot(undefined); setReadError(''); setFieldError(''); setAdminError(''); };
    const chainChanged = (...args: unknown[]) => { setWalletChain(Number(args[0])); setSnapshot(undefined); };
    const disconnect = () => { setAccount(undefined); setWalletChain(undefined); setSnapshot(undefined); };
    provider.on?.('accountsChanged', accountsChanged); provider.on?.('chainChanged', chainChanged); provider.on?.('disconnect', disconnect);
    return () => { provider.removeListener?.('accountsChanged', accountsChanged); provider.removeListener?.('chainChanged', chainChanged); provider.removeListener?.('disconnect', disconnect); };
  }, []);

  const refresh = useCallback(async () => {
    if (!runtime || !verified || !account) return;
    const generation = ++refreshGeneration.current;
    setReading(true);
    try {
      const next = await readSnapshot(runtime, verified, account);
      if (currentAccount.current === account && generation === refreshGeneration.current) {
        setSnapshot(previous => previous && previous.block > next.block ? previous : next); setReadError('');
      }
      return next;
    } catch (error) {
      if (currentAccount.current === account && generation === refreshGeneration.current) setReadError('Live balances could not be refreshed. Transactions are paused. Check your connection and retry.');
      throw error;
    } finally { if (generation === refreshGeneration.current) setReading(false); }
  }, [runtime, verified, account]);

  useEffect(() => {
    setSnapshot(undefined);
    if (!account || !verified) return;
    let active = true;
    const poll = async () => {
      if (!active || readInFlight.current || document.hidden) return;
      readInFlight.current = true;
      try { await refresh(); } catch { /* Visible error is set by refresh. */ } finally { readInFlight.current = false; }
    };
    void poll();
    const timer = window.setInterval(poll, 5000);
    const visible = () => { if (!document.hidden) void poll(); };
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [account, walletChain, verified, refresh]);

  async function connect() {
    if (walletBusy) return;
    const provider = window.ethereum;
    if (!provider) { setWalletError('No browser wallet found. Open this page in an Ethereum wallet browser or install a browser wallet, then reload.'); return; }
    setWalletBusy(true); setWalletError('');
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
      if (!accounts[0] || !isAddress(accounts[0])) throw new Error('No account');
      const chain = await provider.request({ method: 'eth_chainId' });
      setAccount(getAddress(accounts[0])); setWalletChain(Number(chain));
    } catch (error) { setWalletError(friendlyError(error)); } finally { setWalletBusy(false); }
  }
  async function switchChain() {
    if (!runtime || !window.ethereum || walletBusy) return;
    setWalletBusy(true); setWalletError('');
    try { await switchNetwork(window.ethereum, runtime); setWalletChain(Number(await window.ethereum.request({ method: 'eth_chainId' }))); }
    catch (error) { setWalletError(friendlyError(error)); } finally { setWalletBusy(false); }
  }
  const wrongChain = !!account && !!runtime && walletChain !== runtime.manifest.chainId;
  const decimals = actions[action].token === 'IMD' ? verified?.imdDecimals ?? 18 : verified?.compDecimals ?? 18;
  const parsed = parseAmount(amount, decimals);
  const maximum = snapshot ? limits(snapshot)[action] : 0n;
  const validation = snapshot ? actionError(action, parsed, snapshot, decimals) : undefined;
  const needsApproval = action === 'deposit' && !!parsed && !!snapshot && snapshot.allowance < parsed;
  const enabled = !!verified && !!snapshot && !!account && !wrongChain && !readError && !setupError;
  const positionHealth = snapshot ? health(snapshot) : undefined;
  const after = snapshot && parsed && !validation ? projected(snapshot, action, parsed) : undefined;
  const admin = !!verified && !!account && verified.deployer.toLowerCase() === account.toLowerCase();

  async function settle(hash: Hash, kind: string) {
    if (!runtime) return;
    try {
      let replacement: 'cancelled' | 'replaced' | undefined;
      const receipt = await runtime.client.waitForTransactionReceipt({
        hash, timeout: 180000, pollingInterval: 2500,
        onReplaced: event => {
          hash = event.transactionReceipt.transactionHash;
          if (event.reason !== 'repriced') replacement = event.reason;
          setTx({ kind, hash, message: 'Your wallet transaction changed. Checking its receipt…' });
        },
      });
      hash = receipt.transactionHash;
      if (replacement) {
        setTx({ kind, hash, error: true, message: replacement === 'cancelled' ? 'Transaction cancelled in your wallet. The original action was not completed.' : 'Transaction replaced in your wallet. Review the replacement in the explorer before trying again.' });
        try { await refresh(); } catch { /* Refresh exposes its own recovery control. */ }
      }
      else if (receipt.status !== 'success') { setTx({ kind, hash, message: 'Transaction reverted. No action was completed. Refresh your position and try a smaller amount.', error: true }); }
      else {
        setTx({ kind, hash, message: `${kind} confirmed. Refreshing your position…` });
        try { await refresh(); setTx({ kind, hash, message: `${kind} confirmed. Your balances are up to date.` }); } catch { setTx({ kind, hash, message: `${kind} confirmed. Balances are unavailable; refresh before your next action.` }); }
      }
      locked.current = false; setBusy(false);
    } catch {
      setTx({ kind, hash, uncertain: true, message: 'Confirmation is still pending or unavailable. Check the transaction before continuing.' });
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current || !enabled || !runtime || !verified || !account || !window.ethereum || !snapshot) return;
    const invalid = actionError(action, parsed, snapshot, decimals);
    if (invalid) { setFieldError(invalid); amountRef.current?.focus(); return; }
    locked.current = true; setBusy(true); setFieldError('');
    let kind = actions[action].label;
    setTx({ kind, message: 'Checking your current position…' });
    try {
      await assertWallet(window.ethereum, runtime, account);
      const fresh = await refresh();
      if (!fresh) throw new Error('Missing position');
      const changed = actionError(action, parsed, fresh, decimals);
      if (changed) { setFieldError(changed); setTx(undefined); locked.current = false; setBusy(false); return; }
      const approval = action === 'deposit' && fresh.allowance < parsed!;
      kind = approval ? 'Approve IMD' : actions[action].label;
      setTx({ kind, message: `${kind}: simulating before wallet confirmation…` });
      const methods: Record<Action, string> = { deposit: 'depositCollateral', mint: 'mintCOMP', repay: 'repayCOMP', withdraw: 'withdrawCollateral' };
      const hash = await sendAction(runtime, window.ethereum, account, approval ? verified.imd : verified.vault, approval ? 'approve' : methods[action], approval ? [verified.vault.address, parsed!] : [parsed!]);
      setTx({ kind, hash, message: `${kind} submitted. Waiting for confirmation…` });
      await settle(hash, kind);
    } catch (error) { setTx({ kind, message: friendlyError(error), error: true }); locked.current = false; setBusy(false); }
  }
  async function grant(event: FormEvent) {
    event.preventDefault();
    if (locked.current || !enabled || !admin || !runtime || !verified || !account || !window.ethereum) return;
    const units = parseAmount(rightsAmount, verified.compDecimals);
    setAdminError(''); setRightsError('');
    if (!isAddress(recipient.trim()) || recipient.trim().toLowerCase() === zeroAddress) { setAdminError('Enter a valid nonzero Ethereum address.'); recipientRef.current?.focus(); return; }
    if (!units) { setRightsError('Enter a positive COMP rights amount, with at most 18 decimals.'); rightsRef.current?.focus(); return; }
    locked.current = true; setBusy(true);
    const kind = 'Grant rights';
    setTx({ kind, message: 'Grant rights: simulating before wallet confirmation…' });
    try {
      const hash = await sendAction(runtime, window.ethereum, account, verified.oracle, 'grantRights', [getAddress(recipient.trim()), units]);
      setTx({ kind, hash, message: 'Grant rights submitted. Waiting for confirmation…' });
      await settle(hash, kind);
      if (!locked.current) setRightsAmount('');
    } catch (error) { setTx({ kind, message: friendlyError(error), error: true }); locked.current = false; setBusy(false); }
  }
  const explorer = runtime?.manifest.network.explorer;
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="header"><a className="brand" href="#main" aria-label="COMP Compute Money"><img src="./mark.svg" alt="" width="38" height="38"/><span>COMP<span className="brand-sub">Compute Money</span></span></a><nav aria-label="Main"><a className="nav-active" href="#main">Vault</a><a href="#protocol">Protocol <span aria-hidden="true">↗</span></a></nav><div className="wallet-tools"><span className="network-pill"><span className="dot"/>Sepolia</span>{account ? <><button className="wallet-button connected-wallet" type="button" disabled={busy} onClick={() => { setAccount(undefined); setSnapshot(undefined); setTx(undefined); }} title={`Disconnect wallet ${account}`} aria-label={`Disconnect wallet ${account}`}><span className="wallet-address">{account.slice(0, 6)}…{account.slice(-4)}</span><span className="small muted">Disconnect</span></button></> : <button className="wallet-button" type="button" onClick={connect} disabled={walletBusy}>{walletBusy ? 'Connecting…' : 'Connect wallet'}<Icon/></button>}</div></header>
    <main id="main" className="container">
      <section className="intro"><div><p className="eyebrow"><span className="tiny-square"/>Compute-backed borrowing</p><h1>Your work. Your collateral.<br/><span className="muted">Your COMP vault.</span></h1><p className="intro-copy">Put your IMD to work. Use your oracle minting rights to borrow COMP and manage your position in one place.</p></div><div className="testnet-note"><span className="outline-label">Testnet workspace</span><p>Built for Sepolia.<br/>Test tokens, real on-chain actions.</p></div></section>
      {walletError && <div className="notice danger" role="alert">{walletError}</div>}
      {wrongChain && <div className="notice caution"><div><strong>Switch to Sepolia</strong><p>Your wallet is on a different network. Connect to Sepolia to manage this vault.</p></div><button type="button" onClick={switchChain} disabled={walletBusy || busy}>{walletBusy ? 'Switching…' : 'Switch to Sepolia'}</button></div>}
      {setupError ? <div className="notice danger" role="alert"><span>{setupError}</span><button type="button" onClick={() => setSetupAttempt(x => x + 1)}>Retry verification</button></div> : !verified && <p className="loading-note" role="status">Verifying deployment and contract links…</p>}
      {readError && <div className="notice danger" role="alert"><span>{readError}</span><button type="button" disabled={reading || busy} onClick={() => void refresh().catch(() => {})}>Retry reads</button></div>}
      <section className="balance-grid" aria-label="Wallet balances">
        {[{ key: 'imd', label: 'IMD balance', symbol: 'IMD', value: snapshot?.imd, note: 'Available collateral' }, { key: 'comp', label: 'COMP balance', symbol: 'COMP', value: snapshot?.comp, note: 'Available to repay' }, { key: 'rights', label: 'Oracle minting rights', symbol: 'rights', value: snapshot?.rights, note: 'COMP you have rights to mint' }].map(item => <div className="balance-card" key={item.key}><div className="card-label"><span>{item.label}</span><Token symbol={item.symbol}/></div><div className="balance-value" data-testid={`balance-${item.key}`} title={item.value === undefined ? undefined : formatUnits(item.value, 18)}>{item.value === undefined ? '—' : amountText(item.value)}{' '}<span>{item.symbol === 'IMD' ? 'IMD' : 'COMP'}</span></div><span className="muted small">{account ? item.note : 'Connect your wallet to view'}</span></div>)}
      </section>
      <div className="workspace">
        <section className="position-panel" aria-labelledby="position-heading"><div className="section-heading"><h2 id="position-heading">Your position</h2><span className={`status-pill ${positionHealth?.tone ?? ''}`} data-testid="health-status"><span className="dot"/>{positionHealth?.label ?? (account ? 'Loading…' : 'Not connected')}</span></div>
          <div className="position-values"><div><span className="muted small">Deposited collateral</span><p data-testid="position-collateral" title={snapshot && formatUnits(snapshot.collateral, 18)}>{snapshot ? amountText(snapshot.collateral) : '—'} <span>IMD</span></p></div><div><span className="muted small">Outstanding debt</span><p data-testid="position-debt" title={snapshot && formatUnits(snapshot.debt, 18)}>{snapshot ? amountText(snapshot.debt) : '—'} <span>COMP</span></p></div></div>
          <div className="health-panel"><div className="health-header"><span>Collateral ratio</span><span className="muted small">150% minimum</span></div><div className={`ratio ${positionHealth?.tone ?? ''}`} data-testid="position-ratio">{positionHealth?.ratio ?? '—'}<span className="ratio-label">{snapshot?.debt === 0n ? 'No outstanding debt' : 'Collateral / debt'}</span></div><div className="health-bar" aria-hidden="true"><span/><span/><span/>{snapshot && snapshot.debt > 0n && <i style={{ insetInlineStart: `${Math.max(1, Math.min(99, Number(snapshot.collateral * 100n / snapshot.debt) / 3))}%` }}/>}</div><div className="health-legend"><span>At risk &lt;150%</span><span>150–169%</span><span>Healthy ≥170%</span></div><p className="small muted">Keep a buffer above 150%. Minting or withdrawing increases your position’s risk.</p></div>
          {!account ? <div className="position-empty"><span className="empty-icon" aria-hidden="true">↗</span><div><strong>Your position starts here</strong><p>Connect a wallet, deposit IMD, then mint COMP using your work rights.</p></div></div> : <div className="sync-row"><span className="small muted">{snapshot ? `Read at block ${snapshot.block.toLocaleString()} · refreshes every 5s` : 'Loading your position…'}{readError ? ' · stale' : ''}</span><button className="icon-button" type="button" aria-label="Refresh balances" disabled={reading || busy} onClick={() => void refresh().catch(() => {})}><Icon name="refresh"/></button></div>}
        </section>
        <section className="action-panel" aria-labelledby="action-heading"><div className="section-heading"><h2 id="action-heading">Manage your vault</h2><span className="small muted">01 — 04</span></div><div className="action-selector" role="group" aria-label="Vault action">{(Object.keys(actions) as Action[]).map((key, index) => <button type="button" key={key} aria-pressed={key === action} disabled={busy} onClick={() => { setAction(key); setAmount(''); setFieldError(''); if (!tx?.uncertain) setTx(undefined); }}><Icon name={['down', 'mint', 'repay', 'up'][index]}/>{actions[key].label}</button>)}</div>
          <form onSubmit={submit} noValidate><p className="action-description">{actions[action].note}</p><div className="amount-label"><label htmlFor="amount">Amount ({actions[action].token})</label><button type="button" className="text-button" disabled={!enabled || busy || maximum === 0n} onClick={() => { setAmount(formatUnits(maximum, decimals)); setFieldError(''); }}>Use max</button></div><div className={`amount-field ${fieldError ? 'invalid' : ''}`}><input ref={amountRef} id="amount" name="amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} disabled={busy} onChange={e => { setAmount(e.target.value); setFieldError(''); }} aria-invalid={!!fieldError || (!!parsed && !!validation)} aria-describedby="amount-hint amount-error"/><span><Token symbol={actions[action].token}/>{actions[action].token}</span></div><p id="amount-hint" className="small muted available">{snapshot ? `Available for this action: ${amountText(maximum, decimals)} ${actions[action].token}` : 'Connect your wallet to see your available amount.'}</p><p id="amount-error" className="field-error" role="alert">{fieldError || (amount && parsed && validation ? validation : '')}</p>
            <dl className="preview"><div><dt>Accounting price</dt><dd>1 IMD = 1 COMP</dd></div><div><dt>Resulting collateral ratio</dt><dd className={after ? health(after).tone : ''}>{after ? health(after).ratio : '—'}</dd></div>{action === 'mint' && <div><dt>Rights after minting</dt><dd data-testid="rights-preview">{snapshot && parsed && !validation ? `${amountText(snapshot.rights - parsed)} COMP` : '—'}</dd></div>}<div><dt>Network fee</dt><dd>Paid in Sepolia ETH</dd></div></dl>
            {action === 'deposit' && <p className="step-hint small">{needsApproval ? 'Step 1 of 2 · Approve this amount of IMD for the vault. Then confirm your deposit.' : 'Deposit uses your IMD allowance. Any required approval is a separate transaction.'}</p>}
            {action === 'repay' && <p className="step-hint small">COMP is burned directly by the vault. No approval is needed.</p>}
            {!account ? <button className="primary" type="button" onClick={connect} disabled={walletBusy}>{walletBusy ? 'Connecting…' : 'Connect wallet'}<Icon/></button> : wrongChain ? <p className="small muted">Use “Switch to Sepolia” above to continue.</p> : <button className="primary" type="submit" data-testid="execute-action" disabled={!enabled || busy || (!!parsed && !!validation)}>{busy && tx?.kind !== 'Grant rights' ? <><span className="spinner"/>{tx?.kind} pending…</> : <>{needsApproval ? 'Approve IMD' : actions[action].label}<Icon/></>}</button>}
            <p className="action-footer">Review the amount in your wallet before confirming.</p>
          </form>
        </section>
      </div>
      <div className={`transaction-status ${tx?.error ? 'danger' : ''}`} role="status" aria-live="polite">{tx && <><div><strong>{tx.message}</strong>{tx.hash && explorer && <a href={`${explorer}/tx/${tx.hash}`} target="_blank" rel="noreferrer">View transaction <Icon name="link"/></a>}</div>{tx.uncertain && <button type="button" onClick={() => { if (tx.hash) { setTx({ ...tx, uncertain: false, message: 'Checking transaction confirmation…' }); void settle(tx.hash, tx.kind); } }}>Check confirmation</button>}</>}</div>
      {admin && <section className="admin-panel" aria-labelledby="admin-heading"><div><p className="eyebrow">Deployer tools</p><h2 id="admin-heading">Grant minting rights</h2><p className="muted small">Add testnet rights to a wallet. One right allows one COMP to be minted, subject to collateral.</p></div><form onSubmit={grant} noValidate><div><label htmlFor="recipient">Recipient address</label><input ref={recipientRef} id="recipient" name="recipient" placeholder="0x…" autoComplete="off" spellCheck={false} value={recipient} disabled={busy} onChange={e => { setRecipient(e.target.value.trim()); setAdminError(''); }} aria-invalid={!!adminError} aria-describedby="admin-error"/>{isAddress(recipient) && <span className="small address recipient-preview">{getAddress(recipient)}</span>}</div><div><label htmlFor="rights-amount">Rights amount (COMP)</label><input ref={rightsRef} id="rights-amount" name="rights-amount" inputMode="decimal" placeholder="0.00" autoComplete="off" value={rightsAmount} disabled={busy} onChange={e => { setRightsAmount(e.target.value); setRightsError(''); }} aria-invalid={!!rightsError} aria-describedby="rights-error"/></div><button type="submit" disabled={!enabled || busy}>{busy && tx?.kind === 'Grant rights' ? 'Grant rights pending…' : 'Grant rights'}</button><p id="admin-error" className="field-error" role="alert">{adminError}</p><p id="rights-error" className="field-error" role="alert">{rightsError}</p></form></section>}
      {snapshot && <details className="exact-balances"><summary>View exact balances</summary><dl>{([['Wallet IMD', snapshot.imd, 'IMD'], ['Wallet COMP', snapshot.comp, 'COMP'], ['Oracle rights', snapshot.rights, 'COMP'], ['Collateral', snapshot.collateral, 'IMD'], ['Debt', snapshot.debt, 'COMP']] as const).map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{formatUnits(value, 18)} {unit}</dd></div>)}</dl><p className="small muted">Summary values are shortened to four decimal places. These values retain all 18 decimals of precision.</p></details>}
      <section className="how-section" aria-labelledby="how-heading"><div className="section-heading"><h2 id="how-heading">A simple cycle.</h2><span className="small muted">Collateral meets compute</span></div><div className="how-grid"><div><span className="step-number">01</span><h3>Deposit your IMD</h3><p>Add testnet IMD to secure your position. The deployer supplies IMD to test wallets.</p></div><div><span className="step-number">02</span><h3>Turn rights into COMP</h3><p>Borrow within your collateral limit and oracle rights. Each mint consumes rights.</p></div><div><span className="step-number">03</span><h3>Repay and withdraw</h3><p>Repay your COMP debt to free collateral, then withdraw IMD to your wallet.</p></div></div></section>
      <section id="protocol" className="protocol-section"><details><summary>Protocol & contract details <span className="small muted">Deployment, addresses and testnet assumptions</span></summary><div className="protocol-content"><p>This Sepolia proof of concept uses a fixed accounting price of 1 IMD = 1 COMP. There is no live price feed or USD valuation. COMP is minted when you borrow and burned when you repay; supply is uncapped. Oracle rights are test credits granted by the deployer.</p><p>CPL (COMP Launch) is a separate launch asset. This vault operates with IMD collateral and COMP debt. Swaps and liquidity are outside this vault interface.</p>{runtime && <><p className="small muted address">Source commit: {runtime.manifest.sourceCommit}<br/>Attestation: {runtime.manifest.attestationHash}</p>{Object.entries(runtime.contracts).map(([name, contract]) => <AddressLink key={name} label={name} address={contract.address} explorer={runtime.manifest.network.explorer}/>)}{verified && <><AddressLink label="CompToken (from vault)" address={verified.comp.address} explorer={runtime.manifest.network.explorer}/><AddressLink label="MockWorkOracle (from vault)" address={verified.oracle.address} explorer={runtime.manifest.network.explorer}/></>}{account && <AddressLink label="Connected wallet" address={account} explorer={runtime.manifest.network.explorer}/>}<div className="faucet-links">{runtime.manifest.network.faucets.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">Sepolia ETH faucet {index + 1} ↗</a>)}</div></>}</div></details></section>
      <footer><a className="footer-brand" href="#main">COMP <span className="muted">/ Compute Money</span></a><span className="small muted">Sepolia testnet · Built on Ethereum</span></footer>
    </main>
  </>;
}
