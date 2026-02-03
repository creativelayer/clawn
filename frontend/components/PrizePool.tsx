export default function PrizePool({ amount }: { amount: number }) {
  const formatted = new Intl.NumberFormat().format(amount);
  return (
    <div className="text-center py-3">
      <p className="text-xs text-clown-purple uppercase tracking-widest mb-1">Prize Pool</p>
      <p className="text-2xl font-bold">
        <span className="glow-pink text-clown-pink">{formatted}</span>
        <span className="text-clown-yellow ml-2 text-lg">$CLAWN</span>
      </p>
    </div>
  );
}
