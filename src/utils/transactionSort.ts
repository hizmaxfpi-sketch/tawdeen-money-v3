import { Transaction } from '@/types/finance';

const getBusinessDateTimestamp = (dateValue: string) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
};

const getCreatedAtTimestamp = (createdAt?: Date | string) => {
  if (!createdAt) return 0;
  return new Date(createdAt).getTime();
};

export const compareTransactionsByBusinessDateDesc = (a: Transaction, b: Transaction) => {
  const businessDateDiff = getBusinessDateTimestamp(b.date) - getBusinessDateTimestamp(a.date);
  if (businessDateDiff !== 0) return businessDateDiff;

  const createdAtDiff = getCreatedAtTimestamp(b.createdAt) - getCreatedAtTimestamp(a.createdAt);
  if (createdAtDiff !== 0) return createdAtDiff;

  return b.id.localeCompare(a.id);
};

export const compareTransactionsByBusinessDateAsc = (a: Transaction, b: Transaction) => {
  const businessDateDiff = getBusinessDateTimestamp(a.date) - getBusinessDateTimestamp(b.date);
  if (businessDateDiff !== 0) return businessDateDiff;

  const createdAtDiff = getCreatedAtTimestamp(a.createdAt) - getCreatedAtTimestamp(b.createdAt);
  if (createdAtDiff !== 0) return createdAtDiff;

  return a.id.localeCompare(b.id);
};
