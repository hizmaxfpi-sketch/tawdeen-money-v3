type LedgerTransactionLike = {
  type?: string | null;
  amount: number;
};

export interface LedgerSummary {
  totalDebit: number;
  totalCredit: number;
  balance: number;
  transactionCount: number;
}

export const EMPTY_LEDGER_SUMMARY: LedgerSummary = {
  totalDebit: 0,
  totalCredit: 0,
  balance: 0,
  transactionCount: 0,
};

export function calculateLedgerSummary(
  transactions: Array<LedgerTransactionLike | null | undefined>
): LedgerSummary {
  const summary: LedgerSummary = { ...EMPTY_LEDGER_SUMMARY };

  for (const transaction of transactions) {
    if (!transaction) continue;

    summary.transactionCount += 1;
    const amount = Number(transaction.amount || 0);

    if (transaction.type === 'in') {
      summary.totalDebit += amount;
    } else if (transaction.type === 'out') {
      summary.totalCredit += amount;
    }
  }

  summary.balance = summary.totalDebit - summary.totalCredit;

  return summary;
}