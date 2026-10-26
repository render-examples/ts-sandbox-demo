// A typical block: pure data shaping. Runs with no network access.
type Order = { id: string; amount: number; currency: string };

export default function (input: { orders: Order[] }) {
  const totals: Record<string, number> = {};
  for (const order of input.orders) {
    totals[order.currency] = (totals[order.currency] ?? 0) + order.amount;
  }
  console.log(`Totaled ${input.orders.length} orders`);
  return { totals };
}
