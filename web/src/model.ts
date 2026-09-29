import { formatUnits, maxUint256, parseUnits } from 'viem';
export type Action = 'deposit' | 'mint' | 'repay' | 'withdraw';
export type Position = { collateral: bigint; debt: bigint };
export type Snapshot = Position & {
  imd: bigint; comp: bigint; rights: bigint; allowance: bigint; ratio: bigint;
  block: bigint; updatedAt: number;
};
export const actions: Record<Action, { label: string; token: 'IMD' | 'COMP'; note: string }> = {
  deposit: { label: 'Deposit IMD', token: 'IMD', note: 'Move IMD from your wallet into your collateral position.' },
  mint: { label: 'Mint COMP', token: 'COMP', note: 'Borrow COMP against your collateral. Each COMP uses one minting right.' },
  repay: { label: 'Repay COMP', token: 'COMP', note: 'Burn COMP to reduce your debt. Used minting rights are not restored.' },
  withdraw: { label: 'Withdraw IMD', token: 'IMD', note: 'Return collateral to your wallet while keeping your position at or above 150%.' },
};
export function parseAmount(value: string, decimals: number): bigint | undefined {
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return;
  if ((value.trim().split('.')[1]?.length ?? 0) > decimals) return;
  try { const amount = parseUnits(value.trim(), decimals); return amount > 0n && amount <= maxUint256 ? amount : undefined; } catch { return; }
}
export function amountText(value: bigint, decimals = 18): string {
  const raw = formatUnits(value, decimals);
  const [whole, fraction] = raw.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (!fraction) return grouped;
  if (whole === '0' && value > 0n && /^0{4}/.test(fraction)) return '<0.0001';
  return `${grouped}.${fraction.slice(0, 4).replace(/0+$/, '') || '0'}`;
}
export function limits(s: Snapshot): Record<Action, bigint> {
  const borrow = s.collateral * 2n / 3n - s.debt;
  const required = (s.debt * 3n + 1n) / 2n;
  return {
    deposit: s.imd,
    mint: borrow <= 0n ? 0n : borrow < s.rights ? borrow : s.rights,
    repay: s.comp < s.debt ? s.comp : s.debt,
    withdraw: s.collateral > required ? s.collateral - required : 0n,
  };
}
export function projected(s: Position, action: Action, amount: bigint): Position {
  return { collateral: s.collateral + (action === 'deposit' ? amount : action === 'withdraw' ? -amount : 0n), debt: s.debt + (action === 'mint' ? amount : action === 'repay' ? -amount : 0n) };
}
export function health(p: Position): { label: string; tone: string; ratio: string } {
  if (p.debt === 0n) return { label: 'No debt', tone: 'healthy', ratio: '—' };
  const ratio = p.collateral * 100n / p.debt;
  return { ratio: `${ratio}%`, label: ratio >= 170n ? 'Healthy' : ratio >= 150n ? 'Near minimum' : 'At risk', tone: ratio >= 170n ? 'healthy' : ratio >= 150n ? 'caution' : 'danger' };
}
export function actionError(action: Action, amount: bigint | undefined, s: Snapshot, decimals: number): string | undefined {
  if (!amount) return `Enter an amount greater than zero, with at most ${decimals} decimals.`;
  if (amount > limits(s)[action]) {
    if (action === 'deposit') return 'Insufficient IMD balance. Enter a smaller amount.';
    if (action === 'repay') return 'Repayment exceeds your debt or COMP balance. Enter a smaller amount.';
    if (action === 'mint' && amount > s.rights) return 'Insufficient minting rights. Ask the deployer to grant rights.';
    return 'This amount would put your collateral ratio below 150%. Enter a smaller amount.';
  }
}
export function friendlyError(error: unknown): string {
  const item = error as { code?: number; message?: string; shortMessage?: string; cause?: unknown; data?: { errorName?: string } };
  const raw = `${item?.shortMessage ?? ''} ${item?.message ?? ''} ${item?.data?.errorName ?? ''}`;
  if (item?.code === 4001 || /reject|denied/i.test(raw)) return 'Request rejected in your wallet. You can try again when ready.';
  const messages: Record<string, string> = {
    InsufficientRights: 'Insufficient minting rights. Refresh your position or ask the deployer for rights.',
    UnsafeCollateralRatio: 'Your position must remain at or above 150%. Reduce the amount.',
    InsufficientCollateral: 'Not enough collateral. Refresh your position and reduce the amount.',
    ExcessRepayment: 'Repayment exceeds your current debt. Refresh and reduce the amount.',
    Unauthorized: 'This wallet is not authorized for that action.',
    ERC20InsufficientBalance: 'Not enough tokens in your wallet. Refresh and reduce the amount.',
    ERC20InsufficientAllowance: 'Approve IMD before depositing.',
    ZeroAmount: 'Enter an amount greater than zero.',
  };
  for (const [key, message] of Object.entries(messages)) if (raw.includes(key)) return message;
  if (/insufficient funds/i.test(raw)) return 'Not enough Sepolia ETH for gas. Fund your wallet and try again.';
  if (/chain|network|account changed/i.test(raw)) return 'Your wallet account or network changed. Reconnect on Sepolia and try again.';
  if (item?.cause) { const nested = friendlyError(item.cause); if (!nested.startsWith('Unable')) return nested; }
  return 'Unable to complete the request. Check your wallet and connection, then refresh and try again.';
}
