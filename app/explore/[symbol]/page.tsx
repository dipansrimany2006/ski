import TradingClient from "./trading-client";

export default async function TradingPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  return <TradingClient symbol={symbol} />;
}
