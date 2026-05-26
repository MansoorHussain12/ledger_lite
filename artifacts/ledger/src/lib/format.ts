export function formatAmount(amount: number | null | undefined): string {
  if (amount == null) return "0";
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export { formatAmount as formatRupees };

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  try {
    return new Date(dateString + "T00:00:00").toLocaleDateString("en-PK", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const d = new Date(dateString);
  return d.toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
