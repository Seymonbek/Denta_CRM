export function formatMoney(amount: number | string | null | undefined): string {
  if (amount == null) return '0'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '0'
  return new Intl.NumberFormat('uz-UZ').format(num)
}
