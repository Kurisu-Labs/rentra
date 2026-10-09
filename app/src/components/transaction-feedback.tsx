export function TransactionFeedback({
  pending,
  hash,
  confirmed,
  error,
}: {
  pending: boolean;
  hash: string | null;
  confirmed: boolean;
  error: string | null;
}) {
  return (
    <div aria-live="polite" aria-atomic="true">
      {pending && (
        <p className="notice">
          Check MetaMask for a confirmation request. Once submitted, wait for the transaction to
          finish.
        </p>
      )}
      {hash && (
        <p className="notice">
          {confirmed ? "Transaction confirmed. " : "Transaction submitted. "}
          <a href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">
            View transaction ↗
          </a>
        </p>
      )}
      {error && (
        <p className="notice warn" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
