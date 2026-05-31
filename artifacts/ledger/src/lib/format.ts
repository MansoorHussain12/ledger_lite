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

// PDF-style date: "02-APR-26"
export function formatDatePrint(dateString: string | null | undefined): string {
  if (!dateString) return "";
  try {
    const d = new Date(dateString + "T00:00:00");
    const day = String(d.getDate()).padStart(2, "0");
    const month = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][d.getMonth()];
    const year = String(d.getFullYear()).slice(2);
    return `${day}-${month}-${year}`;
  } catch { return dateString; }
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
