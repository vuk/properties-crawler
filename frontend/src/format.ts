const priceFmt = new Intl.NumberFormat('sr-RS', {
  maximumFractionDigits: 0,
})

const areaFmt = new Intl.NumberFormat('sr-RS', {
  maximumFractionDigits: 1,
})

const roomsFmt = new Intl.NumberFormat('sr-RS', {
  maximumFractionDigits: 1,
})

export function formatPrice(n: number): string {
  return priceFmt.format(n)
}

export function formatArea(n: number): string {
  return `${areaFmt.format(n)} m²`
}

export function formatRooms(n: number): string {
  return roomsFmt.format(n)
}

export function formatUnitPrice(n: number): string {
  return `${priceFmt.format(n)} / m²`
}
