# Market Keeper — Delivery Checklist

## 1. Offline-first shell and visual system
- [x] Build a one-page offline-first voice ledger for a small shop owner in Onitsha Market.
- [x] Require no login, no backend, no payments, no internet, and save every sale record and voice recording on the phone's local storage.
- [x] Use very big buttons, large text, and one-handed layouts that work on small Android phones, iPhones, and tablets.
- [x] Use dark navy blue as primary, brown as secondary, and gold as accent colors.
- [x] Show a prominent “Today: ₦0” total-sales header.
- [x] Provide “Cash Sale” and “Debt Sale” as two large side-by-side actions.
- [x] Provide bottom tabs for “Today's Sales” and “Owing Me”.

## 2. Sale entry and local feedback
- [x] Cash Sale asks for Amount and Item name, then saves instantly.
- [x] Debt Sale asks for Amount, Item name, and Customer Name, then saves instantly.
- [x] Add a MIC flow that accepts speech such as “Sold rice 2000 to Emeka debt”, extracts the sale details, and auto-fills the appropriate form without requiring app network access; browser speech support falls back to manual entry when unavailable.
- [x] After saving, play a small “Saved!” sound and show the sale in the list.

## 3. Today's Sales
- [x] List all sales added today with time, item, sale type, amount, and customer name for debt.
- [x] Show separate Total Cash Sales and Total Debt Sales at the bottom.

## 4. Owing Me
- [x] Switch to an Owing Me view that shows only unpaid debt sales grouped by customer name.
- [x] Show each customer's total owing, item count, and complete list of items owed.
- [x] Allow debts to be marked as paid so they leave the owing list.

## 5. Voice playback and close of day
- [x] Show a play icon on voice-created entries and play the locally stored original voice recording.
- [x] “Close Shop - Clear Today” clears only today's list while retaining unpaid debts until they are marked paid.
