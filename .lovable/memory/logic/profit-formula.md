---
name: Profit formula
description: صافي الأرباح = إيرادات الأعمال المباشرة + أرباح المشاريع المحققة فقط + أرباح الحاويات − مصاريف الأعمال
type: feature
---
Revenue = directRevenue (business ops in) + projectProfit (sum of projects.profit WHERE status='completed') + containerProfit (sum of containers.profit)
Expenses = businessExpenses (business ops out, excludes asset_purchase and asset_payment)
Net Profit = Revenue - Expenses

Asset purchase: full value registered as debit (out) to vendor contact ONLY. No business ops entry.
Asset payment (full or installment): TWO transactions — out from fund (no contact) + in to vendor (no fund) to reduce vendor balance.
Asset delete/edit: cascades to reverse all related transactions and sync contact balances.
