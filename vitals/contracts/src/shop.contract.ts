/**
 * shop.contract.ts
 *
 * Transactional domain contracts for Synergos e-commerce.
 * These interfaces describe the shapes exchanged with Synergos.API (/api/shop/*).
 * They are NOT the component config shapes — for those, see element-config.contract.ts.
 */

// ── Product domain ────────────────────────────────────────────────────────────

export interface ProductImage {
  src:   string;
  alt:   string;
  order: number;
}

export interface ProductRating {
  average: number;   // 0–5
  count:   number;
}

export interface ProductCategoryRef {
  id:    string;
  name:  string;
  slug:  string;
}

export interface ProductVariant {
  id:       string;
  sku:      string;
  name:     string;
  value:    string;                                      // 'Rojo', 'XL', '128GB'
  type:     'color' | 'size' | 'storage' | 'custom';
  price?:   number;                                      // price override (null = use product base price)
  inStock:  boolean;
  image?:   string;
}

export interface Product {
  id:            string;
  sku:           string;
  name:          string;
  slug:          string;
  description:   string;
  price:         number;
  originalPrice?: number;
  discount?:     number;                                 // percentage 0–100
  currency:      string;                                 // ISO 4217: 'COP', 'USD'
  images:        ProductImage[];
  category:      ProductCategoryRef;
  variants?:     ProductVariant[];
  attributes?:   { key: string; value: string }[];       // weight, material, dimensions
  badge?:        string;                                 // 'Nuevo', 'Oferta', 'Destacado'
  inStock:       boolean;
  stockQty?:     number;
  rating?:       ProductRating;
  tags?:         string[];
}

export interface ProductCategory {
  id:       string;
  alias:    string;
  name:     string;
  slug:     string;
  image?:   string;
  parent?:  ProductCategoryRef;
  children?: ProductCategoryRef[];
}

// ── API request / response shapes ────────────────────────────────────────────

export interface ProductListRequest {
  category?:  string;
  search?:    string;
  sort?:      'relevance' | 'newest' | 'price-asc' | 'price-desc';
  minPrice?:  number;
  maxPrice?:  number;
  page?:      number;    // 1-based
  pageSize?:  number;    // max 48
}

export interface ProductListResponse {
  items:      Product[];
  total:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
}

// ── Cart domain ───────────────────────────────────────────────────────────────

export interface CartItem {
  productId:   string;
  variantId?:  string;
  sku:         string;
  name:        string;
  image?:      string;
  price:       number;
  currency:    string;
  quantity:    number;
  subtotal:    number;
}

export interface Cart {
  items:       CartItem[];
  itemCount:   number;
  subtotal:    number;
  discount?:   number;
  shipping?:   number;
  tax?:        number;
  total:       number;
  currency:    string;
  coupon?:     string;
  updatedAt:   string;
}

export interface CartAddRequest {
  productId:   string;
  variantId?:  string;
  quantity:    number;
}

export interface CartUpdateRequest {
  quantity:    number;
}

// ── Order domain ──────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface Address {
  firstName:  string;
  lastName:   string;
  email:      string;
  phone?:     string;
  address1:   string;
  address2?:  string;
  city:       string;
  state?:     string;
  postalCode: string;
  country:    string;
}

export interface PaymentIntent {
  method:     'card' | 'pse' | 'nequi' | 'cash' | 'wompi';
  token?:     string;   // gateway token
}

export interface OrderItem {
  productId:   string;
  variantId?:  string;
  sku:         string;
  name:        string;
  price:       number;
  quantity:    number;
  subtotal:    number;
}

export interface Order {
  id:            string;
  orderNumber:   string;
  status:        OrderStatus;
  items:         OrderItem[];
  customer:      Address;
  shipping:      Address;
  billing?:      Address;
  payment:       PaymentIntent;
  subtotal:      number;
  discount?:     number;
  shippingCost:  number;
  tax:           number;
  total:         number;
  currency:      string;
  createdAt:     string;
  updatedAt:     string;
}

export interface CheckoutRequest {
  cart:          Cart;
  customer:      Address;
  shipping:      Address;
  billing?:      Address;
  payment:       PaymentIntent;
}

export interface CheckoutResponse {
  orderId:       string;
  orderNumber:   string;
  status:        OrderStatus;
  redirectUrl?:  string;   // external payment gateway redirect
}
