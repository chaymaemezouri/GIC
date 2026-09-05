export function computePurchaseTax(quantity: number, unitPrice: number, tvaRate = 20) {
  const amountHT = Math.round(quantity * unitPrice * 100) / 100;
  const tvaAmount = Math.round(amountHT * (tvaRate / 100) * 100) / 100;
  const totalPrice = Math.round((amountHT + tvaAmount) * 100) / 100;
  return { amountHT, tvaRate, tvaAmount, totalPrice };
}
