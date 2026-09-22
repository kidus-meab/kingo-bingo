export type TransactionType =
  | "deposit"
  | "send"
  | "receive"
  | "withdraw"
  | "reward";

export type WalletTransaction = {
  id: string;
  type: TransactionType;
  amount: number;
  status: string;
  label: string | null;
  note: string | null;
  relatedId: string | null;
  createdAt: string;
};

export type DepositAccountPublic = {
  id: string;
  label: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
};

export type DepositTx = {
  id: string;
  amount: number;
  status: string;
  smsText: string;
  createdAt: string;
  accountLabel: string;
};

export type WalletState = {
  balance: number;
  rewardBalance: number;
  firstName: string;
  photoUrl: string | null;
  accounts: DepositAccountPublic[];
  transactions: WalletTransaction[];
  transactionsTotal: number;
  hasMoreTransactions: boolean;
};

export type TransferPeer = {
  id: string;
  firstName: string;
  username: string | null;
  photoUrl: string | null;
};

export function transactionTitle(tx: WalletTransaction) {
  if (tx.type === "deposit") return tx.label ? `Deposit · ${tx.label}` : "Deposit";
  if (tx.type === "withdraw") return tx.label ? `Withdraw · ${tx.label}` : "Withdraw";
  if (tx.type === "send") return tx.label ? `Sent to ${tx.label}` : "Sent";
  if (tx.type === "receive") return tx.label ? `From ${tx.label}` : "Received";
  if (tx.type === "reward") return tx.label ?? "Welcome reward";
  return tx.label ?? "Transaction";
}

export function transactionSignedAmount(tx: WalletTransaction) {
  if (tx.type === "send" || tx.type === "withdraw") return -tx.amount;
  return tx.amount;
}
