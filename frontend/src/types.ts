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

/** Matches crawler `ServiceType`: sale=0, rent=1 */
export type ServiceKind = 'all' | 'sale' | 'rent'

export interface FilterState {
  propertyKind: PropertyKind
  serviceKind: ServiceKind
  /** Serbian municipality LAU codes; matches PropertyItem.location */
  locationIds: number[]
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
  serviceKind: 'all',
  locationIds: [],
  minRooms: '',
  maxRooms: '',
  minArea: '',
  maxArea: '',
  minPrice: '',
  maxPrice: '',
  minUnitPrice: '',
  maxUnitPrice: '',
}
