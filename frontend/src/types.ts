export interface PropertyItem {
  id: string
  propertyUrl: string
  title: string
  propertyType: number
  serviceType: number
  description: string
  area: number
  floor: number
  floors: number
  rooms: number
  price: number
  unitPrice: number
  image: string
  location: number
  rawLocation: string | null
  oldPrice?: number
}

export interface PropertiesResponse {
  items: PropertyItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  lastEvaluatedKey: null
}

export type PropertyKind = 'all' | 'apartment' | 'house'

export interface FilterState {
  propertyKind: PropertyKind
  minRooms: string
  maxRooms: string
  minArea: string
  maxArea: string
  minPrice: string
  maxPrice: string
  minUnitPrice: string
  maxUnitPrice: string
}

export const emptyFilters: FilterState = {
  propertyKind: 'all',
  minRooms: '',
  maxRooms: '',
  minArea: '',
  maxArea: '',
  minPrice: '',
  maxPrice: '',
  minUnitPrice: '',
  maxUnitPrice: '',
}
